import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import jwt from "jsonwebtoken";
import request from "supertest";

import { afterEach, describe, expect, it } from "vitest";

import { createDatabase, type SqliteDatabase } from "../src/db";
import { createApp } from "../src/app";
import {
  CANONICAL_IDENTITY_VERSION,
  canonicalKeyFromPlantIdentity,
} from "../../../packages/shared/src/canonicalPlantIdentity";
import { stableJson } from "../src/content-manifests";
import { initializePlantManifest } from "../src/content-manifests";
import { runLegacyBaseline, runStartupCatchUp, scanContentRoot } from "../src/content-source/scanner";
import {
  applyProposal,
  approveEvents,
  buildEventPreview,
  dismissEvents,
} from "../src/content-source/review-service";
import { listChangeEvents } from "../src/content-source/repository";

const databases: SqliteDatabase[] = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

const ACTOR = { id: "1:reviewer@richfarm.test", role: "admin" as const };

function openDatabase(): SqliteDatabase {
  const db = createDatabase(":memory:");
  databases.push(db);
  return db;
}

function insertPlant(
  db: SqliteDatabase,
  options: { plantCode: string; genus: string; species: string },
): number {
  const canonicalKey = canonicalKeyFromPlantIdentity({
    genus: options.genus,
    species: options.species,
    rank: null,
    infraspecificName: null,
    cultivar: null,
    scope: "base",
    parentCanonicalKey: null,
    parentMasterPlantId: null,
  });
  const result = db
    .prepare(
      `INSERT INTO master_plants (
         plant_code, common_name, scientific_name, source_system, source_id,
         canonical_identity_version, canonical_key, genus, species,
         infraspecific_rank, infraspecific_name, cultivar, identity_scope,
         parent_master_plant_id, parent_canonical_key, canonical_status
       ) VALUES (?, ?, ?, 'sqlite', ?, ?, ?, ?, ?, NULL, NULL, NULL, 'base', NULL, NULL, 'active')`,
    )
    .run(
      options.plantCode,
      options.plantCode,
      `${options.genus} ${options.species}`,
      `mcd5-${options.plantCode.toLowerCase()}`,
      CANONICAL_IDENTITY_VERSION,
      canonicalKey,
      options.genus.toLowerCase(),
      options.species.toLowerCase(),
    );
  const id = Number(result.lastInsertRowid);
  for (const locale of ["en", "vi"]) {
    db.prepare(
      `INSERT INTO master_plant_i18n
         (master_plant_id, locale, common_name, content_version, content_status,
          review_status, content_origin, source_refs_json)
       VALUES (?, ?, ?, 1, 'published', 'unreviewed', 'imported', '[]')`,
    ).run(id, locale, options.plantCode);
  }
  return id;
}

function makeTree(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "csrc-review-"));
  temporaryDirectories.push(root);
  fs.mkdirSync(path.join(root, "content", "plants"), { recursive: true });
  fs.mkdirSync(path.join(root, "content", "pests-diseases"), { recursive: true });
  return root;
}

function writeBoundEntity(
  db: SqliteDatabase,
  root: string,
  slug: string,
  plantCode: string,
  viContent: string,
  enContent = `${slug} english source`,
): void {
  const directory = path.join(root, "content", "plants", slug);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "vi.md"), viContent, "utf8");
  fs.writeFileSync(path.join(directory, "en.md"), enContent, "utf8");
  const generated = initializePlantManifest({ db, directoryPath: directory, plantCode });
  expect(generated.manifest).not.toBeNull();
  fs.writeFileSync(path.join(directory, "content.json"), stableJson(generated.manifest), "utf8");
}

interface SeededEvent {
  db: SqliteDatabase;
  root: string;
  viEventId: string;
  manifestEventId: string;
  eventIds: string[];
  slug: string;
  plantCode: string;
}

/**
 * Real authoring workflow: edit locale bytes, then regenerate the manifest as
 * an explicit reviewed replacement (CID-6 conflict-resolution contract), so
 * the journal ends with one `modified` and one `manifest_changed` event.
 */
