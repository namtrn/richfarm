import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import {
  CANONICAL_IDENTITY_VERSION,
  extractLegacyCanonicalIdentityFields,
  validateCanonicalPlantIdentity,
  type CanonicalInfraspecificRank,
  type CanonicalPlantIdentity,
  type CanonicalScope,
} from "../../../packages/shared/src/canonicalPlantIdentity";
import type { SqliteDatabase } from "./db";

/**
 * CID-3 is deliberately additive.  The columns on master_plants remain
 * nullable until a reviewed backfill has completed, while the compatibility
 * writer and the active-row trigger prevent new unclassified plants.
 */
export const SQLITE_CANONICAL_SCHEMA_VERSION = "sqlite_canonical_identity_v1" as const;

export const CANONICAL_REFERENCE_TABLES = [
  "master_plant_i18n",
  "plant_measurements",
  "plant_origin_countries",
  "plant_proven_regions",
  "plant_adaptation_terms",
] as const;

type CanonicalReferenceTable = (typeof CANONICAL_REFERENCE_TABLES)[number];

export interface SqliteCanonicalIdentityFields {
  canonical_identity_version: typeof CANONICAL_IDENTITY_VERSION;
  canonical_key: string;
  genus: string;
  species: string;
  infraspecific_rank: CanonicalInfraspecificRank | null;
  infraspecific_name: string | null;
  cultivar: string | null;
  identity_scope: CanonicalScope;
  parent_master_plant_id: number | null;
  parent_canonical_key: string | null;
}

export interface LegacyIdentityCandidate {
  id: number;
  plantCode: string;
  identity: CanonicalPlantIdentity | null;
  fields: {
    genus: string | null;
    species: string | null;
    rank: string | null;
    infraspecificName: string | null;
    cultivar: string | null;
    scope: CanonicalScope | null;
    parentMasterPlantId: number | null;
    parentCanonicalKey: string | null;
  };
  reason: string | null;
  identitySource: "structured" | "scientific_name" | "stored" | "missing";
}

export interface CanonicalReferenceCount {
  table: CanonicalReferenceTable;
  total: number;
  byLoser: Record<string, number>;
  transferred: number;
  /** Natural-key collisions stay attached to the archived loser row. */
  redirectedConflicts: number;
  /** Kept as a compatibility alias; CID-3 never deletes a child row. */
  archivedConflicts: number;
}

export interface CanonicalIdentityMigrationOptions {
  /** Defaults to true.  A caller must opt into mutation explicitly. */
  dryRun?: boolean;
  /** Stable operator/run ID.  Generated IDs are deterministic for a report. */
  runId?: string;
  /** The only collision repair authorized by CID-3 in this package. */
  winnerId?: number;
  loserIds?: number[];
  /** Require the exact dry-run report revision before apply. */
  dryRunRevision?: string;
  /** A bounded batch protects large local authoring databases. */
  batchSize?: number;
  /** Optional file hash captured by the CLI before a dry-run/apply. */
  databasePath?: string;
  /** Caller-provided backup path.  Apply refuses to run without one. */
  backupPath?: string;
}

export interface CanonicalIdentityMigrationReport {
  schemaVersion: typeof SQLITE_CANONICAL_SCHEMA_VERSION;
  runId: string;
  mode: "dry_run" | "apply";
  status: "ready" | "applied" | "blocked" | "rolled_back";
  beforeHash: string;
  afterHash: string | null;
  backup: {
    required: boolean;
    path: string | null;
    sha256: string | null;
    verified: boolean;
  };
  counts: {
    scanned: number;
    backfillable: number;
    quarantined: number;
    nullCanonicalKeys: number;
    activeRows: number;
    activeCanonicalKeys: number;
    collisions: number;
    repairedCollisions: number;
    archivedRows: number;
    externalIdentities: number;
    parentLinks: number;
  };
  candidates: Array<{
    id: number;
    plantCode: string;
    canonicalKey: string | null;
    scope: CanonicalScope | null;
    parentMasterPlantId: number | null;
    identitySource: LegacyIdentityCandidate["identitySource"];
    status: "backfillable" | "quarantine" | "archived";
    reason: string | null;
  }>;
  collisions: Array<{
    canonicalKey: string;
    rowIds: number[];
    classification: "exact_duplicate" | "unresolved_ambiguity";
    proposal: { winnerId: number | null; loserIds: number[] } | null;
  }>;
  references: CanonicalReferenceCount[];
  quarantine: Array<{ rowId: number; reason: string; details: Record<string, unknown> }>;
  journal: {
    table: string;
    rows: number;
    rollbackReady: boolean;
  };
  errors: string[];
}

export interface SqliteBackupResult {
  sourcePath: string;
  backupPath: string;
  sha256: string;
  verified: boolean;
  bytes: number;
}

export interface CanonicalIdentityMigrationBackupMetadataRepairOptions {
  databasePath: string;
  runId: string;
  backupPath: string;
  /** The exact pre-apply bytes recorded by the approved apply report. */
  expectedBeforeHash: string;
  /** The backup SHA recorded by the approved apply report. */
  expectedBackupSha256: string;
}

export interface CanonicalIdentityMigrationBackupMetadataRepairResult {
  runId: string;
  status: "repaired" | "already_verified";
  databasePath: string;
  backupPath: string;
  backupSha256: string;
  expectedBeforeHash: string;
  filledFields: Array<"backup_path" | "backup_sha256">;
  journalSequence: number | null;
  beforeDatabaseHash: string;
  afterDatabaseHash: string;
}

export class CanonicalIdentityMigrationError extends Error {
  readonly code: string;
  readonly report?: CanonicalIdentityMigrationReport;

  constructor(code: string, message: string, report?: CanonicalIdentityMigrationReport) {
    super(message);
    this.name = "CanonicalIdentityMigrationError";
    this.code = code;
    this.report = report;
  }
}

/**
 * Public write-boundary helpers.  The legacy extractor intentionally falls
 * back to scientific_name for audit/backfill and existing-row updates.  New
 * rows must use this stricter shape so a display string can never manufacture
 * a new identity by accident.
 */
const CANONICAL_INPUT_ALIASES = {
  genus: ["genus", "accepted_genus", "acceptedGenus"],
  species: ["species", "accepted_species", "acceptedSpecies"],
  rank: ["infraspecific_rank", "infraspecificRank", "rank"],
  infraspecificName: ["infraspecific_name", "infraspecificName"],
  cultivar: ["cultivar", "cultivar_name", "cultivarName"],
  scope: ["identity_scope", "identityScope", "scope"],
  parentMasterPlantId: ["parent_master_plant_id", "parentMasterPlantId", "parent_id", "parentId"],
  parentCanonicalKey: ["parent_canonical_key", "parentCanonicalKey", "parent_key", "parentKey"],
} as const;

function ownValue(row: Record<string, unknown>, names: readonly string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  return undefined;
}

function ownValuePresent(row: Record<string, unknown>, names: readonly string[]): boolean {
  return names.some((name) => Object.prototype.hasOwnProperty.call(row, name));
}

/** True when any structured identity value (including an explicit null) was supplied. */
export function hasExplicitCanonicalIdentityFields(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.values(CANONICAL_INPUT_ALIASES).some((names) => ownValuePresent(row, names));
}

/**
 * Require every canonical component to be present at the public create/import
 * boundary.  Null is valid for base-only rank/name/cultivar/parent values;
 * omission is not.  Cultivar parent semantics are enforced by the shared
 * validator below.
 */
export function hasCompleteStructuredCanonicalIdentity(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.values(CANONICAL_INPUT_ALIASES).every((names) => {
    const component = ownValue(row, names);
    return component !== undefined;
  });
}

export function validateStructuredCanonicalIdentity(value: unknown) {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return validateCanonicalPlantIdentity({
    genus: ownValue(row, CANONICAL_INPUT_ALIASES.genus),
    species: ownValue(row, CANONICAL_INPUT_ALIASES.species),
    rank: ownValue(row, CANONICAL_INPUT_ALIASES.rank),
    infraspecificName: ownValue(row, CANONICAL_INPUT_ALIASES.infraspecificName),
    cultivar: ownValue(row, CANONICAL_INPUT_ALIASES.cultivar),
    scope: ownValue(row, CANONICAL_INPUT_ALIASES.scope),
    parentMasterPlantId: ownValue(row, CANONICAL_INPUT_ALIASES.parentMasterPlantId),
    parentCanonicalKey: ownValue(row, CANONICAL_INPUT_ALIASES.parentCanonicalKey),
  });
}

export function assertStructuredCanonicalIdentity(value: unknown): void {
  if (!hasCompleteStructuredCanonicalIdentity(value)) {
    throw new CanonicalIdentityMigrationError(
      "CANONICAL_IDENTITY_INCOMPLETE",
      "new master plants require structured genus, species, rank, infraspecificName, cultivar, scope, and parent fields",
    );
  }
  const result = validateStructuredCanonicalIdentity(value);
  if (!result.ok) {
    throw new CanonicalIdentityMigrationError(
      result.code,
      result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "),
    );
  }
}

export interface CanonicalIdentityMatch {
  id: number;
  plantCode: string;
  canonicalKey: string;
  genus: string;
  species: string;
  rank: string;
  infraspecificName: string;
  cultivar: string;
  scope: CanonicalScope;
  parentMasterPlantId: number | null;
  parentCanonicalKey: string | null;
}

export interface CanonicalIdentityMatchPreview {
  status: "exact" | "near_match" | "new";
  identity: CanonicalPlantIdentity;
  exact: CanonicalIdentityMatch | null;
  suggestions: CanonicalIdentityMatch[];
}

function tableExists(db: SqliteDatabase, table: string): boolean {
  return Boolean(db.prepare(
    `SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?`,
  ).get(table));
}

function columnExists(db: SqliteDatabase, table: string, column: string): boolean {
  if (!tableExists(db, table)) return false;
  const rows = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQLite identifier: ${value}`);
  }
  return `"${value}"`;
}

function ensureColumn(
  db: SqliteDatabase,
  table: string,
  column: string,
  declaration: string,
): void {
  if (!columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${declaration}`);
  }
}

/**
 * Install only additive schema and guards.  This function never backfills,
 * merges, archives, or creates a migration journal row.
 */
