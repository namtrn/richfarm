import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import {
  CANONICAL_IDENTITY_VERSION,
  CANONICAL_INFRASPECIFIC_RANKS,
  extractLegacyCanonicalIdentityFields,
  normalizeCanonicalIdentityToken,
  normalizeCanonicalInfraspecificRank,
  parseLegacyScientificName as parseSharedLegacyScientificName,
  validateCanonicalPlantIdentity,
  type CanonicalIdentityIssue,
  type CanonicalPlantIdentity,
  type CanonicalPlantIdentityInput,
  type CanonicalScope,
} from "../../../packages/shared/src/canonicalPlantIdentity";
import type { SqliteDatabase } from "./db";

/** CID-2 report schema.  This module is intentionally read-only. */
export const CANONICAL_AUDIT_VERSION = "canonical_identity_audit_v1" as const;

export type CanonicalAuditSeverity = "info" | "warning" | "blocked";
export type CanonicalAuditStatus = "healthy" | "warning" | "blocked" | "incomplete";
export type CanonicalAuditSource = "sqlite" | "convex";

export interface CanonicalAuditIdentityRef {
  side: CanonicalAuditSource;
  id: string | number;
  plantCode: string | null;
  sourceSystem: string | null;
  sourceId: string | null;
  canonicalStatus: string;
  canonicalArchivedIntoId: string | number | null;
  canonicalKey: string | null;
  computedCanonicalKey: string | null;
  identitySource: "structured" | "scientific_name" | "stored_key" | "missing";
  genus: string | null;
  species: string | null;
  rank: string | null;
  infraspecificName: string | null;
  cultivar: string | null;
  scope: CanonicalScope | null;
  parentMasterPlantId: number | null;
}

export interface CanonicalAuditFinding {
  id: string;
  severity: CanonicalAuditSeverity;
  code: string;
  category: "identity" | "synchronization" | "content" | "relationship" | "snapshot";
  canonicalKey: string | null;
  sqliteIdentities: CanonicalAuditIdentityRef[];
  convexIdentities: CanonicalAuditIdentityRef[];
  evidence: Record<string, unknown>;
}

export interface CanonicalAuditSourceSummary {
  status: "read" | "unavailable" | "incomplete";
  rowCount: number;
  canonicalKeyCount: number;
  duplicateCanonicalKeyCount: number;
  identityIncompleteCount: number;
  dataRevision: string;
  expectedCount: number | null;
  receivedCount: number;
  pageCount: number;
  terminalCursor: string | null;
}

export interface CanonicalIdentityAuditReport {
  schemaVersion: 1;
  auditVersion: typeof CANONICAL_AUDIT_VERSION;
  auditId: string;
  status: CanonicalAuditStatus;
  summary: {
    totalFindings: number;
    info: number;
    warning: number;
    blocked: number;
    sqliteRows: number;
    convexRows: number | null;
    duplicateCanonicalKeys: number;
    unresolvedIdentityRows: number;
    /** Legacy cultivars with no explicit base edge; each is blocked evidence. */
    legacyParentlessCultivars: number;
  };
  freshnessBoundary: {
    sqliteDataRevision: string;
    sqliteCatalogRevision: string | null;
    sqliteOutboxWatermark: number;
    convexSnapshotRevision: string | null;
    convexExpectedCount: number | null;
    convexReceivedCount: number | null;
    convexPageCount: number;
    convexTerminalCursor: string | null;
    sourceDataChangedDuringRead: boolean;
    snapshotComplete: boolean;
  };
  sources: {
    sqlite: CanonicalAuditSourceSummary;
    convex: CanonicalAuditSourceSummary;
  };
  /** Stable ordering is part of the machine-readable contract. */
  findings: CanonicalAuditFinding[];
}

export interface CanonicalConvexSnapshot {
  rows: readonly unknown[];
  revision?: string | number | null;
  expectedCount?: number | null;
  pageCount?: number;
  terminalCursor?: string | null;
  complete?: boolean;
  sourceDataChanged?: boolean;
}

export interface CanonicalIdentityAuditOptions {
  /** An already-read admin snapshot. No network or mutation is performed. */
  convexSnapshot?: CanonicalConvexSnapshot | readonly unknown[] | null;
  /** Alias retained for callers that call the input an admin snapshot. */
  convexRows?: readonly unknown[] | null;
  /** Stable external run identifier; omitted values are derived from content. */
  runId?: string;
}

interface AuditPlant {
  side: CanonicalAuditSource;
  id: string | number;
  raw: Record<string, unknown>;
  ref: CanonicalAuditIdentityRef;
  canonicalStatus: string;
  canonicalArchivedIntoId: string | number | null;
  validationIssues: readonly CanonicalIdentityIssue[];
  identity: CanonicalPlantIdentity | null;
  explicitCanonicalKey: string | null;
  parentCanonicalKey: string | null;
  parentMasterPlantId: number | null;
  recordVersion: number | null;
  contentVersion: number | null;
  contentHash: string | null;
  contentByteLength: number | null;
}

interface IdentityFields {
  genus: string | null | undefined;
  species: string | null | undefined;
  rank: string | null | undefined;
  infraspecificName: string | null | undefined;
  cultivar: string | null | undefined;
  scope: CanonicalScope | null | undefined;
  parentCanonicalKey: string | null | undefined;
  parentMasterPlantId: number | null | undefined;
  identitySource: CanonicalAuditIdentityRef["identitySource"];
}

