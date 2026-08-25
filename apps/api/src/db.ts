import fs from "fs";
import path from "path";

import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import crypto from "crypto";

import { isLegacyTextShape, legacyCareJsonToMarkdown } from "../../../packages/shared/src/careContentLegacy";
import { isSafeIdentifier } from "./sql-utils";
import { ensureSqliteCanonicalIdentitySchema } from "./sqlite-canonical-identity";

export type SqliteDatabase = Database.Database;

export interface ColumnMetadata {
  cid: number;
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string | null;
  primaryKeyOrder: number;
}

export interface TableMetadata {
  name: string;
  columns: ColumnMetadata[];
  primaryKey: string | null;
}

interface TableRow {
  name: string;
}

interface PragmaRow {
  cid: number;
  name: string;
  type: string;
  notnull: 0 | 1;
  dflt_value: string | null;
  pk: number;
}

export function createDatabase(dbPath: string): SqliteDatabase {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  runMigrations(db);

  return db;
}

function ensureColumn(
  db: SqliteDatabase,
  tableName: string,
  columnName: string,
  columnSql: string,
): void {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as PragmaRow[];
  const hasColumn = rows.some((row) => row.name === columnName);
  if (hasColumn) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql};`);
}

/**
 * Phase 3.1 role contract: only `admin` and `editor` are valid roles.
 * Existing databases created before this migration may still carry a CHECK
 * constraint that accepts `viewer`. SQLite cannot alter a CHECK constraint,
 * so the users table is rebuilt when needed. The rebuild is fail-closed: it
 * refuses to run while any row still has role='viewer', because silently
 * rewriting or dropping those accounts would be destructive.
 */
function migrateUsersRoleCheck(db: SqliteDatabase): void {
  const table = db.prepare(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`,
  ).get() as { sql?: string } | undefined;
  const sql = table?.sql?.toLowerCase() ?? "";
  if (!sql.includes("check") || !sql.includes("'viewer'")) {
    return;
  }

  const viewerCount = (db.prepare(
    `SELECT COUNT(*) AS count FROM users WHERE role = 'viewer'`,
  ).get() as { count: number }).count;
  if (viewerCount > 0) {
    throw new Error(
      `Cannot drop the 'viewer' role: ${viewerCount} user(s) still have role='viewer'. ` +
        "Reassign or deactivate them before the role-contract migration can run.",
    );
  }

  db.transaction(() => {
    // The updated-at trigger follows the table through RENAME; drop it first
    // so the fresh table starts with only the recreated trigger.
    db.exec(`DROP TRIGGER IF EXISTS trg_users_updated_at`);
    db.exec(`ALTER TABLE users RENAME TO users_legacy`);
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'editor')),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec(`
      INSERT INTO users (id, email, password_hash, role, is_active, created_at, updated_at)
      SELECT id, email, password_hash, role, is_active, created_at, updated_at FROM users_legacy;
    `);
    db.exec(`DROP TABLE users_legacy`);
    db.exec(`
      CREATE TRIGGER trg_users_updated_at
      AFTER UPDATE ON users
      FOR EACH ROW
      WHEN NEW.updated_at = OLD.updated_at
      BEGIN
        UPDATE users
        SET updated_at = datetime('now')
        WHERE id = OLD.id;
      END;
    `);
  })();
}