export function ensureSqliteCanonicalIdentitySchema(db: SqliteDatabase): void {
  if (!tableExists(db, "master_plants")) {
    throw new Error("master_plants must exist before installing canonical identity schema");
  }

  ensureColumn(db, "master_plants", "canonical_identity_version", "canonical_identity_version TEXT");
  ensureColumn(db, "master_plants", "canonical_key", "canonical_key TEXT");
  ensureColumn(db, "master_plants", "genus", "genus TEXT");
  ensureColumn(db, "master_plants", "species", "species TEXT");
  ensureColumn(db, "master_plants", "infraspecific_rank", "infraspecific_rank TEXT");
  ensureColumn(db, "master_plants", "infraspecific_name", "infraspecific_name TEXT");
  ensureColumn(db, "master_plants", "cultivar", "cultivar TEXT");
  ensureColumn(db, "master_plants", "identity_scope", "identity_scope TEXT");
  ensureColumn(db, "master_plants", "parent_master_plant_id", "parent_master_plant_id INTEGER");
  ensureColumn(db, "master_plants", "parent_canonical_key", "parent_canonical_key TEXT");
  ensureColumn(db, "master_plants", "canonical_status", "canonical_status TEXT NOT NULL DEFAULT 'active'");
  ensureColumn(db, "master_plants", "canonical_archived_at", "canonical_archived_at TEXT");
  ensureColumn(db, "master_plants", "canonical_archived_into_id", "canonical_archived_into_id INTEGER");
  ensureColumn(db, "master_plants", "canonical_archive_reason", "canonical_archive_reason TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS plant_external_identities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      master_plant_id INTEGER NOT NULL,
      source_system TEXT NOT NULL,
      source_id TEXT NOT NULL,
      retired_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source_system, source_id),
      FOREIGN KEY(master_plant_id) REFERENCES master_plants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_plant_external_identities_master
      ON plant_external_identities(master_plant_id);
    CREATE INDEX IF NOT EXISTS idx_plant_external_identities_source
      ON plant_external_identities(source_system, source_id);

    CREATE TABLE IF NOT EXISTS canonical_identity_quarantine (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      migration_run_id TEXT NOT NULL,
      master_plant_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      UNIQUE(migration_run_id, master_plant_id),
      FOREIGN KEY(master_plant_id) REFERENCES master_plants(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_canonical_identity_quarantine_plant
      ON canonical_identity_quarantine(master_plant_id);

    CREATE TABLE IF NOT EXISTS canonical_identity_migration_runs (
      run_id TEXT PRIMARY KEY,
      schema_version TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('dry_run', 'apply')),
      status TEXT NOT NULL CHECK(status IN ('ready', 'applied', 'blocked', 'rolled_back')),
      before_hash TEXT NOT NULL,
      after_hash TEXT,
      backup_path TEXT,
      backup_sha256 TEXT,
      options_json TEXT NOT NULL DEFAULT '{}',
      report_json TEXT NOT NULL DEFAULT '{}',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS canonical_identity_migration_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      sequence_no INTEGER NOT NULL,
      entity_type TEXT NOT NULL,
      entity_table TEXT,
      entity_id TEXT,
      action TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(run_id, sequence_no)
    );
    CREATE INDEX IF NOT EXISTS idx_canonical_identity_journal_run
      ON canonical_identity_migration_journal(run_id, sequence_no);

    CREATE TABLE IF NOT EXISTS canonical_identity_reference_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      winner_master_plant_id INTEGER NOT NULL,
      loser_master_plant_id INTEGER NOT NULL,
      reference_table TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      row_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(winner_master_plant_id) REFERENCES master_plants(id),
      FOREIGN KEY(loser_master_plant_id) REFERENCES master_plants(id)
    );

    CREATE TABLE IF NOT EXISTS canonical_identity_reference_redirects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      winner_master_plant_id INTEGER NOT NULL,
      loser_master_plant_id INTEGER NOT NULL,
      reference_table TEXT NOT NULL,
      source_reference_id TEXT NOT NULL,
      target_reference_id TEXT NOT NULL,
      row_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      rolled_back_at TEXT,
      UNIQUE(run_id, reference_table, source_reference_id),
      FOREIGN KEY(winner_master_plant_id) REFERENCES master_plants(id),
      FOREIGN KEY(loser_master_plant_id) REFERENCES master_plants(id)
    );
    CREATE INDEX IF NOT EXISTS idx_canonical_identity_redirects_run
      ON canonical_identity_reference_redirects(run_id, reference_table);
  `);
  // Existing rehearsal databases may have the alias table from an earlier
  // additive revision without the rollback tombstone field.
  ensureColumn(db, "plant_external_identities", "retired_at", "retired_at TEXT");

  // Active rows cannot be introduced or changed without a canonical key.
  // Quarantined/archived rows remain writable by the migration journal only.
  db.exec(`
    DROP TRIGGER IF EXISTS trg_master_plants_canonical_identity_required_insert;
    DROP TRIGGER IF EXISTS trg_master_plants_canonical_identity_required_update;
    DROP TRIGGER IF EXISTS trg_master_plants_canonical_identity_parent_insert;
    DROP TRIGGER IF EXISTS trg_master_plants_canonical_identity_parent_update;

    CREATE TRIGGER IF NOT EXISTS trg_master_plants_canonical_identity_required_insert
    BEFORE INSERT ON master_plants
    FOR EACH ROW
    WHEN NEW.canonical_status = 'active'
      AND (
        NEW.canonical_identity_version IS NULL
        OR trim(NEW.canonical_identity_version) = ''
        OR NEW.canonical_key IS NULL
        OR trim(NEW.canonical_key) = ''
      )
    BEGIN
      SELECT RAISE(ABORT, 'CANONICAL_IDENTITY_REQUIRED');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_master_plants_canonical_identity_required_update
    BEFORE UPDATE ON master_plants
    FOR EACH ROW
    WHEN NEW.canonical_status = 'active'
      AND (
        NEW.canonical_identity_version IS NULL
        OR trim(NEW.canonical_identity_version) = ''
        OR NEW.canonical_key IS NULL
        OR trim(NEW.canonical_key) = ''
      )
    BEGIN
      SELECT RAISE(ABORT, 'CANONICAL_IDENTITY_REQUIRED');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_master_plants_canonical_identity_parent_insert
    BEFORE INSERT ON master_plants
    FOR EACH ROW
    WHEN NEW.canonical_status = 'active' AND NEW.canonical_key IS NOT NULL
    BEGIN
      SELECT CASE WHEN NEW.identity_scope = 'base' AND (
        NEW.cultivar IS NOT NULL OR NEW.parent_master_plant_id IS NOT NULL OR NEW.parent_canonical_key IS NOT NULL
      ) THEN RAISE(ABORT, 'CANONICAL_BASE_PARENT_FORBIDDEN') END;
      SELECT CASE WHEN NEW.identity_scope = 'cultivar' AND (
        NEW.cultivar IS NULL OR trim(NEW.cultivar) = '' OR NEW.parent_master_plant_id IS NULL
      ) THEN RAISE(ABORT, 'CANONICAL_CULTIVAR_PARENT_REQUIRED') END;
      SELECT CASE WHEN NEW.parent_master_plant_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master_plants p
        WHERE p.id = NEW.parent_master_plant_id
          AND p.canonical_status = 'active'
          AND p.identity_scope = 'base'
          AND p.cultivar IS NULL
          AND p.genus = NEW.genus
          AND p.species = NEW.species
          AND coalesce(p.infraspecific_rank, '') = coalesce(NEW.infraspecific_rank, '')
          AND coalesce(p.infraspecific_name, '') = coalesce(NEW.infraspecific_name, '')
      ) THEN RAISE(ABORT, 'CANONICAL_PARENT_MISMATCH') END;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_master_plants_canonical_identity_parent_update
    BEFORE UPDATE OF canonical_status, identity_scope, parent_master_plant_id,
      genus, species, infraspecific_rank, infraspecific_name, cultivar ON master_plants
    FOR EACH ROW
    WHEN NEW.canonical_status = 'active' AND NEW.canonical_key IS NOT NULL
    BEGIN
      SELECT CASE WHEN NEW.identity_scope = 'base' AND (
        NEW.cultivar IS NOT NULL OR NEW.parent_master_plant_id IS NOT NULL OR NEW.parent_canonical_key IS NOT NULL
      ) THEN RAISE(ABORT, 'CANONICAL_BASE_PARENT_FORBIDDEN') END;
      SELECT CASE WHEN NEW.identity_scope = 'cultivar' AND (
        NEW.cultivar IS NULL OR trim(NEW.cultivar) = '' OR NEW.parent_master_plant_id IS NULL
      ) THEN RAISE(ABORT, 'CANONICAL_CULTIVAR_PARENT_REQUIRED') END;
      SELECT CASE WHEN NEW.parent_master_plant_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master_plants p
        WHERE p.id = NEW.parent_master_plant_id
          AND p.id <> NEW.id
          AND p.canonical_status = 'active'
          AND p.identity_scope = 'base'
          AND p.cultivar IS NULL
          AND p.genus = NEW.genus
          AND p.species = NEW.species
          AND coalesce(p.infraspecific_rank, '') = coalesce(NEW.infraspecific_rank, '')
          AND coalesce(p.infraspecific_name, '') = coalesce(NEW.infraspecific_name, '')
      ) THEN RAISE(ABORT, 'CANONICAL_PARENT_MISMATCH') END;
    END;
  `);
}

/** Capture a byte-identical SQLite backup before any apply operation. */
export function backupSqliteDatabase(sourcePath: string, requestedBackupPath?: string): SqliteBackupResult {
  const resolvedSource = path.resolve(sourcePath);
  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`SQLite database does not exist: ${resolvedSource}`);
  }
  const source = fs.readFileSync(resolvedSource);
  const sha256 = hashBytes(source);
  const backupPath = path.resolve(requestedBackupPath ?? `${resolvedSource}.cid3-${Date.now()}.bak`);
  if (fs.existsSync(backupPath)) {
    throw new Error(`Refusing to overwrite existing SQLite backup: ${backupPath}`);
  }
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(resolvedSource, backupPath);
  const copied = fs.readFileSync(backupPath);
  const copiedHash = hashBytes(copied);
  return {
    sourcePath: resolvedSource,
    backupPath,
    sha256,
    verified: copiedHash === sha256 && copied.length === source.length,
    bytes: copied.length,
  };
}

function hashBytes(value: Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function openedDatabasePath(db: SqliteDatabase): string | null {
  const name = (db as unknown as { name?: unknown }).name;
  if (typeof name !== "string" || name === ":memory:" || name.trim() === "") return null;
  return path.resolve(name);
}

/**
 * Prepare an immutable, byte-verified backup before an apply preflight.  An
 * existing path is accepted only when it already matches the source bytes;
 * fake/old backups are rejected instead of overwritten.
 */
function prepareVerifiedBackupForPath(
  databasePath: string | undefined,
  requestedBackupPath: string | undefined,
): SqliteBackupResult {
  if (!databasePath || databasePath.trim() === "") {
    throw new CanonicalIdentityMigrationError("DATABASE_PATH_REQUIRED", "CID-3 apply requires databasePath");
  }
  if (!requestedBackupPath || requestedBackupPath.trim() === "") {
    throw new CanonicalIdentityMigrationError("BACKUP_REQUIRED", "CID-3 apply requires backupPath");
  }
  const sourcePath = path.resolve(databasePath);
  if (!fs.existsSync(sourcePath)) {
    throw new CanonicalIdentityMigrationError("DATABASE_NOT_FOUND", `SQLite database does not exist: ${sourcePath}`);
  }
  const backupPath = path.resolve(requestedBackupPath);
  if (backupPath === sourcePath) {
    throw new CanonicalIdentityMigrationError("BACKUP_PATH_INVALID", "backupPath must differ from databasePath");
  }
  const sourceBytes = fs.readFileSync(sourcePath);
  const sourceSha256 = hashBytes(sourceBytes);
  if (fs.existsSync(backupPath)) {
    const backupBytes = fs.readFileSync(backupPath);
    const backupSha256 = hashBytes(backupBytes);
    if (backupSha256 !== sourceSha256 || backupBytes.length !== sourceBytes.length) {
      throw new CanonicalIdentityMigrationError("BACKUP_HASH_MISMATCH", "backup bytes do not match the source database");
    }
    return {
      sourcePath,
      backupPath,
      sha256: sourceSha256,
      verified: true,
      bytes: backupBytes.length,
    };
  }
  const backup = backupSqliteDatabase(sourcePath, backupPath);
  if (!backup.verified || backup.sha256 !== sourceSha256) {
    throw new CanonicalIdentityMigrationError("BACKUP_VERIFY_FAILED", "created backup failed byte verification");
  }
  return backup;
}

function prepareVerifiedBackup(
  db: SqliteDatabase,
  databasePath: string | undefined,
  requestedBackupPath: string | undefined,
): SqliteBackupResult {
  if (!databasePath || databasePath.trim() === "") {
    throw new CanonicalIdentityMigrationError("DATABASE_PATH_REQUIRED", "CID-3 apply requires databasePath");
  }
  const sourcePath = databasePath ? path.resolve(databasePath) : null;
  const openedPath = openedDatabasePath(db);
  if (!sourcePath || !openedPath || openedPath !== sourcePath) {
    throw new CanonicalIdentityMigrationError(
      "DATABASE_PATH_MISMATCH",
      "databasePath must identify the already-open SQLite database",
    );
  }
  return prepareVerifiedBackupForPath(databasePath, requestedBackupPath);
}

function hashDatabase(db: SqliteDatabase): string {
  // serialize() captures schema plus pages for in-memory and file-backed DBs;
  // it avoids relying on filesystem paths in tests and dry-run callers.
  return hashBytes(db.serialize());
}

function hashJson(value: unknown): string {
  return crypto.createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseJson(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || value.trim() === "") return {};
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

function firstValue(row: Record<string, unknown>, names: readonly string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  return undefined;
}

function firstString(row: Record<string, unknown>, names: readonly string[]): string | null | undefined {
  const value = firstValue(row, names);
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value : String(value);
}

function nullableText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const valueText = String(value).trim();
  return valueText ? valueText : null;
}

function positiveInteger(value: unknown): number | null {
  const numberValue = typeof value === "string" && /^\d+$/.test(value.trim())
    ? Number(value)
    : value;
  return typeof numberValue === "number" && Number.isSafeInteger(numberValue) && numberValue > 0
    ? numberValue
    : null;
}

interface CanonicalIdentitySourceFields {
  genus: string | null;
  species: string | null;
  rank: string | null;
  infraspecificName: string | null;
  cultivar: string | null;
  scope: CanonicalScope | null;
  parentMasterPlantId: number | null;
  parentCanonicalKey: string | null;
}

function identitySourceForRow(row: Record<string, unknown>): CanonicalIdentitySourceFields & {
  source: LegacyIdentityCandidate["identitySource"];
} {
  const fields = extractLegacyCanonicalIdentityFields(row);
  return {
    genus: fields.genus,
    species: fields.species,
    rank: fields.rank,
    infraspecificName: fields.infraspecificName,
    cultivar: fields.cultivar,
    scope: fields.scope,
    parentMasterPlantId: fields.parentMasterPlantId,
    parentCanonicalKey: fields.parentCanonicalKey,
    source: fields.identitySource,
  };
}

function matchFromCandidate(candidate: LegacyIdentityCandidate): CanonicalIdentityMatch | null {
  if (!candidate.identity) return null;
  return {
    id: candidate.id,
    plantCode: candidate.plantCode,
    canonicalKey: candidate.identity.canonicalKey,
    genus: candidate.identity.genus,
    species: candidate.identity.species,
    rank: candidate.identity.rank,
    infraspecificName: candidate.identity.infraspecificName,
    cultivar: candidate.identity.cultivar,
    scope: candidate.identity.scope,
    parentMasterPlantId: candidate.fields.parentMasterPlantId,
    parentCanonicalKey: candidate.fields.parentCanonicalKey,
  };
}

/**
 * Read-only canonical match preview for create/import UIs.  Only active rows
 * participate in exact blocking.  Legacy NULL-key rows are inspected through
 * the same deterministic extractor so a new row cannot evade an existing
 * duplicate while backfill is incomplete.  Near matches are suggestions and
 * never mutate or auto-select a row.
 */
export function previewCanonicalIdentityMatch(
  db: SqliteDatabase,
  payload: Record<string, unknown>,
): CanonicalIdentityMatchPreview {
  const validation = validateStructuredCanonicalIdentity(payload);
  if (!validation.ok) {
    throw new CanonicalIdentityMigrationError(
      validation.code,
      validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "),
    );
  }
  const rows = db.prepare(`
    SELECT * FROM master_plants
    WHERE coalesce(canonical_status, 'active') = 'active'
    ORDER BY id ASC
  `).all() as Array<Record<string, unknown>>;
  const candidates = rows
    .map(candidateFromRow)
    .map((candidate) => matchFromCandidate(candidate))
    .filter((match): match is CanonicalIdentityMatch => Boolean(match));
  const exact = candidates.find((match) => match.canonicalKey === validation.canonicalKey) ?? null;
  if (exact) {
    return { status: "exact", identity: validation.identity, exact, suggestions: [] };
  }

  const suggestions = candidates
    .map((match) => {
      let score = 0;
      if (match.genus === validation.identity.genus) score += 3;
      if (match.species === validation.identity.species) score += 3;
      if (match.rank === validation.identity.rank) score += 1;
      if (match.infraspecificName === validation.identity.infraspecificName) score += 1;
      if (match.scope === validation.identity.scope) score += 1;
      if (match.cultivar && validation.identity.cultivar && (
        match.cultivar.startsWith(validation.identity.cultivar) ||
        validation.identity.cultivar.startsWith(match.cultivar)
      )) score += 1;
      return { match, score };
    })
    .filter(({ score }) => score >= 6)
    .sort((left, right) => right.score - left.score || left.match.id - right.match.id)
    .slice(0, 5)
    .map(({ match }) => match);

  return {
    status: suggestions.length > 0 ? "near_match" : "new",
    identity: validation.identity,
    exact: null,
    suggestions,
  };
}

function baseIdentityKey(fields: CanonicalIdentitySourceFields): string | null {
  if (!fields.genus || !fields.species) return null;
  const result = validateCanonicalPlantIdentity({
    genus: fields.genus,
    species: fields.species,
    rank: fields.rank,
    infraspecificName: fields.infraspecificName,
    cultivar: null,
    scope: "base",
    parentCanonicalKey: null,
    parentMasterPlantId: null,
  });
  return result.ok ? result.canonicalKey : null;
}

function candidateFromRow(row: Record<string, unknown>): LegacyIdentityCandidate {
  const id = positiveInteger(firstValue(row, ["id"])) ?? 0;
  const fields = identitySourceForRow(row);
  const parentKey = fields.parentCanonicalKey ?? (
    fields.scope === "cultivar" ? baseIdentityKey(fields) : null
  );
  const validation = fields.genus && fields.species && fields.scope
    ? validateCanonicalPlantIdentity({
      genus: fields.genus,
      species: fields.species,
      rank: fields.rank,
      infraspecificName: fields.infraspecificName,
      cultivar: fields.cultivar,
      scope: fields.scope,
      parentCanonicalKey: parentKey,
      parentMasterPlantId: fields.parentMasterPlantId,
    })
    : { ok: false as const, issues: [{ message: "structured genus/species identity is missing" }] };
  const identity = validation.ok ? validation.identity : null;
  const reason = validation.ok
    ? fields.scope === "cultivar" && fields.parentMasterPlantId === null && !fields.parentCanonicalKey
      ? "cultivar parent is unresolved and requires deterministic base-row linking"
      : null
    : validation.issues.map((issue) => issue.message).join("; ");
  return {
    id,
    plantCode: String(firstValue(row, ["plant_code", "plantCode", "code"]) ?? ""),
    identity,
    fields: {
      genus: fields.genus,
      species: fields.species,
      rank: fields.rank,
      infraspecificName: fields.infraspecificName,
      cultivar: fields.cultivar,
      scope: fields.scope,
      parentMasterPlantId: fields.parentMasterPlantId,
      parentCanonicalKey: fields.parentCanonicalKey,
    },
    reason,
    identitySource: fields.source,
  };
}

/**
 * A PATCH payload is normalized by the API with the persisted structured
 * fields.  If scientific_name or metadata cultivar changes, those fields can
 * otherwise shadow the new source value and leave the old canonical key in
 * place.  Keep this boundary deliberately explicit: only identity-bearing
 * input is compared, and unchanged row fields are stripped before the shared
 * legacy extractor runs.
 */
const IDENTITY_DIRECT_FIELD_GROUPS = [
  ["genus", "accepted_genus", "acceptedGenus"],
  ["species", "accepted_species", "acceptedSpecies"],
  ["infraspecific_rank", "infraspecificRank", "rank"],
  ["infraspecific_name", "infraspecificName"],
  ["cultivar", "cultivar_name", "cultivarName"],
  ["identity_scope", "identityScope", "scope"],
  ["parent_master_plant_id", "parentMasterPlantId", "parent_id", "parentId"],
  ["parent_canonical_key", "parentCanonicalKey", "parent_key", "parentKey"],
] as const;

const CULTIVAR_DIRECT_FIELD_GROUPS = new Set([
  "cultivar",
  "cultivar_name",
  "cultivarName",
  "identity_scope",
  "identityScope",
  "scope",
  "parent_master_plant_id",
  "parentMasterPlantId",
  "parent_id",
  "parentId",
  "parent_canonical_key",
  "parentCanonicalKey",
  "parent_key",
  "parentKey",
]);

const METADATA_CULTIVAR_FIELDS = [
  "cultivar",
  "cultivar_name",
  "cultivarName",
  "cultivar_normalized",
  "cultivarNormalized",
  "infraspecific_rank",
  "infraspecificRank",
  "infraspecific_name",
  "infraspecificName",
  "rank",
] as const;

function hasOwnField(row: Record<string, unknown>, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, name);
}

function firstOwnField(row: Record<string, unknown>, names: readonly string[]): unknown {
  for (const name of names) {
    if (hasOwnField(row, name)) return row[name];
  }
  return undefined;
}

function firstRowField(row: Record<string, unknown>, names: readonly string[]): unknown {
  for (const name of names) {
    if (row[name] !== undefined) return row[name];
  }
  return undefined;
}

function identityValuesEqual(left: unknown, right: unknown): boolean {
  if ((left === null || left === undefined) && (right === null || right === undefined)) return true;
  if (typeof left === "string" && typeof right === "string") return left.trim() === right.trim();
  return Object.is(left, right);
}

function metadataRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function metadataCultivarChanged(current: Record<string, unknown>, payload: Record<string, unknown>): boolean {
  const currentMetadata = metadataRecord(current.metadata_json);
  const nextMetadata = metadataRecord(payload.metadata_json);
  return METADATA_CULTIVAR_FIELDS.some((field) =>
    hasOwnField(nextMetadata, field) && !identityValuesEqual(nextMetadata[field], currentMetadata[field]),
  );
}

function identityRowForWrite(
  current: Record<string, unknown> | null,
  payload: Record<string, unknown>,
  merged: Record<string, unknown>,
): Record<string, unknown> {
  if (!current) return merged;

  const scientificChanged = hasOwnField(payload, "scientific_name")
    && !identityValuesEqual(payload.scientific_name, current.scientific_name);
  const changedGroups = new Set<number>();
  for (const [index, names] of IDENTITY_DIRECT_FIELD_GROUPS.entries()) {
    if (!names.some((name) => hasOwnField(payload, name))) continue;
    if (!identityValuesEqual(firstOwnField(payload, names), firstRowField(current, names))) {
      changedGroups.add(index);
    }
  }
  const cultivarMetadataChanged = metadataCultivarChanged(current, payload);
  const cultivarGroupIndex = IDENTITY_DIRECT_FIELD_GROUPS.findIndex((names) =>
    names.some((name) => name === "cultivar"),
  );
  const cultivarDirectChanged = cultivarGroupIndex >= 0 && changedGroups.has(cultivarGroupIndex);
  if (!scientificChanged && changedGroups.size === 0 && !cultivarMetadataChanged) return merged;

  const result = { ...merged };
  const clearGroup = (names: readonly string[]) => {
    for (const name of names) delete result[name];
  };
  const retainPayloadGroup = (names: readonly string[]) => {
    const value = firstOwnField(payload, names);
    clearGroup(names);
    if (value !== undefined) result[names[0]] = value;
  };

  // A changed scientific name is authoritative unless a caller also supplied
  // a changed structured field.  Persisted structured values from the PATCH
  // normalization are not allowed to shadow the new scientific name.
  if (scientificChanged) {
    IDENTITY_DIRECT_FIELD_GROUPS.forEach((names, index) => {
      if (changedGroups.has(index)) retainPayloadGroup(names);
      else clearGroup(names);
    });
  }

  // Cultivar metadata controls scope and parent resolution.  Remove the old
  // direct cultivar/scope/parent values so the shared extractor can observe
  // the new metadata, while preserving an explicitly changed direct value.
  if (cultivarMetadataChanged || cultivarDirectChanged) {
    IDENTITY_DIRECT_FIELD_GROUPS.forEach((names, index) => {
      if (!names.some((name) => CULTIVAR_DIRECT_FIELD_GROUPS.has(name))) return;
      if (changedGroups.has(index)) retainPayloadGroup(names);
      else clearGroup(names);
    });
  }
  return result;
}

function readMasterPlantRows(db: SqliteDatabase, batchSize = 5000): Record<string, unknown>[] {
  const pageSize = Math.max(1, Math.min(5000, batchSize));
  const rows: Record<string, unknown>[] = [];
  let lastId = 0;
  while (true) {
    const page = db.prepare(`
      SELECT * FROM master_plants
      WHERE id > ?
      ORDER BY id ASC
      LIMIT ?
    `).all(lastId, pageSize) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
    const nextId = Number(page[page.length - 1]?.id);
    if (!Number.isSafeInteger(nextId) || nextId <= lastId) {
      throw new CanonicalIdentityMigrationError("CANONICAL_PAGINATION_STALLED", "master_plants pagination did not advance");
    }
    lastId = nextId;
  }
  return rows;
}

function activeStatus(row: Record<string, unknown>): string {
  return String(row.canonical_status ?? "active");
}

function referenceCounts(
  db: SqliteDatabase,
  loserIds: readonly number[],
  winnerId: number | null = null,
): CanonicalReferenceCount[] {
  return CANONICAL_REFERENCE_TABLES.filter((table) => tableExists(db, table) && columnExists(db, table, "master_plant_id"))
    .map((table) => {
      const byLoser: Record<string, number> = {};
      let total = 0;
      for (const id of loserIds) {
        const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)} WHERE master_plant_id = ?`).get(id) as { count: number };
        byLoser[String(id)] = row.count;
        total += row.count;
      }
      return {
        table,
        total,
        byLoser,
        transferred: winnerId === null ? 0 : total,
        redirectedConflicts: 0,
        archivedConflicts: 0,
      };
    });
}

