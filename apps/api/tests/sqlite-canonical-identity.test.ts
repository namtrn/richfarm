import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { createDatabase, type SqliteDatabase } from "../src/db";
import {
  convexPlantToCreatePayload,
  deriveConvexCanonicalIdentity,
  sqliteDeleteGuard,
  upsertMasterPlantRow,
} from "../src/master-plants";
import {
  applyCanonicalIdentityMigration,
  applyCanonicalIdentityMigrationAtPath,
  dryRunCanonicalIdentityMigration,
  ensureSqliteCanonicalIdentitySchema,
  previewCanonicalIdentityMatch,
  repairCanonicalIdentityMigrationBackupMetadataAtPath,
  rollbackCanonicalIdentityMigration,
  type CanonicalIdentityMigrationReport,
} from "../src/sqlite-canonical-identity";

const databases: SqliteDatabase[] = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

function openMemoryDatabase(): SqliteDatabase {
  const db = createDatabase(":memory:");
  databases.push(db);
  return db;
}

function openFileDatabase(): { db: SqliteDatabase; databasePath: string } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "richfarm-cid3-db-"));
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, "plants.db");
  const db = createDatabase(databasePath);
  databases.push(db);
  return { db, databasePath };
}

function allowLegacyFixtureInsert(db: SqliteDatabase): void {
  // Simulate a pre-CID-3 database whose active rows predate the guards, then
  // reinstall the strict triggers before exercising audit/backfill behavior.
  db.exec(`
    DROP TRIGGER IF EXISTS trg_master_plants_canonical_identity_required_insert;
    DROP TRIGGER IF EXISTS trg_master_plants_canonical_identity_required_update;
  `);
}

function restoreCanonicalGuards(db: SqliteDatabase): void {
  ensureSqliteCanonicalIdentitySchema(db);
}

function payload(
  plantCode: string,
  scientificName: string | null,
  sourceId?: string,
  metadata_json?: Record<string, unknown>,
) {
  const scientificParts = scientificName?.trim().split(/\s+/).filter(Boolean) ?? [];
  const metadataCultivar = typeof metadata_json?.cultivar === "string"
    ? metadata_json.cultivar.trim()
    : "";
  const structuredIdentity = scientificParts.length >= 2
    ? {
      genus: scientificParts[0],
      species: scientificParts[1],
      infraspecific_rank: null,
      infraspecific_name: null,
      cultivar: metadataCultivar || null,
      identity_scope: metadataCultivar ? "cultivar" as const : "base" as const,
      parent_master_plant_id: null,
      parent_canonical_key: metadataCultivar
        ? JSON.stringify(["v1", scientificParts[0].toLowerCase(), scientificParts[1].toLowerCase(), "", "", ""])
        : null,
    }
    : {};
  return {
    plant_code: plantCode,
    common_name: "Tomato",
    scientific_name: scientificName,
    ...structuredIdentity,
    ...(sourceId ? { source_id: sourceId } : {}),
    ...(metadata_json ? { metadata_json } : {}),
    i18n: {
      vi: { common_name: "Cà chua" },
      en: { common_name: "Tomato" },
    },
  };
}

function insertLegacyDuplicateRows(db: SqliteDatabase): void {
  allowLegacyFixtureInsert(db);
  const insert = db.prepare(`
    INSERT INTO master_plants
      (id, plant_code, common_name, scientific_name, source_system, source_id, metadata_json)
    VALUES (?, ?, ?, ?, 'sqlite', ?, ?)
  `);
  insert.run(6, "TOMATO_LEGACY", "Cà chua", "Solanum lycopersicum", "legacy-row-6", JSON.stringify({
    source: "seed",
    convexId: "convex-row-6",
  }));
  insert.run(1554, "TOMATO_DASHBOARD", "Cà chua", "Solanum lycopersicum", "dashboard-row-1554", JSON.stringify({
    source: "dashboard",
  }));

  const i18n = db.prepare(`
    INSERT INTO master_plant_i18n (master_plant_id, locale, common_name, description)
    VALUES (?, ?, ?, ?)
  `);
  for (const [id, locale, name] of [[6, "vi", "Cà chua"], [6, "en", "Tomato"], [1554, "vi", "Cà chua"], [1554, "en", "Tomato"]] as const) {
    i18n.run(id, locale, name, "same bytes");
  }
  db.prepare(`INSERT INTO plant_origin_countries (master_plant_id, country_code) VALUES (?, ?)`).run(6, "US");
  db.prepare(`INSERT INTO plant_origin_countries (master_plant_id, country_code) VALUES (?, ?)`).run(1554, "US");
  db.prepare(`INSERT INTO plant_adaptation_terms (master_plant_id, term_code) VALUES (?, ?)`).run(6, "warm");
  db.prepare(`INSERT INTO plant_adaptation_terms (master_plant_id, term_code) VALUES (?, ?)`).run(6, "moderate");
  db.prepare(`INSERT INTO plant_adaptation_terms (master_plant_id, term_code) VALUES (?, ?)`).run(1554, "warm");
  restoreCanonicalGuards(db);
}