function runMigrations(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'editor')),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
    AFTER UPDATE ON users
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE users
      SET updated_at = datetime('now')
      WHERE id = OLD.id;
    END;

    CREATE TABLE IF NOT EXISTS master_plants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plant_code TEXT NOT NULL UNIQUE,
      common_name TEXT NOT NULL,
      scientific_name TEXT,
      source_system TEXT NOT NULL DEFAULT 'sqlite',
      source_id TEXT,
      record_version INTEGER NOT NULL DEFAULT 1,
      category TEXT NOT NULL DEFAULT 'general',
      "group" TEXT NOT NULL DEFAULT 'other',
      family TEXT,
      purposes_json TEXT NOT NULL DEFAULT '[]',
      growth_stage TEXT NOT NULL DEFAULT 'seedling' CHECK (growth_stage IN ('seedling', 'vegetative', 'flowering', 'harvest')),
      typical_days_to_harvest INTEGER,
      germination_days INTEGER,
      soil_ph_min REAL CHECK (soil_ph_min IS NULL OR (soil_ph_min >= 0 AND soil_ph_min <= 14)),
      soil_ph_max REAL CHECK (soil_ph_max IS NULL OR (soil_ph_max >= 0 AND soil_ph_max <= 14)),
      moisture_target INTEGER CHECK (moisture_target IS NULL OR (moisture_target >= 0 AND moisture_target <= 100)),
      light_hours INTEGER CHECK (light_hours IS NULL OR (light_hours >= 0 AND light_hours <= 24)),
      spacing_cm REAL,
      max_plants_per_m2 REAL,
      seed_rate_per_m2 REAL,
      water_liters_per_m2 REAL,
      yield_kg_per_m2 REAL,
      watering_frequency_days INTEGER,
      fertilizing_frequency_days INTEGER,
      light_requirements TEXT,
      image_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      notes TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      source_url TEXT,
      content_status TEXT NOT NULL DEFAULT 'published',
      content_version INTEGER NOT NULL DEFAULT 1,
      review_status TEXT NOT NULL DEFAULT 'unreviewed',
      reviewed_at TEXT,
      reviewed_by TEXT,
      sync_origin TEXT NOT NULL DEFAULT 'local',
      care_status TEXT NOT NULL DEFAULT 'missing' CHECK (care_status IN ('missing', 'awaiting_review', 'verified', 'not_applicable')),
      care_field_evidence_json TEXT NOT NULL DEFAULT '{}',
      propagation_methods_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (soil_ph_min IS NULL OR soil_ph_max IS NULL OR soil_ph_min <= soil_ph_max)
    );

    CREATE TRIGGER IF NOT EXISTS trg_master_plants_updated_at
    AFTER UPDATE ON master_plants
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE master_plants
      SET updated_at = datetime('now')
      WHERE id = OLD.id;
    END;

    CREATE TABLE IF NOT EXISTS master_plant_i18n (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      master_plant_id INTEGER NOT NULL,
      locale TEXT NOT NULL,
      common_name TEXT NOT NULL,
      description TEXT,
      care_content TEXT,
      content_updated_at TEXT,
      content_version INTEGER NOT NULL DEFAULT 1,
      source TEXT,
      source_url TEXT,
      content_status TEXT NOT NULL DEFAULT 'published',
      review_status TEXT NOT NULL DEFAULT 'unreviewed',
      reviewed_at TEXT,
      reviewed_by TEXT,
      content_origin TEXT NOT NULL DEFAULT 'imported' CHECK (content_origin IN ('authored', 'inherited', 'imported')),
      source_refs_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(master_plant_id, locale),
      FOREIGN KEY(master_plant_id) REFERENCES master_plants(id) ON DELETE CASCADE
    );


    CREATE TABLE IF NOT EXISTS plant_measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      master_plant_id INTEGER NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      temperature_c REAL,
      humidity REAL CHECK (humidity IS NULL OR (humidity >= 0 AND humidity <= 100)),
      ph REAL CHECK (ph IS NULL OR (ph >= 0 AND ph <= 14)),
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(master_plant_id) REFERENCES master_plants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_plant_measurements_master_plant_id
    ON plant_measurements(master_plant_id);

    CREATE INDEX IF NOT EXISTS idx_master_plant_i18n_master_plant_id
    ON master_plant_i18n(master_plant_id);

    CREATE TRIGGER IF NOT EXISTS trg_master_plant_i18n_updated_at
    AFTER UPDATE ON master_plant_i18n
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE master_plant_i18n
      SET updated_at = datetime('now')
      WHERE id = OLD.id;
    END;

    CREATE TABLE IF NOT EXISTS sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedupe_key TEXT NOT NULL UNIQUE,
      entity_type TEXT NOT NULL,
      source_system TEXT NOT NULL,
      source_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK (operation IN ('upsert_plant', 'delete_plant', 'upsert_i18n', 'delete_i18n')),
      locale TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'applied', 'failed', 'blocked', 'superseded')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_attempt_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      applied_at TEXT,
      blocked_finding_id INTEGER,
      blocked_at TEXT,
      blocked_by TEXT,
      blocked_reason TEXT,
      override_id TEXT,
      override_reason TEXT,
      override_expires_at TEXT,
      lease_expires_at TEXT,
      superseded_by INTEGER,
      superseded_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sync_outbox_status_next_attempt
    ON sync_outbox(status, next_attempt_at);

    CREATE INDEX IF NOT EXISTS idx_sync_outbox_source
    ON sync_outbox(source_system, source_id);

    CREATE TABLE IF NOT EXISTS sync_reconciliation_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      remote_count INTEGER NOT NULL DEFAULT 0,
      local_count INTEGER NOT NULL DEFAULT 0,
      upserted_count INTEGER NOT NULL DEFAULT 0,
      removed_count INTEGER NOT NULL DEFAULT 0,
      drift_before INTEGER NOT NULL DEFAULT 0,
      drift_after INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running',
      error TEXT
    );

    -- Plant geography adaptation (Release 1, design doc §2.2).
    -- adaptation_terms / adaptation_term_i18n are a read-only mirror of the
    -- Convex term catalog (Convex is authoritative, like plantGroups), used by
    -- the SQLite API for assignment validation and the editor for option lists.
    -- The three plant_* join tables are the authoring source of truth and ride
    -- inside the existing upsert_plant outbox payload (no sync schema change).
    CREATE TABLE IF NOT EXISTS adaptation_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      dimension TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS adaptation_term_i18n (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term_code TEXT NOT NULL,
      locale TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      translation_status TEXT NOT NULL DEFAULT 'missing'
        CHECK (translation_status IN ('missing','machine_translated','qa_passed','human_reviewed','approved')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(term_code, locale),
      FOREIGN KEY(term_code) REFERENCES adaptation_terms(code) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS plant_origin_countries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      master_plant_id INTEGER NOT NULL,
      country_code TEXT NOT NULL,
      source_refs_json TEXT NOT NULL DEFAULT '[]',
      UNIQUE(master_plant_id, country_code),
      FOREIGN KEY(master_plant_id) REFERENCES master_plants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_plant_origin_countries_plant ON plant_origin_countries(master_plant_id);

    CREATE TABLE IF NOT EXISTS plant_proven_regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      master_plant_id INTEGER NOT NULL,
      country_code TEXT NOT NULL,
      subdivision_code TEXT,
      source_refs_json TEXT NOT NULL DEFAULT '[]',
      UNIQUE(master_plant_id, country_code, subdivision_code),
      FOREIGN KEY(master_plant_id) REFERENCES master_plants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_plant_proven_regions_plant ON plant_proven_regions(master_plant_id);

    CREATE TABLE IF NOT EXISTS plant_adaptation_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      master_plant_id INTEGER NOT NULL,
      term_code TEXT NOT NULL,
      source_refs_json TEXT NOT NULL DEFAULT '[]',
      UNIQUE(master_plant_id, term_code),
      FOREIGN KEY(master_plant_id) REFERENCES master_plants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_plant_adaptation_terms_plant ON plant_adaptation_terms(master_plant_id);
  `);

  ensureSyncControlPlaneSchema(db);

  // Keep older local SQLite files compatible as new plant metadata fields are introduced.
  ensureColumn(db, "master_plants", "source_system", `source_system TEXT NOT NULL DEFAULT 'sqlite'`);
  ensureColumn(db, "master_plants", "source_id", `source_id TEXT`);
  ensureColumn(db, "master_plants", "record_version", `record_version INTEGER NOT NULL DEFAULT 1`);
  ensureColumn(db, "master_plants", "group", `"group" TEXT NOT NULL DEFAULT 'other'`);
  ensureColumn(db, "master_plants", "family", `family TEXT`);
  ensureColumn(db, "master_plants", "purposes_json", `purposes_json TEXT NOT NULL DEFAULT '[]'`);
  ensureColumn(db, "master_plants", "typical_days_to_harvest", `typical_days_to_harvest INTEGER`);
  ensureColumn(db, "master_plants", "germination_days", `germination_days INTEGER`);
  ensureColumn(db, "master_plants", "spacing_cm", `spacing_cm REAL`);
  ensureColumn(db, "master_plants", "max_plants_per_m2", `max_plants_per_m2 REAL`);
  ensureColumn(db, "master_plants", "seed_rate_per_m2", `seed_rate_per_m2 REAL`);
  ensureColumn(db, "master_plants", "water_liters_per_m2", `water_liters_per_m2 REAL`);
  ensureColumn(db, "master_plants", "yield_kg_per_m2", `yield_kg_per_m2 REAL`);
  ensureColumn(db, "master_plants", "watering_frequency_days", `watering_frequency_days INTEGER`);
  ensureColumn(db, "master_plants", "fertilizing_frequency_days", `fertilizing_frequency_days INTEGER`);
  ensureColumn(db, "master_plants", "light_requirements", `light_requirements TEXT`);
  ensureColumn(db, "master_plants", "image_url", `image_url TEXT`);
  ensureColumn(db, "master_plants", "source_url", `source_url TEXT`);
  ensureColumn(db, "master_plants", "content_status", `content_status TEXT NOT NULL DEFAULT 'published'`);
  ensureColumn(db, "master_plants", "content_version", `content_version INTEGER NOT NULL DEFAULT 1`);
  ensureColumn(db, "master_plants", "review_status", `review_status TEXT NOT NULL DEFAULT 'unreviewed'`);
  ensureColumn(db, "master_plants", "reviewed_at", `reviewed_at TEXT`);
  ensureColumn(db, "master_plants", "reviewed_by", `reviewed_by TEXT`);
  ensureColumn(db, "master_plants", "sync_origin", `sync_origin TEXT NOT NULL DEFAULT 'local'`);
  ensureColumn(db, "master_plants", "is_active", `is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))`);
  ensureColumn(db, "master_plants", "care_status", `care_status TEXT NOT NULL DEFAULT 'missing' CHECK (care_status IN ('missing', 'awaiting_review', 'verified', 'not_applicable'))`);
  ensureColumn(db, "master_plants", "care_field_evidence_json", `care_field_evidence_json TEXT NOT NULL DEFAULT '{}'`);
  ensureColumn(db, "master_plants", "propagation_methods_json", `propagation_methods_json TEXT NOT NULL DEFAULT '[]'`);
  // CID-3 is additive and deliberately does not backfill or merge rows while
  // the API opens a database.  Backfill/repair is an explicit dry-run-first
  // operation in sqlite-canonical-identity.ts.
  ensureSqliteCanonicalIdentitySchema(db);
  // All master_plant_i18n columns are ensured BEFORE any table rebuild so the
  // copy-then-swap INSERT ... SELECT can preserve every column (including
  // content_origin, source, review/provenance fields) losslessly.
  ensureColumn(db, "master_plant_i18n", "content_origin", `content_origin TEXT NOT NULL DEFAULT 'imported' CHECK (content_origin IN ('authored', 'inherited', 'imported'))`);
  ensureColumn(db, "master_plant_i18n", "care_content", `care_content TEXT`);
  ensureColumn(db, "master_plant_i18n", "content_updated_at", `content_updated_at TEXT`);
  ensureColumn(db, "master_plant_i18n", "source", `source TEXT`);
  ensureColumn(db, "master_plant_i18n", "source_url", `source_url TEXT`);
  ensureColumn(db, "master_plant_i18n", "content_status", `content_status TEXT NOT NULL DEFAULT 'published'`);
  ensureColumn(db, "master_plant_i18n", "review_status", `review_status TEXT NOT NULL DEFAULT 'unreviewed'`);
  ensureColumn(db, "master_plant_i18n", "reviewed_at", `reviewed_at TEXT`);
  ensureColumn(db, "master_plant_i18n", "reviewed_by", `reviewed_by TEXT`);
  ensureColumn(db, "master_plant_i18n", "source_refs_json", `source_refs_json TEXT NOT NULL DEFAULT '[]'`);
  migrateUsersRoleCheck(db);
  migrateCareContentJsonToMarkdown(db);
  ensureI18nLocaleCompatibility(db);

  // Deterministic release backfill runs after legacy care conversion. The two
  // Basella identities are stable plant codes, not mutable names.
  db.exec(`
    UPDATE master_plant_i18n
    SET content_updated_at = CASE
      WHEN master_plant_id IN (
        SELECT id FROM master_plants
        WHERE plant_code IN ('BASELLA_ALBA_09A582HJFJ', 'BASELLA_ALBA_CEYLON_GZJ982GQJ3')
      ) THEN '2026-08-13T00:00:00.000Z'
      ELSE '2026-07-13T00:00:00.000Z'
    END
    WHERE content_updated_at IS NULL
      AND care_content IS NOT NULL
      AND trim(care_content) <> ''
      AND content_status = 'published';
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_master_plants_source_identity
    ON master_plants(source_system, source_id)
    WHERE source_id IS NOT NULL;
  `);

  // Dashboard list ordering and stats hot paths. Created after ensureColumn
  // so older SQLite files that are missing newer columns (e.g. is_active,
  // image_url) get them before the index is built. The list route orders by
  // updated_at and the stats endpoint counts by is_active / image_url, so
  // these indexes keep those queries off the full scan.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_master_plants_updated_at
    ON master_plants(updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_master_plants_is_active
    ON master_plants(is_active);

    CREATE INDEX IF NOT EXISTS idx_master_plants_image_url
    ON master_plants(image_url);
  `);
}