function seedModifiedEvent(options: {
  plantCode: string;
  genus: string;
  species: string;
  slug: string;
  initialVi: string;
  editedVi: string;
}): SeededEvent {
  const db = openDatabase();
  insertPlant(db, options);
  const root = makeTree();
  writeBoundEntity(db, root, options.slug, options.plantCode, options.initialVi);
  runLegacyBaseline({ db, repositoryRoot: root }, { sealedAt: "2026-08-25T00:00:00.000Z" });
  runStartupCatchUp({ db, repositoryRoot: root });
  db.prepare(`DELETE FROM content_change_events`).run();

  fs.writeFileSync(
    path.join(root, "content", "plants", options.slug, "vi.md"),
    options.editedVi,
    "utf8",
  );
  runStartupCatchUp({ db, repositoryRoot: root });
  const viEventId = listChangeEvents(db, { reviewStates: ["pending"] }).items.find(
    (item) => item.path.endsWith("vi.md"),
  )!.event_id;

  // Author regenerates the manifest binding the new bytes, marking the
  // conflicting locale as a reviewed replacement.
  const directory = path.join(root, "content", "plants", options.slug);
  const generated = initializePlantManifest({
    db,
    directoryPath: directory,
    plantCode: options.plantCode,
  });
  expect(generated.manifest).not.toBeNull();
  const manifest = JSON.parse(stableJson(generated.manifest)) as Record<string, any>;
  manifest.locales.vi = {
    ...manifest.locales.vi,
    sha256: crypto.createHash("sha256").update(options.editedVi).digest("hex"),
    bytes: Buffer.byteLength(options.editedVi),
    content_version: 2,
    review_status: "reviewed",
    source_refs: [{ sourceSystem: "editorial", sourceLocator: `mcd5/${options.slug}` }],
    conflict_resolution: {
      resolution: "replace_database",
      reviewedBy: "mcd5-test",
      reviewedAt: "2026-08-25T00:00:00.000Z",
      reason: "reviewed replacement",
    },
  };
  fs.writeFileSync(path.join(directory, "content.json"), stableJson(manifest), "utf8");
  runStartupCatchUp({ db, repositoryRoot: root });

  const pending = listChangeEvents(db, { reviewStates: ["pending"] }).items;
  const manifestEventId = pending.find((item) => item.path.endsWith("content.json"))!.event_id;
  return {
    db,
    root,
    viEventId,
    manifestEventId,
    eventIds: [viEventId, manifestEventId],
    slug: options.slug,
    plantCode: options.plantCode,
  };
}

