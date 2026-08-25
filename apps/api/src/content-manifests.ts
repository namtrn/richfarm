import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { enqueueSyncOutbox } from "./sync-outbox";
import type { SqliteDatabase } from "./db";
import {
  CANONICAL_IDENTITY_VERSION,
  validateCanonicalPlantIdentity,
  type CanonicalPlantIdentity,
  type CanonicalScope,
} from "../../../packages/shared/src/canonicalPlantIdentity";

/** Versioned contract for Git-authoritative Markdown manifests. */
export const CONTENT_MANIFEST_SCHEMA_VERSION = 1 as const;
export const CONTENT_MANIFEST_FILE = "content.json" as const;
export const REQUIRED_CONTENT_LOCALES = ["en", "vi"] as const;

export type ContentLocale = string;
export type ContentStatus = "draft" | "published" | "needs_review" | "archived";
export type ReviewStatus = "unreviewed" | "in_review" | "reviewed";
export type ContentOrigin = "authored" | "inherited" | "imported";
export type FindingSeverity = "blocked" | "warning" | "info";

export interface ContentSourceRef {
  sourceSystem?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  sourceLocator?: string | null;
  [key: string]: unknown;
}

export interface ContentConflictResolution {
  resolution: "replace_database";
  reviewedBy: string;
  reviewedAt: string;
  reason: string;
}

export interface ContentLocaleManifest {
  file: string;
  bytes: number;
  sha256: string;
  content_version: number;
  content_status: ContentStatus;
  review_status: ReviewStatus;
  content_origin: ContentOrigin;
  source_refs: ContentSourceRef[];
  conflict_resolution?: ContentConflictResolution;
}

export interface PlantContentManifest {
  schema_version: typeof CONTENT_MANIFEST_SCHEMA_VERSION;
  kind: "plant";
  plant_code: string;
  canonical_identity_version: typeof CANONICAL_IDENTITY_VERSION;
  canonical_key: string;
  genus: string;
  species: string;
  infraspecific_rank: string | null;
  infraspecific_name: string | null;
  scope: CanonicalScope;
  parent_plant_code: string | null;
  parent_canonical_key: string | null;
  scientific_name: string;
  cultivar: string | null;
  target_status: "active" | "archived" | "quarantined";
  locales: Record<ContentLocale, ContentLocaleManifest>;
}

export interface PestDiseaseContentManifest {
  schema_version: typeof CONTENT_MANIFEST_SCHEMA_VERSION;
  kind: "pest_disease";
  key: string;
  type: "pest" | "disease";
  locales: Record<ContentLocale, ContentLocaleManifest>;
}

export type ContentManifest = PlantContentManifest | PestDiseaseContentManifest;

export interface ContentFinding {
  severity: FindingSeverity;
  code: string;
  path: string;
  message: string;
  evidence?: Record<string, unknown>;
}

export interface ManifestResult<T extends ContentManifest = ContentManifest> {
  manifest: T | null;
  findings: ContentFinding[];
  manifestPath: string;
  targetId?: number;
}

export interface WorkspaceRefreshResult {
  kind: "plant" | "pest_disease";
  mode: "dry_run" | "write";
  manifests: Array<{
    directory: string;
    manifestPath: string;
    targetId?: number;
    locales: number;
    status: "generated" | "blocked" | "unchanged";
    findings: ContentFinding[];
  }>;
  findings: ContentFinding[];
  summary: {
    directories: number;
    generated: number;
    blocked: number;
    locales: number;
  };
}

export interface ContentImportOptions {
  manifestPaths?: string[];
  contentRoot?: string;
  repositoryRoot?: string;
  /** Explicit stable pest/disease key/type snapshot used by imports. */
  catalog?: readonly PestDiseaseCatalogEntry[];
}

export interface ContentImportReport {
  schema_version: typeof CONTENT_MANIFEST_SCHEMA_VERSION;
  mode: "dry_run";
  status: "ready" | "blocked";
  database_sha256: string;
  /** Target database revision included in the proposal fingerprint. */
  target_db_revision: string;
  /** Exact sorted absolute manifest paths considered by this proposal. */
  manifest_paths: string[];
  /** Stable catalog snapshot used to validate pest/disease imports. */
  catalog_snapshot: PestDiseaseCatalogEntry[];
  catalog_provided: boolean;
  catalog_sha256: string;
  proposal_fingerprint: string;
  manifests: Array<{
    path: string;
    kind: ContentManifest["kind"] | "unknown";
    targetId?: number;
    status: "proposed" | "unchanged" | "blocked" | "review_only";
    locales: number;
  }>;
  findings: ContentFinding[];
  summary: {
    manifests: number;
    locales: number;
    proposed: number;
    unchanged: number;
    conflicts: number;
    blocked: number;
  };
}

export interface ContentApplyResult {
  mode: "apply";
  status: "applied";
  runId: string;
  database_sha256_before: string;
  database_sha256_after: string;
  updatedLocales: number;
  queuedOutbox: number;
}

interface DbPlantRow {
  id: number;
  plant_code: string;
  common_name: string;
  scientific_name: string | null;
  canonical_identity_version?: string | null;
  canonical_key?: string | null;
  genus?: string | null;
  species?: string | null;
  infraspecific_rank?: string | null;
  infraspecific_name?: string | null;
  cultivar?: string | null;
  identity_scope?: string | null;
  parent_master_plant_id?: number | null;
  parent_canonical_key?: string | null;
  canonical_status?: string | null;
  source_system?: string | null;
  source_id?: string | null;
  [key: string]: unknown;
}

interface DbI18nRow {
  id: number;
  master_plant_id: number;
  locale: string;
  common_name: string;
  description: string | null;
  care_content: string | null;
  content_version: number;
  source: string | null;
  source_url: string | null;
  content_status: string;
  review_status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  content_origin: string;
  source_refs_json: string;
  [key: string]: unknown;
}

export interface PestDiseaseCatalogEntry {
  key: string;
  type: "pest" | "disease";
}

export interface PlantMarkdownPestLinkValidationResult {
  valid: boolean;
  filesScanned: number;
  linksScanned: number;
  findings: ContentFinding[];
}

interface IdentityTarget {
  row: DbPlantRow;
  identity: CanonicalPlantIdentity | null;
  parent: DbPlantRow | null;
  findings: ContentFinding[];
}

const CONTENT_STATUSES = new Set<ContentStatus>(["draft", "published", "needs_review", "archived"]);
const REVIEW_STATUSES = new Set<ReviewStatus>(["unreviewed", "in_review", "reviewed"]);
const CONTENT_ORIGINS = new Set<ContentOrigin>(["authored", "inherited", "imported"]);

function finding(
  severity: FindingSeverity,
  code: string,
  manifestPath: string,
  message: string,
  evidence?: Record<string, unknown>,
): ContentFinding {
  return { severity, code, path: manifestPath, message, ...(evidence ? { evidence } : {}) };
}

function validateCatalogSnapshot(catalog: readonly PestDiseaseCatalogEntry[], manifestPath: string): ContentFinding[] {
  const findings: ContentFinding[] = [];
  const seen = new Map<string, PestDiseaseCatalogEntry["type"]>();
  for (const entry of catalog) {
    if (!entry.key) {
      findings.push(finding("blocked", "PEST_CATALOG_KEY_INVALID", manifestPath, "Pest/disease catalog keys must be non-empty"));
      continue;
    }
    if (entry.type !== "pest" && entry.type !== "disease") {
      findings.push(finding("blocked", "PEST_CATALOG_TYPE_INVALID", manifestPath, `Catalog type for ${entry.key} must be pest or disease`, { key: entry.key, type: entry.type }));
      continue;
    }
    const previous = seen.get(entry.key);
    if (previous !== undefined) {
      findings.push(finding("blocked", "PEST_CATALOG_KEY_AMBIGUOUS", manifestPath, `Catalog key ${entry.key} occurs more than once`, { key: entry.key, types: [previous, entry.type] }));
    } else {
      seen.set(entry.key, entry.type);
    }
  }
  return findings;
}

