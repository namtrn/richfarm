import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { createDatabase, type SqliteDatabase } from "../src/db";
import type { ConvexSyncService } from "../src/convex-sync";

async function login(app: ReturnType<typeof createApp>) {
  return loginAs(app, "admin@example.com", "password123");
}

async function loginAs(app: ReturnType<typeof createApp>, email: string, password: string) {
  const response = await request(app).post("/api/auth/login").send({
    email,
    password,
  });
  return `Bearer ${response.body.token}`;
}

describe("Phase 3 master-data contract", () => {
  let db: SqliteDatabase;

  beforeEach(() => {
    db = createDatabase(":memory:");
    db.prepare(`INSERT INTO users (email, password_hash, role, is_active) VALUES (?, ?, 'admin', 1)`).run(
      "admin@example.com",
      bcrypt.hashSync("password123", 10),
    );
  });

  afterEach(() => db.close());

  it("round-trips active, care, source and content metadata through SQLite", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const auth = await login(app);
    const create = await request(app).post("/api/master-plants").set("Authorization", auth).send({
      plant_code: "BASIL_STABLE",
      common_name: "Basil",
      scientific_name: "Ocimum basilicum",
      source_system: "sqlite",
      source_id: "stable-basil-1",
      soil_ph_min: 5.5,
      soil_ph_max: 6.8,
      moisture_target: 60,
      light_hours: 8,
      watering_frequency_days: 2,
      fertilizing_frequency_days: 14,
      light_requirements: "full_sun",
      max_plants_per_m2: 4,
      seed_rate_per_m2: 1,
      notes: "reviewed by agronomy",
      source_url: "https://example.com/basil",
      content_status: "published",
      content_version: 3,
      review_status: "reviewed",
      reviewed_at: "2026-08-05T00:00:00.000Z",
      reviewed_by: "qa",
      i18n: {
        vi: { common_name: "Húng quế", description: "Rau thơm", care_content_json: { ph: [5.5, 6.8] }, content_version: 3 },
        en: { common_name: "Basil", description: "Herb", care_content_json: { ph: [5.5, 6.8] }, content_version: 3 },
        es: { common_name: "Albahaca", description: "Hierba", content_version: 3 },
      },
    });
    expect(create.status).toBe(201);
    expect(create.body.data.source_id).toBe("stable-basil-1");
    expect(create.body.data.soil_ph_min).toBe(5.5);
    expect(create.body.data.is_active).toBe(true);
    expect(create.body.data.i18n.es.common_name).toBe("Albahaca");

    const update = await request(app)
      .patch(`/api/master-plants/${create.body.data.id}`)
      .set("Authorization", auth)
      .send({ is_active: false, soil_ph_max: 7, content_version: 4 });
    expect(update.status).toBe(200);
    expect(update.body.data.is_active).toBe(false);
    expect(update.body.data.soil_ph_max).toBe(7);
    expect(update.body.data.source_id).toBe("stable-basil-1");

    const rename = await request(app)
      .patch(`/api/master-plants/${create.body.data.id}`)
      .set("Authorization", auth)
      .send({ plant_code: "BASIL_STABLE_RENAMED" });
    expect(rename.status).toBe(200);
    expect(rename.body.data.source_id).toBe("stable-basil-1");
    expect((db.prepare(`SELECT COUNT(*) AS count FROM master_plants WHERE source_system = 'sqlite' AND source_id = 'stable-basil-1'`).get() as { count: number }).count).toBe(1);

    const exported = await request(app)
      .get("/api/master-plants/export?format=json&source=sqlite")
      .set("Authorization", auth);
    expect(exported.status).toBe(200);
    expect(exported.body[0].i18n.es.care_content_json).toEqual({});
  });

  it("keeps failed source writes retryable in the outbox", async () => {
    let shouldFail = true;
    const syncService = {
      isEnabled: () => true,
      canReadFromConvex: () => false,
      syncUpsert: async () => {
        if (shouldFail) throw new Error("Convex unavailable");
      },
      syncDelete: async () => undefined,
    } as unknown as ConvexSyncService;
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" }, syncService });
    const auth = await login(app);
    const response = await request(app).post("/api/master-plants").set("Authorization", auth).send({
      plant_code: "OUTBOX_001",
      common_name: "Outbox plant",
      source_system: "sqlite",
      source_id: "outbox-1",
      i18n: { vi: { common_name: "Cây outbox" }, en: { common_name: "Outbox plant" } },
    });
    expect(response.status).toBe(503);
    expect(response.body.retryable).toBe(true);
    expect((db.prepare(`SELECT COUNT(*) AS count FROM master_plants`).get() as { count: number }).count).toBe(0);
    expect((db.prepare(`SELECT status FROM sync_outbox WHERE source_id = 'outbox-1'`).get() as { status: string }).status).toBe("pending");

    shouldFail = false;
    const process = await request(app).post("/api/master-plants/sync-outbox/process").set("Authorization", auth);
    expect(process.status).toBe(200);
    expect(process.body.applied).toBe(1);
    expect((db.prepare(`SELECT COUNT(*) AS count FROM master_plants WHERE source_id = 'outbox-1' AND sync_origin = 'mirror'`).get() as { count: number }).count).toBe(1);
  });

  it("rejects forged viewer-role tokens and persists care_status/content_origin round-trip", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const auth = await login(app);

    // A JWT claiming role=viewer is invalid under the admin|editor contract.
    // The user does not exist in the DB, so the role claim is the only
    // evidence and must be rejected.
    const jwt = (await import("jsonwebtoken")).default;
    const forged = jwt.sign(
      { sub: "99999", email: "ghost@example.com", role: "viewer" },
      "test-secret",
      { issuer: "richfarm-backend", audience: "richfarm-dashboard", expiresIn: "1h" },
    );
    const forgedResponse = await request(app)
      .get("/api/master-plants")
      .set("Authorization", `Bearer ${forged}`);
    expect(forgedResponse.status).toBe(401);

    // care_status aggregate is computed on write (care fields without verified
    // evidence stay awaiting_review) and content_origin round-trips.
    const create = await request(app).post("/api/master-plants").set("Authorization", auth).send({
      plant_code: "CARE_STATUS_1",
      common_name: "Care status plant",
      scientific_name: "Testus carestatus",
      source_system: "sqlite",
      source_id: "care-status-1",
      watering_frequency_days: 3,
      fertilizing_frequency_days: 14,
      i18n: {
        vi: { common_name: "Cây trạng thái", content_origin: "authored" },
        en: { common_name: "Care status plant", content_origin: "imported" },
      },
    });
    expect(create.status).toBe(201);
    expect(create.body.data.care_status).toBe("awaiting_review");
    expect(create.body.data.i18n.vi.content_origin).toBe("authored");

    const read = await request(app).get("/api/master-plants").set("Authorization", auth);
    const row = read.body.data.find((item: { source_id: string }) => item.source_id === "care-status-1");
    expect(row.care_status).toBe("awaiting_review");
    expect(row.i18n.en.content_origin).toBe("imported");
    expect(row.i18n.vi.content_origin).toBe("authored");

    // An i18n-only edit must not recompute/downgrade the persisted aggregate.
    const i18nOnly = await request(app)
      .patch(`/api/master-plants/${create.body.data.id}`)
      .set("Authorization", auth)
      .send({
        i18n: {
          vi: { common_name: "Cây trạng thái mới", content_origin: "authored" },
          en: { common_name: "Care status plant renamed", content_origin: "imported" },
        },
      });
    expect(i18nOnly.status).toBe(200);
    expect(i18nOnly.body.data.care_status).toBe("awaiting_review");
  });

  it("enforces admin-only delete paths for editors", async () => {
    db.prepare(`INSERT INTO users (email, password_hash, role, is_active) VALUES (?, ?, 'editor', 1)`).run(
      "editor@example.com",
      bcrypt.hashSync("editor-password", 10),
    );
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const adminAuth = await login(app);
    const editorAuth = await loginAs(app, "editor@example.com", "editor-password");

    const plant = await request(app).post("/api/master-plants").set("Authorization", adminAuth).send({
      plant_code: "DELETE_GUARD_1",
      common_name: "Delete guard plant",
      source_system: "sqlite",
      source_id: "delete-guard-1",
      i18n: { vi: { common_name: "Cây guard xóa" }, en: { common_name: "Delete guard plant" } },
    });
    expect(plant.status).toBe(201);
    const plantId = plant.body.data.id;

    const syncService = {
      isEnabled: () => false,
      isAdminProxyEnabled: () => true,
      canReadFromConvex: () => false,
      adminMutation: async () => ({ ok: true }),
    } as unknown as ConvexSyncService;
    const proxied = createApp(db, {
      auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" },
      syncService,
    });
    const proxiedAdminAuth = await loginAs(proxied, "admin@example.com", "password123");
    const proxiedEditorAuth = await loginAs(proxied, "editor@example.com", "editor-password");

    // Editor: 403 on every delete path.
    const singleDelete = await request(app).delete(`/api/master-plants/${plantId}`).set("Authorization", editorAuth);
    expect(singleDelete.status).toBe(403);
    const bulkDelete = await request(app)
      .post("/api/master-plants/bulk")
      .set("Authorization", editorAuth)
      .send({ action: "delete", ids: [plantId] });
    expect(bulkDelete.status).toBe(403);
    const i18nDelete = await request(app).delete("/api/master-plants-i18n/999").set("Authorization", editorAuth);
    expect(i18nDelete.status).toBe(403);
    const deleteMutation = await request(proxied)
      .post("/api/convex-admin/mutation")
      .set("Authorization", proxiedEditorAuth)
      .send({ path: "plantAdmin:deletePlant", args: { plantId } });
    expect(deleteMutation.status).toBe(403);

    // Editor can still create/update/curate.
    const editorCreate = await request(app).post("/api/master-plants").set("Authorization", editorAuth).send({
      plant_code: "EDITOR_OK_1",
      common_name: "Editor plant",
      source_system: "sqlite",
      source_id: "editor-ok-1",
      i18n: { vi: { common_name: "Cây editor" }, en: { common_name: "Editor plant" } },
    });
    expect(editorCreate.status).toBe(201);

    // Admin: the same delete paths succeed.
    const adminDelete = await request(app).delete(`/api/master-plants/${plantId}`).set("Authorization", adminAuth);
    expect(adminDelete.status).toBe(204);
    const adminMutation = await request(proxied)
      .post("/api/convex-admin/mutation")
      .set("Authorization", proxiedAdminAuth)
      .send({ path: "plantAdmin:deletePlant", args: { plantId } });
    expect(adminMutation.status).toBe(200);
  });

  it("rejects source identity conflicts during update", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const auth = await login(app);
    const plant = (code: string, sourceId: string) => ({
      plant_code: code,
      common_name: code,
      source_system: "sqlite",
      source_id: sourceId,
      i18n: {
        vi: { common_name: `${code} vi` },
        en: { common_name: `${code} en` },
      },
    });
    const first = await request(app).post("/api/master-plants").set("Authorization", auth).send(plant("IDENTITY_A", "identity-a"));
    const second = await request(app).post("/api/master-plants").set("Authorization", auth).send(plant("IDENTITY_B", "identity-b"));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const conflict = await request(app)
      .patch(`/api/master-plants/${second.body.data.id}`)
      .set("Authorization", auth)
      .send({ source_system: "sqlite", source_id: "identity-a" });
    expect(conflict.status).toBe(409);
  });

  it("resolves Convex-only admin snapshot details by stable id or source identity", async () => {
    const remote = {
      _id: "convex-only-row",
      scientificName: "Mentha spicata",
      displayName: "Spearmint",
      sourceSystem: "convex",
      sourceId: "convex-source-only",
      group: "herbs",
      family: "Lamiaceae",
      isActive: true,
      i18nRows: [
        { locale: "vi", commonName: "Bạc hà" },
        { locale: "en", commonName: "Spearmint" },
      ],
    };
    const syncService = {
      isEnabled: () => false,
      isAdminProxyEnabled: () => true,
      canReadFromConvex: () => true,
      fetchAdminMasterPlants: async () => [remote],
      fetchMasterPlants: async () => [],
    } as unknown as ConvexSyncService;
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" }, syncService });
    const auth = await login(app);

    for (const identifier of [remote._id, remote.sourceId]) {
      const response = await request(app)
        .get(`/api/master-plants/${identifier}?source=convex`)
        .set("Authorization", auth);
      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(remote._id);
      expect(response.body.data.source_id).toBe(remote.sourceId);
      expect(response.body.data.i18n.en.common_name).toBe("Spearmint");
    }
  });

  it("refuses SQLite base/variant and referenced-row deletes", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const auth = await login(app);
    const create = async (code: string, sourceId: string, metadata_json: Record<string, unknown> = {}) =>
      request(app).post("/api/master-plants").set("Authorization", auth).send({
        plant_code: code,
        common_name: code,
        scientific_name: "Ocimum basilicum",
        source_system: "sqlite",
        source_id: sourceId,
        metadata_json,
        i18n: {
          vi: { common_name: `${code} vi` },
          en: { common_name: `${code} en` },
        },
      });

    const base = await create("BASIL_BASE_GUARD", "basil-base-guard");
    const variant = await create("BASIL_VARIANT_GUARD", "basil-variant-guard", { cultivar: "Genovese" });
    expect(base.status).toBe(201);
    expect(variant.status).toBe(201);

    const singleDelete = await request(app)
      .delete(`/api/master-plants/${base.body.data.id}`)
      .set("Authorization", auth);
    expect(singleDelete.status).toBe(409);
    expect(singleDelete.body.error).toMatch(/base plant while variants/i);

    const bulkDelete = await request(app)
      .post("/api/master-plants/bulk")
      .set("Authorization", auth)
      .send({ action: "delete", ids: [base.body.data.id] });
    expect(bulkDelete.status).toBe(409);
    expect(bulkDelete.body.rejected).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: base.body.data.id }),
    ]));

    db.prepare(`INSERT INTO plant_measurements (master_plant_id, note) VALUES (?, ?)`)
      .run(variant.body.data.id, "active garden measurement");
    const referencedDelete = await request(app)
      .delete(`/api/master-plants/${variant.body.data.id}`)
      .set("Authorization", auth);
    expect(referencedDelete.status).toBe(409);
    expect(referencedDelete.body.error).toMatch(/measurements still reference/i);
  });

  it("reconciliation removes stale mirror rows and records zero drift", async () => {
    db.prepare(`INSERT INTO master_plants (plant_code, common_name, source_system, source_id, sync_origin) VALUES (?, ?, ?, ?, ?)`).run(
      "STALE", "Stale", "convex", "stale-1", "mirror",
    );
    const syncService = {
      isEnabled: () => true,
      canReadFromConvex: () => true,
      fetchAdminMasterPlants: async () => [{
        _id: "new-1",
        scientificName: "Mentha spicata",
        displayName: "Mint",
        sourceSystem: "convex",
        sourceId: "new-1",
        group: "herbs",
        family: "Lamiaceae",
        imageUrl: null,
        isActive: true,
        i18nRows: [
          { locale: "vi", commonName: "Bạc hà" },
          { locale: "en", commonName: "Mint" },
        ],
      }],
      fetchMasterPlants: async () => [],
      syncUpsert: async () => undefined,
      syncDelete: async () => undefined,
    } as unknown as ConvexSyncService;
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" }, syncService });
    const auth = await login(app);
    const response = await request(app).post("/api/master-plants/sync-convex-to-sqlite").set("Authorization", auth);
    expect(response.status).toBe(200);
    expect(response.body.removed).toBe(1);
    expect(response.body.drift).toBe(0);
    expect((db.prepare(`SELECT status, drift_after FROM sync_reconciliation_runs ORDER BY id DESC LIMIT 1`).get() as { status: string; drift_after: number })).toMatchObject({ status: "completed", drift_after: 0 });
  });

  it("migrates legacy vi/en SQLite rows without losing data and allows new locales", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "richfarm-phase3-"));
    const dbPath = path.join(tempDir, "legacy.db");
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE master_plants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plant_code TEXT NOT NULL UNIQUE,
        common_name TEXT NOT NULL,
        scientific_name TEXT,
        category TEXT NOT NULL DEFAULT 'general',
        "group" TEXT NOT NULL DEFAULT 'other',
        family TEXT,
        purposes_json TEXT NOT NULL DEFAULT '[]',
        growth_stage TEXT NOT NULL DEFAULT 'seedling',
        typical_days_to_harvest INTEGER,
        germination_days INTEGER,
        soil_ph_min REAL,
        soil_ph_max REAL,
        moisture_target INTEGER,
        light_hours INTEGER,
        spacing_cm REAL,
        water_liters_per_m2 REAL,
        yield_kg_per_m2 REAL,
        image_url TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE master_plant_i18n (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        master_plant_id INTEGER NOT NULL,
        locale TEXT NOT NULL CHECK (locale IN ('vi', 'en')),
        common_name TEXT NOT NULL,
        description TEXT,
        care_content_json TEXT NOT NULL DEFAULT '{}',
        content_version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(master_plant_id, locale),
        FOREIGN KEY(master_plant_id) REFERENCES master_plants(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_master_plant_i18n_master_plant_id
        ON master_plant_i18n(master_plant_id);
      CREATE TRIGGER trg_master_plant_i18n_updated_at
      AFTER UPDATE ON master_plant_i18n
      FOR EACH ROW
      WHEN NEW.updated_at = OLD.updated_at
      BEGIN
        UPDATE master_plant_i18n
        SET updated_at = datetime('now')
        WHERE id = OLD.id;
      END;
    `);
    legacy.prepare(`INSERT INTO master_plants (plant_code, common_name, scientific_name) VALUES (?, ?, ?)`).run(
      "LEGACY_001",
      "Legacy basil",
      "Ocimum basilicum",
    );
    legacy.prepare(`INSERT INTO master_plant_i18n (master_plant_id, locale, common_name) VALUES (1, 'vi', 'Húng quế')`).run();
    legacy.prepare(`INSERT INTO master_plant_i18n (master_plant_id, locale, common_name) VALUES (1, 'en', 'Basil')`).run();
    legacy.close();

    const migrated = createDatabase(dbPath);
    expect((migrated.prepare(`SELECT common_name, source_system, is_active FROM master_plants WHERE id = 1`).get() as Record<string, unknown>)).toMatchObject({
      common_name: "Legacy basil",
      source_system: "sqlite",
      is_active: 1,
    });
    migrated.prepare(`INSERT INTO master_plant_i18n (master_plant_id, locale, common_name) VALUES (1, 'es', 'Albahaca')`).run();
    expect((migrated.prepare(`SELECT COUNT(*) AS count FROM master_plant_i18n WHERE master_plant_id = 1`).get() as { count: number }).count).toBe(3);
    migrated.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