function rowIdList(rows: readonly LegacyIdentityCandidate[]): number[] {
  return rows.map((row) => row.id).filter((id) => id > 0).sort((a, b) => a - b);
}

function buildReport(
  db: SqliteDatabase,
  options: CanonicalIdentityMigrationOptions,
  mode: "dry_run" | "apply",
  beforeHash: string,
): CanonicalIdentityMigrationReport {
  const rows = readMasterPlantRows(db, options.batchSize);
  const candidates = rows.map(candidateFromRow);
  const byKey = new Map<string, LegacyIdentityCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.identity) continue;
    const list = byKey.get(candidate.identity.canonicalKey) ?? [];
    list.push(candidate);
    byKey.set(candidate.identity.canonicalKey, list);
  }
  const collisions = [...byKey.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([canonicalKey, group]) => {
      const rowIds = rowIdList(group);
      const proposal = options.winnerId && rowIds.includes(options.winnerId)
        ? {
          winnerId: options.winnerId,
          loserIds: (options.loserIds ?? rowIds.filter((id) => id !== options.winnerId)).filter((id) => rowIds.includes(id)),
        }
        : null;
      return {
        canonicalKey,
        rowIds,
        classification: "exact_duplicate" as const,
        proposal,
      };
    });
  const approvedLosers = new Set<number>();
  for (const collision of collisions) {
    if (collision.proposal) for (const id of collision.proposal.loserIds) approvedLosers.add(id);
  }
  const quarantine = candidates
    .filter((candidate) => Boolean(candidate.reason) || !candidate.identity)
    .map((candidate) => ({
      rowId: candidate.id,
      reason: candidate.reason ?? "canonical identity could not be derived",
      details: {
        plantCode: candidate.plantCode,
        identitySource: candidate.identitySource,
        fields: candidate.fields,
      },
    }));
  const references = referenceCounts(db, [...approvedLosers], options.winnerId ?? null);
  const activeRows = rows.filter((row) => activeStatus(row) === "active");
  const activeKeys = new Set(candidates
    .filter((candidate) => activeRows.some((row) => Number(row.id) === candidate.id) && candidate.identity)
    .map((candidate) => candidate.identity!.canonicalKey));
  const nullCanonicalKeys = candidates.filter((candidate) => !candidate.identity).length;
  const repairedCollisions = collisions.filter((collision) => collision.proposal).length;
  const runId = options.runId?.trim() || hashJson({ beforeHash, options, collisions }).slice(0, 24);
  const status: CanonicalIdentityMigrationReport["status"] = mode === "dry_run"
    ? (nullCanonicalKeys > 0 || collisions.some((collision) => !collision.proposal) ? "blocked" : "ready")
    : "ready";
  return {
    schemaVersion: SQLITE_CANONICAL_SCHEMA_VERSION,
    runId,
    mode,
    status,
    beforeHash,
    afterHash: null,
    backup: {
      required: mode === "apply",
      path: options.backupPath ?? null,
      sha256: null,
      verified: false,
    },
    counts: {
      scanned: rows.length,
      backfillable: candidates.filter((candidate) => Boolean(candidate.identity)).length,
      quarantined: quarantine.length,
      nullCanonicalKeys,
      activeRows: activeRows.length,
      activeCanonicalKeys: activeKeys.size,
      collisions: collisions.length,
      repairedCollisions,
      archivedRows: approvedLosers.size,
      externalIdentities: rows.filter((row) => nullableText(firstValue(row, ["source_id", "sourceId"]))).length,
      parentLinks: candidates.filter((candidate) => candidate.fields.parentMasterPlantId !== null).length,
    },
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      plantCode: candidate.plantCode,
      canonicalKey: candidate.identity?.canonicalKey ?? null,
      scope: candidate.identity?.scope ?? candidate.fields.scope,
      parentMasterPlantId: candidate.fields.parentMasterPlantId,
      identitySource: candidate.identitySource,
      status: approvedLosers.has(candidate.id)
        ? "archived"
        : candidate.reason || !candidate.identity ? "quarantine" : "backfillable",
      reason: candidate.reason,
    })),
    collisions,
    references,
    quarantine,
    journal: {
      table: "canonical_identity_migration_journal",
      rows: 0,
      rollbackReady: mode === "dry_run",
    },
    errors: [],
  };
}

