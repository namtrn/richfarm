import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { createDatabase, type SqliteDatabase } from "../src/db";
import type { ConvexSyncService } from "../src/convex-sync";

async function loginAs(app: ReturnType<typeof createApp>, email: string) {
  const response = await request(app).post("/api/auth/login").send({ email, password: "password123" });
  return `Bearer ${response.body.token}`;
}

describe("Plant geography adaptation (Release 1, design doc §2.3/§3)", () => {
  let db: SqliteDatabase;

  beforeEach(() => {
    db = createDatabase(":memory:");
    db.prepare(`INSERT INTO users (email, password_hash, role, is_active) VALUES (?, ?, 'admin', 1)`).run(
      "admin@example.com",
      bcrypt.hashSync("password123", 10),
    );
  });

  afterEach(() => db.close());

  async function makeApp() {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const auth = await loginAs(app, "admin@example.com");
    return { app, auth };
  }

  function createPlant(app: ReturnType<typeof createApp>, auth: string, overrides: Record<string, unknown> = {}) {
    return request(app).post("/api/master-plants").set("Authorization", auth).send({
      plant_code: "GEO_TEST",
      common_name: "Geography test",
      scientific_name: "Solanum lycopersicum",
      source_system: "sqlite",
      source_id: "geo-test-1",
      i18n: {
        vi: { common_name: "Cà chua thử nghiệm" },
        en: { common_name: "Geography test" },
      },
      ...overrides,
    });
  }

  it("round-trips origin, proven regions, and adaptation terms and resolves them as own", async () => {
    const { app, auth } = await makeApp();

    const create = await createPlant(app, auth, {
      origin_countries: ["VN", "TH"],
      origin_country_source_refs: { VN: [{ sourceSystem: "seed-catalog" }] },
      proven_regions: [
        { country_code: "VN", subdivision_code: "HCM", source_refs: [{ sourceUrl: "https://example.com/vn" }] },
        { country_code: "US" },
      ],
      adaptation_term_codes: ["hot", "humid", "tropical"],
      adaptation_term_source_refs: { hot: [{ sourceName: "Tropical handbook" }] },
    });
    expect(create.status).toBe(201);
    const id = create.body.data.id;

    const get = await request(app).get(`/api/master-plants/${id}`).set("Authorization", auth);
    expect(get.status).toBe(200);
    expect(get.body.data.origin_countries).toEqual(["VN", "TH"]);
    expect(get.body.data.proven_regions).toEqual([
      { country_code: "VN", subdivision_code: "HCM" },
      { country_code: "US" },
    ]);
    expect(get.body.data.adaptation_term_codes).toEqual(["hot", "humid", "tropical"]);
    expect(get.body.data.resolved_geography.origin_country_source).toBe("own");
    expect(get.body.data.resolved_geography.adaptation_term_source).toBe("own");
    expect(get.body.data.resolved_geography.inherited_from_id).toBeNull();

    // Provenance survives for every assignment category (design doc §1.5).
    expect(get.body.data.origin_country_source_refs).toEqual({
      VN: [{ sourceSystem: "seed-catalog" }],
      TH: [],
    });
    expect(get.body.data.adaptation_term_source_refs).toEqual({
      hot: [{ sourceName: "Tropical handbook" }],
      humid: [],
      tropical: [],
    });
  });

  it("preserves on omission and clears on []", async () => {
    const { app, auth } = await makeApp();

    const create = await createPlant(app, auth, {
      origin_countries: ["VN"],
      adaptation_term_codes: ["hot"],
    });
    const id = create.body.data.id;

    // Omission (PATCH without geography fields) preserves the assignments.
    const patch = await request(app)
      .patch(`/api/master-plants/${id}`)
      .set("Authorization", auth)
      .send({ common_name: "Renamed" });
    expect(patch.status).toBe(200);
    expect(patch.body.data.origin_countries).toEqual(["VN"]);
    expect(patch.body.data.adaptation_term_codes).toEqual(["hot"]);

    // Explicit [] clears only the listed categories.
    const clear = await request(app)
      .patch(`/api/master-plants/${id}`)
      .set("Authorization", auth)
      .send({ origin_countries: [], adaptation_term_codes: [] });
    expect(clear.status).toBe(200);
    expect(clear.body.data.origin_countries).toEqual([]);
    expect(clear.body.data.adaptation_term_codes).toEqual([]);
  });

  it("rejects unknown country codes at save time", async () => {
    const { app, auth } = await makeApp();

    const bad = await createPlant(app, auth, { origin_countries: ["XX"] });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/Unknown country code/);

    const badRegion = await createPlant(app, auth, { proven_regions: [{ country_code: "ZZ" }] });
    expect(badRegion.status).toBe(400);
    expect(badRegion.body.error).toMatch(/Unknown country code/);
  });

  it("rejects unknown/archived term codes when the mirror is populated, fail-open when empty", async () => {
    const { app, auth } = await makeApp();

    // Empty mirror: structurally valid unknown codes pass (Convex is the gate).
    const open = await createPlant(app, auth, {
      plant_code: "GEO_OPEN",
      source_id: "geo-open",
      adaptation_term_codes: ["hot"],
    });
    expect(open.status).toBe(201);

    // Populate the mirror with one active term; unknown codes now fail closed.
    db.prepare(`INSERT INTO adaptation_terms (code, dimension, status, sort_order) VALUES (?, 'temperature', 'active', 1)`)
      .run("cool");
    const closed = await createPlant(app, auth, {
      plant_code: "GEO_CLOSED",
      source_id: "geo-closed",
      adaptation_term_codes: ["hot"],
    });
    expect(closed.status).toBe(400);
    expect(closed.body.error).toMatch(/Unknown adaptation term code/);

    const archived = await createPlant(app, auth, {
      plant_code: "GEO_ARCHIVED_OK",
      source_id: "geo-archived-ok",
      adaptation_term_codes: ["cool"],
    });
    expect(archived.status).toBe(201);
    db.prepare(`UPDATE adaptation_terms SET status = 'archived' WHERE code = 'cool'`).run();
    const archivedReject = await createPlant(app, auth, {
      plant_code: "GEO_ARCHIVED_REJECT",
      source_id: "geo-archived-reject",
      adaptation_term_codes: ["cool"],
    });
    expect(archivedReject.status).toBe(400);
    expect(archivedReject.body.error).toMatch(/Archived adaptation term code/);
  });

  it("allows re-saving a plant that already holds an archived term (unrelated edits)", async () => {
    const { app, auth } = await makeApp();

    db.prepare(`INSERT INTO adaptation_terms (code, dimension, status, sort_order) VALUES (?, 'temperature', 'active', 1)`)
      .run("cool");
    const created = await createPlant(app, auth, { adaptation_term_codes: ["cool"] });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    db.prepare(`UPDATE adaptation_terms SET status = 'archived' WHERE code = 'cool'`).run();

    // Unrelated field edit: the own payload still carries the archived code
    // and the already-assigned code is preserved (mirrors the Convex rule).
    const patch = await request(app)
      .patch(`/api/master-plants/${id}`)
      .set("Authorization", auth)
      .send({ common_name: "Renamed", adaptation_term_codes: ["cool"] });
    expect(patch.status).toBe(200);
    expect(patch.body.data.adaptation_term_codes).toEqual(["cool"]);

    // A brand-new assignment to the archived term is still rejected.
    const blocked = await createPlant(app, auth, {
      plant_code: "GEO_NEW",
      source_id: "geo-new",
      adaptation_term_codes: ["cool"],
    });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toMatch(/Archived adaptation term code/);
  });

  it("rejects malformed subdivision codes with a distinct error", async () => {
    const { app, auth } = await makeApp();

    const bad = await createPlant(app, auth, {
      proven_regions: [{ country_code: "VN", subdivision_code: "hcm!" }],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/Invalid subdivision code/);

    const valid = await createPlant(app, auth, {
      plant_code: "GEO_SUB_OK",
      source_id: "geo-sub-ok",
      proven_regions: [{ country_code: "VN", subdivision_code: "HCM" }],
    });
    expect(valid.status).toBe(201);
  });

  it("rejects duplicate geography assignments before SQLite replace writes", async () => {
    const { app, auth } = await makeApp();

    const duplicateOrigin = await createPlant(app, auth, {
      plant_code: "GEO_DUP_ORIGIN",
      source_id: "geo-dup-origin",
      origin_countries: ["VN", "VN"],
    });
    expect(duplicateOrigin.status).toBe(400);
    expect(duplicateOrigin.body.error).toMatch(/Duplicate origin country assignment: VN/);

    const duplicateRegion = await createPlant(app, auth, {
      plant_code: "GEO_DUP_REGION",
      source_id: "geo-dup-region",
      proven_regions: [
        { country_code: "VN", subdivision_code: "HCM" },
        { country_code: "VN", subdivision_code: "HCM" },
      ],
    });
    expect(duplicateRegion.status).toBe(400);
    expect(duplicateRegion.body.error).toMatch(/Duplicate proven region assignment: VN\/HCM/);

    const duplicateTerm = await createPlant(app, auth, {
      plant_code: "GEO_DUP_TERM",
      source_id: "geo-dup-term",
      adaptation_term_codes: ["hot", "hot"],
    });
    expect(duplicateTerm.status).toBe(400);
    expect(duplicateTerm.body.error).toMatch(/Duplicate adaptation term assignment: hot/);
  });

  it("inherits geography from the base plant when the cultivar has no own assignments", async () => {
    const { app, auth } = await makeApp();

    const base = await request(app).post("/api/master-plants").set("Authorization", auth).send({
      plant_code: "TOMATO_BASE",
      common_name: "Tomato",
      scientific_name: "Solanum lycopersicum",
      source_system: "sqlite",
      source_id: "geo-base",
      origin_countries: ["US", "MX"],
      adaptation_term_codes: ["warm", "moderate"],
      i18n: {
        vi: { common_name: "Cà chua" },
        en: { common_name: "Tomato" },
      },
    });
    expect(base.status).toBe(201);

    const cultivar = await request(app).post("/api/master-plants").set("Authorization", auth).send({
      plant_code: "TOMATO_VN",
      common_name: "Cà chua cherry",
      scientific_name: "Solanum lycopersicum",
      source_system: "sqlite",
      source_id: "geo-cultivar",
      metadata_json: { cultivar: "Cherry" },
      origin_countries: ["VN"],
      i18n: {
        vi: { common_name: "Cà chua cherry" },
        en: { common_name: "Tomato cherry" },
      },
    });
    expect(cultivar.status).toBe(201);
    const cultivarId = cultivar.body.data.id;

    const get = await request(app).get(`/api/master-plants/${cultivarId}`).set("Authorization", auth);
    const geo = get.body.data.resolved_geography;
    // Own origin wins; missing categories inherit from the base.
    expect(geo.origin_country_codes).toEqual(["VN"]);
    expect(geo.origin_country_source).toBe("own");
    expect(geo.adaptation_term_codes).toEqual(["warm", "moderate"]);
    expect(geo.adaptation_term_source).toBe("inherited");
    expect(geo.inherited_from_id).toBe(base.body.data.id);
    // The editing view still shows only the cultivar's own rows.
    expect(get.body.data.origin_countries).toEqual(["VN"]);
    expect(get.body.data.adaptation_term_codes).toEqual([]);
  });

  it("rides geography arrays inside the upsert_plant outbox payload", async () => {
    const { app, auth } = await makeApp();

    const create = await createPlant(app, auth, {
      origin_countries: ["VN"],
      proven_regions: [{ country_code: "VN", subdivision_code: "HCM" }],
      adaptation_term_codes: ["hot", "humid", "tropical"],
    });
    expect(create.status).toBe(201);

    const outbox = db.prepare(
      `SELECT payload_json FROM sync_outbox WHERE entity_type = 'master_plant' AND operation = 'upsert_plant' AND source_id = 'geo-test-1'`,
    ).all() as Array<{ payload_json: string }>;
    expect(outbox.length).toBeGreaterThan(0);
    const payload = JSON.parse(outbox[0].payload_json);
    expect(payload.origin_countries).toEqual(["VN"]);
    expect(payload.proven_regions).toEqual([{ country_code: "VN", subdivision_code: "HCM" }]);
    expect(payload.adaptation_term_codes).toEqual(["hot", "humid", "tropical"]);
  });

  it("reports mirror and join-table health with orphan detection", async () => {
    const { app, auth } = await makeApp();

    db.prepare(`INSERT INTO adaptation_terms (code, dimension, status, sort_order) VALUES (?, 'temperature', 'active', 1)`)
      .run("cool");
    db.prepare(`INSERT INTO adaptation_term_i18n (term_code, locale, label, translation_status) VALUES ('cool', 'vi', 'Mát', 'human_reviewed')`).run();
    // Orphaned join rows: no matching master plant. FK is disabled around the
    // inserts so the health report's orphan detection can be exercised.
    db.pragma("foreign_keys = OFF");
    db.prepare(`INSERT INTO plant_origin_countries (master_plant_id, country_code) VALUES (999999, 'VN')`).run();
    db.prepare(`INSERT INTO plant_adaptation_terms (master_plant_id, term_code) VALUES (999999, 'cool')`).run();
    db.prepare(`INSERT INTO plant_adaptation_terms (master_plant_id, term_code) VALUES (999999, 'ghost')`).run();
    db.prepare(`INSERT INTO adaptation_term_i18n (term_code, locale, label, translation_status) VALUES ('ghost', 'vi', 'Bóng ma', 'missing')`).run();
    db.pragma("foreign_keys = ON");

    const created = await createPlant(app, auth, { origin_countries: ["VN"], adaptation_term_codes: ["cool"] });
    expect(created.status).toBe(201);

    const { adaptationTermsHealth } = await import("../src/master-plants");
    const report = adaptationTermsHealth(db);
    expect(report.mirror.terms).toBe(1);
    expect(report.mirror.i18n).toBe(2);
    expect(report.joins.origin).toBe(2);
    expect(report.joins.adaptationTerms).toBe(3);
    expect(report.orphans.origin).toBe(1);
    expect(report.orphans.provenRegions).toBe(0);
    expect(report.orphans.adaptationTerms).toBe(2);
    expect(report.orphans.adaptationTermCodes).toBe(1);
    expect(report.orphans.i18n).toBe(1);
  });

  it("serves the taxonomy mirror and refreshes it from Convex (admin-only)", async () => {
    const convexTerms = [
      {
        code: "cool",
        dimension: "temperature",
        status: "active",
        sortOrder: 1,
        usageCount: 0,
        translations: [
          { locale: "vi", label: "Mát", description: "Định nghĩa mát.", translationStatus: "human_reviewed" },
          { locale: "en", label: "Cool", description: "Cool definition.", translationStatus: "human_reviewed" },
        ],
      },
    ];
    const syncService = {
      isAdminProxyEnabled: () => true,
      adminQuery: async (path: string) => {
        if (path === "plantAdmin:listAdaptationTerms") return convexTerms;
        throw new Error(`unexpected path ${path}`);
      },
    } as unknown as import("../src/convex-sync").ConvexSyncService;

    const appWithSync = createApp(db, {
      auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" },
      syncService,
    });
    const auth = await loginAs(appWithSync, "admin@example.com");

    const empty = await request(appWithSync).get("/api/adaptation-terms").set("Authorization", auth);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual([]);

    const refresh = await request(appWithSync).post("/api/adaptation-terms/refresh").set("Authorization", auth);
    expect(refresh.status).toBe(200);
    expect(refresh.body.data.mirror.terms).toBe(1);

    const listed = await request(appWithSync).get("/api/adaptation-terms").set("Authorization", auth);
    expect(listed.body.data[0].code).toBe("cool");
    expect(listed.body.data[0].translations).toHaveLength(2);

    // The refreshed mirror becomes the fail-closed authoring gate.
    const rejected = await createPlant(appWithSync, auth, {
      plant_code: "GEO_MIRROR_CLOSED",
      source_id: "geo-mirror-closed",
      adaptation_term_codes: ["hot"],
    });
    expect(rejected.status).toBe(400);

    // An empty Convex response never wipes a populated mirror.
    const emptySync = {
      isAdminProxyEnabled: () => true,
      adminQuery: async () => [],
    } as unknown as import("../src/convex-sync").ConvexSyncService;
    const appEmpty = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" }, syncService: emptySync });
    const authEmpty = await loginAs(appEmpty, "admin@example.com");
    const refuse = await request(appEmpty).post("/api/adaptation-terms/refresh").set("Authorization", authEmpty);
    expect(refuse.status).toBe(502);
    const stillThere = await request(appEmpty).get("/api/adaptation-terms").set("Authorization", authEmpty);
    expect(stillThere.body.data).toHaveLength(1);
  });

  it("represents the three approved tomato pilot fixtures with distinct geography semantics", async () => {
    const { app, auth } = await makeApp();
    const fixtures = [
      {
        plant_code: "TOMATO_BRANDYWINE",
        source_id: "tomato-brandywine",
        origin_countries: ["US"],
        proven_regions: [{ country_code: "US" }],
        adaptation_term_codes: ["warm", "moderate", "temperate", "frost_free"],
      },
      {
        plant_code: "TOMATO_VN_CHERRY_01",
        source_id: "tomato-vn-cherry-01",
        origin_countries: ["VN"],
        proven_regions: [{ country_code: "VN" }],
        adaptation_term_codes: ["hot", "humid", "tropical", "frost_free"],
      },
      {
        plant_code: "TOMATO_TOMMY_TOE",
        source_id: "tomato-tommy-toe",
        origin_countries: ["AU"],
        proven_regions: [{ country_code: "AU" }],
        adaptation_term_codes: ["warm", "moderate", "temperate", "frost_free"],
      },
    ];

    for (const fixture of fixtures) {
      const response = await request(app).post("/api/master-plants").set("Authorization", auth).send({
        common_name: `Tomato ${fixture.source_id}`,
        scientific_name: "Solanum lycopersicum",
        source_system: "sqlite",
        i18n: {
          vi: { common_name: `Cà chua ${fixture.source_id}` },
          en: { common_name: `Tomato ${fixture.source_id}` },
        },
        ...fixture,
      });
      expect(response.status).toBe(201);
      const geo = response.body.data.resolved_geography;
      // Three meanings stay distinct: origin is never used as proven evidence
      // and adaptation is the independent suitability signal.
      expect(geo.origin_country_codes).toEqual(fixture.origin_countries);
      expect(geo.proven_regions.map((region: { country_code: string }) => region.country_code))
        .toEqual(fixture.proven_regions.map((region) => region.country_code));
      expect(geo.adaptation_term_codes).toEqual(fixture.adaptation_term_codes);
      expect(geo.origin_country_source).toBe("own");
    }
  });
});