interface ParsedScientificName {
  genus: string;
  species: string;
  rank: string | null;
  infraspecificName: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstValue(record: Record<string, unknown>, names: readonly string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(record, name)) {
      return record[name];
    }
  }
  return undefined;
}

function firstString(record: Record<string, unknown>, names: readonly string[]): string | null | undefined {
  const value = firstValue(record, names);
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value : String(value);
}

function nullableString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function nullableIdentifier(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string") {
    const text = value.trim();
    return text || null;
  }
  return null;
}

function canonicalLifecycleStatus(row: Record<string, unknown>): string {
  const value = firstString(row, ["canonical_status", "canonicalStatus"]);
  return value?.trim().toLowerCase() || "active";
}

function canonicalArchivedIntoId(row: Record<string, unknown>): string | number | null {
  return nullableIdentifier(firstValue(row, [
    "canonical_archived_into_id",
    "canonicalArchivedIntoId",
  ]));
}

function positiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

function numericVersion(record: Record<string, unknown>, names: readonly string[]): number | null {
  const value = firstValue(record, names);
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return null;
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

/**
 * Parse only a structured Latin scientific-name display.  This is used for
 * legacy audit evidence when old rows have no structured columns.  It never
 * reads common_name and never feeds a create/import path.
 */
export function parseLegacyScientificName(value: unknown): ParsedScientificName | null {
  const parsed = parseSharedLegacyScientificName(value);
  return parsed ? { ...parsed } : null;
}

function identityFieldsForRow(row: Record<string, unknown>): IdentityFields {
  const fields = extractLegacyCanonicalIdentityFields(row);
  return {
    genus: fields.genus,
    species: fields.species,
    rank: fields.rank,
    infraspecificName: fields.infraspecificName,
    cultivar: fields.cultivar,
    scope: fields.scope,
    parentCanonicalKey: fields.parentCanonicalKey,
    parentMasterPlantId: fields.parentMasterPlantId,
    identitySource: fields.identitySource,
  };
}

function keyForBase(fields: IdentityFields): string | null {
  if (typeof fields.genus !== "string" || typeof fields.species !== "string") return null;
  const result = validateCanonicalPlantIdentity({
    genus: fields.genus,
    species: fields.species,
    rank: fields.rank ?? null,
    infraspecificName: fields.infraspecificName ?? null,
    cultivar: null,
    scope: "base",
    parentCanonicalKey: null,
    parentMasterPlantId: null,
  });
  return result.ok ? result.canonicalKey : null;
}

function identityFromFields(fields: IdentityFields): {
  identity: CanonicalPlantIdentity | null;
  validationIssues: readonly CanonicalIdentityIssue[];
} {
  const input: CanonicalPlantIdentityInput = {
    genus: fields.genus as string,
    species: fields.species as string,
    rank: fields.rank ?? null,
    infraspecificName: fields.infraspecificName ?? null,
    cultivar: fields.cultivar ?? null,
    scope: fields.scope as CanonicalScope,
    parentCanonicalKey: fields.parentCanonicalKey ?? (
      fields.scope === "cultivar" ? keyForBase(fields) : null
    ),
    parentMasterPlantId: fields.parentMasterPlantId ?? null,
  };
  const result = validateCanonicalPlantIdentity(input);
  if (result.ok) {
    const originalInput: CanonicalPlantIdentityInput = {
      ...input,
      parentCanonicalKey: fields.parentCanonicalKey ?? null,
      parentMasterPlantId: fields.parentMasterPlantId ?? null,
    };
    const originalValidation = validateCanonicalPlantIdentity(originalInput);
    return {
      identity: result.identity,
      validationIssues: originalValidation.ok ? [] : originalValidation.issues,
    };
  }

  // Parent presence is a relational audit concern.  Still derive the tuple
  // with a temporary base key so duplicate taxonomy evidence remains visible.
  if (fields.scope === "cultivar" && keyForBase(fields)) {
    const fallback = validateCanonicalPlantIdentity({
      ...input,
      parentCanonicalKey: keyForBase(fields),
      parentMasterPlantId: null,
    });
    if (fallback.ok) return { identity: fallback.identity, validationIssues: result.issues };
  }
  return { identity: null, validationIssues: result.issues };
}

function explicitCanonicalKey(row: Record<string, unknown>): string | null {
  const value = firstString(row, ["canonical_key", "canonicalKey"]);
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function hashText(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function contentFingerprint(row: Record<string, unknown>): { hash: string | null; byteLength: number | null } {
  const directHash = firstString(row, ["content_hash", "contentHash", "care_content_hash", "careContentHash"]);
  const content = firstValue(row, ["care_content", "careContent", "description"]);
  if (typeof content === "string") {
    return {
      hash: hashText(content),
      byteLength: Buffer.byteLength(content, "utf8"),
    };
  }
  const bytes = firstValue(row, ["content_byte_length", "contentByteLength", "care_content_byte_length"]);
  const byteLength = typeof bytes === "number" && Number.isSafeInteger(bytes) ? bytes : null;
  return { hash: directHash?.toLowerCase() ?? null, byteLength };
}

function buildPlant(side: CanonicalAuditSource, row: Record<string, unknown>, ordinal: number): AuditPlant {
  const fields = identityFieldsForRow(row);
  const derived = identityFromFields(fields);
  const explicitKey = explicitCanonicalKey(row);
  const canonicalStatus = canonicalLifecycleStatus(row);
  const archivedIntoId = canonicalArchivedIntoId(row);
  const content = contentFingerprint(row);
  const rawId = firstValue(row, side === "sqlite" ? ["id"] : ["_id", "id", "plantId", "plant_id"]);
  const id: string | number = typeof rawId === "number" || typeof rawId === "string"
    ? rawId
    : `${side}-${ordinal + 1}`;
  const plantCode = nullableString(firstValue(row, ["plant_code", "plantCode", "code"]));
  const sourceSystem = nullableString(firstValue(row, ["source_system", "sourceSystem", "source"]));
  const sourceId = nullableString(firstValue(row, ["source_id", "sourceId"]));
  const computedKey = derived.identity?.canonicalKey ?? null;
  const canonicalKey = explicitKey ?? computedKey;
  const identity = derived.identity;
  const ref: CanonicalAuditIdentityRef = {
    side,
    id,
    plantCode,
    sourceSystem,
    sourceId,
    canonicalStatus,
    canonicalArchivedIntoId: archivedIntoId,
    canonicalKey,
    computedCanonicalKey: computedKey,
    identitySource: explicitKey && !computedKey ? "stored_key" : fields.identitySource,
    genus: identity?.genus ?? (typeof fields.genus === "string" ? normalizeCanonicalIdentityToken(fields.genus) : null),
    species: identity?.species ?? (typeof fields.species === "string" ? normalizeCanonicalIdentityToken(fields.species) : null),
    rank: identity?.rank ?? (typeof fields.rank === "string" ? normalizeCanonicalInfraspecificRank(fields.rank) || null : null),
    infraspecificName: identity?.infraspecificName ?? (typeof fields.infraspecificName === "string" ? normalizeCanonicalIdentityToken(fields.infraspecificName) : null),
    cultivar: identity?.cultivar ?? (typeof fields.cultivar === "string" ? normalizeCanonicalIdentityToken(fields.cultivar) || null : null),
    scope: identity?.scope ?? fields.scope ?? null,
    parentMasterPlantId: fields.parentMasterPlantId ?? null,
  };
  return {
    side,
    id,
    raw: row,
    ref,
    canonicalStatus,
    canonicalArchivedIntoId: archivedIntoId,
    validationIssues: derived.validationIssues,
    identity,
    explicitCanonicalKey: explicitKey,
    parentCanonicalKey: nullableString(fields.parentCanonicalKey),
    parentMasterPlantId: fields.parentMasterPlantId ?? null,
    recordVersion: numericVersion(row, ["record_version", "recordVersion", "version"]),
    contentVersion: numericVersion(row, ["content_version", "contentVersion"]),
    contentHash: content.hash,
    contentByteLength: content.byteLength,
  };
}

function identityRefSort(a: CanonicalAuditIdentityRef, b: CanonicalAuditIdentityRef): number {
  const sideOrder = a.side.localeCompare(b.side);
  if (sideOrder !== 0) return sideOrder;
  if (typeof a.id === "number" && typeof b.id === "number") return a.id - b.id;
  return String(a.id).localeCompare(String(b.id));
}

function sortIds(ids: readonly (string | number)[]): Array<string | number> {
  return [...ids].sort((a, b) => {
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b));
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function findingId(
  code: string,
  canonicalKey: string | null,
  sqlite: readonly AuditPlant[],
  convex: readonly AuditPlant[],
): string {
  const value = stableJson({
    code,
    canonicalKey,
    sqlite: sortIds(sqlite.map((plant) => plant.id)),
    convex: sortIds(convex.map((plant) => plant.id)),
  });
  return hashText(value).slice(0, 20);
}

function makeFinding(
  severity: CanonicalAuditSeverity,
  code: string,
  category: CanonicalAuditFinding["category"],
  canonicalKey: string | null,
  sqlite: readonly AuditPlant[],
  convex: readonly AuditPlant[],
  evidence: Record<string, unknown>,
): CanonicalAuditFinding {
  return {
    id: findingId(code, canonicalKey, sqlite, convex),
    severity,
    code,
    category,
    canonicalKey,
    sqliteIdentities: sqlite.map((plant) => plant.ref).sort(identityRefSort),
    convexIdentities: convex.map((plant) => plant.ref).sort(identityRefSort),
    evidence,
  };
}

function groupBy<T>(items: readonly T[], getKey: (item: T) => string | null): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    const group = result.get(key) ?? [];
    group.push(item);
    result.set(key, group);
  }
  return result;
}

function findRows(db: SqliteDatabase): Record<string, unknown>[] {
  const table = db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'master_plants'`,
  ).get() as { name?: string } | undefined;
  if (!table) return [];
  return db.prepare(`SELECT * FROM master_plants ORDER BY id ASC`).all() as Record<string, unknown>[];
}

function readOutboxWatermark(db: SqliteDatabase): number {
  const table = db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_outbox'`,
  ).get() as { name?: string } | undefined;
  if (!table) return 0;
  const row = db.prepare(`SELECT COALESCE(MAX(id), 0) AS watermark FROM sync_outbox`).get() as { watermark?: number };
  return typeof row.watermark === "number" ? row.watermark : 0;
}

function readCatalogRevision(db: SqliteDatabase): string | null {
  const table = db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_catalog_revision'`,
  ).get() as { name?: string } | undefined;
  if (!table) return null;
  const row = db.prepare(`SELECT revision FROM sync_catalog_revision WHERE id = 1`).get() as { revision?: number } | undefined;
  return Number.isSafeInteger(row?.revision) ? String(row!.revision) : null;
}