/** Read-only, deterministic CID-3 preflight. */
export function dryRunCanonicalIdentityMigration(
  db: SqliteDatabase,
  options: Omit<CanonicalIdentityMigrationOptions, "dryRun"> = {},
): CanonicalIdentityMigrationReport {
  return buildReport(db, { ...options, dryRun: true }, "dry_run", hashDatabase(db));
}

function readRow(db: SqliteDatabase, id: number): Record<string, unknown> {
  const row = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) throw new CanonicalIdentityMigrationError("CANONICAL_ROW_NOT_FOUND", `master_plants row ${id} does not exist`);
  return row;
}

function journalRow(
  db: SqliteDatabase,
  runId: string,
  sequence: { value: number },
  entityType: string,
  entityTable: string | null,
  entityId: string | number,
  action: string,
  before: unknown,
  after: unknown,
): void {
  db.prepare(`
    INSERT INTO canonical_identity_migration_journal
      (run_id, sequence_no, entity_type, entity_table, entity_id, action, before_json, after_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId,
    sequence.value++,
    entityType,
    entityTable,
    String(entityId),
    action,
    before === undefined ? null : JSON.stringify(before),
    after === undefined ? null : JSON.stringify(after),
  );
}

function writeCanonicalFields(
  db: SqliteDatabase,
  id: number,
  identity: CanonicalPlantIdentity,
  parentMasterPlantId: number | null,
  status: "active" | "quarantined" | "archived",
  archive?: { intoId: number | null; reason: string },
): void {
  db.prepare(`
    UPDATE master_plants SET
      canonical_identity_version = ?, canonical_key = ?, genus = ?, species = ?,
      infraspecific_rank = ?, infraspecific_name = ?, cultivar = ?, identity_scope = ?,
      parent_master_plant_id = ?, parent_canonical_key = ?, canonical_status = ?,
      canonical_archived_at = CASE WHEN ? = 'archived' THEN coalesce(canonical_archived_at, datetime('now')) ELSE canonical_archived_at END,
      canonical_archived_into_id = CASE WHEN ? = 'archived' THEN ? ELSE canonical_archived_into_id END,
      canonical_archive_reason = CASE WHEN ? = 'archived' THEN ? ELSE canonical_archive_reason END,
      updated_at = updated_at
    WHERE id = ?
  `).run(
    identity.identityVersion,
    identity.canonicalKey,
    identity.genus,
    identity.species,
    identity.rank || null,
    identity.infraspecificName || null,
    identity.cultivar || null,
    identity.scope,
    parentMasterPlantId,
    identity.parentCanonicalKey,
    status,
    status,
    status,
    archive?.intoId ?? null,
    status,
    archive?.reason ?? null,
    id,
  );
}

function ensureExternalIdentity(
  db: SqliteDatabase,
  runId: string,
  sequence: { value: number },
  masterPlantId: number,
  sourceSystem: string,
  sourceId: string,
): void {
  const existing = db.prepare(`SELECT * FROM plant_external_identities WHERE source_system = ? AND source_id = ?`)
    .get(sourceSystem, sourceId) as Record<string, unknown> | undefined;
  if (existing && Number(existing.master_plant_id) !== masterPlantId) {
    throw new CanonicalIdentityMigrationError(
      "EXTERNAL_IDENTITY_COLLISION",
      `${sourceSystem}:${sourceId} already belongs to row ${existing.master_plant_id}`,
    );
  }
  if (existing && !existing.retired_at) return;
  if (existing && existing.retired_at) {
    db.prepare(`UPDATE plant_external_identities SET master_plant_id = ?, retired_at = NULL, updated_at = datetime('now') WHERE id = ?`)
      .run(masterPlantId, existing.id);
    journalRow(db, runId, sequence, "external_identity", "plant_external_identities", `${sourceSystem}:${sourceId}`, "reactivate", existing, {
      ...existing,
      master_plant_id: masterPlantId,
      retired_at: null,
    });
    return;
  }
  db.prepare(`
    INSERT INTO plant_external_identities (master_plant_id, source_system, source_id)
    VALUES (?, ?, ?)
  `).run(masterPlantId, sourceSystem, sourceId);
  journalRow(db, runId, sequence, "external_identity", "plant_external_identities", `${sourceSystem}:${sourceId}`, "insert", undefined, {
    master_plant_id: masterPlantId,
    source_system: sourceSystem,
    source_id: sourceId,
  });
}

function metadataConvexId(row: Record<string, unknown>): string | null {
  const metadata = parseJson(firstValue(row, ["metadata_json", "metadataJson", "metadata"]));
  return nullableText(firstValue(metadata, ["convexId", "convex_id", "convexDocumentId", "convex_document_id"]));
}

function naturalUniqueColumns(db: SqliteDatabase, table: CanonicalReferenceTable): string[][] {
  const indexes = db.prepare(`PRAGMA index_list(${quoteIdentifier(table)})`).all() as Array<{
    name: string;
    unique: number;
  }>;
  return indexes
    .filter((index) => index.unique === 1)
    .map((index) => db.prepare(`PRAGMA index_info(${quoteIdentifier(index.name)})`).all() as Array<{ name: string | null; seqno: number }>)
    .map((columns) => columns.sort((a, b) => a.seqno - b.seqno).map((column) => column.name).filter((name): name is string => Boolean(name)))
    .filter((columns) => columns.includes("master_plant_id"));
}

/**
 * Return the winner's natural-key row for a child without changing either
 * row.  A redirect is required when this returns an ID; deleting the loser
 * child would destroy reviewed/content evidence.
 */
function findNaturalConflict(
  db: SqliteDatabase,
  table: CanonicalReferenceTable,
  row: Record<string, unknown>,
  idColumn: string,
  rowId: string | number,
  winnerId: number,
): string | number | null {
  for (const columns of naturalUniqueColumns(db, table)) {
    const predicates = columns.map((column) => `${quoteIdentifier(column)} = ?`).join(" AND ");
    const values = columns.map((column) => column === "master_plant_id" ? winnerId : row[column]);
    const target = db.prepare(`
      SELECT ${quoteIdentifier(idColumn)} AS reference_id
      FROM ${quoteIdentifier(table)}
      WHERE ${predicates} AND ${quoteIdentifier(idColumn)} <> ?
      LIMIT 1
    `).get(...values, rowId) as { reference_id?: string | number } | undefined;
    if (target?.reference_id !== undefined && target.reference_id !== null) return target.reference_id;
  }
  return null;
}

function moveReferenceRows(
  db: SqliteDatabase,
  runId: string,
  sequence: { value: number },
  winnerId: number,
  loserId: number,
): CanonicalReferenceCount[] {
  const result: CanonicalReferenceCount[] = [];
  for (const table of CANONICAL_REFERENCE_TABLES) {
    if (!tableExists(db, table) || !columnExists(db, table, "master_plant_id")) continue;
    const rows = db.prepare(`SELECT * FROM ${quoteIdentifier(table)} WHERE master_plant_id = ?`).all(loserId) as Array<Record<string, unknown>>;
    let transferred = 0;
    let redirectedConflicts = 0;
    const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string; pk: number }>;
    const idColumn = columns.find((column) => column.pk > 0)?.name ?? "rowid";
    for (const row of rows) {
      const rowId: string | number = typeof row[idColumn] === "number" || typeof row[idColumn] === "string"
        ? row[idColumn] as string | number
        : typeof row.rowid === "number" || typeof row.rowid === "string"
          ? row.rowid as string | number
          : "";
      const targetReferenceId = findNaturalConflict(db, table, row, idColumn, rowId, winnerId);
      if (targetReferenceId === null) {
        db.prepare(`UPDATE ${quoteIdentifier(table)} SET master_plant_id = ? WHERE ${quoteIdentifier(idColumn)} = ?`).run(winnerId, rowId);
        transferred++;
        journalRow(db, runId, sequence, "reference", table, rowId, "transfer", row, { ...row, master_plant_id: winnerId });
      } else {
        // Keep both rows intact and make the logical union explicit.  Readers
        // can resolve this redirect to the winner row while the archived
        // loser row remains available for audit/rollback.
        db.prepare(`
          INSERT INTO canonical_identity_reference_redirects
            (run_id, winner_master_plant_id, loser_master_plant_id, reference_table,
             source_reference_id, target_reference_id, row_json, reason)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          runId,
          winnerId,
          loserId,
          table,
          String(rowId),
          String(targetReferenceId),
          JSON.stringify(row),
          "natural-key-conflict-union",
        );
        redirectedConflicts++;
        journalRow(db, runId, sequence, "reference", table, rowId, "redirect", row, {
          ...row,
          master_plant_id: winnerId,
          target_reference_id: targetReferenceId,
        });
      }
    }
    result.push({
      table,
      total: rows.length,
      byLoser: { [String(loserId)]: rows.length },
      transferred,
      redirectedConflicts,
      archivedConflicts: 0,
    });
  }
  return result;
}