function insertLegacyRankMetadataRows(db: SqliteDatabase): void {
  allowLegacyFixtureInsert(db);
  const insert = db.prepare(`
    INSERT INTO master_plants
      (id, plant_code, common_name, scientific_name, cultivar, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const [id, scientificName, qualifier] of [
    [49, "Brassica rapa", "subsp. chinensis"],
    [53, "Brassica rapa", "subsp. pekinensis"],
    [120, "Brassica rapa", "subsp. rapa"],
    [471, "Brassica rapa", "subsp. narinosa"],
    [50, "Brassica oleracea", "var. capitata"],
    [435, "Brassica oleracea", "var. sabellica"],
    [591, "Brassica napus", "var. napobrassica"],
  ] as const) {
    insert.run(id, `LEGACY_${id}`, `Legacy ${id}`, scientificName, null, JSON.stringify({
      cultivar: qualifier,
      cultivarNormalized: qualifier,
    }));
  }
  for (const [id, scientificName] of [
    [1548, "Brassica rapa"],
    [1549, "Brassica oleracea"],
    [1550, "Brassica napus"],
  ] as const) {
    insert.run(id, `LEGACY_${id}`, `Legacy ${id}`, scientificName, null, JSON.stringify({
      cultivarNormalized: "__default__",
    }));
  }
  restoreCanonicalGuards(db);
}

function insertLegacyCultivarBeforeBase(db: SqliteDatabase): void {
  allowLegacyFixtureInsert(db);
  const insert = db.prepare(`
    INSERT INTO master_plants
      (id, plant_code, common_name, scientific_name, source_system, source_id, metadata_json)
    VALUES (?, ?, ?, ?, 'sqlite', ?, ?)
  `);
  // Row 46 deliberately precedes its base row 1554.  The explicit parent edge
  // is valid and should become active only after the base has been written.
  insert.run(46, "TOMATO_ROMA", "Roma", "Solanum lycopersicum", "tomato-roma", JSON.stringify({
    cultivar: "Roma",
    parentMasterPlantId: 1554,
  }));
  // This cultivar has no reviewed parent edge and must remain quarantined even
  // though a matching base candidate exists.
  insert.run(47, "TOMATO_UNRESOLVED", "Unresolved", "Solanum lycopersicum", "tomato-unresolved", JSON.stringify({
    cultivar: "Unresolved",
  }));
  insert.run(1554, "TOMATO_BASE", "Tomato", "Solanum lycopersicum", "tomato-base", JSON.stringify({}));
  restoreCanonicalGuards(db);
}

describe("SQLite canonical identity writer and CID-3 migration", () => {
  it("projects trusted Convex taxonomy through the strict mirror payload", () => {
    const base = deriveConvexCanonicalIdentity({
      scientificName: "Brassica rapa",
      genus: "Brassica",
      species: "rapa",
      cultivarNormalized: "__default__",
      taxonomyParseStatus: "ok",
    });
    expect(base).toMatchObject({
      identity_scope: "base",
      canonical_key: '["v1","brassica","rapa","","",""]',
      cultivar: null,
      parent_canonical_key: null,
    });

    const infraspecific = deriveConvexCanonicalIdentity({
      scientificName: "Brassica rapa",
      genus: "Brassica",
      species: "rapa",
      cultivarNormalized: "subsp. chinensis",
      taxonomyParseStatus: "ok",
    });
    expect(infraspecific).toMatchObject({
      identity_scope: "base",
      infraspecific_rank: "subsp",
      infraspecific_name: "chinensis",
      cultivar: null,
      canonical_key: '["v1","brassica","rapa","subsp","chinensis",""]',
    });

    const cultivar = deriveConvexCanonicalIdentity({
      scientificName: "Solanum lycopersicum",
      genus: "Solanum",
      species: "lycopersicum",
      cultivar: "Roma",
      cultivarNormalized: "roma",
      taxonomyParseStatus: "ok",
    });
    expect(cultivar).toMatchObject({
      identity_scope: "cultivar",
      cultivar: "roma",
      parent_canonical_key: '["v1","solanum","lycopersicum","","",""]',
      canonical_key: '["v1","solanum","lycopersicum","","","roma"]',
    });

    // A Convex manual-review marker is authoritative even when stale
    // structured fields happen to be present; the mirror must not guess.
    expect(() => deriveConvexCanonicalIdentity({
      scientificName: "Tomato (T01)",
      genus: "Solanum",
      species: "lycopersicum",
      taxonomyParseStatus: "manual_review",
    })).toThrow(/manual_review|structured/i);

    // Legacy snapshots without a conflicting status retain the deterministic
    // scientific-name extractor compatibility path.
    expect(deriveConvexCanonicalIdentity({
      scientificName: "Solanum lycopersicum",
      cultivarNormalized: "__default__",
    })).toMatchObject({
      identity_scope: "base",
      canonical_key: '["v1","solanum","lycopersicum","","",""]',
    });

    const mirroredPayload = convexPlantToCreatePayload({
      plant_code: "BRASSICA_RAPA_REMOTE",
      common_name: "Bok choy",
      scientific_name: "Brassica rapa",
      genus: "Brassica",
      species: "rapa",
      taxonomy_parse_status: "ok",
      cultivarNormalized: "__default__",
      source_system: "convex",
      source_id: "remote-brassica-rapa",
      metadata_json: {},
      i18n: {
        vi: { common_name: "Cải thìa" },
        en: { common_name: "Bok choy" },
      },
    } as never);
    expect(mirroredPayload).toMatchObject({
      genus: "brassica",
      species: "rapa",
      infraspecific_rank: null,
      infraspecific_name: null,
      cultivar: null,
      identity_scope: "base",
      parent_canonical_key: null,
    });
  });

  it("previews exact, near, and new identities without mutating SQLite", () => {
    const db = openMemoryDatabase();
    const baseId = upsertMasterPlantRow(db, payload("PREVIEW_BASE", "Solanum lycopersicum", "preview-base") as never);
    const before = db.serialize().toString("hex");

    const exact = previewCanonicalIdentityMatch(
      db,
      payload("PREVIEW_EXACT", "Solanum lycopersicum") as never,
    );
    expect(exact).toMatchObject({
      status: "exact",
      exact: { id: baseId, plantCode: "PREVIEW_BASE" },
      suggestions: [],
    });

    const near = previewCanonicalIdentityMatch(
      db,
      payload("PREVIEW_CULTIVAR", "Solanum lycopersicum", undefined, { cultivar: "Cherry" }) as never,
    );
    expect(near).toMatchObject({
      status: "near_match",
      exact: null,
      suggestions: [{ id: baseId, plantCode: "PREVIEW_BASE" }],
    });

    const fresh = previewCanonicalIdentityMatch(
      db,
      payload("PREVIEW_NEW", "Capsicum annuum") as never,
    );
    expect(fresh).toMatchObject({ status: "new", exact: null, suggestions: [] });
    expect(db.serialize().toString("hex")).toBe(before);
  });

  it("keeps strict create and update conflicts transactional at the writer boundary", () => {
    const db = openMemoryDatabase();
    expect(() => upsertMasterPlantRow(db, payload("STRICT_INCOMPLETE", null) as never))
      .toThrow(/structured.*fields/i);
    expect((db.prepare(`SELECT COUNT(*) AS count FROM master_plants`).get() as { count: number }).count).toBe(0);

    const tomatoId = upsertMasterPlantRow(db, payload("STRICT_TOMATO", "Solanum lycopersicum", "strict-tomato") as never);
    const eggplantId = upsertMasterPlantRow(db, payload("STRICT_EGGPLANT", "Solanum melongena", "strict-eggplant") as never);
    const before = db.prepare(`SELECT scientific_name, canonical_key FROM master_plants WHERE id = ?`).get(eggplantId);

    expect(() => upsertMasterPlantRow(db, payload("STRICT_EGGPLANT", "Solanum lycopersicum", "strict-eggplant") as never))
      .toThrow(/canonical plant already exists/i);
    expect(db.prepare(`SELECT scientific_name, canonical_key FROM master_plants WHERE id = ?`).get(eggplantId)).toEqual(before);
    expect(db.prepare(`SELECT id FROM master_plants WHERE id = ?`).get(tomatoId)).toEqual({ id: tomatoId });
  });

  it("writes a canonical key for normal inserts and blocks duplicate taxonomy", () => {
    const db = openMemoryDatabase();
    const firstId = upsertMasterPlantRow(db, payload("TOMATO_A", "Solanum lycopersicum") as never);
    expect(db.prepare(`SELECT canonical_key, canonical_identity_version, genus, species FROM master_plants WHERE id = ?`).get(firstId)).toEqual({
      canonical_key: '["v1","solanum","lycopersicum","","",""]',
      canonical_identity_version: "canonical_identity_v1",
      genus: "solanum",
      species: "lycopersicum",
    });
    expect(() => upsertMasterPlantRow(db, payload("TOMATO_B", "Solanum lycopersicum") as never)).toThrow(/canonical plant already exists/i);
    expect(() => upsertMasterPlantRow(db, payload("INCOMPLETE", null) as never)).toThrow(/structured.*fields/i);
  });

  it("rejects a writer duplicate that still has a legacy NULL canonical key", () => {
    const db = openMemoryDatabase();
    allowLegacyFixtureInsert(db);
    db.prepare(`
      INSERT INTO master_plants (id, plant_code, common_name, scientific_name)
      VALUES (99, 'LEGACY_TOMATO', 'Tomato', 'Solanum lycopersicum')
    `).run();
    restoreCanonicalGuards(db);
    expect(() => upsertMasterPlantRow(db, payload("NEW_TOMATO", "Solanum lycopersicum") as never))
      .toThrow(/legacy row 99/i);
  });

  it("recomputes canonical identity when an existing scientific name changes", () => {
    const db = openMemoryDatabase();
    const id = upsertMasterPlantRow(db, payload("IDENTITY_DRIFT", "Solanum lycopersicum", "identity-drift") as never);

    upsertMasterPlantRow(db, payload("IDENTITY_DRIFT", "Solanum melongena", "identity-drift") as never);

    expect(db.prepare(`SELECT id, scientific_name, canonical_key, genus, species FROM master_plants WHERE id = ?`).get(id)).toEqual({
      id,
      scientific_name: "Solanum melongena",
      canonical_key: '["v1","solanum","melongena","","",""]',
      genus: "solanum",
      species: "melongena",
    });
  });

  it("rejects an identity update that drifts onto another active canonical row", () => {
    const db = openMemoryDatabase();
    upsertMasterPlantRow(db, payload("IDENTITY_TOMATO", "Solanum lycopersicum", "identity-tomato") as never);
    const eggplantId = upsertMasterPlantRow(db, payload("IDENTITY_EGGPLANT", "Solanum melongena", "identity-eggplant") as never);

    expect(() => upsertMasterPlantRow(db, payload("IDENTITY_EGGPLANT", "Solanum lycopersicum", "identity-eggplant") as never))
      .toThrow(/canonical plant already exists/i);
    expect(db.prepare(`SELECT scientific_name, canonical_key FROM master_plants WHERE id = ?`).get(eggplantId)).toEqual({
      scientific_name: "Solanum melongena",
      canonical_key: '["v1","solanum","melongena","","",""]',
    });
  });

  it("recomputes cultivar identity when metadata cultivar changes", () => {
    const db = openMemoryDatabase();
    upsertMasterPlantRow(db, payload("CULTIVAR_BASE", "Brassica rapa", "cultivar-base") as never);
    const cultivarId = upsertMasterPlantRow(db, payload(
      "CULTIVAR_ROW",
      "Brassica rapa",
      "cultivar-row",
      { cultivar: "Cantonese Green" },
    ) as never);

    upsertMasterPlantRow(db, payload(
      "CULTIVAR_ROW",
      "Brassica rapa",
      "cultivar-row",
      { cultivar: "Pak Choi" },
    ) as never);

    expect(db.prepare(`SELECT id, cultivar, identity_scope, canonical_key FROM master_plants WHERE id = ?`).get(cultivarId)).toEqual({
      id: cultivarId,
      cultivar: "pak choi",
      identity_scope: "cultivar",
      canonical_key: '["v1","brassica","rapa","","","pak choi"]',
    });
  });

  it("rejects active NULL canonical rows while allowing explicit quarantine rows", () => {
    const db = openMemoryDatabase();
    expect(() => db.prepare(`
      INSERT INTO master_plants (plant_code, common_name, scientific_name)
      VALUES ('UNCLASSIFIED_ACTIVE', 'Unknown', 'Unknown species')
    `).run()).toThrow(/CANONICAL_IDENTITY_REQUIRED/i);
    db.prepare(`
      INSERT INTO master_plants (plant_code, common_name, scientific_name, canonical_status)
      VALUES ('UNCLASSIFIED_QUARANTINED', 'Unknown', 'Unknown species', 'quarantined')
    `).run();
    expect(db.prepare(`SELECT canonical_status, canonical_key FROM master_plants WHERE plant_code = 'UNCLASSIFIED_QUARANTINED'`).get())
      .toEqual({ canonical_status: "quarantined", canonical_key: null });
    expect(() => db.prepare(`
      UPDATE master_plants SET notes = 'must fail' WHERE plant_code = 'UNCLASSIFIED_QUARANTINED'
    `).run()).not.toThrow();
    expect(() => db.prepare(`
      UPDATE master_plants SET canonical_status = 'active' WHERE plant_code = 'UNCLASSIFIED_QUARANTINED'
    `).run()).toThrow(/CANONICAL_IDENTITY_REQUIRED/i);
  });

  it("backfills exact legacy rank metadata as distinct base keys", () => {
    const db = openMemoryDatabase();
    insertLegacyRankMetadataRows(db);
    const report = dryRunCanonicalIdentityMigration(db, { runId: "cid3-legacy-rank-fixtures" });
    expect(report.status).toBe("ready");
    expect(report.counts.collisions).toBe(0);
    expect(report.counts.quarantined).toBe(0);
    const candidates = new Map(report.candidates.map((candidate) => [candidate.id, candidate]));
    expect(candidates.get(49)).toMatchObject({
      status: "backfillable",
      scope: "base",
      canonicalKey: '["v1","brassica","rapa","subsp","chinensis",""]',
    });
    expect(candidates.get(50)).toMatchObject({
      status: "backfillable",
      scope: "base",
      canonicalKey: '["v1","brassica","oleracea","var","capitata",""]',
    });
    expect(candidates.get(1548)).toMatchObject({
      status: "backfillable",
      scope: "base",
      canonicalKey: '["v1","brassica","rapa","","",""]',
    });
  });

  it("dry-runs, explicitly merges 1554 over 6, preserves conflict evidence, and rolls back", () => {
    const { db, databasePath } = openFileDatabase();
    insertLegacyDuplicateRows(db);
    const options = { runId: "cid3-test-run", winnerId: 1554, loserIds: [6] };
    const dryRun = dryRunCanonicalIdentityMigration(db, options);
    expect(dryRun.status).toBe("ready");
    expect(dryRun.beforeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(dryRun.counts.collisions).toBe(1);
    expect(dryRun.counts.repairedCollisions).toBe(1);
    expect(dryRun.references).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: "master_plant_i18n", total: 2 }),
      expect.objectContaining({ table: "plant_origin_countries", total: 1 }),
      expect.objectContaining({ table: "plant_adaptation_terms", total: 2 }),
    ]));

    const backupDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "richfarm-cid3-test-"));
    temporaryDirectories.push(backupDirectory);
    const backupPath = path.join(backupDirectory, "backup.db");
    const applied = applyCanonicalIdentityMigration(db, {
      ...options,
      databasePath,
      backupPath,
      dryRunRevision: dryRun.beforeHash,
    });
    expect(applied.status).toBe("applied");
    expect(db.prepare(`SELECT backup_path, backup_sha256 FROM canonical_identity_migration_runs WHERE run_id = ?`).get(options.runId)).toEqual({
      backup_path: path.resolve(backupPath),
      backup_sha256: applied.backup.sha256,
    });
    expect(db.prepare(`SELECT id, canonical_status, is_active, source_id FROM master_plants ORDER BY id`).all()).toEqual([
      { id: 6, canonical_status: "archived", is_active: 0, source_id: null },
      { id: 1554, canonical_status: "active", is_active: 1, source_id: "dashboard-row-1554" },
    ]);
    expect(db.prepare(`SELECT source_system, source_id, master_plant_id, retired_at FROM plant_external_identities ORDER BY source_system, source_id`).all()).toEqual([
      { source_system: "convex", source_id: "convex-row-6", master_plant_id: 1554, retired_at: null },
      { source_system: "sqlite", source_id: "dashboard-row-1554", master_plant_id: 1554, retired_at: null },
      { source_system: "sqlite", source_id: "legacy-row-6", master_plant_id: 1554, retired_at: null },
    ]);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM master_plant_i18n WHERE master_plant_id = 6`).get()).toEqual({ count: 2 });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM canonical_identity_reference_redirects WHERE run_id = ?`).get(options.runId)).toEqual({ count: 4 });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM plant_adaptation_terms WHERE master_plant_id = 1554`).get()).toEqual({ count: 2 });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM canonical_identity_migration_journal WHERE run_id = ?`).get(options.runId)).toEqual(expect.objectContaining({ count: expect.any(Number) }));

    const rolledBack = rollbackCanonicalIdentityMigration(db, options.runId);
    expect(rolledBack.status).toBe("rolled_back");
    expect(db.prepare(`SELECT id, canonical_status, is_active, source_id FROM master_plants ORDER BY id`).all()).toEqual([
      { id: 6, canonical_status: "active", is_active: 1, source_id: "legacy-row-6" },
      { id: 1554, canonical_status: "active", is_active: 1, source_id: "dashboard-row-1554" },
    ]);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM plant_adaptation_terms WHERE master_plant_id = 6`).get()).toEqual({ count: 2 });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM canonical_identity_reference_redirects WHERE run_id = ? AND rolled_back_at IS NOT NULL`).get(options.runId)).toEqual({ count: 4 });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM plant_external_identities WHERE retired_at IS NOT NULL`).get()).toEqual({ count: 3 });
  });

  it("repairs only NULL backup metadata after verifying the immutable apply backup", () => {
    const { db, databasePath } = openFileDatabase();
    insertLegacyDuplicateRows(db);
    const options = { runId: "cid3-backup-metadata-repair", winnerId: 1554, loserIds: [6] };
    const dryRun = dryRunCanonicalIdentityMigration(db, options);
    const backupDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "richfarm-cid3-metadata-repair-"));
    temporaryDirectories.push(backupDirectory);
    const backupPath = path.join(backupDirectory, "backup.db");
    const applied = applyCanonicalIdentityMigration(db, {
      ...options,
      databasePath,
      backupPath,
      dryRunRevision: dryRun.beforeHash,
    });
    db.prepare(`UPDATE canonical_identity_migration_runs SET backup_sha256 = NULL WHERE run_id = ?`).run(options.runId);
    const plantsBefore = db.prepare(`SELECT id, canonical_status, canonical_key, source_id FROM master_plants ORDER BY id`).all();
    const outboxBefore = db.prepare(`SELECT COUNT(*) AS count, COALESCE(MAX(id), 0) AS max_id FROM sync_outbox`).get();

    expect(() => repairCanonicalIdentityMigrationBackupMetadataAtPath({
      databasePath,
      runId: options.runId,
      backupPath,
      expectedBeforeHash: applied.beforeHash,
      expectedBackupSha256: "0".repeat(64),
    })).toThrow(/beforeHash|backup/i);
    expect(db.prepare(`SELECT backup_sha256 FROM canonical_identity_migration_runs WHERE run_id = ?`).get(options.runId)).toEqual({ backup_sha256: null });

    const repaired = repairCanonicalIdentityMigrationBackupMetadataAtPath({
      databasePath,
      runId: options.runId,
      backupPath,
      expectedBeforeHash: applied.beforeHash,
      expectedBackupSha256: applied.backup.sha256!,
    });
    expect(repaired).toMatchObject({
      runId: options.runId,
      status: "repaired",
      backupPath: path.resolve(backupPath),
      backupSha256: applied.beforeHash,
      expectedBeforeHash: applied.beforeHash,
      filledFields: ["backup_sha256"],
      journalSequence: expect.any(Number),
    });
    expect(db.prepare(`SELECT backup_path, backup_sha256 FROM canonical_identity_migration_runs WHERE run_id = ?`).get(options.runId)).toEqual({
      backup_path: path.resolve(backupPath),
      backup_sha256: applied.beforeHash,
    });
    expect(db.prepare(`SELECT action, entity_type, entity_table, entity_id FROM canonical_identity_migration_journal WHERE run_id = ? AND action = 'backup_metadata_repair'`).all(options.runId)).toEqual([{
      action: "backup_metadata_repair",
      entity_type: "migration_run",
      entity_table: "canonical_identity_migration_runs",
      entity_id: options.runId,
    }]);
    expect(db.prepare(`SELECT id, canonical_status, canonical_key, source_id FROM master_plants ORDER BY id`).all()).toEqual(plantsBefore);
    expect(db.prepare(`SELECT COUNT(*) AS count, COALESCE(MAX(id), 0) AS max_id FROM sync_outbox`).get()).toEqual(outboxBefore);

    const alreadyVerified = repairCanonicalIdentityMigrationBackupMetadataAtPath({
      databasePath,
      runId: options.runId,
      backupPath,
      expectedBeforeHash: applied.beforeHash,
      expectedBackupSha256: applied.backup.sha256!,
    });
    expect(alreadyVerified.status).toBe("already_verified");
    expect(db.prepare(`SELECT COUNT(*) AS count FROM canonical_identity_migration_journal WHERE run_id = ? AND action = 'backup_metadata_repair'`).get(options.runId)).toEqual({ count: 1 });
  });

  it("orders base candidates before lower-id cultivars and preserves quarantined status", () => {
    const { db, databasePath } = openFileDatabase();
    insertLegacyCultivarBeforeBase(db);
    const dryRun = dryRunCanonicalIdentityMigration(db, { runId: "cid3-parent-order-dry-run" });
    expect(dryRun.status).toBe("ready");
    expect(dryRun.candidates.find((candidate) => candidate.id === 47)).toMatchObject({
      scope: "cultivar",
      status: "quarantine",
    });

    const backupPath = path.join(path.dirname(databasePath), "before-parent-order.db");
    const applied = applyCanonicalIdentityMigration(db, {
      runId: "cid3-parent-order-apply",
      databasePath,
      backupPath,
      dryRunRevision: dryRun.beforeHash,
    });
    expect(applied.status).toBe("applied");
    expect(db.prepare(`SELECT id, canonical_status, identity_scope, parent_master_plant_id FROM master_plants WHERE id IN (46, 47, 1554) ORDER BY id`).all()).toEqual([
      { id: 46, canonical_status: "active", identity_scope: "cultivar", parent_master_plant_id: 1554 },
      { id: 47, canonical_status: "quarantined", identity_scope: "cultivar", parent_master_plant_id: null },
      { id: 1554, canonical_status: "active", identity_scope: "base", parent_master_plant_id: null },
    ]);
  });

  it("rejects missing, fake, and stale backup inputs before apply mutation", () => {
    const { db, databasePath } = openFileDatabase();
    upsertMasterPlantRow(db, payload("BACKUP_GUARD", "Genus species", "backup-guard") as never);
    const backupDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "richfarm-cid3-backup-"));
    temporaryDirectories.push(backupDirectory);
    const fakeBackupPath = path.join(backupDirectory, "fake.db");
    fs.writeFileSync(fakeBackupPath, "not-a-sqlite-backup");

    expect(() => applyCanonicalIdentityMigration(db, {
      runId: "cid3-missing-database-path",
      backupPath: fakeBackupPath,
      dryRunRevision: "unused",
    } as never)).toThrow(/databasePath/i);
    expect(() => applyCanonicalIdentityMigration(db, {
      runId: "cid3-fake-backup",
      databasePath,
      backupPath: fakeBackupPath,
      dryRunRevision: "unused",
    })).toThrow(/backup bytes do not match/i);
    expect(() => applyCanonicalIdentityMigration(db, {
      runId: "cid3-missing-backup-path",
      databasePath,
      backupPath: "",
      dryRunRevision: "unused",
    })).toThrow(/backupPath/i);

    const staleBackupPath = path.join(backupDirectory, "stale.db");
    fs.copyFileSync(databasePath, staleBackupPath);
    db.prepare(`UPDATE master_plants SET notes = 'changed after backup' WHERE plant_code = 'BACKUP_GUARD'`).run();
    expect(() => applyCanonicalIdentityMigration(db, {
      runId: "cid3-stale-backup",
      databasePath,
      backupPath: staleBackupPath,
      dryRunRevision: "unused",
    })).toThrow(/backup bytes do not match/i);
  });

  it("creates the file backup before opening and adding the canonical schema", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "richfarm-cid3-pre-schema-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "legacy.db");
    const backupPath = path.join(directory, "legacy.before-cid3.db");
    const legacy = new Database(databasePath);
    legacy.exec(`
      CREATE TABLE master_plants (
        id INTEGER PRIMARY KEY,
        plant_code TEXT NOT NULL UNIQUE,
        common_name TEXT NOT NULL,
        scientific_name TEXT,
        source_system TEXT DEFAULT 'sqlite',
        source_id TEXT,
        record_version INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        content_status TEXT NOT NULL DEFAULT 'published',
        content_version INTEGER NOT NULL DEFAULT 1,
        review_status TEXT NOT NULL DEFAULT 'unreviewed',
        sync_origin TEXT NOT NULL DEFAULT 'local',
        care_status TEXT NOT NULL DEFAULT 'missing',
        care_field_evidence_json TEXT NOT NULL DEFAULT '{}',
        propagation_methods_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO master_plants (id, plant_code, common_name, scientific_name)
      VALUES (1, 'PRE_SCHEMA', 'Pre schema', 'Genus species');
    `);
    const dryRun = dryRunCanonicalIdentityMigration(legacy as never, { runId: "cid3-pre-schema-dry-run" });
    legacy.close();

    const applied = applyCanonicalIdentityMigrationAtPath(databasePath, {
      runId: "cid3-pre-schema-apply",
      backupPath,
      dryRunRevision: dryRun.beforeHash,
    });
    expect(applied.status).toBe("applied");
    expect(applied.backup).toMatchObject({ path: backupPath, verified: true, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const before = new Database(backupPath, { readonly: true });
    const beforeColumns = before.prepare(`PRAGMA table_info(master_plants)`).all() as Array<{ name: string }>;
    before.close();
    const after = new Database(databasePath, { readonly: true });
    const afterColumns = after.prepare(`PRAGMA table_info(master_plants)`).all() as Array<{ name: string }>;
    after.close();
    expect(beforeColumns.some((column) => column.name === "canonical_key")).toBe(false);
    expect(afterColumns.some((column) => column.name === "canonical_key")).toBe(true);
  });

  it("keeps file-level schema/data/run state unchanged after a forced mid-apply failure", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "richfarm-cid3-atomic-failure-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "legacy.db");
    const backupPath = path.join(directory, "legacy.before-cid3.db");
    const legacy = new Database(databasePath);
    legacy.exec(`
      CREATE TABLE master_plants (
        id INTEGER PRIMARY KEY,
        plant_code TEXT NOT NULL UNIQUE,
        common_name TEXT NOT NULL,
        scientific_name TEXT,
        source_system TEXT DEFAULT 'sqlite',
        source_id TEXT,
        record_version INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        content_status TEXT NOT NULL DEFAULT 'published',
        content_version INTEGER NOT NULL DEFAULT 1,
        review_status TEXT NOT NULL DEFAULT 'unreviewed',
        sync_origin TEXT NOT NULL DEFAULT 'local',
        care_status TEXT NOT NULL DEFAULT 'missing',
        care_field_evidence_json TEXT NOT NULL DEFAULT '{}',
        propagation_methods_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE plant_external_identities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        master_plant_id INTEGER NOT NULL,
        source_system TEXT NOT NULL,
        source_id TEXT NOT NULL,
        retired_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(source_system, source_id)
      );
      INSERT INTO master_plants (id, plant_code, common_name, scientific_name, source_id)
      VALUES
        (1, 'ATOMIC_ONE', 'One', 'Genus speciesone', 'forced-conflict'),
        (2, 'ATOMIC_TWO', 'Two', 'Genus speciestwo', 'other-source');
      INSERT INTO plant_external_identities (master_plant_id, source_system, source_id)
      VALUES (2, 'sqlite', 'forced-conflict');
    `);
    legacy.close();
    const beforeBytes = fs.readFileSync(databasePath);
    const beforeHash = crypto.createHash("sha256").update(beforeBytes).digest("hex");
    const dryReader = new Database(databasePath, { readonly: true });
    const dryRun = dryRunCanonicalIdentityMigration(dryReader as never, { runId: "cid3-atomic-failure-dry-run" });
    // Close the read-only connection before file-level apply opens its work copy.
    dryReader.close();

    expect(() => applyCanonicalIdentityMigrationAtPath(databasePath, {
      runId: "cid3-atomic-failure-apply",
      backupPath,
      dryRunRevision: dryRun.beforeHash,
    })).toThrow(/already belongs to row 2/i);

    expect(crypto.createHash("sha256").update(fs.readFileSync(databasePath)).digest("hex")).toBe(beforeHash);
    expect(fs.readFileSync(backupPath).equals(beforeBytes)).toBe(true);
    const unchanged = new Database(databasePath, { readonly: true });
    expect((unchanged.prepare(`PRAGMA table_info(master_plants)`).all() as Array<{ name: string }>).some((column) => column.name === "canonical_key")).toBe(false);
    expect(unchanged.prepare(`SELECT name FROM sqlite_master WHERE name IN ('canonical_identity_migration_runs', 'canonical_identity_migration_journal')`).all()).toEqual([]);
    expect(unchanged.prepare(`SELECT id, source_id FROM master_plants ORDER BY id`).all()).toEqual([
      { id: 1, source_id: "forced-conflict" },
      { id: 2, source_id: "other-source" },
    ]);
    expect(unchanged.prepare(`SELECT master_plant_id, source_system, source_id FROM plant_external_identities`).all()).toEqual([
      { master_plant_id: 2, source_system: "sqlite", source_id: "forced-conflict" },
    ]);
    unchanged.close();
    expect(fs.readdirSync(directory).filter((name) => name.includes(".cid3-work-")).sort()).toEqual([]);
  });

  it("quarantines missing identity in dry-run without changing SQLite", () => {
    const db = openMemoryDatabase();
    db.prepare(`INSERT INTO master_plants (plant_code, common_name, scientific_name, canonical_status) VALUES ('UNKNOWN', 'Unknown', NULL, 'quarantined')`).run();
    const before = db.serialize().toString("hex");
    const report: CanonicalIdentityMigrationReport = dryRunCanonicalIdentityMigration(db, { runId: "cid3-quarantine" });
    expect(report.status).toBe("blocked");
    expect(report.counts.quarantined).toBe(1);
    expect(report.quarantine[0]).toEqual(expect.objectContaining({ rowId: expect.any(Number) }));
    expect(db.serialize().toString("hex")).toBe(before);
  });

  it("scans every row with keyset pagination beyond the 5,000-row batch", () => {
    const db = openMemoryDatabase();
    allowLegacyFixtureInsert(db);
    const insert = db.prepare(`
      INSERT INTO master_plants (id, plant_code, common_name, scientific_name)
      VALUES (?, ?, ?, ?)
    `);
    const insertMany = db.transaction(() => {
      for (let id = 1; id <= 6001; id += 1) {
        insert.run(id, `PAGINATED_${id}`, `Plant ${id}`, `Genus species${id}`);
      }
    });
    insertMany();
    restoreCanonicalGuards(db);
    const report = dryRunCanonicalIdentityMigration(db, { runId: "cid3-pagination", batchSize: 5000 });
    expect(report.status).toBe("ready");
    expect(report.counts.scanned).toBe(6001);
    expect(report.counts.backfillable).toBe(6001);
    expect(report.counts.collisions).toBe(0);
  });

  it("rejects canonical and aliased plants at the API delete guard", () => {
    const db = openMemoryDatabase();
    const id = upsertMasterPlantRow(db, payload("DELETE_CANONICAL", "Solanum lycopersicum", "delete-canonical") as never);
    db.prepare(`UPDATE master_plants SET sync_origin = 'mirror' WHERE id = ?`).run(id);
    const row = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(id) as never;
    expect(sqliteDeleteGuard(db, row)).toMatch(/canonical plant/i);

    const legacyId = db.prepare(`
      INSERT INTO master_plants (plant_code, common_name, scientific_name, canonical_status)
      VALUES ('DELETE_ALIAS', 'Alias', 'Genus species', 'quarantined')
    `).run().lastInsertRowid as number;
    db.prepare(`UPDATE master_plants SET sync_origin = 'mirror' WHERE id = ?`).run(legacyId);
    db.prepare(`
      INSERT INTO plant_external_identities (master_plant_id, source_system, source_id)
      VALUES (?, 'convex', 'alias-delete-test')
    `).run(legacyId);
    const legacyRow = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(legacyId) as never;
    expect(sqliteDeleteGuard(db, legacyRow)).toMatch(/external identity aliases/i);

    allowLegacyFixtureInsert(db);
    const nullKeyLegacyId = db.prepare(`
      INSERT INTO master_plants (plant_code, common_name, scientific_name, canonical_status)
      VALUES ('DELETE_NULL_KEY', 'Legacy', 'Genus species', 'active')
    `).run().lastInsertRowid as number;
    restoreCanonicalGuards(db);
    const nullKeyLegacyRow = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(nullKeyLegacyId) as never;
    expect(sqliteDeleteGuard(db, nullKeyLegacyRow)).toMatch(/hard-delete|archive|remediation/i);
  });
});
