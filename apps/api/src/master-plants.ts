import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { ZodError, z } from "zod";

import type { ConvexPlantLibraryItem, ConvexSyncService } from "./convex-sync";
import type { SqliteDatabase } from "./db";
import { requireRole } from "./auth";
import {
  REQUIRED_CARE_FIELDS,
  recomputeCareStatus,
} from "../../../packages/shared/src/plantCareStatus";
import {
  PROPAGATION_METHODS,
  normalizePropagationMethods,
} from "../../../packages/shared/src/plantPropagation";
import {
  extractLegacyCanonicalIdentityFields,
  normalizeCanonicalIdentityToken,
  validateCanonicalPlantIdentity,
} from "../../../packages/shared/src/canonicalPlantIdentity";
import {
  CanonicalIdentityMigrationError,
  assertStructuredCanonicalIdentity,
  hasExplicitCanonicalIdentityFields,
  hasCompleteStructuredCanonicalIdentity,
  previewCanonicalIdentityMatch,
  resolveCanonicalIdentityForWrite,
  type SqliteCanonicalIdentityFields,
} from "./sqlite-canonical-identity";
import {
  SUBDIVISION_CODE_PATTERN,
  TERM_CODE_PATTERN,
  isValidCountryCode,
} from "../../../packages/shared/src/countries";
import { ADAPTATION_TERMS } from "../../../packages/shared/src/adaptationTerms";
import {
  enqueueSyncOutbox,
  evaluatePayloadApproval,
  processSyncOutbox,
  retryFailedSyncOutbox,
} from "./sync-outbox";
import { sanitizeAuthoringPlantPayload } from "./content-approval";
import { listPendingCareApprovals } from "./care-approval-notifications";

const growthStageSchema = z.enum(["seedling", "vegetative", "flowering", "harvest"]);
const contentStatusSchema = z.enum(["draft", "published", "needs_review", "archived"]);
const reviewStatusSchema = z.enum(["unreviewed", "in_review", "reviewed"]);
const careStatusSchema = z.enum(["missing", "awaiting_review", "verified", "not_applicable"]);
const contentOriginSchema = z.enum(["authored", "inherited", "imported"]);

const sourceRefSchema = z.object({
  sourceSystem: z.string().trim().max(80).nullish(),
  sourceName: z.string().trim().max(240).nullish(),
  sourceUrl: z.string().url().nullish(),
  sourceLocator: z.string().trim().max(240).nullish(),
});

const careFieldEvidenceSchema = z.record(
  z.string(),
  z.object({
    status: careStatusSchema,
    sourceSystem: z.string().trim().max(80).nullish(),
    sourceName: z.string().trim().max(240).nullish(),
    sourceUrl: z.string().url().nullish(),
    sourceLocator: z.string().trim().max(240).nullish(),
    sourceRefs: z.array(z.object({
      sourceSystem: z.string().trim().max(80).nullish(),
      sourceName: z.string().trim().max(240).nullish(),
      sourceUrl: z.string().url().nullish(),
      sourceLocator: z.string().trim().max(240).nullish(),
    })).max(50).optional(),
    fetchedAt: z.number().nullish(),
    reviewedAt: z.number().nullish(),
    reviewedBy: z.string().trim().max(240).nullish(),
  }),
);

const localeContentSchema = z.object({
  common_name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(5000).nullish(),
  care_content: z.string().max(50000).nullish(),
  content_updated_at: z.string().datetime().nullish(),
  content_version: z.number().int().positive().optional(),
  source: z.string().trim().max(240).nullish(),
  source_url: z.string().url().nullish(),
  content_status: contentStatusSchema.optional(),
  review_status: reviewStatusSchema.optional(),
  reviewed_at: z.string().datetime().nullish(),
  reviewed_by: z.string().trim().max(240).nullish(),
  content_origin: contentOriginSchema.optional(),
  source_refs: z.array(z.object({
    sourceSystem: z.string().trim().max(80).nullish(),
    sourceName: z.string().trim().max(240).nullish(),
    sourceUrl: z.string().url().nullish(),
    sourceLocator: z.string().trim().max(240).nullish(),
  })).max(50).optional(),
});

const masterPlantObjectSchema = z.object({
  plant_code: z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9_-]+$/),
  common_name: z.string().trim().min(1).max(120).optional(),
  scientific_name: z.string().trim().max(160).nullish(),
  // CID-3 structured identity fields.  They remain additive to preserve the
  // existing dashboard payload while the compatibility writer derives a
  // deterministic identity from legacy scientific_name values during rollout.
  genus: z.string().trim().max(120).nullish(),
  species: z.string().trim().max(160).nullish(),
  infraspecific_rank: z.string().trim().max(24).nullish(),
  infraspecific_name: z.string().trim().max(160).nullish(),
  cultivar: z.string().trim().max(240).nullish(),
  identity_scope: z.enum(["base", "cultivar"]).nullish(),
  // CamelCase aliases are accepted at the API boundary; persisted output is
  // always the snake_case SQLite shape.
  infraspecificRank: z.string().trim().max(24).nullish(),
  infraspecificName: z.string().trim().max(160).nullish(),
  identityScope: z.enum(["base", "cultivar"]).nullish(),
  scope: z.enum(["base", "cultivar"]).nullish(),
  parent_master_plant_id: z.number().int().positive().nullish(),
  parent_canonical_key: z.string().trim().max(500).nullish(),
  parentMasterPlantId: z.number().int().positive().nullish(),
  parentCanonicalKey: z.string().trim().max(500).nullish(),
  source_system: z.string().trim().min(1).max(80).default("sqlite"),
  source_id: z.string().trim().max(240).nullish(),
  record_version: z.number().int().positive().default(1),
  category: z.string().trim().min(1).max(80).default("general"),
  group: z.string().trim().min(1).max(80).default("other"),
  family: z.string().trim().max(120).nullish(),
  purposes: z.array(z.string()).default([]),
  growth_stage: growthStageSchema.default("seedling"),
  typical_days_to_harvest: z.number().int().min(0).nullish(),
  germination_days: z.number().int().min(0).nullish(),
  watering_frequency_days: z.number().int().min(0).nullish(),
  fertilizing_frequency_days: z.number().int().min(0).nullish(),
  soil_ph_min: z.number().min(0).max(14).nullish(),
  soil_ph_max: z.number().min(0).max(14).nullish(),
  moisture_target: z.number().int().min(0).max(100).nullish(),
  light_hours: z.number().int().min(0).max(24).nullish(),
  light_requirements: z.string().trim().max(120).nullish(),
  spacing_cm: z.number().min(0).nullish(),
  max_plants_per_m2: z.number().min(0).nullish(),
  seed_rate_per_m2: z.number().min(0).nullish(),
  water_liters_per_m2: z.number().min(0).nullish(),
  yield_kg_per_m2: z.number().min(0).nullish(),
  image_url: z.string().url().nullish(),
  is_active: z.boolean().default(true),
  notes: z.string().max(5000).nullish(),
  source_url: z.string().url().nullish(),
  content_status: contentStatusSchema.default("published"),
  content_version: z.number().int().positive().default(1),
  review_status: reviewStatusSchema.default("unreviewed"),
  reviewed_at: z.string().datetime().nullish(),
  reviewed_by: z.string().trim().max(240).nullish(),
  sync_origin: z.enum(["local", "convex", "mirror"]).default("local"),
  metadata_json: z.record(z.string(), z.unknown()).default({}),
  care_status: careStatusSchema.optional(),
  care_field_evidence: careFieldEvidenceSchema.optional(),
  // [] must remain distinguishable from an omitted PATCH field: [] clears,
  // while omission preserves the current list during merge.
  propagation_methods: z.array(z.enum(PROPAGATION_METHODS)).max(PROPAGATION_METHODS.length).optional(),
  // Plant geography adaptation (design doc §2.3). Same []-clears / omission-
  // preserves convention; Convex remains the authoritative term catalog, so
  // term codes are structurally validated here and catalog-validated on save.
  origin_countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(64).optional(),
  // Provenance for origin/adaptation assignments (design doc §1.5): keyed by
  // code, applied together with the category's replace semantics.
  origin_country_source_refs: z.record(z.string(), z.array(sourceRefSchema)).optional(),
  proven_regions: z.array(z.object({
    country_code: z.string().regex(/^[A-Z]{2}$/),
    // Shape-only here so malformed subdivision codes reach the geography
    // validator and return a distinct error message (design doc §6.4).
    subdivision_code: z.string().max(6).optional(),
    source_refs: z.array(sourceRefSchema).optional(),
  })).max(128).optional(),
  adaptation_term_codes: z.array(z.string().regex(TERM_CODE_PATTERN)).max(64).optional(),
  adaptation_term_source_refs: z.record(z.string(), z.array(sourceRefSchema)).optional(),
  i18n: z
    .object({
      vi: localeContentSchema,
      en: localeContentSchema,
      es: localeContentSchema.optional(),
      fr: localeContentSchema.optional(),
      pt: localeContentSchema.optional(),
      zh: localeContentSchema.optional(),
    })
    .optional(),
});

const createMasterPlantSchema = masterPlantObjectSchema
  .superRefine((data, ctx) => {
    if (!data.common_name && !data.i18n?.vi?.common_name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "common_name or i18n.vi.common_name is required",
        path: ["common_name"],
      });
    }

    if (!data.i18n?.vi || !data.i18n?.en) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "i18n with both vi and en is required",
        path: ["i18n"],
      });
    }

    if (
      typeof data.soil_ph_min === "number" &&
      typeof data.soil_ph_max === "number" &&
      data.soil_ph_min > data.soil_ph_max
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "soil_ph_min must be <= soil_ph_max",
        path: ["soil_ph_min"],
      });
    }
  });

const updateMasterPlantSchema = masterPlantObjectSchema
  .partial()
  .superRefine((data, ctx) => {
    if (data.i18n && (!data.i18n.vi || !data.i18n.en)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "i18n must include both vi and en",
        path: ["i18n"],
      });
    }

    if (
      typeof data.soil_ph_min === "number" &&
      typeof data.soil_ph_max === "number" &&
      data.soil_ph_min > data.soil_ph_max
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "soil_ph_min must be <= soil_ph_max",
        path: ["soil_ph_min"],
      });
    }

    // Existing rows may still be edited with scientific_name-only payloads;
    // that compatibility path is intentionally update-only.  Once a caller
    // starts supplying structured identity, require the complete tuple so a
    // PATCH cannot retain a stale canonical key after a partial identity edit.
    if (hasExplicitCanonicalIdentityFields(data) && !hasCompleteStructuredCanonicalIdentity(data)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "structured identity updates require genus, species, rank, infraspecificName, cultivar, scope, and parent fields",
        path: ["canonical_identity"],
      });
    }
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field is required for update",
  });

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  group: z.string().trim().max(80).optional(),
  group_filter: z.string().trim().max(80).optional(),
  missing_i18n: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((value) => value === "true" || value === "1"),
  filter_missing_i18n: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((value) => value === "true" || value === "1"),
  no_image: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((value) => value === "true" || value === "1"),
  filter_no_image: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((value) => value === "true" || value === "1"),
  view_mode: z.enum(["common", "family"]).default("common"),
  source: z.enum(["auto", "convex", "sqlite"]).default("auto"),
  is_active: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((value) => {
      if (!value) {
        return undefined;
      }

      return value === "true" || value === "1";
    }),
});

/** Normalize user-entered search text for local, accent-insensitive matching. */
export function normalizePlantSearchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

interface MasterPlantRow {
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
  canonical_archived_at?: string | null;
  canonical_archived_into_id?: number | null;
  canonical_archive_reason?: string | null;
  source_system: string;
  source_id: string | null;
  record_version: number;
  category: string;
  group: string;
  family: string | null;
  purposes_json: string;
  growth_stage: string;
  typical_days_to_harvest: number | null;
  germination_days: number | null;
  watering_frequency_days: number | null;
  fertilizing_frequency_days: number | null;
  soil_ph_min: number | null;
  soil_ph_max: number | null;
  moisture_target: number | null;
  light_hours: number | null;
  light_requirements: string | null;
  spacing_cm: number | null;
  max_plants_per_m2: number | null;
  seed_rate_per_m2: number | null;
  water_liters_per_m2: number | null;
  yield_kg_per_m2: number | null;
  image_url: string | null;
  is_active: number;
  notes: string | null;
  metadata_json: string;
  source_url: string | null;
  content_status: string;
  content_version: number;
  review_status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  sync_origin: string;
  care_status: string;
  care_field_evidence_json: string;
  propagation_methods_json: string;
  created_at: string;
  updated_at: string;
}

interface MasterPlantI18nRow {
  id: number;
  master_plant_id: number;
  locale: string;
  common_name: string;
  description: string | null;
  care_content: string | null;
  content_updated_at: string | null;
  content_version: number;
  source: string | null;
  source_url: string | null;
  content_status: string;
  review_status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  content_origin: string;
  source_refs_json: string;
  created_at: string;
  updated_at: string;
}

function parseJson(rawValue: string): any {
  try {
    const parsed = JSON.parse(rawValue);
    return parsed;
  } catch {
    return null;
  }
}