function verifyReadback(
  db: SqliteDatabase,
  winnerId: number,
  loserIds: readonly number[],
  expectedKey: string,
): { references: Record<string, number>; externalIdentities: number; archived: number } {
  const winner = readRow(db, winnerId);
  if (winner.canonical_key !== expectedKey || winner.canonical_status !== "active") {
    throw new CanonicalIdentityMigrationError("CANONICAL_READBACK_MISMATCH", `winner row ${winnerId} failed canonical readback`);
  }
  const loserPlaceholders = loserIds.map(() => "?").join(",");
  const archived = loserIds.length === 0 ? 0 : (db.prepare(`
    SELECT COUNT(*) AS count FROM master_plants WHERE id IN (${loserPlaceholders}) AND canonical_status = 'archived' AND is_active = 0
  `).get(...loserIds) as { count: number }).count;
  if (archived !== loserIds.length) {
    throw new CanonicalIdentityMigrationError("CANONICAL_ARCHIVE_READBACK_MISMATCH", "one or more approved loser rows were not archived");
  }
  const references: Record<string, number> = {};
  for (const table of CANONICAL_REFERENCE_TABLES) {
    if (!tableExists(db, table) || !columnExists(db, table, "master_plant_id")) continue;
    references[table] = (db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)} WHERE master_plant_id = ?`).get(winnerId) as { count: number }).count;
  }
  const externalIdentities = (db.prepare(`SELECT COUNT(*) AS count FROM plant_external_identities WHERE master_plant_id = ?`).get(winnerId) as { count: number }).count;
  return { references, externalIdentities, archived };
}

function applyMigration(
  db: SqliteDatabase,
  options: CanonicalIdentityMigrationOptions,
  report: CanonicalIdentityMigrationReport,
  verifiedBackup: SqliteBackupResult,
): CanonicalIdentityMigrationReport {
  if (!verifiedBackup.verified) {
    throw new CanonicalIdentityMigrationError("BACKUP_VERIFY_FAILED", "CID-3 apply requires a verified backup", report);
  }
  const sourceHash = hashBytes(fs.readFileSync(verifiedBackup.sourcePath));
  if (sourceHash !== verifiedBackup.sha256) {
    throw new CanonicalIdentityMigrationError("BACKUP_HASH_MISMATCH", "source database changed after backup", report);
  }
  if (report.status === "blocked") {
    throw new CanonicalIdentityMigrationError("MIGRATION_PREFLIGHT_BLOCKED", "CID-3 dry-run contains unresolved rows or collisions", report);
  }
  if (options.dryRunRevision && options.dryRunRevision !== report.beforeHash) {
    throw new CanonicalIdentityMigrationError("DRY_RUN_STALE", "database changed after the approved dry-run", report);
  }

  const rows = readMasterPlantRows(db, options.batchSize);
  const candidates = rows.map(candidateFromRow);
  const byKey = new Map<string, LegacyIdentityCandidate[]>();
  candidates.filter((candidate) => candidate.identity).forEach((candidate) => {
    const key = candidate.identity!.canonicalKey;
    byKey.set(key, [...(byKey.get(key) ?? []), candidate]);
  });
  const collisions = [...byKey.entries()].filter(([, group]) => group.length > 1);
  const repairs = new Map<number, number>();
  for (const [key, group] of collisions) {
    const rowIds = rowIdList(group);
    if (!options.winnerId || !rowIds.includes(options.winnerId)) {
      throw new CanonicalIdentityMigrationError("COLLISION_REPAIR_REQUIRED", `collision ${key} has no approved winner`, report);
    }
    const loserIds = (options.loserIds ?? rowIds.filter((id) => id !== options.winnerId)).filter((id) => rowIds.includes(id));
    if (loserIds.length !== rowIds.length - 1) {
      throw new CanonicalIdentityMigrationError("COLLISION_REPAIR_INCOMPLETE", `collision ${key} does not name every loser`, report);
    }
    for (const loserId of loserIds) repairs.set(loserId, options.winnerId);
  }

  const beforeHash = hashDatabase(db);
  if (beforeHash !== report.beforeHash) {
    throw new CanonicalIdentityMigrationError("DRY_RUN_STALE", "database bytes changed after dry-run", report);
  }
  ensureSqliteCanonicalIdentitySchema(db);
  const sequence = { value: 1 };
  const referenceReport: CanonicalReferenceCount[] = [];
  const plannedCandidates = new Map(report.candidates.map((candidate) => [candidate.id, candidate]));
  // Bases must be materialized before active cultivars.  Legacy row IDs are
  // not a taxonomy ordering (row 46 may point at base row 1554), so an ID
  // ordered loop can trip the parent trigger on an otherwise valid edge.
  const orderedCandidates = [...candidates].sort((left, right) => {
    const scopeOrder = (candidate: LegacyIdentityCandidate): number =>
      candidate.identity?.scope === "base" ? 0 : candidate.identity?.scope === "cultivar" ? 1 : 2;
    return scopeOrder(left) - scopeOrder(right) || left.id - right.id;
  });
  const transaction = db.transaction(() => {
    const runOptions = {
      ...options,
      dryRun: false,
    };
    db.prepare(`
      INSERT INTO canonical_identity_migration_runs
        (run_id, schema_version, mode, status, before_hash, backup_path, backup_sha256, options_json)
      VALUES (?, ?, 'apply', 'ready', ?, ?, ?, ?)
    `).run(
      report.runId,
      SQLITE_CANONICAL_SCHEMA_VERSION,
      report.beforeHash,
      verifiedBackup.backupPath,
      verifiedBackup.sha256,
      JSON.stringify(runOptions),
    );

    for (const candidate of orderedCandidates) {
      const planned = plannedCandidates.get(candidate.id);
      const loserWinner = repairs.get(candidate.id);
      if (loserWinner) continue;

      // The dry-run is the reviewed decision boundary.  A candidate marked
      // quarantine (including an identity-bearing cultivar with no proven
      // parent) must never be promoted to active merely because a possible
      // base row happens to exist elsewhere in the same database.
      const quarantined = !candidate.identity || planned?.status === "quarantine";
      if (quarantined && !candidate.identity) {
        db.prepare(`UPDATE master_plants SET canonical_status = 'quarantined' WHERE id = ?`).run(candidate.id);
        db.prepare(`
          INSERT OR REPLACE INTO canonical_identity_quarantine
            (migration_run_id, master_plant_id, reason, details_json)
          VALUES (?, ?, ?, ?)
        `).run(report.runId, candidate.id, candidate.reason ?? "canonical identity could not be derived", JSON.stringify({ fields: candidate.fields }));
        journalRow(db, report.runId, sequence, "master_plant", "master_plants", candidate.id, "quarantine", readRow(db, candidate.id), undefined);
        continue;
      }

      if (quarantined) {
        const before = readRow(db, candidate.id);
        writeCanonicalFields(
          db,
          candidate.id,
          candidate.identity!,
          candidate.fields.parentMasterPlantId,
          "quarantined",
        );
        db.prepare(`
          INSERT OR REPLACE INTO canonical_identity_quarantine
            (migration_run_id, master_plant_id, reason, details_json)
          VALUES (?, ?, ?, ?)
        `).run(
          report.runId,
          candidate.id,
          candidate.reason ?? "canonical identity was quarantined during dry-run",
          JSON.stringify({ fields: candidate.fields }),
        );
        journalRow(db, report.runId, sequence, "master_plant", "master_plants", candidate.id, "quarantine", before, readRow(db, candidate.id));
        const sourceSystem = nullableText(firstValue(before, ["source_system", "sourceSystem"]));
        const sourceId = nullableText(firstValue(before, ["source_id", "sourceId"]));
        if (sourceSystem && sourceId) ensureExternalIdentity(db, report.runId, sequence, candidate.id, sourceSystem, sourceId);
        const convexId = metadataConvexId(before);
        if (convexId) ensureExternalIdentity(db, report.runId, sequence, candidate.id, "convex", convexId);
        continue;
      }

      const parent = candidate.fields.scope === "cultivar"
        ? orderedCandidates.find((other) => other.identity?.canonicalKey === baseIdentityKey(candidate.fields)
          && !repairs.has(other.id)
          && other.identity?.scope === "base"
          && plannedCandidates.get(other.id)?.status === "backfillable")
        : undefined;
      const parentId = candidate.fields.parentMasterPlantId ?? parent?.id ?? null;
      const parentRow = parentId === null ? null : readRow(db, parentId);
      const hasParent = candidate.fields.scope !== "cultivar"
        || (parentRow !== null
          && parentRow.canonical_status === "active"
          && parentRow.identity_scope === "base");
      const status = hasParent ? "active" : "quarantined";
      const before = readRow(db, candidate.id);
      writeCanonicalFields(db, candidate.id, candidate.identity!, parentId, status);
      journalRow(db, report.runId, sequence, "master_plant", "master_plants", candidate.id, status === "active" ? "backfill" : "quarantine", before, readRow(db, candidate.id));
      const sourceSystem = nullableText(firstValue(before, ["source_system", "sourceSystem"]));
      const sourceId = nullableText(firstValue(before, ["source_id", "sourceId"]));
      if (sourceSystem && sourceId) ensureExternalIdentity(db, report.runId, sequence, candidate.id, sourceSystem, sourceId);
      const convexId = metadataConvexId(before);
      if (convexId) ensureExternalIdentity(db, report.runId, sequence, candidate.id, "convex", convexId);
    }

    // Move aliases and references before archiving the loser.  The loser keeps
    // its canonical tuple as an auditable archived record, but no longer
    // participates in the active unique invariant.
    for (const [loserId, winnerId] of repairs) {
      const loser = readRow(db, loserId);
      const winner = readRow(db, winnerId);
      const sourceSystem = nullableText(firstValue(loser, ["source_system", "sourceSystem"]));
      const sourceId = nullableText(firstValue(loser, ["source_id", "sourceId"]));
      if (sourceSystem && sourceId) ensureExternalIdentity(db, report.runId, sequence, winnerId, sourceSystem, sourceId);
      const convexId = metadataConvexId(loser);
      if (convexId) ensureExternalIdentity(db, report.runId, sequence, winnerId, "convex", convexId);
      referenceReport.push(...moveReferenceRows(db, report.runId, sequence, winnerId, loserId));
      const loserCandidate = candidates.find((candidate) => candidate.id === loserId);
      if (!loserCandidate?.identity) throw new CanonicalIdentityMigrationError("CANONICAL_LOSER_UNRESOLVED", `loser row ${loserId} has no canonical identity`);
      journalRow(db, report.runId, sequence, "master_plant", "master_plants", loserId, "archive", loser, undefined);
      writeCanonicalFields(db, loserId, loserCandidate.identity, null, "archived", {
        intoId: winnerId,
        reason: `canonical duplicate archived in favor of row ${winnerId}`,
      });
      // Preserve the historical source columns without retaining a duplicate
      // source identity in the compatibility index; aliases now live in the
      // separate external-identity table.
      db.prepare(`UPDATE master_plants SET source_id = NULL, is_active = 0, content_status = 'archived', updated_at = updated_at WHERE id = ?`).run(loserId);
    }

    const winnerIds = [...new Set(repairs.values())];
    for (const winnerId of winnerIds) {
      const winner = readRow(db, winnerId);
      const winnerKey = String(winner.canonical_key ?? "");
      if (!winnerKey) throw new CanonicalIdentityMigrationError("CANONICAL_WINNER_UNRESOLVED", `winner row ${winnerId} has no canonical key`);
      verifyReadback(db, winnerId, [...repairs.entries()].filter(([, id]) => id === winnerId).map(([id]) => id), winnerKey);
    }
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_master_plants_canonical_key_active
        ON master_plants(canonical_key)
        WHERE canonical_status = 'active' AND canonical_key IS NOT NULL;
    `);
    db.prepare(`
      UPDATE canonical_identity_migration_runs
      SET status = 'applied', after_hash = ?, backup_path = ?, backup_sha256 = ?,
        report_json = ?, finished_at = datetime('now')
      WHERE run_id = ?
    `).run(
      hashDatabase(db),
      verifiedBackup.backupPath,
      verifiedBackup.sha256,
      JSON.stringify({ referenceReport }),
      report.runId,
    );
  });

  try {
    transaction();
  } catch (error) {
    if (error instanceof CanonicalIdentityMigrationError) throw error;
    throw new CanonicalIdentityMigrationError("MIGRATION_APPLY_FAILED", error instanceof Error ? error.message : String(error), report);
  }

  const afterHash = hashDatabase(db);
  return {
    ...report,
    mode: "apply",
    status: "applied",
    afterHash,
    backup: {
      ...report.backup,
      path: verifiedBackup.backupPath,
      verified: true,
    },
    counts: {
      ...report.counts,
      repairedCollisions: repairs.size > 0 ? 1 : 0,
    },
    references: referenceReport,
    journal: {
      table: "canonical_identity_migration_journal",
      rows: sequence.value - 1,
      rollbackReady: true,
    },
  };
}

