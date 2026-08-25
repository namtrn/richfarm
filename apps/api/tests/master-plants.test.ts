import bcrypt from "bcryptjs";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { createDatabase, type SqliteDatabase } from "../src/db";
import type { ConvexSyncService } from "../src/convex-sync";

function baseIdentity(genus: string, species: string, cultivar: string | null = null) {
  return {
    genus,
    species,
    infraspecific_rank: null,
    infraspecific_name: null,
    cultivar,
    identity_scope: cultivar ? "cultivar" as const : "base" as const,
    parent_master_plant_id: null,
    parent_canonical_key: cultivar
      ? JSON.stringify(["v1", genus.toLowerCase(), species.toLowerCase(), "", "", ""])
      : null,
  };
}

describe("master plants API", () => {
  let db: SqliteDatabase;

  beforeEach(() => {
    db = createDatabase(":memory:");
    const hash = bcrypt.hashSync("password123", 10);
    db.prepare(`INSERT INTO users (email, password_hash, role, is_active) VALUES (?, ?, 'admin', 1)`).run(
      "admin@example.com",
      hash,
    );
  });

  afterEach(() => {
    db.close();
  });

  async function authHeaderFor(app: ReturnType<typeof createApp>) {
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });
    return `Bearer ${loginResponse.body.token}`;
  }

  it("requires structured identity for new creates and exposes exact/near previews", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const authHeader = await authHeaderFor(app);
    const incomplete = await request(app).post("/api/master-plants").set("Authorization", authHeader).send({
      plant_code: "LEGACY_CREATE",
      common_name: "Legacy create",
      scientific_name: "Solanum lycopersicum",
      i18n: { vi: { common_name: "Cà chua" }, en: { common_name: "Tomato" } },
    });
    expect(incomplete.status).toBe(400);
    expect(incomplete.body.error).toBe("CANONICAL_IDENTITY_INCOMPLETE");
    expect((db.prepare(`SELECT COUNT(*) AS count FROM master_plants`).get() as { count: number }).count).toBe(0);

    const identity = baseIdentity("Solanum", "lycopersicum");
    const created = await request(app).post("/api/master-plants").set("Authorization", authHeader).send({
      plant_code: "TOMATO_PREVIEW",
      common_name: "Tomato",
      scientific_name: "Solanum lycopersicum",
      ...identity,
      i18n: { vi: { common_name: "Cà chua" }, en: { common_name: "Tomato" } },
    });
    expect(created.status).toBe(201);

    const exact = await request(app).post("/api/master-plants/canonical-match-preview").set("Authorization", authHeader).send({
      plant_code: "TOMATO_OTHER_CODE",
      common_name: "Tomato duplicate",
      scientific_name: "Solanum lycopersicum",
      ...identity,
      i18n: { vi: { common_name: "Cà chua" }, en: { common_name: "Tomato" } },
    });
    expect(exact.status).toBe(200);
    expect(exact.body.data.status).toBe("exact");
    expect(exact.body.data.exact.id).toBe(created.body.data.id);

    const near = await request(app).post("/api/master-plants/canonical-match-preview").set("Authorization", authHeader).send({
      plant_code: "TOMATO_VARIANT_PREVIEW",
      common_name: "Cherry tomato",
      scientific_name: "Solanum lycopersicum",
      ...baseIdentity("Solanum", "lycopersicum", "Cherry"),
      i18n: { vi: { common_name: "Cà chua bi" }, en: { common_name: "Cherry tomato" } },
    });
    expect(near.status).toBe(200);
    expect(near.body.data.status).toBe("near_match");
    expect(near.body.data.exact).toBeNull();
    expect(near.body.data.suggestions[0].id).toBe(created.body.data.id);

    const conflict = await request(app).post("/api/master-plants").set("Authorization", authHeader).send({
      plant_code: "TOMATO_DUPLICATE",
      common_name: "Tomato duplicate",
      scientific_name: "Solanum lycopersicum",
      ...identity,
      i18n: { vi: { common_name: "Cà chua" }, en: { common_name: "Tomato" } },
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("CANONICAL_PLANT_EXISTS");
    expect(conflict.body.match.id).toBe(created.body.data.id);
  });

  it("rejects partial canonical PATCH drift and keeps the row unchanged", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const authHeader = await authHeaderFor(app);
    const first = await request(app).post("/api/master-plants").set("Authorization", authHeader).send({
      plant_code: "PATCH_TOMATO",
      common_name: "Tomato",
      scientific_name: "Solanum lycopersicum",
      ...baseIdentity("Solanum", "lycopersicum"),
      i18n: { vi: { common_name: "Cà chua" }, en: { common_name: "Tomato" } },
    });
    const second = await request(app).post("/api/master-plants").set("Authorization", authHeader).send({
      plant_code: "PATCH_EGGPLANT",
      common_name: "Eggplant",
      scientific_name: "Solanum melongena",
      ...baseIdentity("Solanum", "melongena"),
      i18n: { vi: { common_name: "Cà tím" }, en: { common_name: "Eggplant" } },
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const partial = await request(app).patch(`/api/master-plants/${second.body.data.id}`).set("Authorization", authHeader).send({ genus: "Solanum" });
    expect(partial.status).toBe(400);
    expect(partial.body.error).toBe("Validation failed");

    const duplicate = await request(app).patch(`/api/master-plants/${second.body.data.id}`).set("Authorization", authHeader).send({
      genus: "Solanum",
      species: "lycopersicum",
      infraspecific_rank: null,
      infraspecific_name: null,
      cultivar: null,
      identity_scope: "base",
      parent_master_plant_id: null,
      parent_canonical_key: null,
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toBe("CANONICAL_PLANT_EXISTS");
    expect((db.prepare(`SELECT canonical_key FROM master_plants WHERE id = ?`).get(second.body.data.id) as { canonical_key: string }).canonical_key)
      .toBe(second.body.data.canonical_key);
  });

  it("creates and lists master plants", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });
    const authHeader = `Bearer ${loginResponse.body.token}`;

    const createResponse = await request(app).post("/api/master-plants").set("Authorization", authHeader).send({
      plant_code: "TOMATO_001",
      common_name: "Tomato",
      scientific_name: "Solanum lycopersicum",
      ...baseIdentity("Solanum", "lycopersicum"),
      soil_ph_min: 5.5,
      soil_ph_max: 6.8,
      moisture_target: 60,
      light_hours: 8,
      metadata_json: {
        source: "seed-bank",
      },
      i18n: {
        vi: { common_name: "Cà chua", description: "Cây cà chua" },
        en: { common_name: "Tomato", description: "Tomato plant" },
      },
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.plant_code).toBe("TOMATO_001");
    expect(createResponse.body.data.metadata_json.source).toBe("seed-bank");

    const listResponse = await request(app).get("/api/master-plants").set("Authorization", authHeader);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.pagination.total).toBe(1);
  });

  it("rejects invalid pH ranges", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });
    const authHeader = `Bearer ${loginResponse.body.token}`;

    const response = await request(app).post("/api/master-plants").set("Authorization", authHeader).send({
      plant_code: "PEPPER_001",
      common_name: "Pepper",
      soil_ph_min: 7,
      soil_ph_max: 6,
      i18n: {
        vi: { common_name: "Ớt" },
        en: { common_name: "Pepper" },
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  it("requires i18n for create", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });
    const authHeader = `Bearer ${loginResponse.body.token}`;

    const response = await request(app).post("/api/master-plants").set("Authorization", authHeader).send({
      plant_code: "NO_I18N",
      common_name: "Missing I18n",
    });

    expect(response.status).toBe(400);
  });

  it("rejects duplicate plant_code with conflict status", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });
    const authHeader = `Bearer ${loginResponse.body.token}`;

    const payload = {
      plant_code: "LETTUCE_001",
      common_name: "Lettuce",
      scientific_name: "Lactuca sativa",
      ...baseIdentity("Lactuca", "sativa"),
      i18n: {
        vi: { common_name: "Xà lách" },
        en: { common_name: "Lettuce" },
      },
    };

    const firstResponse = await request(app).post("/api/master-plants").set("Authorization", authHeader).send(payload);
    expect(firstResponse.status).toBe(201);

    const duplicateResponse = await request(app).post("/api/master-plants").set("Authorization", authHeader).send(payload);
    expect(duplicateResponse.status).toBe(409);
  });

  it("returns 404 when updating non-existing master plant", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });
    const authHeader = `Bearer ${loginResponse.body.token}`;

    const response = await request(app).patch("/api/master-plants/999").set("Authorization", authHeader).send({
      common_name: "Ghost Plant",
    });

    expect(response.status).toBe(404);
  });

  it("validates pagination query parameters", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });
    const authHeader = `Bearer ${loginResponse.body.token}`;

    const response = await request(app)
      .get("/api/master-plants?page=0&page_size=500")
      .set("Authorization", authHeader);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  it("requires authenticated read access", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const unauthenticated = await request(app).get("/api/master-plants");
    expect(unauthenticated.status).toBe(401);
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });
    const response = await request(app)
      .get("/api/master-plants")
      .set("Authorization", `Bearer ${loginResponse.body.token}`);
    expect(response.status).toBe(200);
  });

  it("uses Convex read model for list and stats when configured", async () => {
    const syncService = {
      canReadFromConvex: () => true,
      fetchMasterPlants: async () => [
        {
          _id: "jx123abc",
          scientificName: "Solanum lycopersicum",
          displayName: "Tomato",
          cultivar: "Roma VF",
          cultivarNormalized: "roma vf",
          group: "nightshades",
          family: "Solanaceae",
          imageUrl: null,
          source: "seed",
          purposes: ["food"],
          i18nRows: [
            { locale: "vi", commonName: "Cà chua Roma" },
            { locale: "en", commonName: "Roma tomato" },
          ],
        },
      ],
    } as unknown as ConvexSyncService;
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" }, syncService });
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });
    const authHeader = `Bearer ${loginResponse.body.token}`;

    const listResponse = await request(app).get("/api/master-plants").set("Authorization", authHeader);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.pagination.total).toBe(1);
    expect(listResponse.body.data[0].plant_code).toMatch(/^SOLANUM_LYCOPERSICUM_ROMA_VF_/);
    expect(listResponse.body.data[0].plant_code).not.toContain(" ");
    expect(listResponse.body.data[0].family).toBe("Solanaceae");

    const statsResponse = await request(app).get("/api/master-plants/stats").set("Authorization", authHeader);
    expect(statsResponse.status).toBe(200);
    expect(statsResponse.body).toMatchObject({
      total: 1,
      active: 1,
      inactive: 0,
      missingVi: 0,
      missingEn: 0,
      missingImage: 1,
      source: "convex",
    });
  });

  it("syncs Convex plants into editable SQLite rows", async () => {
    const syncService = {
      canReadFromConvex: () => true,
      fetchMasterPlants: async () => [
        {
          _id: "jx123abc",
          scientificName: "Solanum lycopersicum",
          displayName: "Tomato",
          cultivar: "Roma VF",
          cultivarNormalized: "roma vf",
          group: "nightshades",
          family: "Solanaceae",
          imageUrl: "https://example.com/tomato.jpg",
          source: "seed",
          purposes: ["food"],
          i18nRows: [
            { locale: "vi", commonName: "Cà chua Roma" },
            { locale: "en", commonName: "Roma tomato" },
          ],
        },
      ],
    } as unknown as ConvexSyncService;
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" }, syncService });
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });
    const authHeader = `Bearer ${loginResponse.body.token}`;

    const syncResponse = await request(app)
      .post("/api/master-plants/sync-convex-to-sqlite")
      .set("Authorization", authHeader);
    expect(syncResponse.status).toBe(200);
    expect(syncResponse.body.upserted).toBe(1);

    const sqliteList = await request(app)
      .get("/api/master-plants?source=sqlite")
      .set("Authorization", authHeader);
    expect(sqliteList.status).toBe(200);
    expect(sqliteList.body.pagination.total).toBe(1);
    expect(sqliteList.body.data[0].id).toBe(1);
    expect(sqliteList.body.data[0].plant_code).toMatch(/^SOLANUM_LYCOPERSICUM_ROMA_VF_/);
    expect(sqliteList.body.data[0].metadata_json.cultivar).toBe("Roma VF");
  });

  it("blocks unauthenticated write access", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const response = await request(app).post("/api/master-plants").send({
      plant_code: "NOAUTH_001",
      common_name: "No Auth",
      i18n: {
        vi: { common_name: "Khong auth" },
        en: { common_name: "No auth" },
      },
    });
    expect(response.status).toBe(401);
  });
});