function sqliteRevision(rows: readonly AuditPlant[], outboxWatermark: number): string {
  return hashText(stableJson({
    outboxWatermark,
    rows: rows.map((plant) => ({
      id: plant.id,
      ref: plant.ref,
      recordVersion: plant.recordVersion,
      contentVersion: plant.contentVersion,
      contentHash: plant.contentHash,
      contentByteLength: plant.contentByteLength,
    })),
  }));
}

function normalizeSnapshot(
  options: CanonicalIdentityAuditOptions,
): {
  rows: readonly unknown[] | null;
  revision: string | null;
  expectedCount: number | null;
  pageCount: number;
  terminalCursor: string | null;
  complete: boolean;
  sourceDataChanged: boolean;
} {
  const candidate = options.convexSnapshot ?? options.convexRows;
  if (candidate === undefined || candidate === null) {
    return {
      rows: null,
      revision: null,
      expectedCount: null,
      pageCount: 0,
      terminalCursor: null,
      complete: false,
      sourceDataChanged: false,
    };
  }
  if (Array.isArray(candidate)) {
    return {
      rows: candidate,
      revision: hashText(stableJson(candidate)),
      expectedCount: candidate.length,
      pageCount: 1,
      terminalCursor: null,
      complete: true,
      sourceDataChanged: false,
    };
  }
  const snapshot = candidate as CanonicalConvexSnapshot;
  const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
  const expectedCount = typeof snapshot.expectedCount === "number" ? snapshot.expectedCount : rows.length;
  return {
    rows,
    revision: snapshot.revision === undefined || snapshot.revision === null
      ? hashText(stableJson(rows))
      : String(snapshot.revision),
    expectedCount,
    pageCount: Number.isSafeInteger(snapshot.pageCount) && (snapshot.pageCount as number) >= 0
      ? snapshot.pageCount as number
      : 1,
    terminalCursor: snapshot.terminalCursor ?? null,
    complete: snapshot.complete !== false && rows.length === expectedCount,
    sourceDataChanged: snapshot.sourceDataChanged === true,
  };
}