// SQLite stores the care profile as flat snake_case columns while the shared
// recompute rule works on camelCase required fields.
const SNAKE_TO_CAMEL_CARE_FIELD: Record<string, string> = {
  watering_frequency_days: "wateringFrequencyDays",
  fertilizing_frequency_days: "fertilizingFrequencyDays",
  light_requirements: "lightRequirements",
  light_hours: "lightHours",
  soil_ph_min: "soilPhMin",
  soil_ph_max: "soilPhMax",
  moisture_target: "moistureTarget",
  typical_days_to_harvest: "typicalDaysToHarvest",
  germination_days: "germinationDays",
};

/** Preserve legacy single-source evidence while exposing canonical refs. */
function normalizeCareFieldEvidenceMap(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, unknown> = {};
  for (const [field, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      output[field] = raw;
      continue;
    }
    const entry = raw as Record<string, unknown>;
    const refs = Array.isArray(entry.sourceRefs)
      ? entry.sourceRefs.filter((ref) => ref && typeof ref === "object" && !Array.isArray(ref))
      : [];
    if (refs.length === 0 && (entry.sourceSystem || entry.sourceName || entry.sourceUrl || entry.sourceLocator)) {
      refs.push({
        ...(entry.sourceSystem ? { sourceSystem: entry.sourceSystem } : {}),
        ...(entry.sourceName ? { sourceName: entry.sourceName } : {}),
        ...(entry.sourceUrl ? { sourceUrl: entry.sourceUrl } : {}),
        ...(entry.sourceLocator ? { sourceLocator: entry.sourceLocator } : {}),
      });
    }
    output[field] = { ...entry, ...(refs.length > 0 ? { sourceRefs: refs } : {}) };
  }
  return output;
}

function normalizePropagationSourceRefs(value: unknown): Array<Record<string, string>> {
  let parsed = value;
  if (typeof value === "string") parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((ref) => {
    if (!ref || typeof ref !== "object" || Array.isArray(ref)) return [];
    const normalized: Record<string, string> = {};
    for (const key of ["sourceSystem", "sourceName", "sourceUrl", "sourceLocator"]) {
      const value = (ref as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) normalized[key] = value.trim();
    }
    return Object.keys(normalized).length > 0 ? [normalized] : [];
  });
}

// Resolve the persisted record-level careStatus for a master-plant payload.
// Contract (Giai đoạn 0): whenever the payload changes care fields or
// evidence, the aggregate MUST be recomputed — a stale persisted value carried
// through a merge (e.g. from normalizeMasterPlant) must never win. An explicit
// care_status is only honored when the payload touches no care data.
export function resolveCareStatus(payload: {
  care_status?: string;
  care_field_evidence?: Record<string, unknown>;
  [field: string]: unknown;
}): string {
  const careFields: Record<string, unknown> = {};
  for (const [snake, camel] of Object.entries(SNAKE_TO_CAMEL_CARE_FIELD)) {
    careFields[camel] = payload[snake];
  }
  if (carePayloadHasChanges(payload)) {
    const evidence = payload.care_field_evidence ?? {};
    return recomputeCareStatus(careFields, evidence as any);
  }
  return payload.care_status ?? "missing";
}

// True when the payload carries any care profile change (fields, evidence or
// an explicit status). I18n-only/taxonomy-only updates must not recompute the
// aggregate from the partial payload and silently downgrade a verified status.
export function carePayloadHasChanges(payload: {
  care_status?: string;
  care_field_evidence?: Record<string, unknown>;
  [field: string]: unknown;
}): boolean {
  if (payload.care_status !== undefined) return true;
  if (payload.care_field_evidence !== undefined) return true;
  return Object.keys(SNAKE_TO_CAMEL_CARE_FIELD).some((snake) => payload[snake] !== undefined);
}

// --- Plant geography adaptation (design doc §2.2, §3) -----------------------

interface OriginCountryJoinRow {
  country_code: string;
  source_refs_json: string;
}

interface ProvenRegionJoinRow {
  country_code: string;
  subdivision_code: string | null;
  source_refs_json: string;
}

interface AdaptationTermJoinRow {
  term_code: string;
  source_refs_json: string;
}

type GeographySource = "own" | "inherited" | "none";

export interface ResolvedGeography {
  origin_country_codes: string[];
  origin_country_source: GeographySource;
  proven_regions: Array<{ country_code: string; subdivision_code?: string }>;
  proven_region_source: GeographySource;
  adaptation_term_codes: string[];
  adaptation_term_source: GeographySource;
  inherited_from_id: number | null;
}

function readPlantOriginCountries(db: SqliteDatabase, plantId: number) {
  return db.prepare(
    `SELECT country_code, source_refs_json FROM plant_origin_countries WHERE master_plant_id = ? ORDER BY id`,
  ).all(plantId) as OriginCountryJoinRow[];
}

function readPlantProvenRegions(db: SqliteDatabase, plantId: number) {
  return db.prepare(
    `SELECT country_code, subdivision_code, source_refs_json FROM plant_proven_regions WHERE master_plant_id = ? ORDER BY id`,
  ).all(plantId) as ProvenRegionJoinRow[];
}

function readPlantAdaptationTerms(db: SqliteDatabase, plantId: number) {
  return db.prepare(
    `SELECT term_code, source_refs_json FROM plant_adaptation_terms WHERE master_plant_id = ? ORDER BY id`,
  ).all(plantId) as AdaptationTermJoinRow[];
}

/**
 * Base-plant lookup for inheritance: same species key, display base, not self.
 * The optional baseLookup (species key -> base row) lets bulk callers that
 * already loaded every row resolve inheritance without one full-table scan
 * per normalized plant; when absent, the legacy per-row query is used.
 */
function findSqliteBasePlant(
  db: SqliteDatabase,
  row: MasterPlantRow,
  baseLookup?: Map<string, MasterPlantRow>,
): MasterPlantRow | undefined {
  const speciesKey = sqliteSpeciesKey(row);
  if (!speciesKey) return undefined;
  if (baseLookup) return baseLookup.get(speciesKey);
  const siblings = db.prepare(`SELECT * FROM master_plants WHERE id != ?`).all(row.id) as MasterPlantRow[];
  return siblings.find((candidate) =>
    sqliteSpeciesKey(candidate) === speciesKey && isSqliteDisplayBasePlant(candidate),
  );
}

/**
 * Category-level fallback (design doc §3.2): own rows win; a cultivar with no
 * own rows in a category inherits the base plant's rows with `source:
 * "inherited"`. Base rows are never modified by cultivar edits — resolution is
 * read-time, so base edits propagate to cultivars automatically.
 */
export function resolvePlantGeography(
  db: SqliteDatabase,
  row: MasterPlantRow,
  baseLookup?: Map<string, MasterPlantRow>,
): ResolvedGeography {
  const ownOrigins = readPlantOriginCountries(db, row.id);
  const ownProven = readPlantProvenRegions(db, row.id);
  const ownTerms = readPlantAdaptationTerms(db, row.id);
  const base = !isSqliteDisplayBasePlant(row) ? findSqliteBasePlant(db, row, baseLookup) : undefined;

  const origins = ownOrigins.length > 0
    ? { items: ownOrigins, source: "own" as GeographySource, fromId: row.id }
    : base
      ? readPlantOriginCountries(db, base.id).length > 0
        ? { items: readPlantOriginCountries(db, base.id), source: "inherited" as GeographySource, fromId: base.id }
        : { items: [] as OriginCountryJoinRow[], source: "none" as GeographySource, fromId: null }
      : { items: [] as OriginCountryJoinRow[], source: "none" as GeographySource, fromId: null };
  const proven = ownProven.length > 0
    ? { items: ownProven, source: "own" as GeographySource, fromId: row.id }
    : base
      ? readPlantProvenRegions(db, base.id).length > 0
        ? { items: readPlantProvenRegions(db, base.id), source: "inherited" as GeographySource, fromId: base.id }
        : { items: [] as ProvenRegionJoinRow[], source: "none" as GeographySource, fromId: null }
      : { items: [] as ProvenRegionJoinRow[], source: "none" as GeographySource, fromId: null };
  const terms = ownTerms.length > 0
    ? { items: ownTerms, source: "own" as GeographySource, fromId: row.id }
    : base
      ? readPlantAdaptationTerms(db, base.id).length > 0
        ? { items: readPlantAdaptationTerms(db, base.id), source: "inherited" as GeographySource, fromId: base.id }
        : { items: [] as AdaptationTermJoinRow[], source: "none" as GeographySource, fromId: null }
      : { items: [] as AdaptationTermJoinRow[], source: "none" as GeographySource, fromId: null };

  const anyInherited = origins.source === "inherited" || proven.source === "inherited" || terms.source === "inherited";

  return {
    origin_country_codes: origins.items.map((item) => item.country_code),
    origin_country_source: origins.source,
    proven_regions: proven.items.map((item) => ({
      country_code: item.country_code,
      ...(item.subdivision_code ? { subdivision_code: item.subdivision_code } : {}),
    })),
    proven_region_source: proven.source,
    adaptation_term_codes: terms.items.map((item) => item.term_code),
    adaptation_term_source: terms.source,
    inherited_from_id: anyInherited ? base?.id ?? null : null,
  };
}

/** Validation error mapped to HTTP 400 by `handleMasterPlantsError`. */
export class PlantGeographyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlantGeographyValidationError";
  }
}

/**
 * Fail-closed assignment validation (design doc §2.4, resolved archived
 * rule): unknown country codes and malformed subdivision codes are always
 * rejected; unknown term codes are rejected when the mirror is populated
 * (never hydrated → Convex remains the authoritative gate and structurally
 * valid codes pass). An archived term code is rejected only when it is not
 * already assigned to the plant — matching Convex, so re-saving a plant that
 * holds an archived assignment (e.g. an unrelated field edit from the
 * dashboard) succeeds while a new assignment to it fails.
 * Errors distinguish invalid country, malformed subdivision, unknown term,
 * and archived term.
 */
export function validatePlantGeography(
  db: SqliteDatabase,
  plantId: number | null,
  payload: { origin_countries?: string[]; proven_regions?: Array<{ country_code: string; subdivision_code?: string }>; adaptation_term_codes?: string[] },
): void {
  const originCodes = payload.origin_countries ?? [];
  const seenOriginCodes = new Set<string>();
  for (const code of originCodes) {
    if (seenOriginCodes.has(code)) {
      throw new PlantGeographyValidationError(`Duplicate origin country assignment: ${code}`);
    }
    seenOriginCodes.add(code);
  }

  const seenProvenRegions = new Set<string>();
  for (const region of payload.proven_regions ?? []) {
    const key = `${region.country_code}\u0000${region.subdivision_code ?? ""}`;
    if (seenProvenRegions.has(key)) {
      const suffix = region.subdivision_code ? `/${region.subdivision_code}` : "";
      throw new PlantGeographyValidationError(
        `Duplicate proven region assignment: ${region.country_code}${suffix}`,
      );
    }
    seenProvenRegions.add(key);
  }

  const seenTermCodes = new Set<string>();
  for (const code of payload.adaptation_term_codes ?? []) {
    if (seenTermCodes.has(code)) {
      throw new PlantGeographyValidationError(`Duplicate adaptation term assignment: ${code}`);
    }
    seenTermCodes.add(code);
  }

  for (const code of originCodes) {
    if (!isValidCountryCode(code)) {
      throw new PlantGeographyValidationError(`Unknown country code: ${code}`);
    }
  }
  for (const region of payload.proven_regions ?? []) {
    if (!isValidCountryCode(region.country_code)) {
      throw new PlantGeographyValidationError(`Unknown country code: ${region.country_code}`);
    }
    if (region.subdivision_code !== undefined && !SUBDIVISION_CODE_PATTERN.test(region.subdivision_code)) {
      throw new PlantGeographyValidationError(`Invalid subdivision code: ${region.subdivision_code}`);
    }
  }
  if (payload.adaptation_term_codes === undefined) return;
  const mirror = db.prepare(`SELECT code, status FROM adaptation_terms`).all() as Array<{ code: string; status: string }>;
  if (mirror.length === 0) return;
  const known = new Set(mirror.map((row) => row.code));
  const active = new Set(mirror.filter((row) => row.status === "active").map((row) => row.code));
  const alreadyAssigned = new Set(
    plantId === null ? [] : readPlantAdaptationTerms(db, plantId).map((row) => row.term_code),
  );
  for (const code of payload.adaptation_term_codes) {
    if (!known.has(code)) {
      throw new PlantGeographyValidationError(`Unknown adaptation term code: ${code}`);
    }
    if (!active.has(code) && !alreadyAssigned.has(code)) {
      throw new PlantGeographyValidationError(`Archived adaptation term code: ${code}`);
    }
  }
}

/**
 * Health report for the taxonomy mirror and geography join tables (design
 * doc §7.1): mirror row counts, join-row counts, and orphan detection.
 */