/**
 * Install the CID-7 reconciliation/control-plane state additively.  The
 * outbox status constraint predates the blocked state, so older files are
 * copied into the expanded table without changing ids or payload bytes.
 * This migration never claims, publishes, or rewrites plant/content rows.
 */
function ensureSyncControlPlaneSchema(db: SqliteDatabase): void {
  const outboxSql = db.prepare(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sync_outbox'`,
  ).get() as { sql?: string } | undefined;
  if (outboxSql?.sql && (!outboxSql.sql.toLowerCase().includes("'blocked'") || !outboxSql.sql.toLowerCase().includes("'superseded'"))) {
    const existingOutboxColumns = new Set(
      (db.prepare(`PRAGMA table_info(sync_outbox)`).all() as Array<{ name: string }>).map((column) => column.name),
    );
    const oldOrNull = (column: string) => existingOutboxColumns.has(column) ? column : "NULL";
    db.transaction(() => {
      db.exec(`
        DROP INDEX IF EXISTS idx_sync_outbox_status_next_attempt;
        DROP INDEX IF EXISTS idx_sync_outbox_source;
        ALTER TABLE sync_outbox RENAME TO sync_outbox_legacy;
        CREATE TABLE sync_outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          dedupe_key TEXT NOT NULL UNIQUE,
          entity_type TEXT NOT NULL,
          source_system TEXT NOT NULL,
          source_id TEXT NOT NULL,
          operation TEXT NOT NULL CHECK (operation IN ('upsert_plant', 'delete_plant', 'upsert_i18n', 'delete_i18n')),
          locale TEXT,
          payload_json TEXT NOT NULL DEFAULT '{}',
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'applied', 'failed', 'blocked', 'superseded')),
          attempt_count INTEGER NOT NULL DEFAULT 0,
          next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_attempt_at TEXT,
          last_error TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          applied_at TEXT,
          blocked_finding_id INTEGER,
          blocked_at TEXT,
          blocked_by TEXT,
          blocked_reason TEXT,
          override_id TEXT,
          override_reason TEXT,
          override_expires_at TEXT,
          lease_expires_at TEXT,
          superseded_by INTEGER,
          superseded_at TEXT
        );
        INSERT INTO sync_outbox (
          id, dedupe_key, entity_type, source_system, source_id, operation,
          locale, payload_json, status, attempt_count, next_attempt_at,
          last_attempt_at, last_error, created_at, updated_at, applied_at,
          blocked_finding_id, blocked_at, blocked_by, blocked_reason,
          override_id, override_reason, override_expires_at, lease_expires_at,
          superseded_by, superseded_at
        )
        SELECT id, dedupe_key, entity_type, source_system, source_id, operation,
          locale, payload_json, status, attempt_count, next_attempt_at,
          last_attempt_at, last_error, created_at, updated_at, applied_at,
          ${oldOrNull("blocked_finding_id")}, ${oldOrNull("blocked_at")},
          ${oldOrNull("blocked_by")}, ${oldOrNull("blocked_reason")},
          ${oldOrNull("override_id")}, ${oldOrNull("override_reason")},
          ${oldOrNull("override_expires_at")}, ${oldOrNull("lease_expires_at")},
          ${oldOrNull("superseded_by")}, ${oldOrNull("superseded_at")}
        FROM sync_outbox_legacy;
        DROP TABLE sync_outbox_legacy;
        CREATE INDEX idx_sync_outbox_status_next_attempt
          ON sync_outbox(status, next_attempt_at);
        CREATE INDEX idx_sync_outbox_source
          ON sync_outbox(source_system, source_id);
      `);
    })();
  } else {
    ensureColumn(db, "sync_outbox", "blocked_finding_id", "blocked_finding_id INTEGER");
    ensureColumn(db, "sync_outbox", "blocked_at", "blocked_at TEXT");
    ensureColumn(db, "sync_outbox", "blocked_by", "blocked_by TEXT");
    ensureColumn(db, "sync_outbox", "blocked_reason", "blocked_reason TEXT");
    ensureColumn(db, "sync_outbox", "override_id", "override_id TEXT");
    ensureColumn(db, "sync_outbox", "override_reason", "override_reason TEXT");
    ensureColumn(db, "sync_outbox", "override_expires_at", "override_expires_at TEXT");
    ensureColumn(db, "sync_outbox", "lease_expires_at", "lease_expires_at TEXT");
    ensureColumn(db, "sync_outbox", "superseded_by", "superseded_by INTEGER");
    ensureColumn(db, "sync_outbox", "superseded_at", "superseded_at TEXT");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_catalog_revision (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      revision INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO sync_catalog_revision (id, revision) VALUES (1, 0);

    CREATE TABLE IF NOT EXISTS sync_findings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL UNIQUE,
      run_id TEXT,
      severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'blocked')),
      code TEXT NOT NULL,
      category TEXT NOT NULL,
      canonical_key TEXT,
      sqlite_identity_json TEXT NOT NULL DEFAULT '[]',
      convex_identity_json TEXT NOT NULL DEFAULT '[]',
      evidence_json TEXT NOT NULL DEFAULT '{}',
      resolution_status TEXT NOT NULL DEFAULT 'open'
        CHECK (resolution_status IN ('open', 'resolved', 'dismissed')),
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      resolved_at TEXT,
      resolved_by TEXT,
      resolution_reason TEXT,
      sqlite_catalog_revision TEXT,
      sqlite_data_revision TEXT,
      outbox_watermark INTEGER,
      convex_snapshot_revision TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sync_findings_status_key
      ON sync_findings(resolution_status, severity, canonical_key);
    CREATE INDEX IF NOT EXISTS idx_sync_findings_run
      ON sync_findings(run_id);

    CREATE TABLE IF NOT EXISTS sync_repair_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id TEXT NOT NULL UNIQUE,
      run_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('merge', 'link', 'republish', 'quarantine', 'archive')),
      status TEXT NOT NULL DEFAULT 'proposed'
        CHECK (status IN ('proposed', 'approved', 'applied', 'rejected', 'stale')),
      payload_json TEXT NOT NULL DEFAULT '{}',
      evidence_json TEXT NOT NULL DEFAULT '{}',
      sqlite_catalog_revision TEXT NOT NULL,
      sqlite_data_revision TEXT NOT NULL,
      outbox_watermark INTEGER NOT NULL,
      convex_snapshot_revision TEXT,
      convex_expected_count INTEGER,
      convex_received_count INTEGER,
      convex_page_count INTEGER,
      convex_terminal_cursor TEXT,
      source_data_changed INTEGER NOT NULL DEFAULT 0,
      snapshot_complete INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      approved_by TEXT,
      approved_at TEXT,
      approval_reason TEXT,
      applied_by TEXT,
      applied_at TEXT,
      rejection_reason TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sync_repair_proposals_status
      ON sync_repair_proposals(status, created_at);

    CREATE TABLE IF NOT EXISTS sync_outbox_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outbox_id INTEGER NOT NULL,
      finding_id INTEGER,
      action TEXT NOT NULL CHECK (action IN ('requeue', 'override')),
      operator_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      expires_at TEXT,
      before_json TEXT NOT NULL DEFAULT '{}',
      after_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(outbox_id) REFERENCES sync_outbox(id),
      FOREIGN KEY(finding_id) REFERENCES sync_findings(id)
    );
    CREATE INDEX IF NOT EXISTS idx_sync_outbox_audit_outbox
      ON sync_outbox_audit(outbox_id, created_at);
  `);

  const reconciliationColumns: Array<[string, string]> = [
    ["run_id", "run_id TEXT"],
    ["mode", "mode TEXT NOT NULL DEFAULT 'audit'"],
    ["sqlite_data_revision", "sqlite_data_revision TEXT"],
    ["sqlite_catalog_revision", "sqlite_catalog_revision TEXT"],
    ["sqlite_outbox_watermark", "sqlite_outbox_watermark INTEGER"],
    ["convex_snapshot_revision", "convex_snapshot_revision TEXT"],
    ["expected_count", "expected_count INTEGER"],
    ["received_count", "received_count INTEGER"],
    ["page_count", "page_count INTEGER NOT NULL DEFAULT 0"],
    ["terminal_cursor", "terminal_cursor TEXT"],
    ["source_data_changed", "source_data_changed INTEGER NOT NULL DEFAULT 0"],
    ["snapshot_complete", "snapshot_complete INTEGER NOT NULL DEFAULT 0"],
    ["finding_count", "finding_count INTEGER NOT NULL DEFAULT 0"],
    ["operator_id", "operator_id TEXT"],
  ];
  for (const [name, declaration] of reconciliationColumns) {
    ensureColumn(db, "sync_reconciliation_runs", name, declaration);
  }
  ensureColumn(db, "sync_repair_proposals", "approval_reason", "approval_reason TEXT");
  ensureColumn(db, "sync_repair_proposals", "convex_expected_count", "convex_expected_count INTEGER");
  ensureColumn(db, "sync_repair_proposals", "convex_received_count", "convex_received_count INTEGER");
  ensureColumn(db, "sync_repair_proposals", "convex_page_count", "convex_page_count INTEGER");
  ensureColumn(db, "sync_repair_proposals", "convex_terminal_cursor", "convex_terminal_cursor TEXT");
  ensureColumn(db, "sync_repair_proposals", "source_data_changed", "source_data_changed INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "sync_repair_proposals", "snapshot_complete", "snapshot_complete INTEGER NOT NULL DEFAULT 0");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_reconciliation_runs_run_id
      ON sync_reconciliation_runs(run_id)
      WHERE run_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_sync_reconciliation_runs_status_mode
      ON sync_reconciliation_runs(status, mode, started_at);
  `);
}