const INTERNAL_PEST_LINK_PATTERN = /richfarm:\/\/pests-diseases[^\s)\]]*/gi;
const PEST_DISEASE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const LOCALE_PATTERN = /^[a-z]{2}(?:-[a-z]{2})?$/;

function markdownFilesUnder(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(absolute);
    }
  };
  visit(root);
  return files.sort((left, right) => left.localeCompare(right));
}

function parseInternalPestLink(value: string): { key: string; locale?: string } | null {
  const match = /^richfarm:\/\/pests-diseases\/([^/?#]+)\/?(?:\?([^#]*))?$/i.exec(value.trim());
  if (!match) return null;
  let key: string;
  try {
    key = decodeURIComponent(match[1]).trim().toLowerCase();
  } catch {
    return null;
  }
  if (!PEST_DISEASE_KEY_PATTERN.test(key)) return null;
  let locale: string | undefined;
  if (match[2] !== undefined) {
    if (!/^locale=[^&]+$/i.test(match[2])) return null;
    try {
      locale = decodeURIComponent(match[2].slice("locale=".length)).trim().toLowerCase();
    } catch {
      return null;
    }
    if (!LOCALE_PATTERN.test(locale)) return null;
  }
  return locale ? { key, locale } : { key };
}

/**
 * Validate every Markdown pest/disease link in a plant content tree against
 * one explicit stable catalog snapshot. Findings point at the Markdown file
 * (rather than only its manifest) and include locale/line evidence so an
 * editor can repair a dangling or malformed link without guessing.
 */
export function validatePlantMarkdownPestLinks(options: {
  contentRoot: string;
  catalog: readonly PestDiseaseCatalogEntry[];
}): PlantMarkdownPestLinkValidationResult {
  const root = path.resolve(options.contentRoot);
  const findings: ContentFinding[] = [];
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return {
      valid: false,
      filesScanned: 0,
      linksScanned: 0,
      findings: [finding("blocked", "CONTENT_ROOT_MISSING", root, `Plant content root does not exist: ${root}`)],
    };
  }

  const catalog = canonicalCatalogSnapshot(options.catalog);
  findings.push(...validateCatalogSnapshot(catalog, root));
  const catalogMatches = new Map<string, PestDiseaseCatalogEntry[]>();
  for (const entry of catalog) {
    const key = entry.key.toLowerCase();
    const matches = catalogMatches.get(key) ?? [];
    matches.push(entry);
    catalogMatches.set(key, matches);
  }

  const files = markdownFilesUnder(root);
  let linksScanned = 0;
  for (const sourcePath of files) {
    const fileName = path.basename(sourcePath);
    const locale = normalizeLocale(fileName.slice(0, -3));
    if (!LOCALE_PATTERN.test(locale)) {
      findings.push(finding("blocked", "PLANT_MARKDOWN_LOCALE_INVALID", sourcePath, `Plant Markdown filename must be a locale: ${fileName}`, { sourcePath, locale }));
    }
    const markdown = fs.readFileSync(sourcePath, "utf8");
    INTERNAL_PEST_LINK_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INTERNAL_PEST_LINK_PATTERN.exec(markdown)) !== null) {
      linksScanned += 1;
      const link = match[0];
      const line = markdown.slice(0, match.index).split("\n").length;
      const evidence = { sourcePath, locale, line, link };
      const parsed = parseInternalPestLink(link);
      if (!parsed) {
        findings.push(finding("blocked", "PEST_LINK_MALFORMED", sourcePath, `Malformed internal pest/disease link in ${locale} Markdown`, evidence));
        continue;
      }
      const candidates = catalogMatches.get(parsed.key) ?? [];
      if (candidates.length === 0) {
        findings.push(finding("blocked", "PEST_LINK_KEY_UNKNOWN", sourcePath, `Internal pest/disease key ${parsed.key} is not in the stable catalog`, { ...evidence, key: parsed.key }));
      } else if (candidates.length !== 1) {
        findings.push(finding("blocked", "PEST_LINK_KEY_AMBIGUOUS", sourcePath, `Internal pest/disease key ${parsed.key} is ambiguous in the stable catalog`, { ...evidence, key: parsed.key, matches: candidates.length }));
      }
    }
  }

  return {
    valid: !findings.some((item) => item.severity === "blocked"),
    filesScanned: files.length,
    linksScanned,
    findings,
  };
}

/** Alias emphasizing that this is the plant Markdown internal-link gate. */
export const validatePlantMarkdownInternalLinks = validatePlantMarkdownPestLinks;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

/** Deterministic JSON used for manifests and reports. */
export function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value), null, 2) + "\n";
}

function hashBytes(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function exactUtf8Digest(value: string | Uint8Array): { bytes: number; sha256: string } {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
  return { bytes: bytes.byteLength, sha256: hashBytes(bytes) };
}

function canonicalCatalogSnapshot(catalog: readonly PestDiseaseCatalogEntry[] | undefined): PestDiseaseCatalogEntry[] {
  return [...(catalog ?? [])]
    .map((entry) => ({ key: String(entry.key ?? "").trim(), type: String(entry.type ?? "") as PestDiseaseCatalogEntry["type"] }))
    .sort((left, right) => left.key.localeCompare(right.key) || String(left.type).localeCompare(String(right.type)));
}

function catalogSnapshotSha256(catalog: readonly PestDiseaseCatalogEntry[]): string {
  return exactUtf8Digest(stableJson(catalog)).sha256;
}

function proposalFingerprint(input: {
  targetDbRevision: string;
  manifestPaths: readonly string[];
  catalogSnapshot: readonly PestDiseaseCatalogEntry[];
  catalogProvided: boolean;
  manifests: readonly Record<string, unknown>[];
}): string {
  return exactUtf8Digest(stableJson({
    schema_version: CONTENT_MANIFEST_SCHEMA_VERSION,
    target_db_revision: input.targetDbRevision,
    manifest_paths: [...input.manifestPaths],
    catalog_snapshot: input.catalogSnapshot,
    catalog_provided: input.catalogProvided,
    manifests: input.manifests,
  })).sha256;
}

function databaseDigest(db: SqliteDatabase): string {
  return hashBytes(db.serialize());
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, stableJson(value), "utf8");
}

function safePositiveVersion(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 1;
}

function parseSourceRefs(value: unknown): ContentSourceRef[] {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(isRecord)
    .map((ref) => ({ ...ref }))
    .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
}

function normalizeLocale(value: string): string {
  return value.trim().toLowerCase();
}