export function adaptationTermsHealth(db: SqliteDatabase) {
  const count = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;
  const termRows = db.prepare(`SELECT code, status FROM adaptation_terms ORDER BY code`).all() as Array<{
    code: string;
    status: string;
  }>;
  const approvedCodes = new Set<string>(ADAPTATION_TERMS.map((term) => term.code));
  const actualCodes = new Set(termRows.map((term) => term.code));
  const extraTermCodes = termRows
    .map((term) => term.code)
    .filter((code) => !approvedCodes.has(code));
  const missingTermCodes = ADAPTATION_TERMS
    .map((term) => term.code)
    .filter((code) => !actualCodes.has(code));
  return {
    mirror: {
      terms: count(`SELECT COUNT(*) AS n FROM adaptation_terms`),
      i18n: count(`SELECT COUNT(*) AS n FROM adaptation_term_i18n`),
    },
    taxonomy: {
      expectedTerms: ADAPTATION_TERMS.length,
      expectedTranslations: ADAPTATION_TERMS.length * 2,
      activeTerms: termRows.filter((term) => term.status === "active").length,
      activeTranslations: count(`
        SELECT COUNT(*) AS n
        FROM adaptation_term_i18n i
        INNER JOIN adaptation_terms t ON t.code = i.term_code
        WHERE t.status = 'active' AND i.locale IN ('vi', 'en')
      `),
      extraTermCodes,
      missingTermCodes,
    },
    joins: {
      origin: count(`SELECT COUNT(*) AS n FROM plant_origin_countries`),
      provenRegions: count(`SELECT COUNT(*) AS n FROM plant_proven_regions`),
      adaptationTerms: count(`SELECT COUNT(*) AS n FROM plant_adaptation_terms`),
    },
    orphans: {
      origin: count(`SELECT COUNT(*) AS n FROM plant_origin_countries o LEFT JOIN master_plants p ON p.id = o.master_plant_id WHERE p.id IS NULL`),
      provenRegions: count(`SELECT COUNT(*) AS n FROM plant_proven_regions o LEFT JOIN master_plants p ON p.id = o.master_plant_id WHERE p.id IS NULL`),
      adaptationTerms: count(`SELECT COUNT(*) AS n FROM plant_adaptation_terms o LEFT JOIN master_plants p ON p.id = o.master_plant_id WHERE p.id IS NULL`),
      adaptationTermCodes: count(`SELECT COUNT(*) AS n FROM plant_adaptation_terms o LEFT JOIN adaptation_terms t ON t.code = o.term_code WHERE t.code IS NULL`),
      i18n: count(`SELECT COUNT(*) AS n FROM adaptation_term_i18n t LEFT JOIN adaptation_terms m ON m.code = t.term_code WHERE m.code IS NULL`),
    },
  };
}

/** Replace-semantics writes: present field replaces the plant's own rows; omitted field leaves them untouched. */
function replacePlantOriginCountries(db: SqliteDatabase, plantId: number, entries: Array<{ country_code: string; source_refs?: unknown }>): void {
  db.prepare(`DELETE FROM plant_origin_countries WHERE master_plant_id = ?`).run(plantId);
  const insert = db.prepare(
    `INSERT INTO plant_origin_countries (master_plant_id, country_code, source_refs_json) VALUES (?, ?, ?)`,
  );
  for (const entry of entries) {
    insert.run(plantId, entry.country_code, JSON.stringify(entry.source_refs ?? []));
  }
}

function replacePlantProvenRegions(db: SqliteDatabase, plantId: number, entries: Array<{ country_code: string; subdivision_code?: string; source_refs?: unknown }>): void {
  db.prepare(`DELETE FROM plant_proven_regions WHERE master_plant_id = ?`).run(plantId);
  const insert = db.prepare(
    `INSERT INTO plant_proven_regions (master_plant_id, country_code, subdivision_code, source_refs_json) VALUES (?, ?, ?, ?)`,
  );
  for (const entry of entries) {
    insert.run(plantId, entry.country_code, entry.subdivision_code ?? null, JSON.stringify(entry.source_refs ?? []));
  }
}

function replacePlantAdaptationTerms(db: SqliteDatabase, plantId: number, entries: Array<{ term_code: string; source_refs?: unknown }>): void {
  db.prepare(`DELETE FROM plant_adaptation_terms WHERE master_plant_id = ?`).run(plantId);
  const insert = db.prepare(
    `INSERT INTO plant_adaptation_terms (master_plant_id, term_code, source_refs_json) VALUES (?, ?, ?)`,
  );
  for (const entry of entries) {
    insert.run(plantId, entry.term_code, JSON.stringify(entry.source_refs ?? []));
  }
}

function applyPlantGeographyPayload(
  db: SqliteDatabase,
  plantId: number,
  payload: z.infer<typeof createMasterPlantSchema>,
): void {
  if (payload.origin_countries !== undefined) {
    const refs = payload.origin_country_source_refs ?? {};
    replacePlantOriginCountries(db, plantId, payload.origin_countries.map((country_code) => ({
      country_code,
      source_refs: refs[country_code],
    })));
  }
  if (payload.proven_regions !== undefined) {
    replacePlantProvenRegions(db, plantId, payload.proven_regions.map((region) => ({
      country_code: region.country_code,
      ...(region.subdivision_code ? { subdivision_code: region.subdivision_code } : {}),
      source_refs: region.source_refs,
    })));
  }
  if (payload.adaptation_term_codes !== undefined) {
    const refs = payload.adaptation_term_source_refs ?? {};
    replacePlantAdaptationTerms(db, plantId, payload.adaptation_term_codes.map((term_code) => ({
      term_code,
      source_refs: refs[term_code],
    })));
  }
}