function findingSort(a: CanonicalAuditFinding, b: CanonicalAuditFinding): number {
  const severityOrder: Record<CanonicalAuditSeverity, number> = { blocked: 0, warning: 1, info: 2 };
  return severityOrder[a.severity] - severityOrder[b.severity]
    || a.code.localeCompare(b.code)
    || (a.canonicalKey ?? "").localeCompare(b.canonicalKey ?? "")
    || a.id.localeCompare(b.id);
}

function comparePlantsByIdentity(
  sqlitePlants: readonly AuditPlant[],
  convexPlants: readonly AuditPlant[],
): Array<[AuditPlant, AuditPlant]> {
  const pairs: Array<[AuditPlant, AuditPlant]> = [];
  const used = new Set<AuditPlant>();
  const match = (sqlite: AuditPlant): AuditPlant | undefined => {
    const candidates = convexPlants.filter((convex) => !used.has(convex));
    const by = (value: string | null, getter: (plant: AuditPlant) => string | null) => (
      value ? candidates.find((candidate) => getter(candidate) === value) : undefined
    );
    return by(sqlite.ref.plantCode, (plant) => plant.ref.plantCode)
      ?? by(sqlite.ref.sourceId && `${sqlite.ref.sourceSystem ?? ""}:${sqlite.ref.sourceId}`, (plant) => (
        plant.ref.sourceId ? `${plant.ref.sourceSystem ?? ""}:${plant.ref.sourceId}` : null
      ))
      ?? by(sqlite.ref.canonicalKey, (plant) => plant.ref.canonicalKey);
  };
  for (const sqlite of sqlitePlants) {
    const convex = match(sqlite);
    if (convex) {
      used.add(convex);
      pairs.push([sqlite, convex]);
    }
  }
  return pairs;
}

function hasSameCanonicalTaxonomy(a: AuditPlant, b: AuditPlant): boolean {
  return Boolean(a.ref.genus && b.ref.genus && a.ref.genus === b.ref.genus
    && a.ref.species && a.ref.species === b.ref.species
    && (a.ref.rank ?? "") === (b.ref.rank ?? "")
    && (a.ref.infraspecificName ?? "") === (b.ref.infraspecificName ?? "")
    && (a.ref.cultivar ?? "") === (b.ref.cultivar ?? ""));
}

function isActiveCanonicalPlant(plant: AuditPlant): boolean {
  return plant.canonicalStatus === "active";
}

function samePlantId(left: string | number, right: string | number): boolean {
  return String(left) === String(right);
}

/**
 * Archived duplicate rows remain in SQLite as historical aliases.  They do
 * not participate in active-key uniqueness, but their redirect must resolve
 * to exactly one active row carrying the same key.  Keep this validation in
 * the read-only audit so an invalid archive cannot hide a real duplicate.
 */