/** Monotonic SQLite catalog revision used as an audit freshness boundary. */
export function getSyncCatalogRevision(db: SqliteDatabase): number {
  const row = db.prepare(
    `SELECT revision FROM sync_catalog_revision WHERE id = 1`,
  ).get() as { revision?: number } | undefined;
  return Number.isSafeInteger(row?.revision) ? Number(row!.revision) : 0;
}

/**
 * Increment the catalog revision in the caller's transaction.  All normal
 * writers reach this through enqueueSyncOutbox, so the revision and outbox
 * row commit atomically with the source write.
 */
export function bumpSyncCatalogRevision(db: SqliteDatabase): number {
  db.prepare(`
    UPDATE sync_catalog_revision
    SET revision = revision + 1, updated_at = datetime('now')
    WHERE id = 1
  `).run();
  return getSyncCatalogRevision(db);
}

/**
 * Older SQLite files were created with a vi/en-only CHECK constraint. Rebuild
 * that table in one transaction so future locale rows can be stored without
 * dropping existing translations. SQLite cannot remove a CHECK constraint with
 * ALTER TABLE, so this is intentionally a narrow, copy-then-swap migration.
 */
function ensureI18nLocaleCompatibility(db: SqliteDatabase): void {
  const table = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'master_plant_i18n'`)
    .get() as { sql?: string } | undefined;
  const sql = table?.sql?.toLowerCase() ?? "";
  if (!sql.includes("check") || !sql.includes("'vi'") || !sql.includes("'en'")) {
    return;
  }

  const migrate = db.transaction(() => {
    rebuildMasterPlantI18nTable(db);
  });
  migrate();
}

/**
 * Copy-then-swap rebuild of `master_plant_i18n` into the final schema.
 *
 * Used by both the vi/en-CHECK compatibility migration and the Phase 2 care
 * migration that drops `care_content_json`. Copies every column losslessly
 * (previously source, source_url, content_status, review_status, reviewed_at,
 * reviewed_by, and content_origin were silently dropped).
 */
function rebuildMasterPlantI18nTable(db: SqliteDatabase): void {
  // ALTER TABLE RENAME keeps object names, so remove the old table's index
  // and trigger before creating their replacements on the new table.
  db.exec(`
    DROP INDEX IF EXISTS idx_master_plant_i18n_master_plant_id;
    DROP TRIGGER IF EXISTS trg_master_plant_i18n_updated_at;
  `);
  db.exec(`ALTER TABLE master_plant_i18n RENAME TO master_plant_i18n_legacy;`);
  // Some disposable/older clones predate source_refs_json entirely. The
  // rebuilt schema owns the column, so project a deterministic empty array
  // for those rows instead of making the copy fail with "no such column".
  const legacyColumns = db
    .prepare(`PRAGMA table_info(master_plant_i18n_legacy)`)
    .all() as PragmaRow[];
  const sourceRefsProjection = legacyColumns.some((column) => column.name === "source_refs_json")
    ? "COALESCE(source_refs_json, '[]')"
    : "'[]'";
  db.exec(`
    CREATE TABLE master_plant_i18n (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      master_plant_id INTEGER NOT NULL,
      locale TEXT NOT NULL,
      common_name TEXT NOT NULL,
      description TEXT,
      care_content TEXT,
      content_updated_at TEXT,
      content_version INTEGER NOT NULL DEFAULT 1,
      source TEXT,
      source_url TEXT,
      content_status TEXT NOT NULL DEFAULT 'published',
      review_status TEXT NOT NULL DEFAULT 'unreviewed',
      reviewed_at TEXT,
      reviewed_by TEXT,
      content_origin TEXT NOT NULL DEFAULT 'imported' CHECK (content_origin IN ('authored', 'inherited', 'imported')),
      source_refs_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(master_plant_id, locale),
      FOREIGN KEY(master_plant_id) REFERENCES master_plants(id) ON DELETE CASCADE
    );
    INSERT INTO master_plant_i18n (
      id, master_plant_id, locale, common_name, description,
      care_content, content_updated_at, content_version, source, source_url,
      content_status, review_status, reviewed_at, reviewed_by,
      content_origin, source_refs_json, created_at, updated_at
    )
    SELECT id, master_plant_id, locale, common_name, description,
      care_content, ${legacyColumns.some((column) => column.name === "content_updated_at") ? "content_updated_at" : "NULL"}, content_version, source, source_url,
      content_status, review_status, reviewed_at, reviewed_by,
      content_origin, ${sourceRefsProjection}, created_at, updated_at
    FROM master_plant_i18n_legacy;
    DROP TABLE master_plant_i18n_legacy;
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
}