describe("MCD-5 review service: approve → apply happy flow", () => {
  it("imports through the existing dry-run/apply pipeline with outbox rows", () => {
    const seed = seedModifiedEvent({
      plantCode: "SOLANUM_LYCOPERSICUM_MCD5",
      genus: "Solanum",
      species: "lycopersicum",
      slug: "tomato",
      initialVi: "# tomato v1",
      editedVi: "# tomato v2 imported",
    });

    const preview = buildEventPreview(seed.db, seed.root, seed.viEventId);
    expect(preview.incomingExcerpt).toContain("# tomato v2 imported");
    expect(preview.manifestIdentity).toMatchObject({
      kind: "plant",
      plantCode: "SOLANUM_LYCOPERSICUM_MCD5",
    });

    const approval = approveEvents(seed.db, seed.root, {
      eventIds: seed.eventIds,
      actor: ACTOR,
      reason: "verified preview diff",
    });
    expect(approval.failures).toEqual([]);
    expect(approval.proposalId).not.toBeNull();
    expect(approval.approved).toHaveLength(2);
    expect(listChangeEvents(seed.db, { reviewStates: ["approved"] }).total).toBe(2);

    const outcome = applyProposal(seed.db, seed.root, {
      proposalId: approval.proposalId!,
      actor: ACTOR,
      reason: "apply reviewed tomato content",
    });
    expect(outcome.status).toBe("applied");
    if (outcome.status !== "applied") return;

    expect(outcome.updatedLocales).toBe(2);
    expect(outcome.appliedEventIds).toEqual(expect.arrayContaining(seed.eventIds));

    // SQLite staging updated + outbox enqueued; Convex is never called here.
    const careContent = (
      seed.db
        .prepare(
          `SELECT i.care_content FROM master_plant_i18n i
           JOIN master_plants p ON p.id = i.master_plant_id
           WHERE p.plant_code = ? AND i.locale = 'vi'`,
        )
        .get("SOLANUM_LYCOPERSICUM_MCD5") as { care_content: string }
    ).care_content;
    expect(careContent).toBe("# tomato v2 imported");
    const outboxRow = seed.db
      .prepare(
        `SELECT status FROM sync_outbox WHERE operation = 'upsert_i18n' ORDER BY id DESC LIMIT 1`,
      )
      .get() as { status: string };
    expect(outboxRow.status).toBe("pending");

    expect(listChangeEvents(seed.db, { reviewStates: ["applied"] }).total).toBe(2);

    // Index refreshed post-apply: a reconcile tick must not re-report the
    // just-applied change as another modification.
    const reconcile = scanContentRoot(
      { db: seed.db, repositoryRoot: seed.root, rootKey: "plants", detectorSource: "periodic_reconcile" },
      { mode: "periodic_reconcile" },
    );
    expect(reconcile.counts.eventsProduced).toBe(0);
  });
});