function archivedCanonicalAliasFindings(plants: readonly AuditPlant[]): CanonicalAuditFinding[] {
  const findings: CanonicalAuditFinding[] = [];
  const suffix = plants[0]?.side.toUpperCase() ?? "SQLITE";
  const identities = (rows: readonly AuditPlant[]): {
    sqlite: AuditPlant[];
    convex: AuditPlant[];
  } => rows[0]?.side === "convex"
    ? { sqlite: [], convex: [...rows] }
    : { sqlite: [...rows], convex: [] };
  for (const archived of plants) {
    if (archived.canonicalStatus !== "archived" || !archived.ref.canonicalKey) continue;
    const canonicalKey = archived.ref.canonicalKey;
    const activeWinners = plants.filter((candidate) => (
      isActiveCanonicalPlant(candidate) && candidate.ref.canonicalKey === canonicalKey
    ));
    const target = archived.canonicalArchivedIntoId === null
      ? undefined
      : plants.find((candidate) => samePlantId(candidate.id, archived.canonicalArchivedIntoId as string | number));
    const targetMatches = Boolean(
      target
      && isActiveCanonicalPlant(target)
      && target.ref.canonicalKey === canonicalKey,
    );
    const valid = activeWinners.length === 1
      && targetMatches
      && samePlantId(target!.id, activeWinners[0].id);
    if (valid) {
      const refs = identities([archived, target!]);
      findings.push(makeFinding(
        "info",
        `ARCHIVED_CANONICAL_ALIAS_${suffix}`,
        "identity",
        canonicalKey,
        refs.sqlite,
        refs.convex,
        {
          classification: "archived_alias",
          rowId: archived.id,
          targetRowId: target!.id,
          targetCanonicalKey: target!.ref.canonicalKey,
          activeWinnerRowIds: sortIds(activeWinners.map((winner) => winner.id)),
        },
      ));
      continue;
    }

    const reasons: string[] = [];
    if (archived.canonicalArchivedIntoId === null) reasons.push("missing_archive_target");
    if (activeWinners.length !== 1) reasons.push("expected_exactly_one_active_winner");
    if (!target) reasons.push("archive_target_not_found");
    else {
      if (!isActiveCanonicalPlant(target)) reasons.push("archive_target_not_active");
      if (target.ref.canonicalKey !== canonicalKey) reasons.push("archive_target_key_mismatch");
      if (activeWinners.length === 1 && !samePlantId(target.id, activeWinners[0].id)) {
        reasons.push("archive_target_is_not_active_winner");
      }
    }
    const refs = identities([archived, ...(target ? [target] : [])]);
    findings.push(makeFinding(
      "blocked",
      `ARCHIVED_CANONICAL_REDIRECT_INVALID_${suffix}`,
      "identity",
      canonicalKey,
      refs.sqlite,
      refs.convex,
      {
        classification: "invalid_archived_alias",
        rowId: archived.id,
        redirectTargetId: archived.canonicalArchivedIntoId,
        targetRowId: target?.id ?? null,
        targetCanonicalKey: target?.ref.canonicalKey ?? null,
        activeWinnerRowIds: sortIds(activeWinners.map((winner) => winner.id)),
        reasons,
      },
    ));
  }
  return findings;
}

