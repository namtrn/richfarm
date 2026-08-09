import fs from "fs";
import path from "path";

import bcrypt from "bcryptjs";
import Database from "better-sqlite3";

import { isSafeIdentifier } from "./sql-utils";

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

function runMigrations(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'editor', 'viewer')),
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
      care_content_json TEXT NOT NULL DEFAULT '{}',
      content_version INTEGER NOT NULL DEFAULT 1,
      source TEXT,
      source_url TEXT,
      content_status TEXT NOT NULL DEFAULT 'published',
      review_status TEXT NOT NULL DEFAULT 'unreviewed',
      reviewed_at TEXT,
      reviewed_by TEXT,
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
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'applied', 'failed')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_attempt_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      applied_at TEXT
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
  `);

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

  ensureI18nLocaleCompatibility(db);

  ensureColumn(db, "master_plant_i18n", "source", `source TEXT`);
  ensureColumn(db, "master_plant_i18n", "source_url", `source_url TEXT`);
  ensureColumn(db, "master_plant_i18n", "content_status", `content_status TEXT NOT NULL DEFAULT 'published'`);
  ensureColumn(db, "master_plant_i18n", "review_status", `review_status TEXT NOT NULL DEFAULT 'unreviewed'`);
  ensureColumn(db, "master_plant_i18n", "reviewed_at", `reviewed_at TEXT`);
  ensureColumn(db, "master_plant_i18n", "reviewed_by", `reviewed_by TEXT`);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_master_plants_source_identity
    ON master_plants(source_system, source_id)
    WHERE source_id IS NOT NULL;
  `);
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
    // ALTER TABLE RENAME keeps object names, so remove the old table's index
    // and trigger before creating their replacements on the new table.
    db.exec(`
      DROP INDEX IF EXISTS idx_master_plant_i18n_master_plant_id;
      DROP TRIGGER IF EXISTS trg_master_plant_i18n_updated_at;
    `);
    db.exec(`ALTER TABLE master_plant_i18n RENAME TO master_plant_i18n_legacy;`);
    db.exec(`
      CREATE TABLE master_plant_i18n (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        master_plant_id INTEGER NOT NULL,
        locale TEXT NOT NULL,
        common_name TEXT NOT NULL,
        description TEXT,
        care_content_json TEXT NOT NULL DEFAULT '{}',
        content_version INTEGER NOT NULL DEFAULT 1,
        source TEXT,
        source_url TEXT,
        content_status TEXT NOT NULL DEFAULT 'published',
        review_status TEXT NOT NULL DEFAULT 'unreviewed',
        reviewed_at TEXT,
        reviewed_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(master_plant_id, locale),
        FOREIGN KEY(master_plant_id) REFERENCES master_plants(id) ON DELETE CASCADE
      );
      INSERT INTO master_plant_i18n (
        id, master_plant_id, locale, common_name, description,
        care_content_json, content_version, created_at, updated_at
      )
      SELECT id, master_plant_id, locale, common_name, description,
        care_content_json, content_version, created_at, updated_at
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
  });
  migrate();
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