export interface CareContentMigrationReport {
  migrated: boolean;
  totalRowsBefore: number;
  totalRowsAfter: number;
  legacyNonEmpty: number;
  converted: number;
  authoredTextCount: number;
  failures: Array<{ id: number; locale: string; reason: string }>;
  textHashBefore: string;
  textHashAfter: string;
  provenanceHashesBefore: Record<string, string>;
  provenanceHashesAfter: Record<string, string>;
  viBefore: number;
  enBefore: number;
  viAfter: number;
  enAfter: number;
  foreignKeyIssues: number;
}

const PROVENANCE_COLUMNS = [
  "content_version",
  "source",
  "source_url",
  "content_status",
  "review_status",
  "reviewed_at",
  "reviewed_by",
  "content_origin",
  "created_at",
  "updated_at",
] as const;

function columnHash(db: SqliteDatabase, column: string): string {
  const rows = db
    .prepare(`SELECT ${column} AS value FROM master_plant_i18n ORDER BY id ASC`)
    .all() as Array<{ value: unknown }>;
  const joined = rows.map((row) => String(row.value ?? "")).join("\u0000");
  return crypto.createHash("sha256").update(joined).digest("hex");
}

/**
 * Phase 2 migration: convert legacy `care_content_json` values into canonical
 * `care_content` Markdown, then rebuild `master_plant_i18n` without the legacy
 * column. Transactional and idempotent (no-op when the legacy column is absent).
 */