/**
 * Apply is intentionally impossible without an explicit dry-run report and a
 * verified backup path.  Callers should persist the returned report as an
 * artifact and pass its beforeHash back as dryRunRevision.
 */
export function applyCanonicalIdentityMigration(
  db: SqliteDatabase,
  options: Omit<CanonicalIdentityMigrationOptions, "dryRun"> & {
    databasePath: string;
    dryRunRevision: string;
    backupPath: string;
  },
): CanonicalIdentityMigrationReport {
  // Backup is deliberately created/verified before the dry-run or any schema
  // installation. A caller cannot supply a fake path and cannot omit the
  // source path that ties the backup to this exact open database.
  const verifiedBackup = prepareVerifiedBackup(db, options.databasePath, options.backupPath);
  const report = dryRunCanonicalIdentityMigration(db, options);
  const sourceAfterDryRun = hashBytes(fs.readFileSync(verifiedBackup.sourcePath));
  if (sourceAfterDryRun !== verifiedBackup.sha256) {
    throw new CanonicalIdentityMigrationError("BACKUP_HASH_MISMATCH", "source database changed during dry-run", report);
  }
  const reportWithBackup: CanonicalIdentityMigrationReport = {
    ...report,
    backup: {
      required: true,
      path: verifiedBackup.backupPath,
      sha256: verifiedBackup.sha256,
      verified: verifiedBackup.verified,
    },
  };
  return applyMigration(db, { ...options, dryRun: false }, reportWithBackup, verifiedBackup);
}