describe("MCD-5 stale gates", () => {
  it("rejects apply when an approved file changed on disk after approval", () => {
    const seed = seedModifiedEvent({
      plantCode: "CAPSICUM_ANNUUM_MCD5",
      genus: "Capsicum",
      species: "annuum",
      slug: "pepper",
      initialVi: "# pepper v1",
      editedVi: "# pepper v2",
    });
    const approval = approveEvents(seed.db, seed.root, {
      eventIds: seed.eventIds,
      actor: ACTOR,
      reason: "looks good",
    });

    fs.writeFileSync(
      path.join(seed.root, "content", "plants", "pepper", "vi.md"),
      "# pepper v3 sneaky",
      "utf8",
    );
    const outcome = applyProposal(seed.db, seed.root, {
      proposalId: approval.proposalId!,
      actor: ACTOR,
      reason: "apply",
    });
    expect(outcome).toMatchObject({ status: "rejected", code: "SCOPE_FILE_CHANGED_ON_DISK" });

    // Nothing was imported.
    const careContent = (
      seed.db
        .prepare(
          `SELECT i.care_content FROM master_plant_i18n i
           JOIN master_plants p ON p.id = i.master_plant_id
           WHERE p.plant_code = ? AND i.locale = 'vi'`,
        )
        .get("CAPSICUM_ANNUUM_MCD5") as { care_content: string | null }
    ).care_content;
    expect(careContent).toBeNull();
  });

  it("rejects via supersession when newer evidence lands after approval", () => {
    const seed = seedModifiedEvent({
      plantCode: "MENTHA_SPICATA_MCD5",
      genus: "Mentha",
      species: "spicata",
      slug: "mint",
      initialVi: "# mint v1",
      editedVi: "# mint v2",
    });
    const approval = approveEvents(seed.db, seed.root, {
      eventIds: seed.eventIds,
      actor: ACTOR,
      reason: "ok",
    });

    fs.writeFileSync(
      path.join(seed.root, "content", "plants", "mint", "vi.md"),
      "# mint v3",
      "utf8",
    );
    runStartupCatchUp({ db: seed.db, repositoryRoot: seed.root });

    const outcome = applyProposal(seed.db, seed.root, {
      proposalId: approval.proposalId!,
      actor: ACTOR,
      reason: "apply",
    });
    expect(outcome).toMatchObject({ status: "rejected", code: "APPROVED_EVENT_SUPERSEDED" });
    if (outcome.status === "rejected") {
      expect(outcome.supersededEventIds).toContain(seed.viEventId);
    }

    // The replacement evidence is reviewable as its own pending item.
    expect(listChangeEvents(seed.db, { reviewStates: ["pending"] }).total).toBe(1);
  });

  it("is unaffected by unrelated entity edits between approval and apply", () => {
    const db = openDatabase();
    insertPlant(db, { plantCode: "OCIMUM_BASILICUM_MCD5", genus: "Ocimum", species: "basilicum" });
    insertPlant(db, { plantCode: "BASELLA_ALBA_MCD5", genus: "Basella", species: "alba" });
    const root = makeTree();
    writeBoundEntity(db, root, "basil", "OCIMUM_BASILICUM_MCD5", "# basil v1");
    writeBoundEntity(db, root, "basella", "BASELLA_ALBA_MCD5", "# basella v1");
    runLegacyBaseline({ db, repositoryRoot: root }, { sealedAt: "2026-08-25T00:00:00.000Z" });
    runStartupCatchUp({ db, repositoryRoot: root });
    db.prepare(`DELETE FROM content_change_events`).run();

    fs.writeFileSync(path.join(root, "content", "plants", "basil", "vi.md"), "# basil v2", "utf8");
    runStartupCatchUp({ db, repositoryRoot: root });
    const basilViEvent = listChangeEvents(db, { reviewStates: ["pending"] }).items.find(
      (item) => item.path.endsWith("vi.md"),
    )!;
    // Author regenerates the manifest for the new bytes (reviewed replacement).
    const basilDir = path.join(root, "content", "plants", "basil");
    const generated = initializePlantManifest({
      db,
      directoryPath: basilDir,
      plantCode: "OCIMUM_BASILICUM_MCD5",
    });
    const manifest = JSON.parse(stableJson(generated.manifest)) as Record<string, any>;
    manifest.locales.vi = {
      ...manifest.locales.vi,
      sha256: crypto.createHash("sha256").update("# basil v2").digest("hex"),
      bytes: Buffer.byteLength("# basil v2"),
      content_version: 2,
      review_status: "reviewed",
      source_refs: [{ sourceSystem: "editorial", sourceLocator: "mcd5/basil" }],
      conflict_resolution: {
        resolution: "replace_database",
        reviewedBy: "mcd5-test",
        reviewedAt: "2026-08-25T00:00:00.000Z",
        reason: "reviewed replacement",
      },
    };
    fs.writeFileSync(path.join(basilDir, "content.json"), stableJson(manifest), "utf8");
    runStartupCatchUp({ db, repositoryRoot: root });
    const basilEventIds = listChangeEvents(db, { reviewStates: ["pending"] })
      .items.map((item) => item.event_id);

    const approval = approveEvents(db, root, {
      eventIds: basilEventIds,
      actor: ACTOR,
      reason: "basil only",
    });
    expect(approval.failures).toEqual([]);

    // Unrelated entity changes AFTER approval must not stale basil's proposal.
    fs.writeFileSync(path.join(root, "content", "plants", "basella", "vi.md"), "# basella v2", "utf8");
    runStartupCatchUp({ db, repositoryRoot: root });

    const outcome = applyProposal(db, root, {
      proposalId: approval.proposalId!,
      actor: ACTOR,
      reason: "apply basil",
    });
    expect(outcome).toMatchObject({ status: "applied" });
    const basellaPending = listChangeEvents(db, { reviewStates: ["pending"] }).total;
    expect(basellaPending).toBe(1);
  });
});