export function migrateCareContentJsonToMarkdown(db: SqliteDatabase): CareContentMigrationReport {
  const columns = db.prepare(`PRAGMA table_info(master_plant_i18n)`).all() as PragmaRow[];
  const hasLegacy = columns.some((col) => col.name === "care_content_json");
  const hasCare = columns.some((col) => col.name === "care_content");
  if (!hasLegacy) {
    return {
      migrated: false,
      totalRowsBefore: 0,
      totalRowsAfter: 0,
      legacyNonEmpty: 0,
      converted: 0,
      authoredTextCount: 0,
      failures: [],
      textHashBefore: "",
      textHashAfter: "",
      provenanceHashesBefore: {},
      provenanceHashesAfter: {},
      viBefore: 0,
      enBefore: 0,
      viAfter: 0,
      enAfter: 0,
      foreignKeyIssues: 0,
    };
  }
  if (!hasCare) {
    ensureColumn(db, "master_plant_i18n", "care_content", `care_content TEXT`);
  }

  const report: CareContentMigrationReport = {
    migrated: true,
    totalRowsBefore: 0,
    totalRowsAfter: 0,
    legacyNonEmpty: 0,
    converted: 0,
    authoredTextCount: 0,
    failures: [],
    textHashBefore: "",
    textHashAfter: "",
    provenanceHashesBefore: {},
    provenanceHashesAfter: {},
    viBefore: 0,
    enBefore: 0,
    viAfter: 0,
    enAfter: 0,
    foreignKeyIssues: 0,
  };

  const authoredTextsBefore: string[] = [];
  const authoredRowIds: number[] = [];

  db.transaction(() => {
    const rows = db
      .prepare(`SELECT id, locale, care_content_json FROM master_plant_i18n ORDER BY id ASC`)
      .all() as Array<{ id: number; locale: string; care_content_json: string }>;
    report.totalRowsBefore = rows.length;
    report.viBefore = rows.filter((row) => row.locale === "vi").length;
    report.enBefore = rows.filter((row) => row.locale === "en").length;
    for (const column of PROVENANCE_COLUMNS) {
      report.provenanceHashesBefore[column] = columnHash(db, column);
    }

    const update = db.prepare(`UPDATE master_plant_i18n SET care_content = ? WHERE id = ?`);
    for (const row of rows) {
      const raw = row.care_content_json;
      if (raw === null || raw === undefined || raw.trim() === "" || raw.trim() === "{}") {
        continue;
      }
      report.legacyNonEmpty++;
      const conversion = legacyCareJsonToMarkdown(raw, row.locale);
      if (conversion.kind === "markdown") {
        update.run(conversion.markdown, row.id);
        report.converted++;
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = null;
        }
        if (isLegacyTextShape(parsed)) {
          report.authoredTextCount++;
          authoredTextsBefore.push(conversion.markdown);
          authoredRowIds.push(row.id);
        }
      } else if (conversion.kind === "unsupported") {
        report.failures.push({ id: row.id, locale: row.locale, reason: conversion.reason });
      }
    }
    report.textHashBefore = crypto
      .createHash("sha256")
      .update(authoredTextsBefore.join("\u0000"))
      .digest("hex");

    rebuildMasterPlantI18nTable(db);

    report.totalRowsAfter = (
      db.prepare(`SELECT COUNT(*) AS count FROM master_plant_i18n`).get() as { count: number }
    ).count;
    report.viAfter = (
      db.prepare(`SELECT COUNT(*) AS count FROM master_plant_i18n WHERE locale = 'vi'`).get() as {
        count: number;
      }
    ).count;
    report.enAfter = (
      db.prepare(`SELECT COUNT(*) AS count FROM master_plant_i18n WHERE locale = 'en'`).get() as {
        count: number;
      }
    ).count;
    for (const column of PROVENANCE_COLUMNS) {
      report.provenanceHashesAfter[column] = columnHash(db, column);
    }
    const authoredTextsAfter: string[] = [];
    for (const id of authoredRowIds) {
      const row = db.prepare(`SELECT care_content FROM master_plant_i18n WHERE id = ?`).get(id) as
        | { care_content: string | null }
        | undefined;
      authoredTextsAfter.push(row?.care_content ?? "");
    }
    report.textHashAfter = crypto
      .createHash("sha256")
      .update(authoredTextsAfter.join("\u0000"))
      .digest("hex");
    report.foreignKeyIssues = (
      db.prepare(`PRAGMA foreign_key_check`).all() as unknown[]
    ).length;
  })();

  return report;
}