/**
 * File-level apply entrypoint.  It captures/verifies the backup before
 * opening SQLite, so opening the database cannot perform a schema mutation
 * before the rollback artifact exists.  The caller still supplies the exact
 * dry-run revision and explicit backup path.
 */
export function applyCanonicalIdentityMigrationAtPath(
  databasePath: string,
  options: Omit<CanonicalIdentityMigrationOptions, "dryRun" | "databasePath"> & {
    dryRunRevision: string;
    backupPath: string;
  },
): CanonicalIdentityMigrationReport {
  const verifiedBackup = prepareVerifiedBackupForPath(databasePath, options.backupPath);
  const sourcePath = verifiedBackup.sourcePath;
  const workingPath = path.join(
    path.dirname(sourcePath),
    `.${path.basename(sourcePath)}.cid3-work-${process.pid}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`,
  );
  if (fs.existsSync(workingPath)) {
    throw new CanonicalIdentityMigrationError("WORKING_PATH_EXISTS", `refusing to reuse migration working path ${workingPath}`);
  }

  // Work against a verified pre-open copy.  Schema installation currently
  // uses additive DDL outside the data transaction; keeping it on this copy
  // makes the file-level entrypoint atomic even when a later journal/reference
  // operation fails.  The original path is replaced only after full success.
  fs.copyFileSync(sourcePath, workingPath, fs.constants.COPYFILE_EXCL);
  const workingBytes = fs.readFileSync(workingPath);
  if (workingBytes.length !== verifiedBackup.bytes || hashBytes(workingBytes) !== verifiedBackup.sha256) {
    fs.rmSync(workingPath, { force: true });
    throw new CanonicalIdentityMigrationError("WORKING_COPY_VERIFY_FAILED", "migration working copy does not match verified backup");
  }

  let db: SqliteDatabase | null = null;
  let installed = false;
  try {
    db = new Database(workingPath);
    db.pragma("foreign_keys = ON");
    const resolvedOptions = {
      ...options,
      databasePath: sourcePath,
    };
    const report = dryRunCanonicalIdentityMigration(db, resolvedOptions);
    const sourceAfterDryRun = hashBytes(fs.readFileSync(verifiedBackup.sourcePath));
    if (sourceAfterDryRun !== verifiedBackup.sha256) {
      throw new CanonicalIdentityMigrationError("BACKUP_HASH_MISMATCH", "source database changed during dry-run", report);
    }
    const reportWithBackup: CanonicalIdentityMigrationReport = {
      ...report,
      backup: {
        required: true,
        path: verifiedBackup.backupPath,
        sha256: verifiedBackup.sha256,
        verified: verifiedBackup.verified,
      },
    };
    const applied = applyMigration(db, { ...resolvedOptions, dryRun: false }, reportWithBackup, verifiedBackup);
    db.close();
    db = null;
    if (hashBytes(fs.readFileSync(sourcePath)) !== verifiedBackup.sha256) {
      throw new CanonicalIdentityMigrationError("BACKUP_HASH_MISMATCH", "source database changed before atomic replacement", applied);
    }
    fs.renameSync(workingPath, sourcePath);
    installed = true;
    return applied;
  } finally {
    db?.close();
    if (!installed && fs.existsSync(workingPath)) fs.rmSync(workingPath, { force: true });
  }
}

/**
 * Fill only missing backup metadata on an already-applied migration run.
 *
 * This is a narrowly scoped repair for runs written by an older build that
 * persisted backup_path but omitted backup_sha256.  The caller must provide
 * the exact pre-apply hash and backup hash from the immutable apply report;
 * both values must match the backup bytes before the database is opened for
 * this metadata-only update.  No plant, reference, or outbox row is touched.
 */
export function repairCanonicalIdentityMigrationBackupMetadataAtPath(
  options: CanonicalIdentityMigrationBackupMetadataRepairOptions,
): CanonicalIdentityMigrationBackupMetadataRepairResult {
  const runId = options.runId.trim();
  if (!runId) {
    throw new CanonicalIdentityMigrationError("MIGRATION_RUN_REQUIRED", "metadata repair requires runId");
  }
  if (!options.databasePath || options.databasePath.trim() === "") {
    throw new CanonicalIdentityMigrationError("DATABASE_PATH_REQUIRED", "metadata repair requires databasePath");
  }
  if (!options.backupPath || options.backupPath.trim() === "") {
    throw new CanonicalIdentityMigrationError("BACKUP_REQUIRED", "metadata repair requires backupPath");
  }
  const sourcePath = path.resolve(options.databasePath);
  const backupPath = path.resolve(options.backupPath);
  if (sourcePath === backupPath) {
    throw new CanonicalIdentityMigrationError("BACKUP_PATH_INVALID", "backupPath must differ from databasePath");
  }
  if (!fs.existsSync(sourcePath)) {
    throw new CanonicalIdentityMigrationError("DATABASE_NOT_FOUND", `SQLite database does not exist: ${sourcePath}`);
  }
  if (!fs.existsSync(backupPath)) {
    throw new CanonicalIdentityMigrationError("BACKUP_NOT_FOUND", `SQLite backup does not exist: ${backupPath}`);
  }

  const expectedBeforeHash = options.expectedBeforeHash.trim().toLowerCase();
  const expectedBackupSha256 = options.expectedBackupSha256.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedBeforeHash) || !/^[a-f0-9]{64}$/.test(expectedBackupSha256)) {
    throw new CanonicalIdentityMigrationError("BACKUP_HASH_INVALID", "metadata repair requires two SHA-256 hashes");
  }
  if (expectedBeforeHash !== expectedBackupSha256) {
    throw new CanonicalIdentityMigrationError(
      "BACKUP_METADATA_EXPECTATION_MISMATCH",
      "apply report beforeHash and backup SHA must match",
    );
  }
  const actualBackupSha256 = hashBytes(fs.readFileSync(backupPath));
  if (actualBackupSha256 !== expectedBeforeHash) {
    throw new CanonicalIdentityMigrationError(
      "BACKUP_HASH_MISMATCH",
      "backup bytes do not match the apply report beforeHash",
    );
  }

  const beforeDatabaseHash = hashBytes(fs.readFileSync(sourcePath));
  const db = new Database(sourcePath);
  db.pragma("foreign_keys = ON");
  try {
    if (!tableExists(db as unknown as SqliteDatabase, "canonical_identity_migration_runs")
      || !tableExists(db as unknown as SqliteDatabase, "canonical_identity_migration_journal")
      || !columnExists(db as unknown as SqliteDatabase, "canonical_identity_migration_runs", "backup_path")
      || !columnExists(db as unknown as SqliteDatabase, "canonical_identity_migration_runs", "backup_sha256")) {
      throw new CanonicalIdentityMigrationError(
        "MIGRATION_METADATA_SCHEMA_REQUIRED",
        "canonical migration metadata tables/columns are required before repair",
      );
    }
    const run = db.prepare(`SELECT * FROM canonical_identity_migration_runs WHERE run_id = ?`).get(runId) as Record<string, unknown> | undefined;
    if (!run) {
      throw new CanonicalIdentityMigrationError("MIGRATION_RUN_NOT_FOUND", `migration run ${runId} does not exist`);
    }
    if (String(run.status) !== "applied") {
      throw new CanonicalIdentityMigrationError("MIGRATION_NOT_APPLIED", `migration run ${runId} is not applied`);
    }
    if (String(run.before_hash ?? "").toLowerCase() !== expectedBeforeHash) {
      throw new CanonicalIdentityMigrationError(
        "MIGRATION_BEFORE_HASH_MISMATCH",
        "migration run before_hash does not match the approved apply report",
      );
    }

    const existingBackupPath = run.backup_path === null || run.backup_path === undefined
      ? null
      : path.resolve(String(run.backup_path));
    if (existingBackupPath !== null && existingBackupPath !== backupPath) {
      throw new CanonicalIdentityMigrationError(
        "MIGRATION_BACKUP_PATH_MISMATCH",
        "migration run backup_path does not match the approved backup",
      );
    }
    const existingBackupSha = run.backup_sha256 === null || run.backup_sha256 === undefined
      ? null
      : String(run.backup_sha256).trim().toLowerCase();
    if (existingBackupSha !== null && existingBackupSha !== expectedBackupSha256) {
      throw new CanonicalIdentityMigrationError(
        "MIGRATION_BACKUP_SHA_MISMATCH",
        "migration run backup_sha256 does not match the approved backup",
      );
    }

    const filledFields: Array<"backup_path" | "backup_sha256"> = [];
    if (existingBackupPath === null) filledFields.push("backup_path");
    if (existingBackupSha === null) filledFields.push("backup_sha256");
    if (filledFields.length === 0) {
      db.close();
      return {
        runId,
        status: "already_verified",
        databasePath: sourcePath,
        backupPath,
        backupSha256: expectedBackupSha256,
        expectedBeforeHash,
        filledFields,
        journalSequence: null,
        beforeDatabaseHash,
        afterDatabaseHash: hashBytes(fs.readFileSync(sourcePath)),
      };
    }

    const repaired = db.transaction(() => {
      const before = db.prepare(`SELECT * FROM canonical_identity_migration_runs WHERE run_id = ?`).get(runId) as Record<string, unknown>;
      const assignments: string[] = [];
      const values: unknown[] = [];
      if (existingBackupPath === null) {
        assignments.push("backup_path = ?");
        values.push(backupPath);
      }
      if (existingBackupSha === null) {
        assignments.push("backup_sha256 = ?");
        values.push(expectedBackupSha256);
      }
      values.push(runId);
      db.prepare(`UPDATE canonical_identity_migration_runs SET ${assignments.join(", ")} WHERE run_id = ?`).run(...values);
      const after = db.prepare(`SELECT * FROM canonical_identity_migration_runs WHERE run_id = ?`).get(runId) as Record<string, unknown>;
      const nextSequence = Number((db.prepare(`
        SELECT COALESCE(MAX(sequence_no), 0) + 1 AS sequence_no
        FROM canonical_identity_migration_journal
        WHERE run_id = ?
      `).get(runId) as { sequence_no: number }).sequence_no);
      journalRow(
        db,
        runId,
        { value: nextSequence },
        "migration_run",
        "canonical_identity_migration_runs",
        runId,
        "backup_metadata_repair",
        before,
        after,
      );
      return nextSequence;
    })();
    db.close();
    return {
      runId,
      status: "repaired",
      databasePath: sourcePath,
      backupPath,
      backupSha256: expectedBackupSha256,
      expectedBeforeHash,
      filledFields,
      journalSequence: repaired,
      beforeDatabaseHash,
      afterDatabaseHash: hashBytes(fs.readFileSync(sourcePath)),
    };
  } finally {
    if (db.open) db.close();
  }
}