function localeFiles(directoryPath: string, manifestPath: string): {
  files: Map<string, { name: string; path: string; bytes: number; sha256: string }>;
  findings: ContentFinding[];
} {
  const files = new Map<string, { name: string; path: string; bytes: number; sha256: string }>();
  const findings: ContentFinding[] = [];
  for (const name of fs.readdirSync(directoryPath).sort()) {
    if (name === CONTENT_MANIFEST_FILE || name.startsWith(".")) continue;
    const absolute = path.join(directoryPath, name);
    if (!fs.statSync(absolute).isFile()) continue;
    if (!name.endsWith(".md")) {
      findings.push(finding("blocked", "UNSUPPORTED_CONTENT_FILE", manifestPath, `Unsupported content file ${name}`, { file: name }));
      continue;
    }
    const locale = normalizeLocale(name.slice(0, -3));
    if (!/^[a-z]{2}(?:-[a-z]{2})?$/.test(locale)) {
      findings.push(finding("blocked", "INVALID_LOCALE_FILE", manifestPath, `Markdown filename must be a locale: ${name}`, { file: name }));
      continue;
    }
    if (files.has(locale)) {
      findings.push(finding("blocked", "DUPLICATE_LOCALE_FILE", manifestPath, `More than one Markdown file maps to locale ${locale}`, { locale }));
      continue;
    }
    const bytes = fs.readFileSync(absolute);
    const digest = exactUtf8Digest(bytes);
    files.set(locale, { name, path: absolute, ...digest });
  }
  return { files, findings };
}

function checkRequiredLocales(locales: Iterable<string>, manifestPath: string, requiredLocales: readonly string[]): ContentFinding[] {
  const available = new Set(locales);
  return requiredLocales
    .filter((locale) => !available.has(normalizeLocale(locale)))
    .map((locale) => finding("blocked", "MISSING_LOCALE_FILE", manifestPath, `Required locale ${locale} has no Markdown file`, { locale }));
}