export function ensureBootstrapAdmin(db: SqliteDatabase, email?: string, password?: string): void {
  if (!email || !password) {
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return;
  }

  const hash = bcrypt.hashSync(password, 12);

  const existing = db
    .prepare(`SELECT id FROM users WHERE email = ? LIMIT 1`)
    .get(normalizedEmail) as { id: number } | undefined;

  if (existing) {
    // Update password in case it changed in .env
    db.prepare(`UPDATE users SET password_hash = ?, is_active = 1 WHERE email = ?`).run(hash, normalizedEmail);
  } else {
    db.prepare(`INSERT INTO users (email, password_hash, role, is_active) VALUES (?, ?, 'admin', 1)`).run(
      normalizedEmail,
      hash,
    );
  }
}

export function listUserTables(db: SqliteDatabase): string[] {
  const rows = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC`,
    )
    .all() as TableRow[];

  return rows.map((row) => row.name).filter((name) => isSafeIdentifier(name));
}

export function getTableMetadata(db: SqliteDatabase, tableName: string): TableMetadata | null {
  if (!isSafeIdentifier(tableName)) {
    return null;
  }

  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(tableName) as TableRow | undefined;

  if (!tableExists) {
    return null;
  }

  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as PragmaRow[];

  if (rows.length === 0) {
    return null;
  }

  const columns: ColumnMetadata[] = rows.map((row) => ({
    cid: row.cid,
    name: row.name,
    type: row.type || "TEXT",
    notNull: Boolean(row.notnull),
    defaultValue: row.dflt_value,
    primaryKeyOrder: row.pk,
  }));

  const primaryKeyColumn = [...columns]
    .sort((a, b) => a.primaryKeyOrder - b.primaryKeyOrder)
    .find((column) => column.primaryKeyOrder > 0);

  return {
    name: tableName,
    columns,
    primaryKey: primaryKeyColumn?.name ?? null,
  };
}

export function getAllTableMetadata(db: SqliteDatabase): TableMetadata[] {
  return listUserTables(db)
    .map((tableName) => getTableMetadata(db, tableName))
    .filter((table): table is TableMetadata => Boolean(table));
}