function auditPlants(
  sqlitePlants: readonly AuditPlant[],
  convexPlants: readonly AuditPlant[],
  convexComplete: boolean,
): CanonicalAuditFinding[] {
  const findings: CanonicalAuditFinding[] = [];

  const allSides: readonly AuditPlant[] = [...sqlitePlants, ...convexPlants];
  for (const plant of allSides) {
    if (!plant.identity && !plant.explicitCanonicalKey) {
      findings.push(makeFinding(
        "blocked",
        "CANONICAL_IDENTITY_INCOMPLETE",
        "identity",
        null,
        plant.side === "sqlite" ? [plant] : [],
        plant.side === "convex" ? [plant] : [],
        {
          reason: "structured genus/species identity is missing or invalid",
          identitySource: plant.ref.identitySource,
          rowId: plant.id,
          plantCode: plant.ref.plantCode,
        },
      ));
    }
    if (plant.explicitCanonicalKey && !plant.identity) {
      findings.push(makeFinding(
        "blocked",
        "CANONICAL_KEY_INVALID",
        "identity",
        plant.explicitCanonicalKey,
        plant.side === "sqlite" ? [plant] : [],
        plant.side === "convex" ? [plant] : [],
        { reason: "stored canonical key cannot be verified against structured identity", rowId: plant.id },
      ));
    }
    if (plant.explicitCanonicalKey && plant.identity && plant.explicitCanonicalKey !== plant.identity.canonicalKey) {
      findings.push(makeFinding(
        "blocked",
        "CANONICAL_KEY_INCONSISTENT",
        "identity",
        plant.explicitCanonicalKey,
        plant.side === "sqlite" ? [plant] : [],
        plant.side === "convex" ? [plant] : [],
        {
          storedCanonicalKey: plant.explicitCanonicalKey,
          recomputedCanonicalKey: plant.identity.canonicalKey,
          rowId: plant.id,
        },
      ));
    }
    for (const validationIssue of plant.validationIssues) {
      if (validationIssue.code === "CANONICAL_IDENTITY_INCOMPLETE") continue;
      // The relationship pass below emits one concrete MISSING_BASE_PARENT
      // finding for this common legacy shape. Avoid a duplicate validator
      // finding for the same missing edge while retaining other parent errors.
      if (
        validationIssue.code === "CANONICAL_IDENTITY_PARENT_REQUIRED" &&
        plant.ref.scope === "cultivar" &&
        Boolean(plant.ref.cultivar) &&
        plant.parentMasterPlantId === null &&
        !plant.parentCanonicalKey
      ) {
        continue;
      }
      const code = validationIssue.code.includes("PARENT") ? "CANONICAL_PARENT_INVALID" : validationIssue.code;
      findings.push(makeFinding(
        "blocked",
        code,
        "identity",
        plant.ref.canonicalKey,
        plant.side === "sqlite" ? [plant] : [],
        plant.side === "convex" ? [plant] : [],
        { path: validationIssue.path, reason: validationIssue.message, rowId: plant.id },
      ));
    }
  }

  findings.push(...archivedCanonicalAliasFindings(sqlitePlants));
  findings.push(...archivedCanonicalAliasFindings(convexPlants));

  const byKey = groupBy(allSides, (plant) => plant.ref.canonicalKey);
  for (const [canonicalKey, plants] of byKey) {
    const sqlite = plants.filter((plant) => plant.side === "sqlite");
    const convex = plants.filter((plant) => plant.side === "convex");
    const activeSqlite = sqlite.filter(isActiveCanonicalPlant);
    const activeConvex = convex.filter(isActiveCanonicalPlant);
    if (activeSqlite.length > 1) {
      findings.push(makeFinding(
        "blocked",
        "DUPLICATE_CANONICAL_KEY_SQLITE",
        "identity",
        canonicalKey,
        activeSqlite,
        [],
        {
          classification: activeSqlite.every((plant) => hasSameCanonicalTaxonomy(activeSqlite[0], plant))
            ? "exact_duplicate"
            : "unresolved_ambiguity",
          rowIds: sortIds(activeSqlite.map((plant) => plant.id)),
          plantCodes: activeSqlite.map((plant) => plant.ref.plantCode).filter(Boolean).sort(),
        },
      ));
    }
    if (activeConvex.length > 1) {
      findings.push(makeFinding(
        "blocked",
        "DUPLICATE_CANONICAL_KEY_CONVEX",
        "identity",
        canonicalKey,
        [],
        activeConvex,
        {
          classification: activeConvex.every((plant) => hasSameCanonicalTaxonomy(activeConvex[0], plant))
            ? "exact_duplicate"
            : "unresolved_ambiguity",
          documentIds: sortIds(activeConvex.map((plant) => plant.id)),
        },
      ));
    }
    if (activeSqlite.length === 1 && activeConvex.length === 1) {
      const [left, right] = [activeSqlite[0], activeConvex[0]];
      if (left.ref.plantCode && right.ref.plantCode && left.ref.plantCode !== right.ref.plantCode) {
        findings.push(makeFinding(
          "blocked",
          "CANONICAL_KEY_PLANT_CODE_MISMATCH",
          "identity",
          canonicalKey,
          sqlite,
          convex,
          { sqlitePlantCode: left.ref.plantCode, convexPlantCode: right.ref.plantCode },
        ));
      }
    }
  }

  const byCode = groupBy(allSides, (plant) => plant.ref.plantCode);
  for (const [plantCode, plants] of byCode) {
    const sqlite = plants.filter((plant) => plant.side === "sqlite");
    const convex = plants.filter((plant) => plant.side === "convex");
    const keys = new Set(plants.map((plant) => plant.ref.canonicalKey).filter(Boolean));
    if (keys.size > 1) {
      findings.push(makeFinding(
        "blocked",
        "PLANT_CODE_TAXONOMY_MISMATCH",
        "identity",
        null,
        sqlite,
        convex,
        { plantCode, canonicalKeys: [...keys].sort() },
      ));
    }
    if (plants.length > 1 && sqlite.length > 1) {
      findings.push(makeFinding(
        "blocked",
        "PLANT_CODE_COLLISION_SQLITE",
        "identity",
        null,
        sqlite,
        convex,
        { plantCode, rowIds: sortIds(sqlite.map((plant) => plant.id)) },
      ));
    }
  }

  const bySource = groupBy(allSides, (plant) => plant.ref.sourceId
    ? `${plant.ref.sourceSystem ?? ""}:${plant.ref.sourceId}`
    : null);
  for (const [sourceIdentity, plants] of bySource) {
    const canonicalKeys = new Set(plants.map((plant) => plant.ref.canonicalKey).filter(Boolean));
    if (canonicalKeys.size > 1) {
      findings.push(makeFinding(
        "blocked",
        "SOURCE_IDENTITY_COLLISION",
        "identity",
        null,
        plants.filter((plant) => plant.side === "sqlite"),
        plants.filter((plant) => plant.side === "convex"),
        { sourceIdentity, canonicalKeys: [...canonicalKeys].sort() },
      ));
    } else if (plants.length > 1 && canonicalKeys.size === 1) {
      findings.push(makeFinding(
        "info",
        "SOURCE_IDENTITY_ALIAS",
        "identity",
        [...canonicalKeys][0] ?? null,
        plants.filter((plant) => plant.side === "sqlite"),
        plants.filter((plant) => plant.side === "convex"),
        { sourceIdentity, classification: "source_alias" },
      ));
    }
  }

  const sqliteById = new Map(sqlitePlants.map((plant) => [String(plant.id), plant]));
  for (const plant of sqlitePlants) {
    if (plant.ref.scope === "base" && (plant.parentMasterPlantId !== null || plant.parentCanonicalKey)) {
      findings.push(makeFinding(
        "blocked",
        "BASE_PARENT_FORBIDDEN",
        "relationship",
        plant.ref.canonicalKey,
        [plant],
        [],
        { rowId: plant.id, parentMasterPlantId: plant.parentMasterPlantId, parentCanonicalKey: plant.parentCanonicalKey },
      ));
    }
    if (plant.ref.scope === "cultivar") {
      if (plant.parentMasterPlantId === null && !plant.parentCanonicalKey) {
        findings.push(makeFinding(
          "blocked",
          "MISSING_BASE_PARENT",
          "relationship",
          plant.ref.canonicalKey,
          [plant],
          [],
          { rowId: plant.id, plantCode: plant.ref.plantCode, classification: "unresolved_legacy_parent" },
        ));
      } else if (plant.parentMasterPlantId !== null) {
        const parent = sqliteById.get(String(plant.parentMasterPlantId));
        if (!parent) {
          findings.push(makeFinding(
            "blocked",
            "INVALID_BASE_PARENT",
            "relationship",
            plant.ref.canonicalKey,
            [plant],
            [],
            { rowId: plant.id, parentMasterPlantId: plant.parentMasterPlantId, reason: "parent row does not exist" },
          ));
        } else if (parent.ref.scope !== "base" || parent.ref.cultivar) {
          findings.push(makeFinding(
            "blocked",
            "PARENT_IS_NOT_BASE",
            "relationship",
            plant.ref.canonicalKey,
            [plant, parent],
            [],
            { rowId: plant.id, parentMasterPlantId: parent.id },
          ));
        } else if (!hasSameCanonicalTaxonomy(
          { ...plant, ref: { ...plant.ref, cultivar: null } },
          parent,
        )) {
          findings.push(makeFinding(
            "blocked",
            "BASE_PARENT_SPECIES_MISMATCH",
            "relationship",
            plant.ref.canonicalKey,
            [plant, parent],
            [],
            { rowId: plant.id, parentMasterPlantId: parent.id },
          ));
        }
      }
    }
  }

  if (convexComplete) {
    const pairs = comparePlantsByIdentity(sqlitePlants, convexPlants);
    const pairedSqlite = new Set(pairs.map(([sqlite]) => sqlite));
    const pairedConvex = new Set(pairs.map(([, convex]) => convex));
    for (const sqlite of sqlitePlants) {
      if (!pairedSqlite.has(sqlite)) {
        findings.push(makeFinding(
          "warning",
          "CONVEX_MISSING_PLANT",
          "synchronization",
          sqlite.ref.canonicalKey,
          [sqlite],
          [],
          { rowId: sqlite.id, plantCode: sqlite.ref.plantCode },
        ));
      }
    }
    for (const convex of convexPlants) {
      if (!pairedConvex.has(convex)) {
        findings.push(makeFinding(
          "blocked",
          "CONVEX_ONLY_PLANT",
          "synchronization",
          convex.ref.canonicalKey,
          [],
          [convex],
          { documentId: convex.id, plantCode: convex.ref.plantCode },
        ));
      }
    }
    for (const [sqlite, convex] of pairs) {
      if (sqlite.ref.canonicalKey && convex.ref.canonicalKey && sqlite.ref.canonicalKey !== convex.ref.canonicalKey) {
        findings.push(makeFinding(
          "blocked",
          "CANONICAL_IDENTITY_DRIFT",
          "synchronization",
          sqlite.ref.canonicalKey,
          [sqlite],
          [convex],
          { sqliteCanonicalKey: sqlite.ref.canonicalKey, convexCanonicalKey: convex.ref.canonicalKey },
        ));
      }
      if (sqlite.recordVersion !== null && convex.recordVersion !== null) {
        if (convex.recordVersion < sqlite.recordVersion) {
          findings.push(makeFinding(
            "blocked",
            "VERSION_REGRESSION",
            "synchronization",
            sqlite.ref.canonicalKey,
            [sqlite],
            [convex],
            { sqliteRecordVersion: sqlite.recordVersion, convexRecordVersion: convex.recordVersion },
          ));
        } else if (convex.recordVersion > sqlite.recordVersion) {
          findings.push(makeFinding(
            "warning",
            "VERSION_DRIFT",
            "synchronization",
            sqlite.ref.canonicalKey,
            [sqlite],
            [convex],
            { sqliteRecordVersion: sqlite.recordVersion, convexRecordVersion: convex.recordVersion },
          ));
        }
      }
      if (sqlite.contentHash && convex.contentHash && sqlite.contentHash !== convex.contentHash) {
        findings.push(makeFinding(
          "blocked",
          "CONTENT_HASH_DRIFT",
          "content",
          sqlite.ref.canonicalKey,
          [sqlite],
          [convex],
          {
            sqliteContentHash: sqlite.contentHash,
            convexContentHash: convex.contentHash,
            sqliteContentByteLength: sqlite.contentByteLength,
            convexContentByteLength: convex.contentByteLength,
          },
        ));
      }
    }
  }

  return findings;
}