function slugifyIdentity(identity: CanonicalPlantIdentity): string {
  return [identity.genus, identity.species, identity.rank, identity.infraspecificName, identity.scope === "cultivar" ? identity.cultivar : ""]
    .filter(Boolean)
    .join("-")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/×/g, "x")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function rowIdentity(db: SqliteDatabase, row: DbPlantRow, manifestPath: string): IdentityTarget {
  const findings: ContentFinding[] = [];
  const validation = validateCanonicalPlantIdentity({
    genus: row.genus,
    species: row.species,
    rank: row.infraspecific_rank ?? null,
    infraspecificName: row.infraspecific_name ?? null,
    cultivar: row.cultivar ?? null,
    scope: row.identity_scope,
    parentCanonicalKey: row.parent_canonical_key ?? null,
    parentMasterPlantId: typeof row.parent_master_plant_id === "number" ? row.parent_master_plant_id : null,
  });
  if (!validation.ok) {
    findings.push(finding("blocked", "CANONICAL_TARGET_INVALID", manifestPath, validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "), { plantCode: row.plant_code }));
    return { row, identity: null, parent: null, findings };
  }
  if (row.canonical_identity_version !== CANONICAL_IDENTITY_VERSION) {
    findings.push(finding("blocked", "CANONICAL_IDENTITY_VERSION_MISMATCH", manifestPath, `Target ${row.plant_code} is not on ${CANONICAL_IDENTITY_VERSION}`, { actual: row.canonical_identity_version ?? null }));
  }
  if (row.canonical_key !== validation.canonicalKey) {
    findings.push(finding("blocked", "CANONICAL_KEY_MISMATCH", manifestPath, `Stored canonical key does not recompute from target identity`, { stored: row.canonical_key ?? null, computed: validation.canonicalKey }));
  }
  let parent: DbPlantRow | null = null;
  if (validation.identity.scope === "cultivar") {
    const parentId = validation.identity.parentMasterPlantId;
    if (parentId !== null) {
      const parents = dbRowsForParent(db, parentId);
      if (parents.length !== 1) {
        findings.push(finding("blocked", "CANONICAL_PARENT_TARGET_INVALID", manifestPath, `Cultivar target must have exactly one parent row`, { parentId, matches: parents.length }));
      } else {
        parent = parents[0];
      }
    }
  }
  return { row, identity: validation.identity, parent, findings };
}

function dbRowsForParent(db: SqliteDatabase, parentId: number): DbPlantRow[] {
  return db.prepare(`SELECT * FROM master_plants WHERE id = ?`).all(parentId) as DbPlantRow[];
}

function targetForPlantCode(db: SqliteDatabase, plantCode: string, manifestPath: string): IdentityTarget | null {
  const rows = db.prepare(`SELECT * FROM master_plants WHERE plant_code = ? ORDER BY id ASC`).all(plantCode) as DbPlantRow[];
  if (rows.length === 0) {
    return null;
  }
  const target = rowIdentity(db, rows[0], manifestPath);
  if (rows.length > 1) {
    target.findings.push(finding("blocked", "AMBIGUOUS_PLANT_CODE", manifestPath, `plant_code ${plantCode} resolves to multiple SQLite rows`, { plantCode, rowIds: rows.map((row) => row.id) }));
  }
  if ((target.row.canonical_status ?? "active") !== "active") {
    target.findings.push(finding("blocked", "PLANT_TARGET_NOT_ACTIVE", manifestPath, `Content target ${plantCode} is ${target.row.canonical_status ?? "unknown"}`, { plantCode, status: target.row.canonical_status ?? null, rowId: target.row.id }));
  }
  return target;
}

function targetBySlug(db: SqliteDatabase, slug: string, manifestPath: string): { target: IdentityTarget | null; findings: ContentFinding[] } {
  const rows = db.prepare(`SELECT * FROM master_plants ORDER BY id ASC`).all() as DbPlantRow[];
  const candidates: IdentityTarget[] = [];
  const findings: ContentFinding[] = [];
  for (const row of rows) {
    const target = rowIdentity(db, row, manifestPath);
    if (target.identity && slugifyIdentity(target.identity) === slug) candidates.push(target);
  }
  if (candidates.length === 0) {
    findings.push(finding("blocked", "MISSING_PLANT_TARGET", manifestPath, `No active SQLite plant unambiguously matches directory ${slug}`, { directory: slug }));
    return { target: null, findings };
  }
  const active = candidates.filter((candidate) => (candidate.row.canonical_status ?? "active") === "active");
  const selected = active.length === 1 ? active[0] : active.length > 1 ? null : candidates.length === 1 ? candidates[0] : null;
  if (!selected) {
    findings.push(finding("blocked", "AMBIGUOUS_PLANT_DIRECTORY", manifestPath, `Directory ${slug} matches multiple active plants`, { directory: slug, rowIds: candidates.map((candidate) => candidate.row.id) }));
    return { target: null, findings };
  }
  if ((selected.row.canonical_status ?? "active") !== "active") {
    selected.findings.push(finding("blocked", "PLANT_TARGET_NOT_ACTIVE", manifestPath, `Content target ${selected.row.plant_code} is ${selected.row.canonical_status ?? "unknown"}`, { plantCode: selected.row.plant_code, status: selected.row.canonical_status ?? null, rowId: selected.row.id }));
  }
  return { target: selected, findings: selected.findings };
}

function localeManifestFromFile(
  locale: string,
  file: { name: string; bytes: number; sha256: string },
  existing: ContentLocaleManifest | undefined,
): ContentLocaleManifest {
  return {
    file: file.name,
    bytes: file.bytes,
    sha256: file.sha256,
    content_version: safePositiveVersion(existing?.content_version),
    // Git content is never promoted to published by generation. Existing
    // review metadata is retained only when an explicit old manifest exists.
    content_status: existing?.content_status ?? "needs_review",
    review_status: existing?.review_status ?? "unreviewed",
    content_origin: existing?.content_origin ?? "authored",
    source_refs: parseSourceRefs(existing?.source_refs ?? []),
    ...(existing?.conflict_resolution ? { conflict_resolution: existing.conflict_resolution } : {}),
  };
}

function parentCode(db: SqliteDatabase, target: IdentityTarget): string | null {
  if (!target.identity) return null;
  const parentId = target.identity.parentMasterPlantId;
  if (parentId === null) return null;
  const parent = target.parent ?? db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(parentId) as DbPlantRow | undefined;
  return parent?.plant_code ?? null;
}

function createPlantManifest(
  db: SqliteDatabase,
  directoryPath: string,
  target: IdentityTarget,
  requiredLocales: readonly string[],
): ManifestResult<PlantContentManifest> {
  const manifestPath = path.join(directoryPath, CONTENT_MANIFEST_FILE);
  const findings = [...target.findings];
  const files = localeFiles(directoryPath, manifestPath);
  findings.push(...files.findings, ...checkRequiredLocales(files.files.keys(), manifestPath, requiredLocales));
  const existing = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;
  const existingLocales = isRecord(existing) && isRecord(existing.locales) ? existing.locales as Record<string, ContentLocaleManifest> : {};
  if (existing && (!isRecord(existing) || existing.kind !== "plant" || existing.plant_code !== target.row.plant_code)) {
    findings.push(finding("blocked", "MANIFEST_IDENTITY_DRIFT", manifestPath, "Existing manifest identity does not match the explicitly selected plant_code", { plantCode: target.row.plant_code }));
  }
  if (!target.identity) return { manifest: null, findings, manifestPath, targetId: target.row.id };
  const manifest: PlantContentManifest = {
    schema_version: CONTENT_MANIFEST_SCHEMA_VERSION,
    kind: "plant",
    plant_code: target.row.plant_code,
    canonical_identity_version: CANONICAL_IDENTITY_VERSION,
    canonical_key: target.identity.canonicalKey,
    genus: target.identity.genus,
    species: target.identity.species,
    infraspecific_rank: target.identity.rank || null,
    infraspecific_name: target.identity.infraspecificName || null,
    scope: target.identity.scope,
    parent_plant_code: parentCode(db, target),
    parent_canonical_key: target.identity.parentCanonicalKey,
    scientific_name: String(target.row.scientific_name ?? "").trim(),
    cultivar: target.identity.cultivar || null,
    target_status: (target.row.canonical_status ?? "active") as PlantContentManifest["target_status"],
    locales: Object.fromEntries([...files.files.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([locale, file]) => [
      locale,
      localeManifestFromFile(locale, file, existingLocales[locale]),
    ])),
  };
  findings.push(...validatePlantManifest(manifest, manifestPath).findings);
  return { manifest, findings, manifestPath, targetId: target.row.id };
}

export function initializePlantManifest(options: {
  db: SqliteDatabase;
  directoryPath: string;
  plantCode: string;
  requiredLocales?: readonly string[];
}): ManifestResult<PlantContentManifest> {
  const directoryPath = path.resolve(options.directoryPath);
  const manifestPath = path.join(directoryPath, CONTENT_MANIFEST_FILE);
  if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
    return { manifest: null, findings: [finding("blocked", "CONTENT_DIRECTORY_MISSING", manifestPath, `Content directory does not exist: ${directoryPath}`)], manifestPath };
  }
  const target = targetForPlantCode(options.db, options.plantCode, manifestPath);
  if (!target) {
    return { manifest: null, findings: [finding("blocked", "MISSING_PLANT_TARGET", manifestPath, `No SQLite plant has immutable plant_code ${options.plantCode}`, { plantCode: options.plantCode })], manifestPath };
  }
  return createPlantManifest(options.db, directoryPath, target, options.requiredLocales ?? REQUIRED_CONTENT_LOCALES);
}

export function refreshPlantManifests(options: {
  db: SqliteDatabase;
  contentRoot: string;
  write?: boolean;
  requiredLocales?: readonly string[];
}): WorkspaceRefreshResult {
  const contentRoot = path.resolve(options.contentRoot);
  const findings: ContentFinding[] = [];
  const manifests: WorkspaceRefreshResult["manifests"] = [];
  if (!fs.existsSync(contentRoot) || !fs.statSync(contentRoot).isDirectory()) {
    return { kind: "plant", mode: options.write ? "write" : "dry_run", manifests: [], findings: [finding("blocked", "CONTENT_ROOT_MISSING", contentRoot, `Plant content root does not exist: ${contentRoot}`)], summary: { directories: 0, generated: 0, blocked: 1, locales: 0 } };
  }
  for (const entry of fs.readdirSync(contentRoot, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
    const directoryPath = path.join(contentRoot, entry.name);
    const manifestPath = path.join(directoryPath, CONTENT_MANIFEST_FILE);
    const target = targetBySlug(options.db, entry.name, manifestPath);
    if (!target.target) {
      manifests.push({ directory: entry.name, manifestPath, status: "blocked", locales: 0, findings: target.findings });
      findings.push(...target.findings);
      continue;
    }
    const result = createPlantManifest(options.db, directoryPath, target.target, options.requiredLocales ?? REQUIRED_CONTENT_LOCALES);
    const blocked = result.findings.some((item) => item.severity === "blocked");
    const unchanged = fs.existsSync(manifestPath) && !blocked && stableJson(readJson(manifestPath)) === stableJson(result.manifest);
    if (options.write && !blocked && result.manifest && !unchanged) writeJson(manifestPath, result.manifest);
    const status = blocked ? "blocked" : unchanged ? "unchanged" : "generated";
    manifests.push({
      directory: entry.name,
      manifestPath,
      targetId: result.targetId,
      status,
      locales: Object.keys(result.manifest?.locales ?? {}).length,
      findings: result.findings,
    });
    findings.push(...result.findings);
  }
  // The old root export manifest contains stale row IDs and is intentionally
  // never read as an authority for per-directory Git content.
  const rootCareManifest = path.resolve(contentRoot, "..", "care-content-export-manifest.json");
  if (fs.existsSync(rootCareManifest)) {
    findings.push(finding("info", "LEGACY_ROOT_MANIFEST_IGNORED", rootCareManifest, "Root care-content export manifest is not an authority for content.json imports"));
  }
  const locales = manifests.reduce((sum, item) => sum + item.locales, 0);
  return {
    kind: "plant",
    mode: options.write ? "write" : "dry_run",
    manifests,
    findings,
    summary: {
      directories: manifests.length,
      generated: manifests.filter((item) => item.status !== "blocked").length,
      blocked: manifests.filter((item) => item.status === "blocked").length,
      locales,
    },
  };
}

function validateLocaleManifest(value: unknown, manifestPath: string, locale: string): ContentFinding[] {
  const findings: ContentFinding[] = [];
  if (!isRecord(value)) return [finding("blocked", "LOCALE_MANIFEST_INVALID", manifestPath, `Locale ${locale} manifest must be an object` )];
  if (typeof value.file !== "string" || value.file !== `${locale}.md`) findings.push(finding("blocked", "LOCALE_FILE_MISMATCH", manifestPath, `Locale ${locale} must point to ${locale}.md`));
  if (typeof value.bytes !== "number" || !Number.isSafeInteger(value.bytes) || value.bytes < 0) findings.push(finding("blocked", "CONTENT_BYTES_INVALID", manifestPath, `Locale ${locale} bytes must be a non-negative integer`));
  if (typeof value.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.sha256)) findings.push(finding("blocked", "CONTENT_SHA256_INVALID", manifestPath, `Locale ${locale} sha256 must be lowercase SHA-256`));
  if (!Number.isSafeInteger(value.content_version) || Number(value.content_version) < 1) findings.push(finding("blocked", "CONTENT_VERSION_INVALID", manifestPath, `Locale ${locale} content_version must be positive`));
  if (!CONTENT_STATUSES.has(value.content_status as ContentStatus)) findings.push(finding("blocked", "CONTENT_STATUS_INVALID", manifestPath, `Locale ${locale} content_status is invalid`));
  if (!REVIEW_STATUSES.has(value.review_status as ReviewStatus)) findings.push(finding("blocked", "REVIEW_STATUS_INVALID", manifestPath, `Locale ${locale} review_status is invalid`));
  if (!CONTENT_ORIGINS.has(value.content_origin as ContentOrigin)) findings.push(finding("blocked", "CONTENT_ORIGIN_INVALID", manifestPath, `Locale ${locale} content_origin is invalid`));
  if (!Array.isArray(value.source_refs) || value.source_refs.some((ref) => !isRecord(ref))) findings.push(finding("blocked", "SOURCE_REFS_INVALID", manifestPath, `Locale ${locale} source_refs must be an array of objects`));
  if (value.content_status === "published" && value.review_status === "unreviewed") findings.push(finding("blocked", "PUBLISHED_UNREVIEWED", manifestPath, `Locale ${locale} cannot be published while unreviewed`));
  if (value.review_status === "reviewed" && (!Array.isArray(value.source_refs) || value.source_refs.length === 0)) findings.push(finding("blocked", "REVIEWED_WITHOUT_PROVENANCE", manifestPath, `Locale ${locale} is reviewed but has no source_refs`));
  if (value.content_origin === "imported" && (!Array.isArray(value.source_refs) || value.source_refs.length === 0)) findings.push(finding("blocked", "IMPORTED_WITHOUT_PROVENANCE", manifestPath, `Locale ${locale} is imported but has no source_refs`));
  return findings;
}

export function validatePlantManifest(value: unknown, manifestPath = "content.json"): { valid: boolean; findings: ContentFinding[] } {
  const findings: ContentFinding[] = [];
  if (!isRecord(value)) return { valid: false, findings: [finding("blocked", "MANIFEST_INVALID", manifestPath, "Plant manifest must be an object")] };
  if (value.schema_version !== CONTENT_MANIFEST_SCHEMA_VERSION || value.kind !== "plant") findings.push(finding("blocked", "MANIFEST_SCHEMA_INVALID", manifestPath, "Plant manifest schema_version/kind is invalid"));
  for (const field of ["plant_code", "canonical_identity_version", "canonical_key", "genus", "species", "scientific_name"]) if (typeof value[field] !== "string" || value[field].trim() === "") findings.push(finding("blocked", "IDENTITY_FIELD_MISSING", manifestPath, `Plant manifest field ${field} is required`));
  if (value.canonical_identity_version !== CANONICAL_IDENTITY_VERSION) findings.push(finding("blocked", "CANONICAL_IDENTITY_VERSION_MISMATCH", manifestPath, "Manifest canonical identity version is unsupported"));
  if (value.scope !== "base" && value.scope !== "cultivar") findings.push(finding("blocked", "IDENTITY_SCOPE_INVALID", manifestPath, "Manifest scope must be base or cultivar"));
  if (value.scope === "base" && (value.cultivar !== null || value.parent_plant_code !== null || value.parent_canonical_key !== null)) findings.push(finding("blocked", "BASE_PARENT_FORBIDDEN", manifestPath, "Base content cannot declare cultivar or parent"));
  if (value.scope === "cultivar" && (typeof value.cultivar !== "string" || !value.cultivar.trim() || typeof value.parent_plant_code !== "string" || !value.parent_plant_code.trim())) findings.push(finding("blocked", "CULTIVAR_PARENT_REQUIRED", manifestPath, "Cultivar content requires cultivar and parent_plant_code"));
  const validation = validateCanonicalPlantIdentity({
    genus: value.genus,
    species: value.species,
    rank: value.infraspecific_rank ?? null,
    infraspecificName: value.infraspecific_name ?? null,
    cultivar: value.cultivar ?? null,
    scope: value.scope,
    parentCanonicalKey: value.parent_canonical_key ?? null,
    parentMasterPlantId: null,
  });
  if (!validation.ok) findings.push(finding("blocked", "CANONICAL_IDENTITY_INVALID", manifestPath, validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")));
  else if (value.canonical_key !== validation.canonicalKey) findings.push(finding("blocked", "CANONICAL_KEY_RECOMPUTE_MISMATCH", manifestPath, "Manifest canonical_key does not recompute from structured identity", { expected: validation.canonicalKey, actual: value.canonical_key }));
  if (!isRecord(value.locales) || Object.keys(value.locales).length === 0) findings.push(finding("blocked", "LOCALES_MISSING", manifestPath, "Plant manifest must declare at least one locale"));
  else for (const locale of Object.keys(value.locales).sort()) findings.push(...validateLocaleManifest(value.locales[locale], manifestPath, locale));
  return { valid: !findings.some((item) => item.severity === "blocked"), findings };
}

export function validatePestDiseaseManifest(value: unknown, manifestPath = "content.json"): { valid: boolean; findings: ContentFinding[] } {
  const findings: ContentFinding[] = [];
  if (!isRecord(value)) return { valid: false, findings: [finding("blocked", "MANIFEST_INVALID", manifestPath, "Pest/disease manifest must be an object")] };
  if (value.schema_version !== CONTENT_MANIFEST_SCHEMA_VERSION || value.kind !== "pest_disease") findings.push(finding("blocked", "MANIFEST_SCHEMA_INVALID", manifestPath, "Pest/disease manifest schema_version/kind is invalid"));
  if (typeof value.key !== "string" || !value.key.trim()) findings.push(finding("blocked", "PEST_KEY_MISSING", manifestPath, "Stable pest/disease key is required"));
  if (value.type !== "pest" && value.type !== "disease") findings.push(finding("blocked", "PEST_TYPE_INVALID", manifestPath, "Pest/disease type must be pest or disease"));
  if (!isRecord(value.locales) || Object.keys(value.locales).length === 0) findings.push(finding("blocked", "LOCALES_MISSING", manifestPath, "Pest/disease manifest must declare at least one locale"));
  else for (const locale of Object.keys(value.locales).sort()) findings.push(...validateLocaleManifest(value.locales[locale], manifestPath, locale));
  return { valid: !findings.some((item) => item.severity === "blocked"), findings };
}

export function validateContentManifest(value: unknown, manifestPath = "content.json"): { valid: boolean; findings: ContentFinding[] } {
  if (isRecord(value) && value.kind === "plant") return validatePlantManifest(value, manifestPath);
  if (isRecord(value) && value.kind === "pest_disease") return validatePestDiseaseManifest(value, manifestPath);
  return { valid: false, findings: [finding("blocked", "MANIFEST_KIND_INVALID", manifestPath, "Manifest kind must be plant or pest_disease")] };
}

function compareManifestToTarget(db: SqliteDatabase, manifest: PlantContentManifest, target: IdentityTarget, manifestPath: string): ContentFinding[] {
  const findings: ContentFinding[] = [...target.findings];
  if (!target.identity) return findings;
  const expected = {
    plant_code: target.row.plant_code,
    canonical_identity_version: CANONICAL_IDENTITY_VERSION,
    canonical_key: target.identity.canonicalKey,
    genus: target.identity.genus,
    species: target.identity.species,
    infraspecific_rank: target.identity.rank || null,
    infraspecific_name: target.identity.infraspecificName || null,
    scope: target.identity.scope,
    parent_canonical_key: target.identity.parentCanonicalKey,
    scientific_name: String(target.row.scientific_name ?? "").trim(),
    cultivar: target.identity.cultivar || null,
  };
  for (const [field, expectedValue] of Object.entries(expected)) if ((manifest as unknown as Record<string, unknown>)[field] !== expectedValue) findings.push(finding("blocked", "MANIFEST_TARGET_IDENTITY_MISMATCH", manifestPath, `Manifest ${field} does not match SQLite target`, { field, expected: expectedValue, actual: (manifest as unknown as Record<string, unknown>)[field] }));
  const expectedParentCode = parentCode(db, target);
  if (manifest.parent_plant_code !== expectedParentCode) findings.push(finding("blocked", "MANIFEST_PARENT_MISMATCH", manifestPath, "Manifest parent_plant_code does not match SQLite target", { expected: expectedParentCode, actual: manifest.parent_plant_code }));
  return findings;
}

function i18nRows(db: SqliteDatabase, plantId: number): Map<string, DbI18nRow> {
  const rows = db.prepare(`SELECT * FROM master_plant_i18n WHERE master_plant_id = ? ORDER BY locale ASC`).all(plantId) as DbI18nRow[];
  return new Map(rows.map((row) => [normalizeLocale(row.locale), row]));
}

function relativeManifestPath(manifestPath: string, repositoryRoot?: string): string {
  return path.relative(repositoryRoot ? path.resolve(repositoryRoot) : process.cwd(), manifestPath).split(path.sep).join("/");
}

function manifestFiles(options: ContentImportOptions): string[] {
  if (options.manifestPaths?.length) return options.manifestPaths.map((item) => path.resolve(item)).sort();
  const root = path.resolve(options.contentRoot ?? path.resolve(process.cwd(), "content"));
  const paths: string[] = [];
  for (const category of ["plants", "pests-diseases"]) {
    const categoryRoot = path.join(root, category);
    if (!fs.existsSync(categoryRoot)) continue;
    for (const entry of fs.readdirSync(categoryRoot, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
      const file = path.join(categoryRoot, entry.name, CONTENT_MANIFEST_FILE);
      if (fs.existsSync(file)) paths.push(file);
    }
  }
  return paths;
}

function fileWithinDirectory(directoryPath: string, fileName: string): string | null {
  if (path.basename(fileName) !== fileName || !fileName.endsWith(".md")) return null;
  const filePath = path.resolve(directoryPath, fileName);
  return filePath.startsWith(`${path.resolve(directoryPath)}${path.sep}`) ? filePath : null;
}

function contentGate(locale: ContentLocaleManifest, manifestPath: string, localeName: string): ContentFinding[] {
  const findings: ContentFinding[] = [];
  if (locale.content_status === "published" && locale.review_status === "unreviewed") findings.push(finding("blocked", "PUBLISHED_UNREVIEWED", manifestPath, `Locale ${localeName} cannot be imported as published/unreviewed`));
  if (locale.review_status === "reviewed" && locale.source_refs.length === 0) findings.push(finding("blocked", "REVIEWED_WITHOUT_PROVENANCE", manifestPath, `Locale ${localeName} has no source_refs`));
  if (locale.content_origin === "imported" && locale.source_refs.length === 0) findings.push(finding("blocked", "IMPORTED_WITHOUT_PROVENANCE", manifestPath, `Locale ${localeName} is imported without source_refs`));
  return findings;
}

export function dryRunContentImport(db: SqliteDatabase, options: ContentImportOptions = {}): ContentImportReport {
  const findings: ContentFinding[] = [];
  const manifests: ContentImportReport["manifests"] = [];
  const manifestPaths = manifestFiles(options);
  const targetDbRevision = databaseDigest(db);
  const catalogProvided = options.catalog !== undefined;
  const catalogSnapshot = canonicalCatalogSnapshot(options.catalog);
  const catalogSha256 = catalogSnapshotSha256(catalogSnapshot);
  const fingerprintManifests: Array<Record<string, unknown>> = [];
  let locales = 0;
  let proposed = 0;
  let unchanged = 0;
  let conflicts = 0;
  const appendFingerprint = (manifestPath: string, raw: unknown, summary: Record<string, unknown>): void => {
    fingerprintManifests.push({
      path: manifestPath,
      ...summary,
      manifest: stableValue(raw),
    });
  };
  for (const manifestPath of manifestPaths) {
    let raw: unknown = null;
    try {
      raw = readJson(manifestPath);
    } catch (error) {
      const item = finding("blocked", "MANIFEST_JSON_INVALID", manifestPath, error instanceof Error ? error.message : String(error));
      findings.push(item);
      const summary = { path: relativeManifestPath(manifestPath, options.repositoryRoot), kind: "unknown" as const, status: "blocked" as const, locales: 0 };
      manifests.push(summary);
      appendFingerprint(manifestPath, raw, summary);
      continue;
    }
    const validation = validateContentManifest(raw, manifestPath);
    findings.push(...validation.findings);
    if (!validation.valid || !isRecord(raw)) {
      const kind: ContentImportReport["manifests"][number]["kind"] = isRecord(raw) && (raw.kind === "plant" || raw.kind === "pest_disease") ? raw.kind : "unknown";
      const summary = { path: relativeManifestPath(manifestPath, options.repositoryRoot), kind, status: "blocked" as const, locales: 0 };
      manifests.push(summary);
      appendFingerprint(manifestPath, raw, summary);
      continue;
    }
    if (raw.kind === "pest_disease") {
      const manifest = raw as unknown as PestDiseaseContentManifest;
      const directory = path.dirname(manifestPath);
      let localCount = 0;
      if (!catalogProvided) {
        findings.push(finding("blocked", "PEST_CATALOG_REQUIRED", manifestPath, "Pest/disease imports require an explicit stable catalog snapshot"));
      } else {
        findings.push(...validateCatalogSnapshot(catalogSnapshot, manifestPath));
        const candidates = catalogSnapshot.filter((entry) => entry.key === manifest.key);
        if (candidates.length === 0) {
          findings.push(finding("blocked", "PEST_CATALOG_KEY_UNKNOWN", manifestPath, `Pest/disease key ${manifest.key} is not in the explicit catalog snapshot`, { key: manifest.key }));
        } else if (candidates.length !== 1) {
          findings.push(finding("blocked", "PEST_CATALOG_KEY_AMBIGUOUS", manifestPath, `Pest/disease key ${manifest.key} is ambiguous in the explicit catalog snapshot`, { key: manifest.key }));
        } else if (candidates[0].type !== manifest.type) {
          findings.push(finding("blocked", "PEST_CATALOG_TYPE_MISMATCH", manifestPath, `Pest/disease key ${manifest.key} has catalog type ${candidates[0].type}, not ${manifest.type}`, { key: manifest.key, expected: candidates[0].type, actual: manifest.type }));
        }
      }
      for (const [locale, localeManifest] of Object.entries(manifest.locales)) {
        localCount++;
        locales++;
        findings.push(...contentGate(localeManifest, manifestPath, locale));
        const filePath = fileWithinDirectory(directory, localeManifest.file);
        if (!filePath || !fs.existsSync(filePath)) {
          findings.push(finding("blocked", "CONTENT_FILE_MISSING", manifestPath, `Locale ${locale} Markdown file is missing`, { locale, file: localeManifest.file }));
          continue;
        }
        const digest = exactUtf8Digest(fs.readFileSync(filePath));
        if (digest.bytes !== localeManifest.bytes || digest.sha256 !== localeManifest.sha256) findings.push(finding("blocked", "CONTENT_HASH_MISMATCH", manifestPath, `Locale ${locale} Markdown bytes differ from manifest`, { locale, expected: { bytes: localeManifest.bytes, sha256: localeManifest.sha256 }, actual: digest }));
      }
      const summary = { path: relativeManifestPath(manifestPath, options.repositoryRoot), kind: "pest_disease" as const, status: "review_only" as const, locales: localCount };
      manifests.push(summary);
      appendFingerprint(manifestPath, raw, summary);
      continue;
    }
      const manifest = raw as unknown as PlantContentManifest;
      const target = targetForPlantCode(db, manifest.plant_code, manifestPath);
      let localCount = 0;
      let manifestProposed = 0;
      if (!target) findings.push(finding("blocked", "MISSING_PLANT_TARGET", manifestPath, `No SQLite plant has immutable plant_code ${manifest.plant_code}`, { plantCode: manifest.plant_code }));
      else {
        findings.push(...compareManifestToTarget(db, manifest, target, manifestPath));
        // Plant Markdown may link to pest/disease detail. When an explicit
        // catalog snapshot accompanies the proposal, validate the source
        // files as part of the same dry-run fingerprint/gate.
        if (catalogProvided) {
          findings.push(...validatePlantMarkdownPestLinks({
            contentRoot: path.dirname(manifestPath),
            catalog: catalogSnapshot,
          }).findings);
        }
        const rows = i18nRows(db, target.row.id);
      for (const [locale, localeManifest] of Object.entries(manifest.locales)) {
        localCount++;
        locales++;
        findings.push(...contentGate(localeManifest, manifestPath, locale));
        const filePath = fileWithinDirectory(path.dirname(manifestPath), localeManifest.file);
        if (!filePath || !fs.existsSync(filePath)) {
          findings.push(finding("blocked", "CONTENT_FILE_MISSING", manifestPath, `Locale ${locale} Markdown file is missing`, { locale, file: localeManifest.file }));
          continue;
        }
        const digest = exactUtf8Digest(fs.readFileSync(filePath));
        if (digest.bytes !== localeManifest.bytes || digest.sha256 !== localeManifest.sha256) {
          findings.push(finding("blocked", "CONTENT_HASH_MISMATCH", manifestPath, `Locale ${locale} Markdown bytes differ from manifest`, { locale, expected: { bytes: localeManifest.bytes, sha256: localeManifest.sha256 }, actual: digest }));
          continue;
        }
        const row = rows.get(normalizeLocale(locale));
        if (!row) {
          findings.push(finding("blocked", "DATABASE_LOCALE_MISSING", manifestPath, `SQLite target has no ${locale} locale row`, { plantId: target.row.id, locale }));
          continue;
        }
        const databaseDigestValue = row.care_content === null || row.care_content === "" ? null : exactUtf8Digest(row.care_content).sha256;
        if (databaseDigestValue === localeManifest.sha256) {
          unchanged++;
          continue;
        }
        if (databaseDigestValue !== null) {
          conflicts++;
          const resolution = localeManifest.conflict_resolution;
          const canReplace = Boolean(resolution && localeManifest.review_status === "reviewed" && localeManifest.source_refs.length > 0 && resolution.resolution === "replace_database" && resolution.reviewedBy.trim() && resolution.reviewedAt.trim() && resolution.reason.trim());
          if (!canReplace || localeManifest.content_version <= safePositiveVersion(row.content_version)) findings.push(finding("blocked", "CONTENT_HASH_CONFLICT", manifestPath, `Locale ${locale} would overwrite different SQLite bytes without a newer reviewed resolution`, { locale, databaseSha256: databaseDigestValue, manifestSha256: localeManifest.sha256, databaseVersion: row.content_version, manifestVersion: localeManifest.content_version }));
          else findings.push(finding("warning", "CONTENT_HASH_CONFLICT_REVIEWED", manifestPath, `Locale ${locale} has an explicit newer reviewed replacement`, { locale }));
        }
        proposed++;
        manifestProposed++;
      }
    }
    const manifestDirectory = path.dirname(manifestPath);
    const blocked = findings.some((item) => item.severity === "blocked" && (
      item.path === manifestPath || item.path.startsWith(`${manifestDirectory}${path.sep}`)
    ));
    const summary = { path: relativeManifestPath(manifestPath, options.repositoryRoot), kind: "plant" as const, targetId: target?.row.id, status: blocked ? "blocked" as const : manifestProposed > 0 ? "proposed" as const : "unchanged" as const, locales: localCount };
    manifests.push(summary);
    appendFingerprint(manifestPath, raw, summary);
  }
  const blocked = findings.some((item) => item.severity === "blocked");
  const proposalFingerprintValue = proposalFingerprint({
    targetDbRevision,
    manifestPaths,
    catalogSnapshot,
    catalogProvided,
    manifests: fingerprintManifests,
  });
  return {
    schema_version: CONTENT_MANIFEST_SCHEMA_VERSION,
    mode: "dry_run",
    status: blocked ? "blocked" : "ready",
    database_sha256: targetDbRevision,
    target_db_revision: targetDbRevision,
    manifest_paths: manifestPaths,
    catalog_snapshot: catalogSnapshot,
    catalog_provided: catalogProvided,
    catalog_sha256: catalogSha256,
    proposal_fingerprint: proposalFingerprintValue,
    manifests,
    findings,
    summary: {
      manifests: manifests.length,
      locales,
      proposed,
      unchanged,
      conflicts,
      blocked: findings.filter((item) => item.severity === "blocked").length,
    },
  };
}

function syncPayload(db: SqliteDatabase, plant: DbPlantRow): Record<string, unknown> {
  const rows = db.prepare(`SELECT * FROM master_plant_i18n WHERE master_plant_id = ? ORDER BY locale ASC`).all(plant.id) as DbI18nRow[];
  const i18n = Object.fromEntries(rows.map((row) => [row.locale, {
    common_name: row.common_name,
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.care_content !== null ? { care_content: row.care_content } : {}),
    content_version: row.content_version,
    content_status: row.content_status,
    review_status: row.review_status,
    content_origin: row.content_origin,
    ...(row.source ? { source: row.source } : {}),
    ...(row.source_url ? { source_url: row.source_url } : {}),
    source_refs: parseSourceRefs(row.source_refs_json),
  }]));
  return {
    plant_code: plant.plant_code,
    common_name: plant.common_name,
    scientific_name: plant.scientific_name,
    source_system: plant.source_system ?? "sqlite",
    source_id: plant.source_id ?? `sqlite-local-${plant.id}`,
    canonical_identity_version: plant.canonical_identity_version,
    canonical_key: plant.canonical_key,
    genus: plant.genus,
    species: plant.species,
    infraspecific_rank: plant.infraspecific_rank,
    infraspecific_name: plant.infraspecific_name,
    cultivar: plant.cultivar,
    identity_scope: plant.identity_scope,
    parent_master_plant_id: plant.parent_master_plant_id,
    parent_canonical_key: plant.parent_canonical_key,
    i18n,
  };
}

/**
 * Apply is deliberately separate from dry-run. Callers must pass the exact
 * report produced from the same database bytes and an authenticated admin
 * decision; this helper never processes the outbox or publishes remotely.
 */
export function applyContentImport(
  db: SqliteDatabase,
  report: ContentImportReport,
  options: { authorized: boolean; runId: string; manifestPaths?: string[]; repositoryRoot?: string; catalog?: readonly PestDiseaseCatalogEntry[] },
): ContentApplyResult {
  if (!options.authorized) throw new Error("CONTENT_IMPORT_ADMIN_AUTH_REQUIRED");
  if (report.mode !== "dry_run" || report.status !== "ready") throw new Error("CONTENT_IMPORT_DRY_RUN_REQUIRED");
  const beforeHash = databaseDigest(db);
  if (beforeHash !== report.database_sha256 || beforeHash !== report.target_db_revision) throw new Error("CONTENT_IMPORT_STALE_DRY_RUN");
  const fresh = dryRunContentImport(db, {
    manifestPaths: options.manifestPaths,
    repositoryRoot: options.repositoryRoot,
    catalog: options.catalog,
  });
  const proposalMatches = fresh.proposal_fingerprint === report.proposal_fingerprint
    && fresh.target_db_revision === report.target_db_revision
    && fresh.database_sha256 === report.database_sha256
    && stableJson(fresh.manifest_paths) === stableJson(report.manifest_paths)
    && stableJson(fresh.manifests) === stableJson(report.manifests)
    && stableJson(fresh.catalog_snapshot) === stableJson(report.catalog_snapshot)
    && fresh.catalog_provided === report.catalog_provided
    && fresh.catalog_sha256 === report.catalog_sha256;
  if (!proposalMatches) throw new Error("CONTENT_IMPORT_PROPOSAL_MISMATCH");
  if (fresh.status !== "ready") throw new Error("CONTENT_IMPORT_FRESHNESS_FAILED");
  const paths = manifestFiles({ manifestPaths: options.manifestPaths, repositoryRoot: options.repositoryRoot });
  let updatedLocales = 0;
  let queuedOutbox = 0;
  db.transaction(() => {
    for (const manifestPath of paths) {
      const raw = readJson(manifestPath);
      if (!isRecord(raw) || raw.kind !== "plant") continue;
      const manifest = raw as unknown as PlantContentManifest;
      const target = targetForPlantCode(db, manifest.plant_code, manifestPath);
      if (!target) throw new Error(`CONTENT_IMPORT_TARGET_MISSING:${manifest.plant_code}`);
      for (const [locale, localeManifest] of Object.entries(manifest.locales)) {
        const filePath = fileWithinDirectory(path.dirname(manifestPath), localeManifest.file);
        if (!filePath) throw new Error(`CONTENT_IMPORT_FILE_INVALID:${manifestPath}:${locale}`);
        const markdown = fs.readFileSync(filePath, "utf8");
        const digest = exactUtf8Digest(markdown);
        if (digest.bytes !== localeManifest.bytes || digest.sha256 !== localeManifest.sha256) throw new Error(`CONTENT_IMPORT_HASH_CHANGED:${manifestPath}:${locale}`);
        const updated = db.prepare(`
          UPDATE master_plant_i18n
          SET care_content = ?, content_version = ?, content_status = ?, review_status = ?,
              content_origin = ?, source_refs_json = ?, updated_at = datetime('now')
          WHERE master_plant_id = ? AND locale = ?
        `).run(markdown, localeManifest.content_version, localeManifest.content_status, localeManifest.review_status, localeManifest.content_origin, JSON.stringify(localeManifest.source_refs), target.row.id, locale);
        if (updated.changes !== 1) throw new Error(`CONTENT_IMPORT_DATABASE_LOCALE_MISSING:${target.row.id}:${locale}`);
        updatedLocales++;
        const sourceId = target.row.source_id ?? `sqlite-local-${target.row.id}`;
        enqueueSyncOutbox(db, {
          entityType: "master_plant",
          sourceSystem: target.row.source_system ?? "sqlite",
          sourceId,
          operation: "upsert_i18n",
          locale,
          payload: syncPayload(db, target.row),
        });
        queuedOutbox++;
      }
    }
  })();
  return { mode: "apply", status: "applied", runId: options.runId, database_sha256_before: beforeHash, database_sha256_after: databaseDigest(db), updatedLocales, queuedOutbox };
}

export function generatePestDiseaseManifest(options: {
  directoryPath: string;
  catalog: readonly PestDiseaseCatalogEntry[];
  requiredLocales?: readonly string[];
}): ManifestResult<PestDiseaseContentManifest> {
  const directoryPath = path.resolve(options.directoryPath);
  const manifestPath = path.join(directoryPath, CONTENT_MANIFEST_FILE);
  if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) return { manifest: null, findings: [finding("blocked", "CONTENT_DIRECTORY_MISSING", manifestPath, `Content directory does not exist: ${directoryPath}`)], manifestPath };
  const key = path.basename(directoryPath);
  const candidates = options.catalog.filter((entry) => entry.key === key);
  const findings: ContentFinding[] = [];
  if (candidates.length === 0) findings.push(finding("blocked", "MISSING_PEST_DISEASE_TARGET", manifestPath, `No stable pest/disease key ${key} exists in the catalog`, { key }));
  if (candidates.length > 1) findings.push(finding("blocked", "AMBIGUOUS_PEST_DISEASE_TARGET", manifestPath, `Stable pest/disease key ${key} occurs more than once in the catalog`, { key }));
  const files = localeFiles(directoryPath, manifestPath);
  findings.push(...files.findings, ...checkRequiredLocales(files.files.keys(), manifestPath, options.requiredLocales ?? REQUIRED_CONTENT_LOCALES));
  const existing = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;
  if (existing && (!isRecord(existing) || existing.kind !== "pest_disease" || existing.key !== key || existing.type !== candidates[0]?.type)) findings.push(finding("blocked", "MANIFEST_IDENTITY_DRIFT", manifestPath, "Existing pest/disease manifest identity does not match the stable catalog key"));
  if (!candidates[0]) return { manifest: null, findings, manifestPath };
  const existingLocales = isRecord(existing) && isRecord(existing.locales) ? existing.locales as Record<string, ContentLocaleManifest> : {};
  const manifest: PestDiseaseContentManifest = {
    schema_version: CONTENT_MANIFEST_SCHEMA_VERSION,
    kind: "pest_disease",
    key,
    type: candidates[0].type,
    locales: Object.fromEntries([...files.files.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([locale, file]) => [locale, localeManifestFromFile(locale, file, existingLocales[locale])])),
  };
  findings.push(...validatePestDiseaseManifest(manifest, manifestPath).findings);
  return { manifest, findings, manifestPath };
}

export function refreshPestDiseaseManifests(options: {
  contentRoot: string;
  catalog: readonly PestDiseaseCatalogEntry[];
  write?: boolean;
  requiredLocales?: readonly string[];
}): WorkspaceRefreshResult {
  const root = path.resolve(options.contentRoot);
  const manifests: WorkspaceRefreshResult["manifests"] = [];
  const findings: ContentFinding[] = [];
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return { kind: "pest_disease", mode: options.write ? "write" : "dry_run", manifests: [], findings: [finding("blocked", "CONTENT_ROOT_MISSING", root, `Pest/disease content root does not exist: ${root}`)], summary: { directories: 0, generated: 0, blocked: 1, locales: 0 } };
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
    const result = generatePestDiseaseManifest({ directoryPath: path.join(root, entry.name), catalog: options.catalog, requiredLocales: options.requiredLocales });
    const blocked = result.findings.some((item) => item.severity === "blocked");
    if (options.write && !blocked && result.manifest) writeJson(result.manifestPath, result.manifest);
    manifests.push({
      directory: entry.name,
      manifestPath: result.manifestPath,
      status: blocked ? "blocked" : "generated",
      locales: Object.keys(result.manifest?.locales ?? {}).length,
      findings: result.findings,
    });
    findings.push(...result.findings);
  }
  return {
    kind: "pest_disease",
    mode: options.write ? "write" : "dry_run",
    manifests,
    findings,
    summary: {
      directories: manifests.length,
      generated: manifests.filter((item) => item.status !== "blocked").length,
      blocked: manifests.filter((item) => item.status === "blocked").length,
      locales: manifests.reduce((sum, item) => sum + item.locales, 0),
    },
  };
}
