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
      category TEXT NOT NULL DEFAULT 'general',
      growth_stage TEXT NOT NULL DEFAULT 'seedling' CHECK (growth_stage IN ('seedling', 'vegetative', 'flowering', 'harvest')),
      soil_ph_min REAL CHECK (soil_ph_min IS NULL OR (soil_ph_min >= 0 AND soil_ph_min <= 14)),
      soil_ph_max REAL CHECK (soil_ph_max IS NULL OR (soil_ph_max >= 0 AND soil_ph_max <= 14)),
      moisture_target INTEGER CHECK (moisture_target IS NULL OR (moisture_target >= 0 AND moisture_target <= 100)),
      light_hours INTEGER CHECK (light_hours IS NULL OR (light_hours >= 0 AND light_hours <= 24)),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      notes TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
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
  `);
}

export function ensureBootstrapAdmin(db: SqliteDatabase, email?: string, password?: string): void {
  if (!email || !password) {
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return;
  }

  const existing = db
    .prepare(`SELECT id FROM users WHERE email = ? LIMIT 1`)
    .get(normalizedEmail) as { id: number } | undefined;

  if (existing) {
    return;
  }

  const hash = bcrypt.hashSync(password, 12);
  db.prepare(`INSERT INTO users (email, password_hash, role, is_active) VALUES (?, ?, 'admin', 1)`).run(
    normalizedEmail,
    hash,
  );
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