function sourceSummary(
  status: CanonicalAuditSourceSummary["status"],
  plants: readonly AuditPlant[],
  revision: string,
  expectedCount: number | null,
  pageCount: number,
  terminalCursor: string | null,
): CanonicalAuditSourceSummary {
  const groups = groupBy(plants, (plant) => plant.ref.canonicalKey);
  return {
    status,
    rowCount: plants.length,
    canonicalKeyCount: groups.size,
    duplicateCanonicalKeyCount: [...groups.values()].filter((group) => (
      group.filter(isActiveCanonicalPlant).length > 1
    )).length,
    identityIncompleteCount: plants.filter((plant) => !plant.identity && !plant.explicitCanonicalKey).length,
    dataRevision: revision,
    expectedCount,
    receivedCount: plants.length,
    pageCount,
    terminalCursor,
  };
}

function reportStatus(findings: readonly CanonicalAuditFinding[], snapshotComplete: boolean): CanonicalAuditStatus {
  if (!snapshotComplete) return "incomplete";
  if (findings.some((finding) => finding.severity === "blocked")) return "blocked";
  if (findings.some((finding) => finding.severity === "warning")) return "warning";
  return "healthy";
}

/** Run a deterministic, read-only audit against an already-open SQLite DB. */
export function auditCanonicalIdentity(
  db: SqliteDatabase,
  options: CanonicalIdentityAuditOptions = {},
): CanonicalIdentityAuditReport {
  const sqliteRows = findRows(db).map((row, index) => buildPlant("sqlite", row, index));
  const outboxWatermark = readOutboxWatermark(db);
  const sqliteCatalogRevision = readCatalogRevision(db);
  const sqliteDataRevision = sqliteRevision(sqliteRows, outboxWatermark);
  const snapshot = normalizeSnapshot(options);
  const convexPlants = snapshot.rows
    ? snapshot.rows.map((row, index) => buildPlant("convex", asRecord(row), index))
    : [];
  const findings = auditPlants(sqliteRows, convexPlants, snapshot.complete && snapshot.rows !== null);
  if (snapshot.rows !== null && !snapshot.complete) {
    findings.push(makeFinding(
      "blocked",
      "CONVEX_SNAPSHOT_INCOMPLETE",
      "snapshot",
      null,
      [],
      convexPlants,
      {
        expectedCount: snapshot.expectedCount,
        receivedCount: convexPlants.length,
        pageCount: snapshot.pageCount,
        terminalCursor: snapshot.terminalCursor,
        sourceDataChanged: snapshot.sourceDataChanged,
      },
    ));
  }
  const stableFindings = findings.sort(findingSort);
  const blocked = stableFindings.filter((finding) => finding.severity === "blocked").length;
  const warning = stableFindings.filter((finding) => finding.severity === "warning").length;
  const info = stableFindings.filter((finding) => finding.severity === "info").length;
  const duplicateCanonicalKeys = new Set(stableFindings
    .filter((finding) => finding.code.startsWith("DUPLICATE_CANONICAL_KEY"))
    .map((finding) => finding.canonicalKey)
    .filter(Boolean)).size;
  const unresolvedIdentityRows = sqliteRows.filter((plant) => !plant.identity && !plant.explicitCanonicalKey).length;
  const legacyParentlessCultivars = stableFindings.filter(
    (finding) => finding.code === "MISSING_BASE_PARENT",
  ).length;
  const convexDataRevision = snapshot.revision;
  const snapshotComplete = snapshot.rows === null || snapshot.complete;
  const reportCore = {
    sqliteDataRevision,
    convexDataRevision,
    findings: stableFindings,
    sourceDataChanged: snapshot.sourceDataChanged,
  };
  const auditId = options.runId?.trim() || hashText(stableJson(reportCore)).slice(0, 24);
  return {
    schemaVersion: 1,
    auditVersion: CANONICAL_AUDIT_VERSION,
    auditId,
    status: reportStatus(stableFindings, snapshotComplete),
    summary: {
      totalFindings: stableFindings.length,
      info,
      warning,
      blocked,
      sqliteRows: sqliteRows.length,
      convexRows: snapshot.rows === null ? null : convexPlants.length,
      duplicateCanonicalKeys,
      unresolvedIdentityRows,
      legacyParentlessCultivars,
    },
    freshnessBoundary: {
      sqliteDataRevision,
      sqliteCatalogRevision,
      sqliteOutboxWatermark: outboxWatermark,
      convexSnapshotRevision: convexDataRevision,
      convexExpectedCount: snapshot.expectedCount,
      convexReceivedCount: snapshot.rows === null ? null : convexPlants.length,
      convexPageCount: snapshot.pageCount,
      convexTerminalCursor: snapshot.terminalCursor,
      sourceDataChangedDuringRead: snapshot.sourceDataChanged,
      snapshotComplete,
    },
    sources: {
      sqlite: sourceSummary("read", sqliteRows, sqliteDataRevision, sqliteRows.length, 1, null),
      convex: sourceSummary(
        snapshot.rows === null ? "unavailable" : snapshot.complete ? "read" : "incomplete",
        convexPlants,
        convexDataRevision ?? hashText("convex:unavailable"),
        snapshot.expectedCount,
        snapshot.pageCount,
        snapshot.terminalCursor,
      ),
    },
    findings: stableFindings,
  };
}

/** Open a SQLite file read-only and run the audit. Never calls createDatabase. */
export function auditCanonicalIdentityFile(
  dbPath: string,
  options: CanonicalIdentityAuditOptions = {},
): CanonicalIdentityAuditReport {
  const resolvedPath = path.resolve(dbPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`SQLite database does not exist: ${resolvedPath}`);
  }
  const db = new Database(resolvedPath, { readonly: true, fileMustExist: true });
  try {
    return auditCanonicalIdentity(db as unknown as SqliteDatabase, options);
  } finally {
    db.close();
  }
}

export const auditCanonicalDatabase = auditCanonicalIdentity;
export const runCanonicalIdentityAudit = auditCanonicalIdentityFile;