/** Restore a run using its journal, in reverse sequence order. */
export function rollbackCanonicalIdentityMigration(
  db: SqliteDatabase,
  runId: string,
): { runId: string; restoredRows: number; restoredReferences: number; status: "rolled_back" } {
  ensureSqliteCanonicalIdentitySchema(db);
  const run = db.prepare(`SELECT * FROM canonical_identity_migration_runs WHERE run_id = ?`).get(runId) as Record<string, unknown> | undefined;
  if (!run) throw new CanonicalIdentityMigrationError("MIGRATION_RUN_NOT_FOUND", `migration run ${runId} does not exist`);
  if (run.status !== "applied") throw new CanonicalIdentityMigrationError("MIGRATION_NOT_APPLIED", `migration run ${runId} is not applied`);
  let restoredRows = 0;
  let restoredReferences = 0;
  const transaction = db.transaction(() => {
    // Restoring a pre-CID-3 active NULL-key row is an explicitly journaled
    // rollback operation. Temporarily suspend only the required-identity
    // guards inside this transaction, then reinstall them before commit;
    // ordinary writes never receive this compatibility bypass.
    db.exec(`
      DROP TRIGGER IF EXISTS trg_master_plants_canonical_identity_required_insert;
      DROP TRIGGER IF EXISTS trg_master_plants_canonical_identity_required_update;
    `);
    const archived = db.prepare(`SELECT * FROM canonical_identity_reference_archive WHERE run_id = ? ORDER BY id DESC`).all(runId) as Array<Record<string, unknown>>;
    for (const item of archived) {
      const table = String(item.reference_table);
      const row = JSON.parse(String(item.row_json)) as Record<string, unknown>;
      const columns = Object.keys(row).filter((column) => column !== "rowid");
      const placeholders = columns.map(() => "?").join(", ");
      db.prepare(`INSERT OR IGNORE INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${placeholders})`).run(...columns.map((column) => row[column]));
      restoredReferences++;
    }
    const journal = db.prepare(`SELECT * FROM canonical_identity_migration_journal WHERE run_id = ? ORDER BY sequence_no DESC`).all(runId) as Array<Record<string, unknown>>;
    for (const entry of journal) {
      if (entry.entity_type === "external_identity" && entry.entity_id) {
        const identity = String(entry.entity_id).split(":");
        const sourceSystem = identity.shift() ?? "";
        const sourceId = identity.join(":");
        if (entry.action === "insert") {
          // Keep the alias evidence but retire the run-created active mapping.
          db.prepare(`
            UPDATE plant_external_identities
            SET retired_at = datetime('now'), updated_at = datetime('now')
            WHERE source_system = ? AND source_id = ? AND retired_at IS NULL
          `).run(sourceSystem, sourceId);
        } else if (entry.action === "reactivate" && entry.before_json) {
          const before = JSON.parse(String(entry.before_json)) as Record<string, unknown>;
          db.prepare(`
            UPDATE plant_external_identities
            SET master_plant_id = ?, retired_at = ?, updated_at = ?
            WHERE source_system = ? AND source_id = ?
          `).run(before.master_plant_id, before.retired_at ?? null, before.updated_at ?? null, sourceSystem, sourceId);
        }
        continue;
      }
      if (entry.entity_type === "reference" && entry.action === "transfer" && entry.entity_table && entry.before_json) {
        const table = String(entry.entity_table);
        const before = JSON.parse(String(entry.before_json)) as Record<string, unknown>;
        const id = Number.isFinite(Number(entry.entity_id)) ? Number(entry.entity_id) : String(entry.entity_id);
        db.prepare(`UPDATE ${quoteIdentifier(table)} SET master_plant_id = ? WHERE id = ?`).run(before.master_plant_id, id);
        restoredReferences++;
        continue;
      }
      if (entry.entity_type !== "master_plant" || !entry.before_json) continue;
      const before = JSON.parse(String(entry.before_json)) as Record<string, unknown>;
      const id = Number(entry.entity_id);
      const columns = Object.keys(before).filter((column) => column !== "id");
      db.prepare(`UPDATE master_plants SET ${columns.map((column) => `${quoteIdentifier(column)} = ?`).join(", ")} WHERE id = ?`).run(...columns.map((column) => before[column]), id);
      restoredRows++;
    }
    db.prepare(`
      UPDATE canonical_identity_reference_redirects
      SET rolled_back_at = datetime('now')
      WHERE run_id = ? AND rolled_back_at IS NULL
    `).run(runId);
    ensureSqliteCanonicalIdentitySchema(db);
    db.prepare(`UPDATE canonical_identity_migration_runs SET status = 'rolled_back', finished_at = datetime('now') WHERE run_id = ?`).run(runId);
  });
  transaction();
  return { runId, restoredRows, restoredReferences, status: "rolled_back" };
}

/** Resolve/write canonical fields at the normal SQLite writer boundary. */
export function resolveCanonicalIdentityForWrite(
  db: SqliteDatabase,
  payload: Record<string, unknown>,
  existingId?: number,
): SqliteCanonicalIdentityFields {
  const current = existingId === undefined ? null : readRow(db, existingId);
  const merged = { ...(current ?? {}), ...payload };
  const identityRow = identityRowForWrite(current, payload, merged);
  // Existing rows may still use the compatibility extractor (scientific_name
  // and metadata) while they are being edited.  A new row has no such
  // compatibility path: all structured fields must be explicit and valid.
  let candidate: LegacyIdentityCandidate;
  if (existingId === undefined) {
    const validation = validateStructuredCanonicalIdentity(payload);
    if (!hasCompleteStructuredCanonicalIdentity(payload) || !validation.ok) {
      const incomplete = !hasCompleteStructuredCanonicalIdentity(payload);
      const message = incomplete
        ? "new master plants require structured genus, species, rank, infraspecificName, cultivar, scope, and parent fields"
        : validation.ok
          ? "structured canonical identity is invalid"
          : validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
      throw new CanonicalIdentityMigrationError(
        incomplete || validation.ok ? "CANONICAL_IDENTITY_INCOMPLETE" : validation.code,
        message,
      );
    }
    candidate = {
      id: 0,
      plantCode: String(payload.plant_code ?? ""),
      identity: validation.identity,
      fields: {
        genus: validation.identity.genus,
        species: validation.identity.species,
        rank: validation.identity.rank || null,
        infraspecificName: validation.identity.infraspecificName || null,
        cultivar: validation.identity.cultivar || null,
        scope: validation.identity.scope,
        parentMasterPlantId: validation.identity.parentMasterPlantId,
        parentCanonicalKey: validation.identity.parentCanonicalKey,
      },
      reason: null,
      identitySource: "structured",
    };
  } else {
    candidate = candidateFromRow(identityRow);
  }
  if (!candidate.identity) {
    throw new CanonicalIdentityMigrationError(
      "CANONICAL_IDENTITY_INCOMPLETE",
      `plant ${String(merged.plant_code ?? existingId ?? "new")} requires structured genus/species identity`,
    );
  }
  let parentId = candidate.fields.parentMasterPlantId;
  if (candidate.identity.scope === "cultivar" && parentId === null) {
    const parentKey = baseIdentityKey(candidate.fields);
    const rows = db.prepare(`
      SELECT id, canonical_key FROM master_plants
      WHERE canonical_status = 'active' AND identity_scope = 'base' AND canonical_key = ?
      ORDER BY id ASC
    `).all(parentKey) as Array<{ id: number; canonical_key: string }>;
    if (rows.length !== 1) {
      throw new CanonicalIdentityMigrationError(
        "CANONICAL_IDENTITY_PARENT_REQUIRED",
        `cultivar ${String(merged.plant_code ?? existingId ?? "new")} requires one unambiguous base parent`,
      );
    }
    parentId = rows[0].id;
  }
  const parentCanonicalKey = candidate.identity.scope === "cultivar"
    ? (candidate.fields.parentCanonicalKey ?? baseIdentityKey(candidate.fields))
    : null;
  const identityValidation = validateCanonicalPlantIdentity({
    genus: candidate.identity.genus,
    species: candidate.identity.species,
    rank: candidate.identity.rank || null,
    infraspecificName: candidate.identity.infraspecificName || null,
    cultivar: candidate.identity.cultivar || null,
    scope: candidate.identity.scope,
    parentCanonicalKey,
    parentMasterPlantId: parentId,
  });
  if (!identityValidation.ok) {
    throw new CanonicalIdentityMigrationError(identityValidation.code, identityValidation.issues[0]?.message ?? identityValidation.code);
  }
  // Legacy rows can still be active while the additive backfill is pending.
  // Compute their identity in the same writer call so a new canonical row
  // cannot be inserted beside an old NULL-key duplicate.
  const legacyRows = db.prepare(`
    SELECT * FROM master_plants
    WHERE canonical_status = 'active'
      AND (canonical_identity_version IS NULL OR canonical_key IS NULL)
      AND id <> coalesce(?, -1)
    ORDER BY id ASC
  `).all(existingId ?? null) as Array<Record<string, unknown>>;
  const legacyDuplicate = legacyRows
    .map((row) => candidateFromRow(row))
    .find((candidate) => candidate.identity?.canonicalKey === identityValidation.canonicalKey);
  if (legacyDuplicate) {
    throw new CanonicalIdentityMigrationError(
      "CANONICAL_PLANT_EXISTS",
      `canonical plant already exists at legacy row ${legacyDuplicate.id} (${legacyDuplicate.plantCode})`,
    );
  }
  const duplicate = db.prepare(`
    SELECT id, plant_code FROM master_plants
    WHERE canonical_status = 'active' AND canonical_key = ? AND id <> coalesce(?, -1)
  `).get(identityValidation.canonicalKey, existingId ?? null) as { id: number; plant_code: string } | undefined;
  if (duplicate) {
    throw new CanonicalIdentityMigrationError(
      "CANONICAL_PLANT_EXISTS",
      `canonical plant already exists at row ${duplicate.id} (${duplicate.plant_code})`,
    );
  }
  return {
    canonical_identity_version: identityValidation.identity.identityVersion,
    canonical_key: identityValidation.canonicalKey,
    genus: identityValidation.identity.genus,
    species: identityValidation.identity.species,
    infraspecific_rank: identityValidation.identity.rank || null,
    infraspecific_name: identityValidation.identity.infraspecificName || null,
    cultivar: identityValidation.identity.cultivar || null,
    identity_scope: identityValidation.identity.scope,
    parent_master_plant_id: parentId,
    parent_canonical_key: parentCanonicalKey,
  };
}