describe("MCD-5 batch approval and dismissal", () => {
  it("approves valid items independently and reports invalid ones per item", () => {
    const good = seedModifiedEvent({
      plantCode: "PETROSELINUM_CRISPUM_MCD5",
      genus: "Petroselinum",
      species: "crispum",
      slug: "parsley",
      initialVi: "# parsley v1",
      editedVi: "# parsley v2",
    });
    // A dismissed event cannot be approved again.
    dismissEvents(good.db, {
      eventIds: [],
      actor: ACTOR,
      reason: "noop placeholder",
    });
    const extra = seedModifiedEvent({
      plantCode: "ANETHUM_GRAVEOLENS_MCD5",
      genus: "Anethum",
      species: "graveolens",
      slug: "dill",
      initialVi: "# dill v1",
      editedVi: "# dill v2",
    });
    dismissEvents(extra.db, {
      eventIds: [extra.viEventId],
      actor: ACTOR,
      reason: "not wanted",
    });

    // Cross-database id is intentionally unknown to `good`'s journal.
    const result = approveEvents(good.db, good.root, {
      eventIds: [...good.eventIds, extra.viEventId, "missing-event"],
      actor: ACTOR,
      reason: "batch",
    });
    expect(result.approved).toEqual(
      good.eventIds.map((eventId) => ({ eventId, ok: true })),
    );
    expect(result.failures).toEqual([
      { eventId: extra.viEventId, ok: false, code: "EVENT_NOT_FOUND" },
      { eventId: "missing-event", ok: false, code: "EVENT_NOT_FOUND" },
    ]);
    expect(listChangeEvents(good.db, { reviewStates: ["approved"] }).total).toBe(2);

    const applied = applyProposal(good.db, good.root, {
      proposalId: result.proposalId!,
      actor: ACTOR,
      reason: "apply batch remainder",
    });
    expect(applied.status).toBe("applied");
  });

  it("records dismissal with reviewer audit fields and blocks re-dismissal", () => {
    const seed = seedModifiedEvent({
      plantCode: "THYMUS_VULGARIS_MCD5",
      genus: "Thymus",
      species: "vulgaris",
      slug: "thyme",
      initialVi: "# thyme v1",
      editedVi: "# thyme v2",
    });
    const first = dismissEvents(seed.db, {
      eventIds: [seed.viEventId],
      actor: ACTOR,
      reason: "duplicate of manual edit",
    });
    expect(first.dismissed).toHaveLength(1);
    const event = listChangeEvents(seed.db, { reviewStates: ["dismissed"] }).items[0];
    expect(event?.reviewer_id).toBe(ACTOR.id);
    expect(event?.review_reason).toBe("duplicate of manual edit");

    const second = dismissEvents(seed.db, {
      eventIds: [seed.viEventId],
      actor: ACTOR,
      reason: "again",
    });
    expect(second.failures[0]?.code).toBe("EVENT_NOT_DISMISSIBLE:dismissed");
  });
});

describe("MCD-5 API surface authz", () => {
  function buildAppWithUser(role: "admin" | "editor") {
    const db = openDatabase();
    db.prepare(
      `INSERT INTO users (email, password_hash, role, is_active) VALUES (?, 'x', ?, 1)`,
    ).run(`${role}@richfarm.test`, role);
    const secret = "test-secret-mcd5";
    const app = createApp(db, { auth: { jwtSecret: secret, jwtExpiresIn: "1h" } });
    const token = jwt.sign(
      { sub: "1", email: `${role}@richfarm.test`, role },
      secret,
      { expiresIn: "1h", issuer: "richfarm-backend", audience: "richfarm-dashboard" },
    );
    return { db, app, token };
  }

  it("requires authentication and editor/admin roles on review routes", async () => {
    const { app, token } = buildAppWithUser("editor");
    await request(app).get("/api/content-review/events").expect(401);
    await request(app)
      .get("/api/content-review/events")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .then((response) => {
        expect(response.body).toHaveProperty("items");
        expect(response.body).toHaveProperty("total");
      });
    await request(app)
      .post("/api/content-review/approve")
      .set("Authorization", `Bearer ${token}`)
      .send({ eventIds: [], reason: "short" })
      .expect(400);
    await request(app)
      .get("/api/content-review/monitor-status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .then((response) => {
        expect(response.body).toHaveProperty("quarantined");
      });
  });

  it("returns 404 preview for unknown events with a valid token", async () => {
    const { app, token } = buildAppWithUser("admin");
    await request(app)
      .get("/api/content-review/events/does-not-exist/preview")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });
});