export function normalizeMasterPlant(
  db: SqliteDatabase,
  row: MasterPlantRow,
  baseLookup?: Map<string, MasterPlantRow>,
) {
  return {
    id: row.id,
    plant_code: row.plant_code,
    common_name: row.common_name,
    scientific_name: row.scientific_name,
    canonical_identity_version: row.canonical_identity_version ?? null,
    canonical_key: row.canonical_key ?? null,
    genus: row.genus ?? null,
    species: row.species ?? null,
    infraspecific_rank: row.infraspecific_rank ?? null,
    infraspecific_name: row.infraspecific_name ?? null,
    cultivar: row.cultivar ?? null,
    identity_scope: row.identity_scope ?? null,
    parent_master_plant_id: row.parent_master_plant_id ?? null,
    parent_canonical_key: row.parent_canonical_key ?? null,
    canonical_status: row.canonical_status ?? "active",
    canonical_archived_at: row.canonical_archived_at ?? null,
    canonical_archived_into_id: row.canonical_archived_into_id ?? null,
    canonical_archive_reason: row.canonical_archive_reason ?? null,
    source_system: row.source_system,
    source_id: row.source_id,
    record_version: row.record_version,
    category: row.category,
    group: row.group,
    family: row.family,
    purposes: parseJson(row.purposes_json) ?? [],
    growth_stage: row.growth_stage,
    typical_days_to_harvest: row.typical_days_to_harvest,
    germination_days: row.germination_days,
    watering_frequency_days: row.watering_frequency_days,
    fertilizing_frequency_days: row.fertilizing_frequency_days,
    soil_ph_min: row.soil_ph_min,
    soil_ph_max: row.soil_ph_max,
    moisture_target: row.moisture_target,
    light_hours: row.light_hours,
    light_requirements: row.light_requirements,
    spacing_cm: row.spacing_cm,
    max_plants_per_m2: row.max_plants_per_m2,
    seed_rate_per_m2: row.seed_rate_per_m2,
    water_liters_per_m2: row.water_liters_per_m2,
    yield_kg_per_m2: row.yield_kg_per_m2,
    image_url: row.image_url,
    is_active: Boolean(row.is_active),
    notes: row.notes,
    metadata_json: parseJson(row.metadata_json) || {},
    source_url: row.source_url,
    content_status: row.content_status,
    content_version: row.content_version,
    review_status: row.review_status,
    reviewed_at: row.reviewed_at,
    reviewed_by: row.reviewed_by,
    sync_origin: row.sync_origin,
    care_status: row.care_status,
    care_field_evidence: normalizeCareFieldEvidenceMap(parseJson(row.care_field_evidence_json)),
    propagation_methods: normalizePropagationMethods(parseJson(row.propagation_methods_json)),
    propagationMethods: normalizePropagationMethods(parseJson(row.propagation_methods_json)),
    // Own rows (for editing) plus the read-time resolved view (for display).
    // Provenance is preserved end to end for every assignment category.
    origin_countries: readPlantOriginCountries(db, row.id).map((item) => item.country_code),
    origin_country_source_refs: Object.fromEntries(
      readPlantOriginCountries(db, row.id).map((item) => [item.country_code, parseJson(item.source_refs_json) ?? []]),
    ),
    proven_regions: readPlantProvenRegions(db, row.id).map((item) => ({
      country_code: item.country_code,
      ...(item.subdivision_code ? { subdivision_code: item.subdivision_code } : {}),
    })),
    adaptation_term_codes: readPlantAdaptationTerms(db, row.id).map((item) => item.term_code),
    adaptation_term_source_refs: Object.fromEntries(
      readPlantAdaptationTerms(db, row.id).map((item) => [item.term_code, parseJson(item.source_refs_json) ?? []]),
    ),
    resolved_geography: resolvePlantGeography(db, row, baseLookup),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function normalizeI18n(rows: MasterPlantI18nRow[]) {
  const result: Record<string, {
    common_name: string;
    description?: string;
    care_content?: string;
    content_updated_at?: string;
    content_version?: number;
    source?: string;
    source_url?: string;
    content_status?: string;
    review_status?: string;
    reviewed_at?: string;
    reviewed_by?: string;
    content_origin?: string;
    source_refs?: Array<{
      sourceSystem?: string | null;
      sourceName?: string | null;
      sourceUrl?: string | null;
      sourceLocator?: string | null;
    }>;
  }> = {
    vi: { common_name: "" },
    en: { common_name: "" },
  };

  for (const row of rows) {
    const sourceRefs = normalizePropagationSourceRefs(row.source_refs_json);
    if (sourceRefs.length === 0 && (row.source || row.source_url)) {
      sourceRefs.push({
        ...(row.source ? { sourceName: row.source } : {}),
        ...(row.source_url ? { sourceUrl: row.source_url } : {}),
      });
    }
    result[row.locale] = {
      common_name: row.common_name,
      ...(row.description ? { description: row.description } : {}),
      ...(row.care_content ? { care_content: row.care_content } : {}),
      ...(row.content_updated_at ? { content_updated_at: row.content_updated_at } : {}),
      content_version: row.content_version,
      ...(row.source ? { source: row.source } : {}),
      ...(row.source_url ? { source_url: row.source_url } : {}),
      content_status: row.content_status,
      review_status: row.review_status,
      ...(row.reviewed_at ? { reviewed_at: row.reviewed_at } : {}),
      ...(row.reviewed_by ? { reviewed_by: row.reviewed_by } : {}),
      content_origin: row.content_origin,
      ...(sourceRefs.length > 0
        ? { source_refs: sourceRefs }
        : {}),
    };
  }

  return result;
}

export function upsertI18n(
  db: SqliteDatabase,
  masterPlantId: number,
  i18n: Record<string, {
    common_name: string;
    description?: string | null;
    care_content?: string | null;
    content_updated_at?: string | null;
    content_version?: number;
    source?: string | null;
    source_url?: string | null;
    content_status?: string;
    review_status?: string;
    reviewed_at?: string | null;
    reviewed_by?: string | null;
    content_origin?: string;
    source_refs?: Array<{
      sourceSystem?: string | null;
      sourceName?: string | null;
      sourceUrl?: string | null;
      sourceLocator?: string | null;
    }>;
  }>,
) {
  const locales = new Set(Object.keys(i18n).map((locale) => locale.trim().toLowerCase()));
  const existingRows = db
    .prepare(`SELECT id, locale, care_content, content_status, content_updated_at FROM master_plant_i18n WHERE master_plant_id = ?`)
    .all(masterPlantId) as Array<{
      id: number;
      locale: string;
      care_content: string | null;
      content_status: string;
      content_updated_at: string | null;
    }>;
  const existingByLocale = new Map(existingRows.map((row) => [row.locale, row]));
  for (const row of existingRows) {
    if (!locales.has(row.locale)) {
      db.prepare(`DELETE FROM master_plant_i18n WHERE id = ?`).run(row.id);
    }
  }

  for (const [locale, payload] of Object.entries(i18n)) {
    if (!payload || !payload.common_name) continue;
    // Three-state contract: absent/undefined preserves, null or empty clears
    // (SQLite NULL), non-empty string upserts byte-for-byte.
    const careContent =
      payload.care_content !== undefined &&
      payload.care_content !== null &&
      payload.care_content.trim() !== ""
        ? payload.care_content
        : null;
    const normalizedLocale = locale.trim().toLowerCase();
    const existing = existingByLocale.get(normalizedLocale);
    const effectiveStatus = payload.content_status ?? "published";
    const contentUpdatedAt = payload.content_updated_at ?? (
      effectiveStatus === "published" && careContent &&
      (!existing || existing.content_status !== "published" || existing.care_content !== careContent)
        ? new Date().toISOString()
        : existing?.content_updated_at ?? null
    );
    db.prepare(
      `INSERT INTO master_plant_i18n (
        master_plant_id, locale, common_name, description, care_content, content_updated_at,
        content_version, source, source_url, content_status, review_status,
        reviewed_at, reviewed_by, content_origin, source_refs_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(master_plant_id, locale) DO UPDATE SET
         common_name = excluded.common_name,
         description = excluded.description,
         care_content = excluded.care_content,
         content_updated_at = CASE
           WHEN excluded.content_updated_at IS NOT NULL THEN excluded.content_updated_at
           WHEN excluded.content_status = 'published'
             AND (master_plant_i18n.content_status <> 'published' OR master_plant_i18n.care_content IS NOT excluded.care_content)
             THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           ELSE master_plant_i18n.content_updated_at
         END,
         content_version = excluded.content_version,
         source = excluded.source,
         source_url = excluded.source_url,
         content_status = excluded.content_status,
         review_status = excluded.review_status,
         reviewed_at = excluded.reviewed_at,
         reviewed_by = excluded.reviewed_by,
         content_origin = excluded.content_origin,
         source_refs_json = excluded.source_refs_json,
         updated_at = datetime('now')`,
    ).run(
      masterPlantId,
      locale,
      payload.common_name,
      payload.description ?? null,
      careContent,
      contentUpdatedAt,
      payload.content_version ?? 1,
      payload.source ?? null,
      payload.source_url ?? null,
      payload.content_status ?? "published",
      payload.review_status ?? "unreviewed",
      payload.reviewed_at ?? null,
      payload.reviewed_by ?? null,
      payload.content_origin ?? "imported",
      JSON.stringify(normalizePropagationSourceRefs(payload.source_refs ?? [])),
    );
  }
}

export function fetchI18n(db: SqliteDatabase, masterPlantId: number) {
  const rows = db
    .prepare(`SELECT * FROM master_plant_i18n WHERE master_plant_id = ?`)
    .all(masterPlantId) as MasterPlantI18nRow[];
  return normalizeI18n(rows);
}

function toSqliteBoolean(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

export function withSourceIdentity(payload: z.infer<typeof createMasterPlantSchema>) {
  return createMasterPlantSchema.parse({
    ...payload,
    source_system: payload.source_system?.trim() || "sqlite",
    source_id: payload.source_id?.trim() || crypto.randomUUID(),
    record_version: payload.record_version ?? 1,
  });
}

export function buildMasterPlantPayload(
  db: SqliteDatabase,
  row: MasterPlantRow,
  i18n = fetchI18n(db, row.id),
) {
  return withSourceIdentity(createMasterPlantSchema.parse({
    ...normalizeMasterPlant(db, row),
    i18n,
  }));
}

const SQLITE_INFRASPECIFIC_PATTERN = /^(subsp|ssp|var|f)\.?$/i;

function normalizeSqliteTaxonomyToken(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function sqliteCultivar(row: MasterPlantRow) {
  const metadata = parseJson(row.metadata_json);
  if (metadata && typeof metadata === "object" && typeof metadata.cultivar === "string") {
    const cultivar = metadata.cultivar.trim();
    if (cultivar) return cultivar;
  }

  const tokens = normalizeSqliteTaxonomyToken(row.scientific_name)
    .replace(/[(),;]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length < 3) return undefined;

  let speciesIndex = 1;
  if ((tokens[1] === "x" || tokens[1] === "×") && tokens.length >= 4) speciesIndex = 2;
  const rank = tokens[speciesIndex + 1];
  if (!SQLITE_INFRASPECIFIC_PATTERN.test(rank ?? "")) return undefined;
  return tokens.slice(speciesIndex + 1).join(" ");
}

function isSqliteDisplayBasePlant(row: MasterPlantRow) {
  const cultivar = normalizeSqliteTaxonomyToken(sqliteCultivar(row));
  return !cultivar || SQLITE_INFRASPECIFIC_PATTERN.test(cultivar.split(" ", 1)[0]);
}

function sqliteSpeciesKey(row: MasterPlantRow) {
  const tokens = normalizeSqliteTaxonomyToken(row.scientific_name)
    .replace(/[(),;]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length < 2) return undefined;
  const speciesIndex = (tokens[1] === "x" || tokens[1] === "×") && tokens.length >= 3 ? 2 : 1;
  return `${tokens[0]}|${tokens[speciesIndex]}`;
}

export function sqliteDeleteGuard(db: SqliteDatabase, row: MasterPlantRow): string | undefined {
  if (row.canonical_identity_version || row.canonical_key) {
    return "Cannot hard-delete a canonical plant; archive or deactivate it instead";
  }

  const aliases = db.prepare(`
    SELECT COUNT(*) AS count
    FROM plant_external_identities
    WHERE master_plant_id = ?
  `).get(row.id) as { count: number };
  if (aliases.count > 0) {
    return "Cannot hard-delete a plant with external identity aliases; archive or deactivate it instead";
  }

  if (isSqliteDisplayBasePlant(row)) {
    const speciesKey = sqliteSpeciesKey(row);
    if (speciesKey) {
      const siblings = db.prepare(`SELECT * FROM master_plants WHERE id != ?`).all(row.id) as MasterPlantRow[];
      const hasVariant = siblings.some((candidate) =>
        sqliteSpeciesKey(candidate) === speciesKey && !isSqliteDisplayBasePlant(candidate),
      );
      if (hasVariant) {
        return "Cannot delete base plant while variants still exist; deactivate it instead";
      }
    }
  }

  const references = db.prepare(`
    SELECT COUNT(*) AS count
    FROM plant_measurements
    WHERE master_plant_id = ?
  `).get(row.id) as { count: number };
  if (references.count > 0) {
    return "Cannot delete a plant while SQLite measurements still reference it; deactivate it instead";
  }

  // CID-3 is fail-closed: hard deletion is never a normal SQLite operation.
  // Reviewed remediation/archive code is the only path allowed to transfer
  // references and retain a tombstone for the old row.
  return "Cannot hard-delete a master plant; use the audited archive/remediation path instead";
}

function sourceConflict(
  db: SqliteDatabase,
  payload: z.infer<typeof createMasterPlantSchema>,
  excludedId?: number,
) {
  const byCode = db.prepare(`SELECT id FROM master_plants WHERE plant_code = ?`).get(payload.plant_code) as
    | { id: number }
    | undefined;
  if (byCode && byCode.id !== excludedId) return byCode;
  if (!payload.source_id) return undefined;
  const bySource = db.prepare(`SELECT id FROM master_plants WHERE source_system = ? AND source_id = ?`).get(
    payload.source_system,
    payload.source_id,
  ) as { id: number } | undefined;
  return bySource && bySource.id !== excludedId ? bySource : undefined;
}

function queuePlantSync(
  db: SqliteDatabase,
  payload: z.infer<typeof createMasterPlantSchema>,
  operation: "upsert_plant" | "upsert_i18n" | "delete_i18n" = "upsert_plant",
) {
  enqueueSyncOutbox(db, {
    entityType: "master_plant",
    sourceSystem: payload.source_system,
    sourceId: payload.source_id!,
    operation,
    payload: payload as unknown as Record<string, unknown>,
  });
}

/**
 * Queue every local-authoring plant for the explicit publish action.
 *
 * Existing seed rows predate stable source identity and have NULL source_id.
 * Assign a deterministic SQLite identity from the row id while queueing so a
 * repeated request updates the same dedupe key instead of creating duplicate
 * publish work. This function only writes local provenance/outbox state; it
 * never invokes Convex.
 */
export function queueLocalAuthoringPlantsForPublish(
  db: SqliteDatabase,
  limit = 5000,
): { scanned: number; queued: number; identitiesAssigned: number; skippedNotApproved: number } {
  return db.transaction(() => {
    const rows = db.prepare(`
      SELECT * FROM master_plants
      WHERE sync_origin = 'local'
      ORDER BY id ASC
      LIMIT ?
    `).all(Math.max(1, Math.min(5000, limit))) as MasterPlantRow[];
    let identitiesAssigned = 0;
    let queued = 0;
    let skippedNotApproved = 0;
    for (const row of rows) {
      const sourceId = row.source_id?.trim() || `sqlite-local-${row.id}`;
      if (!row.source_id?.trim()) {
        db.prepare(`UPDATE master_plants SET source_id = ?, updated_at = updated_at WHERE id = ?`)
          .run(sourceId, row.id);
        identitiesAssigned++;
      }
      const payload = withSourceIdentity(createMasterPlantSchema.parse({
        ...normalizeMasterPlant(db, row),
        source_system: row.source_system?.trim() || "sqlite",
        source_id: sourceId,
        i18n: fetchI18n(db, row.id),
        sync_origin: "local",
      }));
      // CAP-2026-08-31: only approved care content may be queued. Unapproved
      // locales stay in SQLite as drafts; the dashboard approval action
      // queues them explicitly.
      const approval = evaluatePayloadApproval(payload as unknown as Record<string, unknown>);
      if (!approval.allowed) {
        skippedNotApproved++;
        continue;
      }
      queuePlantSync(db, payload);
      queued++;
    }
    return { scanned: rows.length, queued, identitiesAssigned, skippedNotApproved };
  })();
}

export interface LegacyPropagationMigrationReport {
  dryRun: boolean;
  scanned: number;
  eligible: number;
  migrated: number;
  manualReview: number;
  failures: Array<{ id: number; source: string; reason: string }>;
  bySource: Record<string, { eligible: number; migrated: number; manualReview: number }>;
  mustRunBeforeCanonicalMetadataBackfill: true;
}

/** SQLite mirror equivalent of the Convex legacy propagation migration. */
export function migrateLegacyPropagationMethods(
  db: SqliteDatabase,
  options: { dryRun?: boolean; limit?: number } = {},
): LegacyPropagationMigrationReport {
  const dryRun = options.dryRun ?? true;
  const rows = db.prepare(`SELECT * FROM master_plants ORDER BY id ASC LIMIT ?`)
    .all(Math.max(1, Math.min(options.limit ?? 5000, 5000))) as MasterPlantRow[];
  const bySource: LegacyPropagationMigrationReport["bySource"] = {
    seed: { eligible: 0, migrated: 0, manualReview: 0 },
    cutting: { eligible: 0, migrated: 0, manualReview: 0 },
    bulb: { eligible: 0, migrated: 0, manualReview: 0 },
  };
  const report: LegacyPropagationMigrationReport = {
    dryRun,
    scanned: rows.length,
    eligible: 0,
    migrated: 0,
    manualReview: 0,
    failures: [],
    bySource,
    mustRunBeforeCanonicalMetadataBackfill: true,
  };
  const mapping: Record<string, string> = { seed: "seed", cutting: "stem_cutting", bulb: "bulb" };

  const sourceBucket = (source: string) => {
    if (!bySource[source]) bySource[source] = { eligible: 0, migrated: 0, manualReview: 0 };
    return bySource[source];
  };

  for (const row of rows) {
    const metadata = parseJson(row.metadata_json);
    const source = typeof metadata?.source === "string" ? metadata.source.trim().toLowerCase() : "";
    if (!source) continue;
    const bucket = sourceBucket(source);
    if (!(source in mapping)) {
      report.manualReview += 1;
      bucket.manualReview += 1;
      continue;
    }
    const sourceSystem = row.source_system?.trim() ?? "";
    const sourceId = row.source_id?.trim() ?? "";
    const signatureBackfill = sourceSystem === "convex" && sourceId === String(row.id);
    if ((sourceSystem || sourceId) && !signatureBackfill) {
      report.manualReview += 1;
      bucket.manualReview += 1;
      continue;
    }
    report.eligible += 1;
    bucket.eligible += 1;
    const current = normalizePropagationMethods(parseJson(row.propagation_methods_json)) ?? [];
    const next = normalizePropagationMethods([...current, mapping[source]]);
    if (!next) {
      report.failures.push({ id: row.id, source, reason: "normalization produced no method" });
      continue;
    }
    if (dryRun) continue;
    try {
      const nextMetadata = { ...(metadata && typeof metadata === "object" ? metadata : {}) } as Record<string, unknown>;
      delete nextMetadata.source;
      db.prepare(`UPDATE master_plants SET propagation_methods_json = ?, metadata_json = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(JSON.stringify(next), JSON.stringify(nextMetadata), row.id);
      const check = db.prepare(`SELECT propagation_methods_json FROM master_plants WHERE id = ?`).get(row.id) as { propagation_methods_json: string } | undefined;
      if (!normalizePropagationMethods(parseJson(check?.propagation_methods_json ?? "[]"))?.includes(mapping[source] as any)) {
        throw new Error("propagation read-back did not contain mapped method");
      }
      report.migrated += 1;
      bucket.migrated += 1;
    } catch (error) {
      report.failures.push({ id: row.id, source, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}

function slugifyPlantCode(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/×/g, "x")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toUpperCase();
}

function buildConvexPlantCode(plant: ConvexPlantLibraryItem) {
  const base = slugifyPlantCode(plant.scientificName) || slugifyPlantCode(plant.displayName);
  const cultivar = plant.cultivar ? slugifyPlantCode(plant.cultivar) : "";
  const idSuffix = slugifyPlantCode(plant._id).slice(-10);
  return [base, cultivar, idSuffix].filter(Boolean).join("_").slice(0, 120);
}

function normalizeConvexPlant(plant: ConvexPlantLibraryItem) {
  const sourceSystem = plant.sourceSystem ?? (plant.source?.startsWith("backend:") ? "sqlite" : "convex");
  const sourceId = plant.sourceId ?? plant._id;
  const i18n: Record<string, {
    common_name: string;
    description?: string;
    care_content?: string;
    content_updated_at?: string;
    content_version?: number;
    source?: string;
    source_url?: string;
    content_status?: string;
    review_status?: string;
    reviewed_at?: string;
    reviewed_by?: string;
    content_origin?: string;
  }> = {};

  for (const row of plant.i18nRows ?? []) {
    i18n[row.locale] = {
      common_name: row.commonName,
      ...(row.description ? { description: row.description } : {}),
      ...(row.careContent ? { care_content: row.careContent } : {}),
      ...(row.contentUpdatedAt ? { content_updated_at: new Date(row.contentUpdatedAt).toISOString() } : {}),
      ...(row.contentVersion !== undefined ? { content_version: row.contentVersion } : {}),
      ...(row.source ? { source: row.source } : {}),
      ...(row.sourceUrl ? { source_url: row.sourceUrl } : {}),
      ...(row.contentStatus ? { content_status: row.contentStatus } : {}),
      ...(row.reviewStatus ? { review_status: row.reviewStatus } : {}),
      ...(row.reviewedAt ? { reviewed_at: new Date(row.reviewedAt).toISOString() } : {}),
      ...(row.reviewedBy ? { reviewed_by: row.reviewedBy } : {}),
      ...(row.contentOrigin ? { content_origin: row.contentOrigin } : {}),
      ...(row.sourceRefs ? { source_refs: row.sourceRefs } : {}),
    };
  }

  return {
    id: plant._id,
    plant_code: buildConvexPlantCode(plant),
    common_name: plant.displayName,
    scientific_name: plant.scientificName,
    genus: plant.genus ?? null,
    species: plant.species ?? null,
    taxonomy_parse_status: plant.taxonomyParseStatus ?? null,
    source_system: sourceSystem,
    source_id: sourceId,
    record_version: plant.recordVersion ?? 1,
    category: "general",
    group: plant.group ?? "other",
    family: plant.family ?? null,
    purposes: plant.purposes ?? [],
    growth_stage: plant.growthStage ?? "seedling",
    typical_days_to_harvest: plant.typicalDaysToHarvest ?? null,
    germination_days: plant.germinationDays ?? null,
    watering_frequency_days: plant.wateringFrequencyDays ?? null,
    fertilizing_frequency_days: plant.fertilizingFrequencyDays ?? null,
    soil_ph_min: plant.soilPhMin ?? null,
    soil_ph_max: plant.soilPhMax ?? null,
    moisture_target: plant.moistureTarget ?? null,
    light_hours: plant.lightHours ?? null,
    light_requirements: plant.lightRequirements ?? null,
    spacing_cm: plant.spacingCm ?? null,
    max_plants_per_m2: plant.maxPlantsPerM2 ?? null,
    seed_rate_per_m2: plant.seedRatePerM2 ?? null,
    water_liters_per_m2: plant.waterLitersPerM2 ?? null,
    yield_kg_per_m2: plant.yieldKgPerM2 ?? null,
    image_url: plant.imageUrl ?? null,
    is_active: plant.isActive !== false,
    notes: plant.notes ?? plant.description ?? null,
    source_url: plant.sourceUrl ?? null,
    content_status: plant.contentStatus ?? "published",
    content_version: plant.contentVersion ?? 1,
    review_status: plant.reviewStatus ?? "unreviewed",
    reviewed_at: plant.reviewedAt ? new Date(plant.reviewedAt).toISOString() : null,
    reviewed_by: plant.reviewedBy ?? null,
    sync_origin: "mirror",
    care_status: plant.careStatus ?? "missing",
    care_field_evidence: plant.careFieldEvidence ?? {},
    propagation_methods: normalizePropagationMethods(plant.propagationMethods),
    propagationMethods: normalizePropagationMethods(plant.propagationMethods),
    metadata_json: {
      source: plant.source ?? "convex",
      convexId: plant._id,
      sourceSystem,
      sourceId,
      cultivar: plant.cultivar ?? undefined,
      cultivarNormalized: plant.cultivarNormalized ?? undefined,
    },
    created_at: null,
    updated_at: null,
    i18n,
  };
}

function getRemotePlantStats(plants: ReturnType<typeof normalizeConvexPlant>[]) {
  const missingVi = plants.filter((plant) => !plant.i18n.vi?.common_name?.trim()).length;
  const missingEn = plants.filter((plant) => !plant.i18n.en?.common_name?.trim()).length;
  const missingImage = plants.filter((plant) => !plant.image_url).length;

  return {
    total: plants.length,
    active: plants.filter((plant) => plant.is_active).length,
    inactive: plants.filter((plant) => !plant.is_active).length,
    missingVi,
    missingEn,
    missingImage,
    source: "convex" as const,
  };
}

type ConvexCanonicalIdentitySource = {
  scientific_name?: unknown;
  scientificName?: unknown;
  genus?: unknown;
  species?: unknown;
  cultivar?: unknown;
  cultivarNormalized?: unknown;
  metadata_json?: unknown;
  identity_scope?: unknown;
  identityScope?: unknown;
  scope?: unknown;
  parent_canonical_key?: unknown;
  parentCanonicalKey?: unknown;
  taxonomy_parse_status?: unknown;
  taxonomyParseStatus?: unknown;
};

function textIdentityValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function throwConvexIdentityError(message: string): never {
  throw new CanonicalIdentityMigrationError("CANONICAL_IDENTITY_INCOMPLETE", message);
}

/**
 * Project the trusted Convex taxonomy snapshot into the SQLite writer tuple.
 * The legacy extractor is used only for structured scientific-name/cultivar
 * fields already present in the snapshot; displayName is deliberately never a
 * fallback. Ambiguous/manual-review snapshots fail before a mirror write.
 */
export function deriveConvexCanonicalIdentity(
  source: ConvexCanonicalIdentitySource,
): SqliteCanonicalIdentityFields {
  const scientificName = textIdentityValue(source.scientific_name ?? source.scientificName);
  const directGenus = textIdentityValue(source.genus);
  const directSpecies = textIdentityValue(source.species);
  const taxonomyStatus = textIdentityValue(source.taxonomy_parse_status ?? source.taxonomyParseStatus);
  if (Boolean(directGenus) !== Boolean(directSpecies)) {
    return throwConvexIdentityError("Convex snapshot contains only one structured taxonomy component");
  }
  if (taxonomyStatus && taxonomyStatus !== "ok") {
    return throwConvexIdentityError(`Convex snapshot taxonomy is marked ${taxonomyStatus}`);
  }

  const legacySource = {
    scientific_name: scientificName,
    ...(directGenus && directSpecies ? { genus: directGenus, species: directSpecies } : {}),
    ...(source.cultivar !== undefined ? { cultivar: source.cultivar } : {}),
    ...(source.cultivarNormalized !== undefined ? { cultivarNormalized: source.cultivarNormalized } : {}),
    ...(source.metadata_json !== undefined ? { metadata_json: source.metadata_json } : {}),
    ...(source.identity_scope !== undefined ? { identity_scope: source.identity_scope } : {}),
    ...(source.identityScope !== undefined ? { identityScope: source.identityScope } : {}),
    ...(source.scope !== undefined ? { scope: source.scope } : {}),
    ...(source.parent_canonical_key !== undefined ? { parent_canonical_key: source.parent_canonical_key } : {}),
    ...(source.parentCanonicalKey !== undefined ? { parentCanonicalKey: source.parentCanonicalKey } : {}),
  };
  const fields = extractLegacyCanonicalIdentityFields(legacySource);
  const scientificFields = extractLegacyCanonicalIdentityFields({
    scientific_name: scientificName,
    ...(source.cultivar !== undefined ? { cultivar: source.cultivar } : {}),
    ...(source.cultivarNormalized !== undefined ? { cultivarNormalized: source.cultivarNormalized } : {}),
  });
  if (!fields.genus || !fields.species || fields.identitySource === "missing") {
    return throwConvexIdentityError("Convex snapshot lacks an unambiguous structured genus/species identity");
  }

  if (directGenus && directSpecies && scientificFields.genus && scientificFields.species && (
    normalizeCanonicalIdentityToken(directGenus) !== normalizeCanonicalIdentityToken(scientificFields.genus) ||
    normalizeCanonicalIdentityToken(directSpecies) !== normalizeCanonicalIdentityToken(scientificFields.species)
  )) {
    return throwConvexIdentityError("Convex snapshot structured taxonomy conflicts with scientificName");
  }
  if (fields.rank && scientificFields.rank && normalizeCanonicalIdentityToken(fields.rank) !== normalizeCanonicalIdentityToken(scientificFields.rank)) {
    return throwConvexIdentityError("Convex snapshot infraspecific rank is ambiguous");
  }
  if (fields.infraspecificName && scientificFields.infraspecificName && normalizeCanonicalIdentityToken(fields.infraspecificName) !== normalizeCanonicalIdentityToken(scientificFields.infraspecificName)) {
    return throwConvexIdentityError("Convex snapshot infraspecific name is ambiguous");
  }

  const rank = fields.rank ?? scientificFields.rank;
  const infraspecificName = fields.infraspecificName ?? scientificFields.infraspecificName;
  const cultivar = fields.cultivar ?? scientificFields.cultivar;
  const scope = fields.scope;
  const baseValidation = validateCanonicalPlantIdentity({
    genus: fields.genus,
    species: fields.species,
    rank,
    infraspecificName,
    cultivar: null,
    scope: "base",
    parentCanonicalKey: null,
    parentMasterPlantId: null,
  });
  if (!baseValidation.ok) {
    return throwConvexIdentityError(`Convex base identity is invalid: ${baseValidation.issues[0]?.message ?? baseValidation.code}`);
  }
  const parentCanonicalKey = scope === "cultivar"
    ? (fields.parentCanonicalKey ?? baseValidation.canonicalKey)
    : null;
  const validation = validateCanonicalPlantIdentity({
    genus: fields.genus,
    species: fields.species,
    rank,
    infraspecificName,
    cultivar,
    scope,
    parentCanonicalKey,
    parentMasterPlantId: null,
  });
  if (!validation.ok) {
    return throwConvexIdentityError(`Convex identity is invalid: ${validation.issues[0]?.message ?? validation.code}`);
  }
  return {
    canonical_identity_version: validation.identity.identityVersion,
    canonical_key: validation.canonicalKey,
    genus: validation.identity.genus,
    species: validation.identity.species,
    infraspecific_rank: validation.identity.rank || null,
    infraspecific_name: validation.identity.infraspecificName || null,
    cultivar: validation.identity.cultivar || null,
    identity_scope: validation.identity.scope,
    parent_master_plant_id: null,
    parent_canonical_key: parentCanonicalKey,
  };
}

function getSqlitePlantStats(db: SqliteDatabase) {
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM master_plants`).get() as { n: number }).n;
  const active = (db.prepare(`SELECT COUNT(*) AS n FROM master_plants WHERE is_active = 1`).get() as { n: number }).n;
  const inactive = (db.prepare(`SELECT COUNT(*) AS n FROM master_plants WHERE is_active = 0`).get() as { n: number }).n;
  const missingVi = (db.prepare(`
    SELECT COUNT(*) AS n FROM master_plants mp
    WHERE NOT EXISTS (
      SELECT 1 FROM master_plant_i18n i
      WHERE i.master_plant_id = mp.id AND i.locale = 'vi' AND i.common_name != ''
    )`).get() as { n: number }).n;
  const missingEn = (db.prepare(`
    SELECT COUNT(*) AS n FROM master_plants mp
    WHERE NOT EXISTS (
      SELECT 1 FROM master_plant_i18n i
      WHERE i.master_plant_id = mp.id AND i.locale = 'en' AND i.common_name != ''
    )`).get() as { n: number }).n;
  const missingI18n = (db.prepare(`
    SELECT COUNT(*) AS n FROM master_plants mp
    WHERE NOT EXISTS (
      SELECT 1 FROM master_plant_i18n i
      WHERE i.master_plant_id = mp.id AND i.locale = 'vi' AND i.common_name != ''
    ) OR NOT EXISTS (
      SELECT 1 FROM master_plant_i18n i
      WHERE i.master_plant_id = mp.id AND i.locale = 'en' AND i.common_name != ''
    )`).get() as { n: number }).n;
  const missingImage = (db.prepare(`SELECT COUNT(*) AS n FROM master_plants WHERE image_url IS NULL OR image_url = ''`).get() as { n: number }).n;

  return { total, active, inactive, missingVi, missingEn, missingI18n, missingImage, source: "sqlite" as const };
}

/**
 * Dashboard/admin reads use one full Convex snapshot across list, detail,
 * stats, and export. The canonical production projection intentionally hides
 * inactive/draft/placeholder rows for mobile; using it for admin reads would
 * make those rows impossible to manage. Older local test doubles may expose
 * only the canonical reader, so fall back only when no admin reader exists or
 * when it explicitly returns null.
 */
function hasAdminReader(syncService?: ConvexSyncService) {
  const fetchAdmin = (syncService as unknown as { fetchAdminMasterPlants?: unknown } | undefined)?.fetchAdminMasterPlants;
  if (typeof fetchAdmin !== "function") return false;
  if (typeof syncService?.isAdminProxyEnabled === "function") {
    return syncService.isAdminProxyEnabled();
  }
  return true;
}

async function fetchAdminSnapshot(
  syncService: ConvexSyncService,
  locale: string,
  requireAdmin = false,
): Promise<ConvexPlantLibraryItem[]> {
  if (hasAdminReader(syncService)) {
    const remote = await (syncService as unknown as { fetchAdminMasterPlants: (locale: string) => Promise<ConvexPlantLibraryItem[] | null> })
      .fetchAdminMasterPlants(locale);
    if (remote) return remote;
  }

  const hasFetchAdmin = typeof (syncService as unknown as { fetchAdminMasterPlants?: unknown }).fetchAdminMasterPlants === "function";
  if (requireAdmin && hasFetchAdmin) {
    throw new Error("Convex admin read sync is not configured");
  }

  const fallback = await syncService.fetchMasterPlants(locale);
  return fallback ?? [];
}

export function upsertMasterPlantRow(
  db: SqliteDatabase,
  payload: z.infer<typeof createMasterPlantSchema>,
) {
  // Keep the exported compatibility boundary safe for internal callers that
  // provide a structurally valid payload without first running the route's
  // withSourceIdentity helper.
  payload = withSourceIdentity(createMasterPlantSchema.parse(payload));
  const i18nPayload = payload.i18n!;
  const resolvedCommonName = payload.common_name ?? i18nPayload.vi.common_name;
  let existing = payload.source_id
    ? db
      .prepare(`SELECT id FROM master_plants WHERE source_system = ? AND source_id = ?`)
      .get(payload.source_system, payload.source_id) as { id: number } | undefined
    : undefined;

  // Legacy rows predate the stable source identity and hold NULL source_id.
  // When a payload adopts a stable identity for such a row (Giai đoạn 1
  // provenance backfill), the source lookup misses — fall back to plant_code
  // so the legacy row is updated in place instead of colliding on INSERT.
  // The fallback only adopts rows that still carry no source identity, so a
  // genuinely different row with the same plant_code can never be hijacked.
  if (!existing) {
    const byCode = db
      .prepare(`SELECT id, source_id FROM master_plants WHERE plant_code = ?`)
      .get(payload.plant_code) as { id: number; source_id: string | null } | undefined;
    if (byCode && (byCode.source_id ?? "").trim() === "") {
      existing = byCode;
    }
  }

  // Every normal SQLite writer crosses this boundary.  The resolver is
  // deterministic for legacy scientific_name rows, rejects incomplete new
  // identities, links an unambiguous cultivar parent, and checks active-key
  // conflicts before any row is inserted or updated.
  const canonical = resolveCanonicalIdentityForWrite(
    db,
    payload as unknown as Record<string, unknown>,
    existing?.id,
  );

  // The archived-term rule needs the resolved plant identity so an
  // already-assigned archived code can be re-saved (unrelated edits).
  validatePlantGeography(db, existing?.id ?? null, payload);

  if (existing) {
    const existingRow = db.prepare(
      `SELECT care_status, care_field_evidence_json FROM master_plants WHERE id = ?`,
    ).get(existing.id) as { care_status: string; care_field_evidence_json: string } | undefined;
    // Recompute only when the payload changes care fields/evidence; otherwise
    // keep the persisted aggregate and evidence (i18n-only edits must not
    // downgrade or erase them).
    const careChanged = carePayloadHasChanges(payload);
    const resolvedCareStatus = careChanged
      ? resolveCareStatus(payload)
      : (existingRow?.care_status ?? "missing");
    const resolvedEvidence = payload.care_field_evidence !== undefined
      ? payload.care_field_evidence
      : (parseJson(existingRow?.care_field_evidence_json ?? "{}") || {});
    db.prepare(
      `UPDATE master_plants SET
        plant_code = ?,
        common_name = ?,
        scientific_name = ?,
        canonical_identity_version = ?,
        canonical_key = ?,
        genus = ?,
        species = ?,
        infraspecific_rank = ?,
        infraspecific_name = ?,
        cultivar = ?,
        identity_scope = ?,
        parent_master_plant_id = ?,
        parent_canonical_key = ?,
        source_system = ?,
        source_id = ?,
        record_version = ?,
        category = ?,
        "group" = ?,
        family = ?,
        purposes_json = ?,
        growth_stage = ?,
        typical_days_to_harvest = ?,
        germination_days = ?,
        watering_frequency_days = ?,
        fertilizing_frequency_days = ?,
        soil_ph_min = ?,
        soil_ph_max = ?,
        moisture_target = ?,
        light_hours = ?,
        light_requirements = ?,
        spacing_cm = ?,
        max_plants_per_m2 = ?,
        seed_rate_per_m2 = ?,
        water_liters_per_m2 = ?,
        yield_kg_per_m2 = ?,
        image_url = ?,
        is_active = ?,
        notes = ?,
        metadata_json = ?,
        source_url = ?,
        content_status = ?,
        content_version = ?,
        review_status = ?,
        reviewed_at = ?,
        reviewed_by = ?,
        sync_origin = ?,
        care_status = ?,
        care_field_evidence_json = ?,
        propagation_methods_json = ?,
        updated_at = datetime('now')
      WHERE id = ?`,
    ).run(
      payload.plant_code,
      resolvedCommonName,
      payload.scientific_name ?? null,
      canonical.canonical_identity_version,
      canonical.canonical_key,
      canonical.genus,
      canonical.species,
      canonical.infraspecific_rank,
      canonical.infraspecific_name,
      canonical.cultivar,
      canonical.identity_scope,
      canonical.parent_master_plant_id,
      canonical.parent_canonical_key,
      payload.source_system,
      payload.source_id ?? null,
      payload.record_version,
      payload.category,
      payload.group,
      payload.family ?? null,
      JSON.stringify(payload.purposes),
      payload.growth_stage,
      payload.typical_days_to_harvest ?? null,
      payload.germination_days ?? null,
      payload.watering_frequency_days ?? null,
      payload.fertilizing_frequency_days ?? null,
      payload.soil_ph_min ?? null,
      payload.soil_ph_max ?? null,
      payload.moisture_target ?? null,
      payload.light_hours ?? null,
      payload.light_requirements ?? null,
      payload.spacing_cm ?? null,
      payload.max_plants_per_m2 ?? null,
      payload.seed_rate_per_m2 ?? null,
      payload.water_liters_per_m2 ?? null,
      payload.yield_kg_per_m2 ?? null,
      payload.image_url ?? null,
      toSqliteBoolean(payload.is_active),
      payload.notes ?? null,
      JSON.stringify(payload.metadata_json),
      payload.source_url ?? null,
      payload.content_status,
      payload.content_version,
      payload.review_status,
      payload.reviewed_at ?? null,
      payload.reviewed_by ?? null,
      payload.sync_origin,
      resolvedCareStatus,
      JSON.stringify(resolvedEvidence),
      JSON.stringify(normalizePropagationMethods(payload.propagation_methods) ?? []),
      existing.id,
    );
    applyPlantGeographyPayload(db, existing.id, payload);
    upsertI18n(db, existing.id, i18nPayload);
    return existing.id;
  }

  const result = db
    .prepare(
      `INSERT INTO master_plants (
        plant_code,
        common_name,
        scientific_name,
        canonical_identity_version,
        canonical_key,
        genus,
        species,
        infraspecific_rank,
        infraspecific_name,
        cultivar,
        identity_scope,
        parent_master_plant_id,
        parent_canonical_key,
        source_system,
        source_id,
        record_version,
        category,
        "group",
        family,
        purposes_json,
        growth_stage,
        typical_days_to_harvest,
        germination_days,
        watering_frequency_days,
        fertilizing_frequency_days,
        soil_ph_min,
        soil_ph_max,
        moisture_target,
        light_hours,
        light_requirements,
        spacing_cm,
        max_plants_per_m2,
        seed_rate_per_m2,
        water_liters_per_m2,
        yield_kg_per_m2,
        image_url,
        is_active,
        notes,
        metadata_json,
        source_url,
        content_status,
        content_version,
        review_status,
        reviewed_at,
        reviewed_by,
        sync_origin,
        care_status,
        care_field_evidence_json,
        propagation_methods_json
      ) VALUES (${Array.from({ length: 49 }, () => "?").join(", ")})`,
    )
    .run(
      payload.plant_code,
      resolvedCommonName,
      payload.scientific_name ?? null,
      canonical.canonical_identity_version,
      canonical.canonical_key,
      canonical.genus,
      canonical.species,
      canonical.infraspecific_rank,
      canonical.infraspecific_name,
      canonical.cultivar,
      canonical.identity_scope,
      canonical.parent_master_plant_id,
      canonical.parent_canonical_key,
      payload.source_system,
      payload.source_id ?? null,
      payload.record_version,
      payload.category,
      payload.group,
      payload.family ?? null,
      JSON.stringify(payload.purposes),
      payload.growth_stage,
      payload.typical_days_to_harvest ?? null,
      payload.germination_days ?? null,
      payload.watering_frequency_days ?? null,
      payload.fertilizing_frequency_days ?? null,
      payload.soil_ph_min ?? null,
      payload.soil_ph_max ?? null,
      payload.moisture_target ?? null,
      payload.light_hours ?? null,
      payload.light_requirements ?? null,
      payload.spacing_cm ?? null,
      payload.max_plants_per_m2 ?? null,
      payload.seed_rate_per_m2 ?? null,
      payload.water_liters_per_m2 ?? null,
      payload.yield_kg_per_m2 ?? null,
      payload.image_url ?? null,
      toSqliteBoolean(payload.is_active),
      payload.notes ?? null,
      JSON.stringify(payload.metadata_json),
      payload.source_url ?? null,
      payload.content_status,
      payload.content_version,
      payload.review_status,
      payload.reviewed_at ?? null,
      payload.reviewed_by ?? null,
      payload.sync_origin,
      resolveCareStatus(payload),
      JSON.stringify(payload.care_field_evidence ?? {}),
      JSON.stringify(normalizePropagationMethods(payload.propagation_methods) ?? []),
    );
  const id = Number(result.lastInsertRowid);
  applyPlantGeographyPayload(db, id, payload);
  upsertI18n(db, id, i18nPayload);
  return id;
}

export function convexPlantToCreatePayload(plant: ReturnType<typeof normalizeConvexPlant>) {
  // The canonical/admin projection preserves missing translations for stats
  // and export. SQLite's mirror schema still requires the two baseline
  // locales, so only the mirror write gets a deterministic compatibility name;
  // it is never exposed as reviewed/curated content by the read projection.
  const i18n = { ...plant.i18n };
  if (!i18n.vi?.common_name?.trim()) {
    i18n.vi = { common_name: plant.common_name };
  }
  if (!i18n.en?.common_name?.trim()) {
    i18n.en = { common_name: plant.scientific_name };
  }
  const canonical = deriveConvexCanonicalIdentity(plant);
  return createMasterPlantSchema.parse({
    plant_code: plant.plant_code,
    common_name: plant.common_name,
    scientific_name: plant.scientific_name,
    genus: canonical.genus,
    species: canonical.species,
    infraspecific_rank: canonical.infraspecific_rank,
    infraspecific_name: canonical.infraspecific_name,
    cultivar: canonical.cultivar,
    identity_scope: canonical.identity_scope,
    parent_master_plant_id: null,
    parent_canonical_key: canonical.parent_canonical_key,
    source_system: plant.source_system,
    source_id: plant.source_id,
    record_version: plant.record_version,
    category: plant.category,
    group: plant.group,
    family: plant.family,
    purposes: plant.purposes,
    growth_stage: plant.growth_stage,
    typical_days_to_harvest: plant.typical_days_to_harvest,
    germination_days: plant.germination_days,
    watering_frequency_days: plant.watering_frequency_days,
    fertilizing_frequency_days: plant.fertilizing_frequency_days,
    soil_ph_min: plant.soil_ph_min,
    soil_ph_max: plant.soil_ph_max,
    moisture_target: plant.moisture_target,
    light_hours: plant.light_hours,
    light_requirements: plant.light_requirements,
    spacing_cm: plant.spacing_cm,
    max_plants_per_m2: plant.max_plants_per_m2,
    seed_rate_per_m2: plant.seed_rate_per_m2,
    water_liters_per_m2: plant.water_liters_per_m2,
    yield_kg_per_m2: plant.yield_kg_per_m2,
    image_url: plant.image_url,
    is_active: plant.is_active,
    notes: plant.notes,
    source_url: plant.source_url,
    content_status: plant.content_status,
    content_version: plant.content_version,
    review_status: plant.review_status,
    reviewed_at: plant.reviewed_at,
    reviewed_by: plant.reviewed_by,
    sync_origin: plant.sync_origin,
    metadata_json: plant.metadata_json,
    propagation_methods: plant.propagation_methods,
    i18n,
  });
}

const bulkSchema = z.object({
  action: z.enum(["activate", "deactivate", "delete"]),
  ids: z.array(z.number().int().positive()).min(1).max(500),
});

const exportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
  source: z.enum(["auto", "convex", "sqlite"]).default("auto"),
  is_active: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true" || v === "1")),
});

type MasterPlantCsvRow = Omit<
  ReturnType<typeof normalizeMasterPlant>,
  | "canonical_identity_version"
  | "canonical_key"
  | "genus"
  | "species"
  | "infraspecific_rank"
  | "infraspecific_name"
  | "cultivar"
  | "identity_scope"
  | "parent_master_plant_id"
  | "parent_canonical_key"
  | "canonical_status"
  | "canonical_archived_at"
  | "canonical_archived_into_id"
  | "canonical_archive_reason"
  | "origin_countries"
  | "origin_country_source_refs"
  | "proven_regions"
  | "adaptation_term_codes"
  | "adaptation_term_source_refs"
  | "resolved_geography"
>;

function toCsv(rows: MasterPlantCsvRow[], i18nMap: Map<number, ReturnType<typeof normalizeI18n>>): string {
  const headers = [
    "id", "plant_code", "common_name", "scientific_name", "source_system", "source_id", "record_version",
    "category", "group", "family", "growth_stage", "typical_days_to_harvest", "germination_days",
    "watering_frequency_days", "fertilizing_frequency_days",
    "soil_ph_min", "soil_ph_max", "moisture_target", "light_hours",
    "light_requirements", "spacing_cm", "max_plants_per_m2", "seed_rate_per_m2",
    "water_liters_per_m2", "yield_kg_per_m2", "image_url", "is_active", "notes",
    "source_url", "content_status", "content_version", "review_status", "reviewed_at", "reviewed_by",
    "metadata_json", "propagation_methods", "vi_common_name", "vi_description", "vi_care_content",
    "en_common_name", "en_description", "en_care_content",
    "es_common_name", "es_description", "es_care_content",
    "fr_common_name", "fr_description", "fr_care_content",
    "pt_common_name", "pt_description", "pt_care_content",
    "zh_common_name", "zh_description", "zh_care_content",
    "created_at", "updated_at",
  ];
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const str = String(v);
    if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
      return `"${str.replace(/"/g, "\"\"")}"`;
    }
    return str;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    const i18n = i18nMap.get(row.id) ?? { vi: { common_name: "" }, en: { common_name: "" } };
    const localeCells = (["vi", "en", "es", "fr", "pt", "zh"] as const).flatMap((locale) => {
      const value = i18n[locale];
      return [
        value?.common_name ?? "",
        value?.description ?? "",
        value?.care_content ?? "",
      ];
    });
    lines.push([
      row.id, row.plant_code, row.common_name, row.scientific_name, row.source_system, row.source_id, row.record_version,
      row.category, row.group, row.family,
      row.growth_stage, row.typical_days_to_harvest, row.germination_days,
      row.watering_frequency_days, row.fertilizing_frequency_days,
      row.soil_ph_min, row.soil_ph_max, row.moisture_target, row.light_hours,
      row.light_requirements, row.spacing_cm, row.max_plants_per_m2, row.seed_rate_per_m2,
      row.water_liters_per_m2, row.yield_kg_per_m2, row.image_url, row.is_active, row.notes,
      row.source_url, row.content_status, row.content_version, row.review_status, row.reviewed_at, row.reviewed_by,
      JSON.stringify(row.metadata_json), JSON.stringify(row.propagation_methods ?? []),
      ...localeCells,
      row.created_at, row.updated_at,
    ].map(escape).join(","));
  }
  return lines.join("\n");
}

export function createMasterPlantsRouter(db: SqliteDatabase, syncService?: ConvexSyncService): Router {
  const router = Router();

  // ── GET /stats ───────────────────────────────────────
  router.get("/stats", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z.object({
        source: z.enum(["auto", "convex", "sqlite"]).default("auto"),
      }).parse(req.query);
      if (query.source !== "sqlite" && syncService?.canReadFromConvex()) {
        const remotePlants = await fetchAdminSnapshot(syncService, "vi", true);
        res.json(getRemotePlantStats((remotePlants ?? []).map(normalizeConvexPlant)));
        return;
      }

      res.json(getSqlitePlantStats(db));
    } catch (error) {
      next(error);
    }
  });

  // Keep this explicit collection route before the generic `/:id` route below.
  // Stage 2 of the local-first flow: Markdown has already been imported into
  // SQLite, but care content still needs approval in Plant Detail before the
  // resulting snapshot can enter the publication outbox.
  router.get("/care-approvals", (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(listPendingCareApprovals(db));
    } catch (error) {
      next(error);
    }
  });

  router.post("/sync-convex-to-sqlite", async (_req: Request, res: Response, next: NextFunction) => {
    let reconciliationId: number | undefined;
    try {
      if (!syncService?.canReadFromConvex()) {
        res.status(503).json({ error: "Convex read sync is not configured" });
        return;
      }

      const started = db.prepare(`
        INSERT INTO sync_reconciliation_runs (source, status) VALUES ('convex', 'running')
      `).run();
      reconciliationId = Number(started.lastInsertRowid);

      const remotePlants = await fetchAdminSnapshot(syncService, "vi", true);
      const normalized = (remotePlants ?? []).map(normalizeConvexPlant);
      const payloads = normalized.map(convexPlantToCreatePayload);
      const remoteKeys = new Set(payloads.map((payload) => `${payload.source_system}:${payload.source_id}`));
      const localMirrorRows = db.prepare(`
        SELECT * FROM master_plants WHERE sync_origin = 'mirror'
      `).all() as MasterPlantRow[];
      const staleRows = localMirrorRows.filter((row) => !remoteKeys.has(`${row.source_system}:${row.source_id}`));
      const syncRows = db.transaction(() => {
        let upserted = 0;
        for (const payload of payloads) {
          upsertMasterPlantRow(db, { ...payload, sync_origin: "mirror" });
          upserted++;
        }
        for (const stale of staleRows) {
          const guardError = sqliteDeleteGuard(db, stale);
          if (guardError) {
            throw new Error(`Cannot remove stale canonical plant ${stale.id}: ${guardError}`);
          }
          db.prepare(`DELETE FROM master_plants WHERE id = ?`).run(stale.id);
        }
        return { upserted, removed: staleRows.length };
      });
      const result = syncRows();

      db.prepare(`
        UPDATE sync_reconciliation_runs
        SET finished_at = datetime('now'), remote_count = ?, local_count = ?,
            upserted_count = ?, removed_count = ?, drift_before = ?, drift_after = 0,
            status = 'completed'
        WHERE id = ?
      `).run(
        payloads.length,
        localMirrorRows.length,
        result.upserted,
        result.removed,
        result.removed,
        reconciliationId,
      );

      res.json({
        ok: true,
        upserted: result.upserted,
        removed: result.removed,
        drift: 0,
        stats: getSqlitePlantStats(db),
      });
    } catch (error) {
      if (reconciliationId !== undefined) {
        db.prepare(`
          UPDATE sync_reconciliation_runs
          SET finished_at = datetime('now'), status = 'failed', error = ? WHERE id = ?
        `).run(error instanceof Error ? error.message : String(error), reconciliationId);
      }
      next(error);
    }
  });

  router.post("/sync-outbox/process", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = z.coerce.number().int().min(1).max(100).default(25).parse(req.query.limit);
      // Local authoring already committed the SQLite row before it entered
      // the outbox. Publishing must never hydrate the (possibly stale)
      // payload back over newer local edits; the processor only marks the
      // outbox item applied. Delete publication is also write-once here; the
      // local row is already gone and must not be removed if a new row with
      // the same source identity was authored before retry.
      const result = await processSyncOutbox(db, syncService, limit);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  router.post("/sync-outbox/retry-failed", (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ ok: true, retried: retryFailedSyncOutbox(db) });
    } catch (error) {
      next(error);
    }
  });

  // Explicit queue-only boundary for legacy/local authored rows. This does
  // not call Convex or process pending work; the separate publish action does
  // that only after an operator requests it and credentials are configured.
  router.post("/sync-outbox/queue-local", (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = z.coerce.number().int().min(1).max(5000).default(5000).parse(req.query.limit);
      const result = queueLocalAuthoringPlantsForPublish(db, limit);
      res.json({ ok: true, ...result, publishStarted: false });
    } catch (error) {
      next(error);
    }
  });

  // ── POST /bulk ────────────────────────────────────────
  router.post("/bulk", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = bulkSchema.parse(req.body);
      const placeholders = payload.ids.map(() => "?").join(",");

      if (payload.action === "activate") {
        const result = db.transaction(() => {
          const rows = db.prepare(`SELECT * FROM master_plants WHERE id IN (${placeholders})`).all(...payload.ids) as MasterPlantRow[];
          let queued = 0;
          let skippedNotApproved = 0;
          for (const row of rows) {
            const merged = withSourceIdentity(createMasterPlantSchema.parse({
              ...normalizeMasterPlant(db, row),
              i18n: fetchI18n(db, row.id),
              is_active: true,
            }));
            upsertMasterPlantRow(db, { ...merged, sync_origin: "local" });
            if (evaluatePayloadApproval(merged as unknown as Record<string, unknown>).allowed) {
              queuePlantSync(db, merged);
              queued++;
            } else {
              skippedNotApproved++;
            }
          }
          return { affected: rows.length, queued, skippedNotApproved };
        })();
        res.json(result);
      } else if (payload.action === "deactivate") {
        const result = db.transaction(() => {
          const rows = db.prepare(`SELECT * FROM master_plants WHERE id IN (${placeholders})`).all(...payload.ids) as MasterPlantRow[];
          let queued = 0;
          let skippedNotApproved = 0;
          for (const row of rows) {
            const merged = withSourceIdentity(createMasterPlantSchema.parse({
              ...normalizeMasterPlant(db, row),
              i18n: fetchI18n(db, row.id),
              is_active: false,
            }));
            upsertMasterPlantRow(db, { ...merged, sync_origin: "local" });
            if (evaluatePayloadApproval(merged as unknown as Record<string, unknown>).allowed) {
              queuePlantSync(db, merged);
              queued++;
            } else {
              skippedNotApproved++;
            }
          }
          return { affected: rows.length, queued, skippedNotApproved };
        })();
        res.json(result);
      } else if (payload.action === "delete") {
        if (req.authUser?.role !== "admin") {
          res.status(403).json({ error: "Forbidden: bulk delete is admin-only" });
          return;
        }
        const rejected: Array<{ id: number; error: string }> = [];
        let affected = 0;
        const queued = true;
        db.transaction(() => {
          for (const id of payload.ids) {
            const row = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(id) as MasterPlantRow | undefined;
            if (!row) continue;

            const guardError = sqliteDeleteGuard(db, row);
            if (guardError) {
              rejected.push({ id, error: guardError });
              continue;
            }

            db.prepare(`DELETE FROM master_plants WHERE id = ?`).run(id);
            if (queued) {
              enqueueSyncOutbox(db, {
                entityType: "master_plant",
                sourceSystem: row.source_system,
                sourceId: row.source_id ?? String(row.id),
                operation: "delete_plant",
                payload: { id: row.id },
              });
            }
            affected += 1;
          }
        })();
        const status = rejected.length > 0 ? 409 : 200;
        res.status(status).json({
          affected,
          failures: rejected.map(({ id }) => String(id)),
          rejected,
          retryable: false,
          queued,
          ...(rejected.length > 0 ? { error: "One or more master plants cannot be deleted; deactivate them instead" } : {}),
        });
      }
    } catch (error) {
      next(error);
    }
  });

  // ── GET /export ───────────────────────────────────────
  router.get("/export", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = exportQuerySchema.parse(req.query);

      // ── Convex path ──
      if (query.source !== "sqlite" && syncService?.canReadFromConvex()) {
        const remotePlants = await fetchAdminSnapshot(syncService, "vi", true);
        let normalized = (remotePlants ?? []).map(normalizeConvexPlant);

        if (typeof query.is_active === "boolean") {
          const active = query.is_active;
          normalized = normalized.filter((p) => p.is_active === active);
        }

        if (query.format === "csv") {
          // Build a stub i18nMap from the already-resolved i18n on each plant
          const i18nMap = new Map<number, ReturnType<typeof normalizeI18n>>();
          normalized.forEach((p, idx) => {
            // normalizeConvexPlant assigns a string _id, not a numeric id.
            // Use idx as a synthetic numeric key for the CSV helper.
            i18nMap.set(idx, p.i18n as ReturnType<typeof normalizeI18n>);
          });
          // toCsv expects rows with numeric ids and string timestamps; remap accordingly
          const remapped = normalized.map((p, idx) => ({
            ...p,
            id: idx,
            created_at: p.created_at ?? "",
            updated_at: p.updated_at ?? "",
          }));
          const csv = toCsv(remapped, i18nMap);
          res.setHeader("Content-Type", "text/csv; charset=utf-8");
          res.setHeader("Content-Disposition", `attachment; filename="master-plants-${Date.now()}.csv"`);
          res.send(csv);
        } else {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Content-Disposition", `attachment; filename="master-plants-${Date.now()}.json"`);
          res.json(normalized);
        }
        return;
      }

      // ── SQLite path ──
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (typeof query.is_active === "boolean") {
        conditions.push("is_active = ?");
        params.push(toSqliteBoolean(query.is_active));
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const rows = db
        .prepare(`SELECT * FROM master_plants ${where} ORDER BY id ASC`)
        .all(...params) as MasterPlantRow[];

      const normalized = rows.map((row) => normalizeMasterPlant(db, row));

      if (query.format === "csv") {
        const i18nMap = new Map<number, ReturnType<typeof normalizeI18n>>();
        for (const row of rows) {
          i18nMap.set(row.id, fetchI18n(db, row.id));
        }
        const csv = toCsv(normalized, i18nMap);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="master-plants-${Date.now()}.csv"`);
        res.send(csv);
      } else {
        const withI18n = normalized.map((row) => ({ ...row, i18n: fetchI18n(db, row.id) }));
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="master-plants-${Date.now()}.json"`);
        res.json(withI18n);
      }
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listQuerySchema.parse(req.query);

      if (query.source !== "sqlite" && syncService?.canReadFromConvex()) {
        const remotePlants = await fetchAdminSnapshot(syncService, "vi", true);
        const normalized = (remotePlants ?? []).map(normalizeConvexPlant);
        const filtered = normalized.filter((plant) => {
          if (typeof query.is_active === "boolean" && plant.is_active !== query.is_active) {
            return false;
          }
          if (!query.search) {
            return true;
          }
          const needle = query.search.toLowerCase();
          return [plant.plant_code, plant.common_name, plant.scientific_name]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(needle));
        });

        const offset = (query.page - 1) * query.page_size;
        const data = filtered.slice(offset, offset + query.page_size);

        res.json({
          data,
          pagination: {
            page: query.page,
            page_size: query.page_size,
            total: filtered.length,
          },
          groupOptions: Array.from(new Set(normalized.map((plant) => plant.group).filter(Boolean))).sort(),
        });
        return;
      }

      // The local authoring boundary deliberately resolves the complete
      // SQLite snapshot before filtering. SQL LIKE is not accent-insensitive
      // across all SQLite builds, while the dashboard contract requires
      // `mồng tơi` and `mong toi` to produce the same result set.
      const rows = db
        .prepare(`SELECT * FROM master_plants ORDER BY updated_at DESC, id DESC`)
        .all() as MasterPlantRow[];
      const i18nByPlant = new Map<number, ReturnType<typeof normalizeI18n>>();
      const allI18nRows = db.prepare(`SELECT * FROM master_plant_i18n`).all() as MasterPlantI18nRow[];
      const groupedI18n = new Map<number, MasterPlantI18nRow[]>();
      for (const i18nRow of allI18nRows) {
        const grouped = groupedI18n.get(i18nRow.master_plant_id);
        if (grouped) grouped.push(i18nRow);
        else groupedI18n.set(i18nRow.master_plant_id, [i18nRow]);
      }
      for (const [plantId, plantI18nRows] of groupedI18n) {
        i18nByPlant.set(plantId, normalizeI18n(plantI18nRows));
      }
      const groupOptions = Array.from(new Set(
        rows.map((row) => row.group).filter((group) => Boolean(group?.trim())),
      )).sort((a, b) => a.localeCompare(b, "vi"));
      const needle = normalizePlantSearchText(query.search);
      const requestedGroupValue = normalizePlantSearchText(query.group ?? query.group_filter);
      const requestedGroup = requestedGroupValue === "all" ? "" : requestedGroupValue;
      const missingI18n = Boolean(query.missing_i18n || query.filter_missing_i18n);
      const noImage = Boolean(query.no_image || query.filter_no_image);
      // Filter and sort on raw row/i18n fields first: normalizeMasterPlant
      // resolves geography (origin countries, proven regions, adaptation
      // terms, inheritance) with several queries per plant, so it must only
      // run for the page slice actually returned to the dashboard.
      const filtered = rows
        .map((row) => ({
          row,
          i18n: i18nByPlant.get(row.id) ?? { vi: { common_name: "" }, en: { common_name: "" } },
        }))
        .filter(({ row, i18n }) => {
          if (typeof query.is_active === "boolean" && Boolean(row.is_active) !== query.is_active) {
            return false;
          }
          if (requestedGroup && normalizePlantSearchText(row.group) !== requestedGroup) {
            return false;
          }
          if (missingI18n && i18n.vi?.common_name?.trim() && i18n.en?.common_name?.trim()) {
            return false;
          }
          if (noImage && row.image_url) {
            return false;
          }
          if (!needle) {
            return true;
          }
          const haystack = [
            row.plant_code,
            row.common_name,
            row.scientific_name,
            row.family,
            row.group,
            row.category,
            ...Object.values(i18n).flatMap((locale) => [locale?.common_name, locale?.description]),
          ]
            .map(normalizePlantSearchText)
            .filter(Boolean)
            .join(" ");
          return haystack.includes(needle);
        });
      // Keep cluster order stable across pages. The dashboard can therefore
      // render a family/common header without rows jumping between requests.
      filtered.sort((left, right) => {
        const leftMetadata = (parseJson(left.row.metadata_json) || {}) as Record<string, unknown>;
        const rightMetadata = (parseJson(right.row.metadata_json) || {}) as Record<string, unknown>;
        const leftCluster = query.view_mode === "family"
          ? left.row.family ?? ""
          : (typeof leftMetadata.commonNameGroupKey === "string" && leftMetadata.commonNameGroupKey)
            || String(left.row.scientific_name ?? "").split(/\s+/, 1)[0]
            || left.row.group;
        const rightCluster = query.view_mode === "family"
          ? right.row.family ?? ""
          : (typeof rightMetadata.commonNameGroupKey === "string" && rightMetadata.commonNameGroupKey)
            || String(right.row.scientific_name ?? "").split(/\s+/, 1)[0]
            || right.row.group;
        return normalizePlantSearchText(leftCluster).localeCompare(normalizePlantSearchText(rightCluster), "vi")
          || normalizePlantSearchText(left.row.common_name).localeCompare(normalizePlantSearchText(right.row.common_name), "vi")
          || left.row.id - right.row.id;
      });
      const offset = (query.page - 1) * query.page_size;
      // Inheritance resolution needs the display base plant per species key.
      // The full row set is already loaded for filtering, so resolve it once
      // instead of scanning the whole table again for every page row.
      const baseBySpeciesKey = new Map<string, MasterPlantRow>();
      for (const candidate of rows) {
        if (!isSqliteDisplayBasePlant(candidate)) continue;
        const key = sqliteSpeciesKey(candidate);
        if (key && !baseBySpeciesKey.has(key)) baseBySpeciesKey.set(key, candidate);
      }
      const data = filtered.slice(offset, offset + query.page_size).map(({ row, i18n }) => ({
        ...normalizeMasterPlant(db, row, baseBySpeciesKey),
        i18n,
      }));

      res.json({
        data,
        pagination: {
          page: query.page,
          page_size: query.page_size,
          total: filtered.length,
        },
        groupOptions,
        stats: getSqlitePlantStats(db),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = String(req.params.id ?? "").trim();
      const source = z.enum(["auto", "convex", "sqlite"]).default("auto").parse(req.query.source);
      const numericId = /^[1-9]\d*$/.test(rawId) ? Number(rawId) : undefined;
      const row = numericId === undefined
        ? undefined
        : db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(numericId) as
          | MasterPlantRow
          | undefined;

      if (source !== "sqlite" && syncService?.canReadFromConvex()) {
        const remoteRows = await fetchAdminSnapshot(syncService, "vi", true);
        const remote = row?.source_id
          ? remoteRows.find((item) => {
            const sourceMatches = item.sourceSystem
              ? item.sourceSystem === row.source_system
              : row.source_system === "convex";
            if (!sourceMatches) return false;
            return item.sourceId === row.source_id ||
              (row.source_system === "convex" && item._id === row.source_id);
          })
          : remoteRows.find((item) => item._id === rawId || item.sourceId === rawId);
        if (remote) {
          const normalized = normalizeConvexPlant(remote);
          res.json({
            data: {
              ...normalized,
              ...(row ? { id: row.id } : {}),
              i18n: normalized.i18n,
            },
          });
          return;
        }
      }

      if (!row) {
        res.status(404).json({ error: "Master plant not found" });
        return;
      }

      res.json({ data: { ...normalizeMasterPlant(db, row), i18n: fetchI18n(db, row.id) } });
    } catch (error) {
      next(error);
    }
  });

  // Read-only create/import guard.  The response is deliberately separate
  // from POST / so dashboards can show an exact existing row or near-match
  // suggestions before committing a new record.
  router.post("/canonical-match-preview", async (req: Request, res: Response, next: NextFunction) => {
    try {
      assertStructuredCanonicalIdentity(req.body);
      const payload = createMasterPlantSchema.parse(req.body);
      const preview = previewCanonicalIdentityMatch(db, payload as unknown as Record<string, unknown>);
      res.json({ data: preview });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Never infer a new identity from scientific_name, common_name, or
      // metadata.  Existing-row PATCH compatibility is handled below.
      assertStructuredCanonicalIdentity(req.body);
      const authoredPayload = createMasterPlantSchema.parse(
        sanitizeAuthoringPlantPayload(createMasterPlantSchema.parse(req.body) as unknown as Record<string, unknown>).payload,
      );
      const payload = withSourceIdentity(authoredPayload);
      const preview = previewCanonicalIdentityMatch(db, payload as unknown as Record<string, unknown>);
      if (preview.exact) {
        res.status(409).json({
          error: "CANONICAL_PLANT_EXISTS",
          code: "CANONICAL_PLANT_EXISTS",
          match: preview.exact,
          suggestions: [],
        });
        return;
      }
      const conflict = sourceConflict(db, payload);
      if (conflict) {
        res.status(409).json({ error: "A master plant with this identity already exists" });
        return;
      }

      const approval = evaluatePayloadApproval(payload as unknown as Record<string, unknown>);
      const queued = approval.allowed;
      const rowId = db.transaction(() => {
        const localPayload = { ...payload, sync_origin: "local" as const };
        const id = upsertMasterPlantRow(db, localPayload);
        if (queued) queuePlantSync(db, payload);
        return id;
      })();
      const row = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(rowId) as MasterPlantRow;

      res.status(201).json({
        data: { ...normalizeMasterPlant(db, row), i18n: fetchI18n(db, row.id) },
        queued,
        ...(approval.allowed ? {} : { reason: approval.reason }),
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const payload = updateMasterPlantSchema.parse(req.body);

      const currentRow = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(id) as
        | MasterPlantRow
        | undefined;

      if (!currentRow) {
        res.status(404).json({ error: "Master plant not found" });
        return;
      }

      const currentI18n = fetchI18n(db, currentRow.id);
      const previousPayload = buildMasterPlantPayload(db, currentRow, currentI18n);
      const authoredPayload = createMasterPlantSchema.parse({
        ...normalizeMasterPlant(db, currentRow),
        i18n: currentI18n,
        ...payload,
        // Clearing the UI field must not silently rotate the stable upstream
        // identity. An explicit source-id change is still supported.
        source_id: payload.source_id == null ? currentRow.source_id : payload.source_id,
      });
      const mergedPayload = withSourceIdentity(createMasterPlantSchema.parse(
        sanitizeAuthoringPlantPayload(
          authoredPayload as unknown as Record<string, unknown>,
          previousPayload as unknown as Record<string, unknown>,
        ).payload,
      ));
      const conflict = sourceConflict(db, mergedPayload, currentRow.id);
      if (conflict) {
        res.status(409).json({ error: "A master plant with this identity already exists" });
        return;
      }

      const approval = evaluatePayloadApproval(mergedPayload as unknown as Record<string, unknown>);
      const queued = approval.allowed;
      const rowId = db.transaction(() => {
        const id = upsertMasterPlantRow(db, {
          ...mergedPayload,
          sync_origin: "local",
        });
        if (queued) queuePlantSync(db, mergedPayload);
        return id;
      })();
      const updatedRow = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(rowId) as MasterPlantRow;
      res.json({
        data: { ...normalizeMasterPlant(db, updatedRow), i18n: fetchI18n(db, rowId) },
        queued,
        ...(approval.allowed ? {} : { reason: approval.reason }),
      });
    } catch (error) {
      next(error);
    }
  });

  // Deletes are admin-only (Phase 3.1 role contract). `req.authUser` is set by
  // the auth middleware mounted in app.ts; editors receive 403 on every delete
  // path, including the bulk `delete` action handled inside POST /bulk.
  router.delete("/:id", requireRole(["admin"]), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const currentRow = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(id) as MasterPlantRow | undefined;
      if (!currentRow) {
        res.status(404).json({ error: "Master plant not found" });
        return;
      }

      const guardError = sqliteDeleteGuard(db, currentRow);
      if (guardError) {
        res.status(409).json({ error: guardError });
        return;
      }

      const queued = true;
      db.transaction(() => {
        db.prepare(`DELETE FROM master_plants WHERE id = ?`).run(id);
        if (queued) {
          enqueueSyncOutbox(db, {
            entityType: "master_plant",
            sourceSystem: currentRow.source_system,
            sourceId: currentRow.source_id ?? String(currentRow.id),
            operation: "delete_plant",
            payload: { id: currentRow.id },
          });
        }
      })();

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function handleMasterPlantsError(error: unknown, res: Response): boolean {
  if (error instanceof CanonicalIdentityMigrationError) {
    if (error.code === "CANONICAL_PLANT_EXISTS") {
      res.status(409).json({
        error: "CANONICAL_PLANT_EXISTS",
        details: error.message,
      });
      return true;
    }
    if (error.code.startsWith("CANONICAL_IDENTITY") || error.code === "CANONICAL_PARENT_MISMATCH") {
      res.status(400).json({ error: error.code, details: error.message });
      return true;
    }
  }

  if (error instanceof PlantGeographyValidationError) {
    res.status(400).json({ error: error.message });
    return true;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: error.flatten(),
    });
    return true;
  }

  if (error instanceof Error && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "");

    if (code === "SQLITE_CONSTRAINT_UNIQUE") {
      res.status(409).json({ error: "A master plant with this plant_code already exists" });
      return true;
    }

    if (code.startsWith("SQLITE_CONSTRAINT")) {
      res.status(400).json({ error: error.message });
      return true;
    }
  }

  if (error instanceof Error && error.message === "Convex admin read sync is not configured") {
    res.status(503).json({ error: error.message, retryable: true });
    return true;
  }

  if (error instanceof Error && error.message.startsWith("CONTENT_NOT_APPROVED")) {
    res.status(409).json({ error: "CONTENT_NOT_APPROVED", details: error.message });
    return true;
  }

  return false;
}
