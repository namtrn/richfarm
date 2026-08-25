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

function identityForScientific(scientificName: string, cultivar: string | null = null) {
  const [genus, species] = scientificName.trim().split(/\s+/);
  return baseIdentity(genus, species, cultivar);
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
      ...identityForScientific("Ocimum basilicum"),
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
        vi: { common_name: "Húng quế", description: "Rau thơm", care_content: "## Tưới nước\n\nGiữ ẩm đều.", content_version: 3 },
        en: { common_name: "Basil", description: "Herb", care_content: "## Watering\n\nKeep evenly moist.", content_version: 3 },
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
    expect(exported.body[0].i18n.es.care_content).toBeUndefined();
    expect(exported.body[0].i18n.vi.care_content).toBe("## Tưới nước\n\nGiữ ẩm đều.");
  });

  it("persists locally before publishing and never replays stale outbox payloads over local edits", async () => {
    const syncService = {
      isEnabled: () => true,
      canReadFromConvex: () => false,
      syncUpsert: async () => undefined,
      syncDelete: async () => undefined,
    } as unknown as ConvexSyncService;
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" }, syncService });
    const auth = await login(app);
    const response = await request(app).post("/api/master-plants").set("Authorization", auth).send({
      plant_code: "OUTBOX_001",
      common_name: "Outbox plant",
      scientific_name: "Outboxium plantus",
      ...identityForScientific("Outboxium plantus"),
      source_system: "sqlite",
      source_id: "outbox-1",
      i18n: { vi: { common_name: "Cây outbox" }, en: { common_name: "Outbox plant" } },
    });
    expect(response.status).toBe(201);
    expect(response.body.queued).toBe(true);
    expect((db.prepare(`SELECT COUNT(*) AS count FROM master_plants WHERE source_id = 'outbox-1' AND sync_origin = 'local'`).get() as { count: number }).count).toBe(1);
    expect((db.prepare(`SELECT status FROM sync_outbox WHERE source_id = 'outbox-1'`).get() as { status: string }).status).toBe("pending");

    const update = await request(app)
      .patch(`/api/master-plants/${response.body.data.id}`)
      .set("Authorization", auth)
      .send({ common_name: "Newer local name" });
    expect(update.status).toBe(200);
    expect(update.body.queued).toBe(true);

    const process = await request(app).post("/api/master-plants/sync-outbox/process").set("Authorization", auth);
    expect(process.status).toBe(200);
    // Enqueue coalesces pending upserts by source identity, so only the latest
    // payload is published.
    expect(process.body.applied).toBe(1);
    const persisted = db.prepare(`SELECT common_name, sync_origin FROM master_plants WHERE source_id = 'outbox-1'`).get() as { common_name: string; sync_origin: string };
    expect(persisted).toEqual({ common_name: "Newer local name", sync_origin: "local" });
  });

  it("queues local plant and i18n writes even when Convex sync is disabled", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const auth = await login(app);
    const created = await request(app).post("/api/master-plants").set("Authorization", auth).send({
      plant_code: "LOCAL_QUEUE_1",
      common_name: "Local queue plant",
      scientific_name: "Queueus localis",
      ...identityForScientific("Queueus localis"),
      source_system: "sqlite",
      source_id: "local-queue-1",
      i18n: { vi: { common_name: "Cây hàng đợi" }, en: { common_name: "Local queue plant" } },
    });
    expect(created.status).toBe(201);
    expect(created.body.queued).toBe(true);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM sync_outbox WHERE source_id = 'local-queue-1' AND operation = 'upsert_plant' AND status = 'pending'`).get() as { n: number }).n).toBe(1);

    const translation = await request(app).post("/api/master-plants-i18n").set("Authorization", auth).send({
      master_plant_id: created.body.data.id,
      locale: "ES",
      common_name: "Planta local",
      care_content: "## Riego\n\nRegar por la mañana.",
      content_origin: "authored",
    });
    expect(translation.status).toBe(201);
    expect(translation.body).toMatchObject({ queued: true, data: { locale: "es", care_content: "## Riego\n\nRegar por la mañana.", content_origin: "authored" } });
    expect((db.prepare(`SELECT COUNT(*) AS n FROM sync_outbox WHERE source_id = 'local-queue-1' AND operation = 'upsert_i18n' AND locale = 'es' AND status = 'pending'`).get() as { n: number }).n).toBe(1);
  });

  it("queue-local assigns stable legacy identities, dedupes, and never publishes", async () => {
    let publishCalls = 0;
    const syncService = {
      isEnabled: () => true,
      canReadFromConvex: () => false,
      syncUpsert: async () => { publishCalls += 1; },
      syncDelete: async () => { publishCalls += 1; },
    } as unknown as ConvexSyncService;
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" }, syncService });
    const auth = await login(app);
    const created = await request(app).post("/api/master-plants").set("Authorization", auth).send({
      plant_code: "LEGACY_LOCAL_1",
      common_name: "Legacy local",
      scientific_name: "Legacyus localis",
      ...identityForScientific("Legacyus localis"),
      source_system: "sqlite",
      source_id: "temporary-id",
      i18n: { vi: { common_name: "Cây cũ" }, en: { common_name: "Legacy local" } },
    });
    expect(created.status).toBe(201);
    db.prepare(`DELETE FROM sync_outbox`).run();
    db.prepare(`UPDATE master_plants SET source_id = NULL WHERE id = ?`).run(created.body.data.id);

    const first = await request(app).post("/api/master-plants/sync-outbox/queue-local").set("Authorization", auth);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true, scanned: 1, queued: 1, identitiesAssigned: 1, publishStarted: false });
    expect(publishCalls).toBe(0);
    const stableId = `sqlite-local-${created.body.data.id}`;
    expect((db.prepare(`SELECT source_id FROM master_plants WHERE id = ?`).get(created.body.data.id) as { source_id: string }).source_id).toBe(stableId);

    const second = await request(app).post("/api/master-plants/sync-outbox/queue-local").set("Authorization", auth);
    expect(second.body).toMatchObject({ scanned: 1, queued: 1, identitiesAssigned: 0, publishStarted: false });
    expect(publishCalls).toBe(0);
    const queued = db.prepare(`SELECT source_id, status, payload_json FROM sync_outbox`).all() as Array<{ source_id: string; status: string; payload_json: string }>;
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ source_id: stableId, status: "pending" });
    expect(JSON.parse(queued[0].payload_json).source_id).toBe(stableId);
  });

  it("maps i18n REST list, create, update, delete, and required-locale guard", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const auth = await login(app);
    const plant = await request(app).post("/api/master-plants").set("Authorization", auth).send({
      plant_code: "I18N_REST_1",
      common_name: "Rosemary",
      scientific_name: "Salvia rosmarinus",
      ...identityForScientific("Salvia rosmarinus"),
      group: "herb",
      i18n: { vi: { common_name: "Hương thảo" }, en: { common_name: "Rosemary" } },
    });
    const created = await request(app).post("/api/master-plants-i18n").set("Authorization", auth).send({
      master_plant_id: plant.body.data.id,
      locale: "FR",
      common_name: "Romarin",
      care_content: "## Soleil\n\nPlein soleil.",
      content_origin: "imported",
    });
    expect(created.status).toBe(201);

    const listed = await request(app).get("/api/master-plants-i18n?locale=FR").set("Authorization", auth);
    expect(listed.body.data).toEqual([expect.objectContaining({
      id: created.body.data.id,
      master_plant_id: plant.body.data.id,
      locale: "fr",
      common_name: "Romarin",
      care_content: "## Soleil\n\nPlein soleil.",
      content_origin: "imported",
      plant_scientific_name: "Salvia rosmarinus",
      plant_group: "herb",
    })]);

    const updated = await request(app).patch(`/api/master-plants-i18n/${created.body.data.id}`).set("Authorization", auth).send({
      common_name: "Romarin officinal",
      care_content: "## Lumière\n\nPlein soleil, arroser 2×.",
      content_origin: "authored",
    });
    expect(updated.body).toMatchObject({ queued: true, data: { common_name: "Romarin officinal", care_content: "## Lumière\n\nPlein soleil, arroser 2×.", content_origin: "authored" } });

    const requiredVi = db.prepare(`SELECT id FROM master_plant_i18n WHERE master_plant_id = ? AND locale = 'vi'`).get(plant.body.data.id) as { id: number };
    const guarded = await request(app).delete(`/api/master-plants-i18n/${requiredVi.id}`).set("Authorization", auth);
    expect(guarded.status).toBe(400);
    expect(guarded.body.error).toBe("vi and en translations are required");
    const removed = await request(app).delete(`/api/master-plants-i18n/${created.body.data.id}`).set("Authorization", auth);
    expect(removed.status).toBe(204);
    expect(db.prepare(`SELECT 1 FROM master_plant_i18n WHERE id = ?`).get(created.body.data.id)).toBeUndefined();
    expect((db.prepare(`SELECT operation, locale FROM sync_outbox WHERE source_id = ? AND operation = 'delete_i18n'`).get(plant.body.data.source_id) as { operation: string; locale: string })).toEqual({ operation: "delete_i18n", locale: "fr" });
  });

  it("provides deterministic SQLite search, missing-i18n stats, and cluster pagination", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const auth = await login(app);
    const plants = [
      { plant_code: "SPINACH_1", common_name: "Malabar spinach", scientific_name: "Basella alba", ...identityForScientific("Basella alba"), family: "Basellaceae", group: "leafy", image_url: "https://example.com/a.jpg", i18n: { vi: { common_name: "Mồng tơi" }, en: { common_name: "Malabar spinach" } } },
      { plant_code: "BASIL_1", common_name: "Basil", scientific_name: "Ocimum basilicum", ...identityForScientific("Ocimum basilicum"), family: "Lamiaceae", group: "herb", i18n: { vi: { common_name: "Húng quế" }, en: { common_name: "Basil" } } },
      { plant_code: "MINT_1", common_name: "Mint", scientific_name: "Mentha spicata", ...identityForScientific("Mentha spicata"), family: "Lamiaceae", group: "herb", i18n: { vi: { common_name: "Bạc hà" }, en: { common_name: "Mint" } } },
      { plant_code: "DILL_1", common_name: "Dill", scientific_name: "Anethum graveolens", ...identityForScientific("Anethum graveolens"), family: "Apiaceae", group: "herb", i18n: { vi: { common_name: "Thì là" }, en: { common_name: "Dill" } } },
    ];
    for (const plant of plants) {
      const created = await request(app).post("/api/master-plants").set("Authorization", auth).send(plant);
      expect(created.status).toBe(201);
    }
    db.prepare(`DELETE FROM master_plant_i18n WHERE locale = 'en' AND master_plant_id = (SELECT id FROM master_plants WHERE plant_code = 'MINT_1')`).run();
    db.prepare(`DELETE FROM master_plant_i18n WHERE locale = 'vi' AND master_plant_id = (SELECT id FROM master_plants WHERE plant_code = 'DILL_1')`).run();

    const accented = await request(app).get("/api/master-plants?source=sqlite&search=m%E1%BB%93ng%20t%C6%A1i").set("Authorization", auth);
    const plain = await request(app).get("/api/master-plants?source=sqlite&search=mong%20toi").set("Authorization", auth);
    expect(accented.body.data.map((row: { plant_code: string }) => row.plant_code)).toEqual(["SPINACH_1"]);
    expect(plain.body.data.map((row: { plant_code: string }) => row.plant_code)).toEqual(["SPINACH_1"]);

    const missing = await request(app).get("/api/master-plants?source=sqlite&missing_i18n=true").set("Authorization", auth);
    expect(missing.body.data.map((row: { plant_code: string }) => row.plant_code).sort()).toEqual(["DILL_1", "MINT_1"]);
    const stats = await request(app).get("/api/master-plants/stats?source=sqlite").set("Authorization", auth);
    expect(stats.body).toMatchObject({ total: 4, missingVi: 1, missingEn: 1, missingI18n: 2, missingImage: 3 });

    const page1 = await request(app).get("/api/master-plants?source=sqlite&view_mode=family&page=1&page_size=2").set("Authorization", auth);
    const page2 = await request(app).get("/api/master-plants?source=sqlite&view_mode=family&page=2&page_size=2").set("Authorization", auth);
    expect(page1.body.pagination).toEqual({ page: 1, page_size: 2, total: 4 });
    expect([...page1.body.data, ...page2.body.data].map((row: { plant_code: string }) => row.plant_code)).toEqual([
      "DILL_1", "SPINACH_1", "BASIL_1", "MINT_1",
    ]);
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
      ...identityForScientific("Testus carestatus"),
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
      scientific_name: "Deleteus guardus",
      ...identityForScientific("Deleteus guardus"),
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
      scientific_name: "Editorus okus",
      ...identityForScientific("Editorus okus"),
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
      scientific_name: `Identityus ${code.toLowerCase()}`,
      ...identityForScientific(`Identityus ${code.toLowerCase()}`),
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
    const create = async (code: string, sourceId: string, metadata_json: Record<string, unknown> = {}) => {
      const cultivar = typeof metadata_json.cultivar === "string" ? metadata_json.cultivar : null;
      return request(app).post("/api/master-plants").set("Authorization", auth).send({
        plant_code: code,
        common_name: code,
        scientific_name: "Ocimum basilicum",
        ...identityForScientific("Ocimum basilicum", cultivar),
        source_system: "sqlite",
        source_id: sourceId,
        metadata_json,
        i18n: {
          vi: { common_name: `${code} vi` },
          en: { common_name: `${code} en` },
        },
      });
    };

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

  it("mirrors Convex Markdown care byte-for-byte into SQLite (no JSON envelope)", async () => {
    // Plan L128 regression: Markdown starting with a heading, containing
    // Unicode, quotes, and newlines must reach SQLite unchanged; never
    // produce `{}`, `{ text: ... }`, a JSON envelope, or a missing field.
    const markdown = "## Chăm sóc\n\nGiữ ẩm đều — câu \"trích dẫn\" và dòng mới.\n\n- Tưới buổi sáng\n- Kiểm tra lá";
    const syncService = {
      isEnabled: () => true,
      canReadFromConvex: () => true,
      fetchAdminMasterPlants: async () => [{
        _id: "md-1",
        scientificName: "Ocimum basilicum",
        displayName: "Húng quế",
        sourceSystem: "convex",
        sourceId: "md-1",
        group: "herbs",
        family: "Lamiaceae",
        imageUrl: null,
        isActive: true,
        i18nRows: [
          { locale: "vi", commonName: "Húng quế", careContent: markdown },
          { locale: "en", commonName: "Basil" },
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
    expect(response.body.upserted).toBe(1);

    const row = db.prepare(`SELECT care_content FROM master_plant_i18n WHERE master_plant_id = (SELECT id FROM master_plants WHERE source_id = 'md-1') AND locale = 'vi'`).get() as { care_content: string | null };
    expect(row.care_content).toBe(markdown);
    // No JSON envelope, no {text} wrapper, no "{}" fallback, no missing field.
    expect(row.care_content).not.toBe("{}");
    expect(row.care_content).not.toMatch(/^\{ "text":/);
    expect(row.care_content).not.toContain('"format"');
    expect(row.care_content).toContain("## Chăm sóc");
    expect(row.care_content).toContain("câu \"trích dẫn\"");
    expect(row.care_content).toContain("dòng mới");
    // en row without care stays NULL (absent, not invented).
    const enRow = db.prepare(`SELECT care_content FROM master_plant_i18n WHERE master_plant_id = (SELECT id FROM master_plants WHERE source_id = 'md-1') AND locale = 'en'`).get() as { care_content: string | null };
    expect(enRow.care_content).toBeNull();
  });

  it("drains outbox to the newest full-i18n Markdown payload (upsert_i18n newest-wins)", async () => {
    // Plan L196: upsert_plant and upsert_i18n have different dedupe keys and
    // may transiently publish different full-i18n snapshots; assert the final
    // published state after the queue drains.
    const published: Array<Record<string, unknown>> = [];
    const syncService = {
      isEnabled: () => true,
      canReadFromConvex: () => false,
      syncUpsert: async (payload: Record<string, unknown>) => { published.push(payload); },
      syncDelete: async () => undefined,
    } as unknown as ConvexSyncService;
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" }, syncService });
    const auth = await login(app);

    const created = await request(app).post("/api/master-plants").set("Authorization", auth).send({
      plant_code: "OUTBOX_MD_1",
      common_name: "Markdown plant",
      scientific_name: "Markdownus plantus",
      ...identityForScientific("Markdownus plantus"),
      source_system: "sqlite",
      source_id: "outbox-md-1",
      i18n: {
        vi: { common_name: "Cây markdown", care_content: "## V1\n\nNội dung cũ." },
        en: { common_name: "Markdown plant" },
      },
    });
    expect(created.status).toBe(201);
    expect(created.body.queued).toBe(true);

    // PATCH overwrites the i18n payload with a newer Markdown snapshot.
    const patched = await request(app)
      .patch(`/api/master-plants/${created.body.data.id}`)
      .set("Authorization", auth)
      .send({
        i18n: {
          vi: { common_name: "Cây markdown", care_content: "## V2\n\nNội dung mới \"quoted\"." },
          en: { common_name: "Markdown plant" },
        },
      });
    expect(patched.status).toBe(200);
    expect(patched.body.queued).toBe(true);

    const drain = await request(app).post("/api/master-plants/sync-outbox/process?limit=100").set("Authorization", auth);
    expect(drain.status).toBe(200);

    // Every published payload must carry Markdown strings, never JSON objects.
    for (const payload of published) {
      const i18n = payload.i18n as Record<string, Record<string, unknown>> | undefined;
      if (i18n?.vi) {
        expect(typeof i18n.vi.care_content).toBe("string");
        expect(i18n.vi.care_content).not.toMatch(/^\{/);
      }
    }

    // After the queue drains, the newest i18n snapshot wins: the final
    // published vi care content is V2, and no outbox item stays pending.
    const lastPublished = published[published.length - 1];
    const vi = (lastPublished?.i18n as Record<string, { care_content: string }>)?.vi;
    expect(vi?.care_content).toBe("## V2\n\nNội dung mới \"quoted\".");
    const pending = db.prepare(`SELECT COUNT(*) AS n FROM sync_outbox WHERE source_id = 'outbox-md-1' AND status IN ('pending', 'failed')`).get() as { n: number };
    expect(pending.n).toBe(0);
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
