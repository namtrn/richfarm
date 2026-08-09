import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { ZodError, z } from "zod";

import type { ConvexPlantLibraryItem, ConvexSyncService } from "./convex-sync";
import type { SqliteDatabase } from "./db";
import {
  enqueueSyncOutbox,
  processSyncOutbox,
  retryFailedSyncOutbox,
} from "./sync-outbox";

const growthStageSchema = z.enum(["seedling", "vegetative", "flowering", "harvest"]);
const contentStatusSchema = z.enum(["draft", "published", "needs_review", "archived"]);
const reviewStatusSchema = z.enum(["unreviewed", "in_review", "reviewed"]);

const localeContentSchema = z.object({
  common_name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(5000).nullish(),
  care_content_json: z.record(z.string(), z.unknown()).default({}),
  content_version: z.number().int().positive().optional(),
  source: z.string().trim().max(240).nullish(),
  source_url: z.string().url().nullish(),
  content_status: contentStatusSchema.optional(),
  review_status: reviewStatusSchema.optional(),
  reviewed_at: z.string().datetime().nullish(),
  reviewed_by: z.string().trim().max(240).nullish(),
});

const masterPlantObjectSchema = z.object({
  plant_code: z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9_-]+$/),
  common_name: z.string().trim().min(1).max(120).optional(),
  scientific_name: z.string().trim().max(160).nullish(),
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
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field is required for update",
  });

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
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

interface MasterPlantRow {
  id: number;
  plant_code: string;
  common_name: string;
  scientific_name: string | null;
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
  created_at: string;
  updated_at: string;
}

interface MasterPlantI18nRow {
  id: number;
  master_plant_id: number;
  locale: string;
  common_name: string;
  description: string | null;
  care_content_json: string;
  content_version: number;
  source: string | null;
  source_url: string | null;
  content_status: string;
  review_status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
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

export function normalizeMasterPlant(row: MasterPlantRow) {
  return {
    id: row.id,
    plant_code: row.plant_code,
    common_name: row.common_name,
    scientific_name: row.scientific_name,
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
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function normalizeI18n(rows: MasterPlantI18nRow[]) {
  const result: Record<string, {
    common_name: string;
    description?: string;
    care_content_json?: Record<string, unknown>;
    content_version?: number;
    source?: string;
    source_url?: string;
    content_status?: string;
    review_status?: string;
    reviewed_at?: string;
    reviewed_by?: string;
  }> = {
    vi: { common_name: "" },
    en: { common_name: "" },
  };

  for (const row of rows) {
    result[row.locale] = {
      common_name: row.common_name,
      ...(row.description ? { description: row.description } : {}),
      care_content_json: parseJson(row.care_content_json) || {},
      content_version: row.content_version,
      ...(row.source ? { source: row.source } : {}),
      ...(row.source_url ? { source_url: row.source_url } : {}),
      content_status: row.content_status,
      review_status: row.review_status,
      ...(row.reviewed_at ? { reviewed_at: row.reviewed_at } : {}),
      ...(row.reviewed_by ? { reviewed_by: row.reviewed_by } : {}),
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
    care_content_json?: Record<string, unknown>;
    content_version?: number;
    source?: string | null;
    source_url?: string | null;
    content_status?: string;
    review_status?: string;
    reviewed_at?: string | null;
    reviewed_by?: string | null;
  }>,
) {
  const locales = new Set(Object.keys(i18n).map((locale) => locale.trim().toLowerCase()));
  const existingRows = db
    .prepare(`SELECT id, locale FROM master_plant_i18n WHERE master_plant_id = ?`)
    .all(masterPlantId) as Array<{ id: number; locale: string }>;
  for (const row of existingRows) {
    if (!locales.has(row.locale)) {
      db.prepare(`DELETE FROM master_plant_i18n WHERE id = ?`).run(row.id);
    }
  }

  for (const [locale, payload] of Object.entries(i18n)) {
    if (!payload || !payload.common_name) continue;
    db.prepare(
      `INSERT INTO master_plant_i18n (
        master_plant_id, locale, common_name, description, care_content_json,
        content_version, source, source_url, content_status, review_status,
        reviewed_at, reviewed_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(master_plant_id, locale) DO UPDATE SET
         common_name = excluded.common_name,
         description = excluded.description,
         care_content_json = excluded.care_content_json,
         content_version = excluded.content_version,
         source = excluded.source,
         source_url = excluded.source_url,
         content_status = excluded.content_status,
         review_status = excluded.review_status,
         reviewed_at = excluded.reviewed_at,
         reviewed_by = excluded.reviewed_by,
         updated_at = datetime('now')`,
    ).run(
      masterPlantId,
      locale,
      payload.common_name,
      payload.description ?? null,
      JSON.stringify(payload.care_content_json ?? {}),
      payload.content_version ?? 1,
      payload.source ?? null,
      payload.source_url ?? null,
      payload.content_status ?? "published",
      payload.review_status ?? "unreviewed",
      payload.reviewed_at ?? null,
      payload.reviewed_by ?? null,
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
    ...normalizeMasterPlant(row),
    i18n,
  }));
}

function syncIdentity(row: MasterPlantRow) {
  return {
    id: row.id,
    sourceSystem: row.source_system,
    sourceId: row.source_id,
  };
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

function sqliteDeleteGuard(db: SqliteDatabase, row: MasterPlantRow): string | undefined {
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

  return undefined;
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
    care_content_json?: Record<string, unknown>;
    content_version?: number;
    source?: string;
    source_url?: string;
    content_status?: string;
    review_status?: string;
    reviewed_at?: string;
    reviewed_by?: string;
  }> = {};

  for (const row of plant.i18nRows ?? []) {
    i18n[row.locale] = {
      common_name: row.commonName,
      ...(row.description ? { description: row.description } : {}),
      ...(row.careContent ? { care_content_json: parseJson(row.careContent) || {} } : {}),
      ...(row.contentVersion !== undefined ? { content_version: row.contentVersion } : {}),
      ...(row.source ? { source: row.source } : {}),
      ...(row.sourceUrl ? { source_url: row.sourceUrl } : {}),
      ...(row.contentStatus ? { content_status: row.contentStatus } : {}),
      ...(row.reviewStatus ? { review_status: row.reviewStatus } : {}),
      ...(row.reviewedAt ? { reviewed_at: new Date(row.reviewedAt).toISOString() } : {}),
      ...(row.reviewedBy ? { reviewed_by: row.reviewedBy } : {}),
    };
  }

  return {
    id: plant._id,
    plant_code: buildConvexPlantCode(plant),
    common_name: plant.displayName,
    scientific_name: plant.scientificName,
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
  const missingImage = (db.prepare(`SELECT COUNT(*) AS n FROM master_plants WHERE image_url IS NULL OR image_url = ''`).get() as { n: number }).n;

  return { total, active, inactive, missingVi, missingEn, missingImage, source: "sqlite" as const };
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
  const i18nPayload = payload.i18n!;
  const resolvedCommonName = payload.common_name ?? i18nPayload.vi.common_name;
  const existing = payload.source_id
    ? db
      .prepare(`SELECT id FROM master_plants WHERE source_system = ? AND source_id = ?`)
      .get(payload.source_system, payload.source_id) as { id: number } | undefined
    : db
      .prepare(`SELECT id FROM master_plants WHERE plant_code = ?`)
      .get(payload.plant_code) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE master_plants SET
        plant_code = ?,
        common_name = ?,
        scientific_name = ?,
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
        updated_at = datetime('now')
      WHERE id = ?`,
    ).run(
      payload.plant_code,
      resolvedCommonName,
      payload.scientific_name ?? null,
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
      existing.id,
    );
    upsertI18n(db, existing.id, i18nPayload);
    return existing.id;
  }

  const result = db
    .prepare(
      `INSERT INTO master_plants (
        plant_code,
        common_name,
        scientific_name,
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
        sync_origin
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )`,
    )
    .run(
      payload.plant_code,
      resolvedCommonName,
      payload.scientific_name ?? null,
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
    );
  const id = Number(result.lastInsertRowid);
  upsertI18n(db, id, i18nPayload);
  return id;
}

function convexPlantToCreatePayload(plant: ReturnType<typeof normalizeConvexPlant>) {
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
  return createMasterPlantSchema.parse({
    plant_code: plant.plant_code,
    common_name: plant.common_name,
    scientific_name: plant.scientific_name,
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

function toCsv(rows: ReturnType<typeof normalizeMasterPlant>[], i18nMap: Map<number, ReturnType<typeof normalizeI18n>>): string {
  const headers = [
    "id", "plant_code", "common_name", "scientific_name", "source_system", "source_id", "record_version",
    "category", "group", "family", "growth_stage", "typical_days_to_harvest", "germination_days",
    "watering_frequency_days", "fertilizing_frequency_days",
    "soil_ph_min", "soil_ph_max", "moisture_target", "light_hours",
    "light_requirements", "spacing_cm", "max_plants_per_m2", "seed_rate_per_m2",
    "water_liters_per_m2", "yield_kg_per_m2", "image_url", "is_active", "notes",
    "source_url", "content_status", "content_version", "review_status", "reviewed_at", "reviewed_by",
    "metadata_json", "vi_common_name", "vi_description", "vi_care_content_json",
    "en_common_name", "en_description", "en_care_content_json",
    "es_common_name", "es_description", "es_care_content_json",
    "fr_common_name", "fr_description", "fr_care_content_json",
    "pt_common_name", "pt_description", "pt_care_content_json",
    "zh_common_name", "zh_description", "zh_care_content_json",
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
        JSON.stringify(value?.care_content_json ?? {}),
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
      JSON.stringify(row.metadata_json),
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
      const result = await processSyncOutbox(db, syncService, limit, {
        applyUpsert: (rawPayload) => {
          const payload = createMasterPlantSchema.parse({
            ...rawPayload,
            sync_origin: "mirror",
          });
          db.transaction(() => upsertMasterPlantRow(db, payload))();
        },
        applyDelete: ({ sourceSystem, sourceId }) => {
          db.prepare(`DELETE FROM master_plants WHERE source_system = ? AND source_id = ?`)
            .run(sourceSystem, sourceId);
        },
      });
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

  // ── POST /bulk ────────────────────────────────────────
  router.post("/bulk", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = bulkSchema.parse(req.body);
      const placeholders = payload.ids.map(() => "?").join(",");

      if (payload.action === "activate") {
        if (syncService?.isEnabled()) {
          const failures: string[] = [];
          for (const id of payload.ids) {
            const row = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(id) as MasterPlantRow | undefined;
            if (!row) continue;
            const merged = withSourceIdentity(createMasterPlantSchema.parse({
              ...normalizeMasterPlant(row),
              i18n: fetchI18n(db, row.id),
              is_active: true,
            }));
            try {
              await syncService.syncUpsert(merged as unknown as Record<string, unknown>);
              db.transaction(() => upsertMasterPlantRow(db, { ...merged, sync_origin: "mirror" }))();
            } catch (error) {
              queuePlantSync(db, merged);
              failures.push(String(id));
            }
          }
          res.status(failures.length ? 503 : 200).json({ affected: payload.ids.length - failures.length, failures, retryable: failures.length > 0 });
          return;
        }
        const result = db.prepare(`UPDATE master_plants SET is_active = 1, updated_at = datetime('now') WHERE id IN (${placeholders})`).run(...payload.ids);
        res.json({ affected: result.changes });
      } else if (payload.action === "deactivate") {
        if (syncService?.isEnabled()) {
          const failures: string[] = [];
          for (const id of payload.ids) {
            const row = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(id) as MasterPlantRow | undefined;
            if (!row) continue;
            const merged = withSourceIdentity(createMasterPlantSchema.parse({
              ...normalizeMasterPlant(row),
              i18n: fetchI18n(db, row.id),
              is_active: false,
            }));
            try {
              await syncService.syncUpsert(merged as unknown as Record<string, unknown>);
              db.transaction(() => upsertMasterPlantRow(db, { ...merged, sync_origin: "mirror" }))();
            } catch {
              queuePlantSync(db, merged);
              failures.push(String(id));
            }
          }
          res.status(failures.length ? 503 : 200).json({ affected: payload.ids.length - failures.length, failures, retryable: failures.length > 0 });
          return;
        }
        const result = db.prepare(`UPDATE master_plants SET is_active = 0, updated_at = datetime('now') WHERE id IN (${placeholders})`).run(...payload.ids);
        res.json({ affected: result.changes });
      } else if (payload.action === "delete") {
        const failures: string[] = [];
        const rejected: Array<{ id: number; error: string }> = [];
        let affected = 0;
        for (const id of payload.ids) {
          const row = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(id) as MasterPlantRow | undefined;
          if (!row) continue;

          const guardError = sqliteDeleteGuard(db, row);
          if (guardError) {
            rejected.push({ id, error: guardError });
            continue;
          }

          if (syncService?.isEnabled()) {
            try {
              await syncService.syncDelete(syncIdentity(row));
            } catch {
              enqueueSyncOutbox(db, {
                entityType: "master_plant",
                sourceSystem: row.source_system,
                sourceId: row.source_id ?? String(row.id),
                operation: "delete_plant",
                payload: { id: row.id },
              });
              failures.push(String(id));
              continue;
            }
          }
          db.prepare(`DELETE FROM master_plants WHERE id = ?`).run(id);
          affected += 1;
        }
        const status = rejected.length > 0 ? 409 : failures.length > 0 ? 503 : 200;
        res.status(status).json({
          affected,
          failures: [...failures, ...rejected.map(({ id }) => String(id))],
          rejected,
          retryable: failures.length > 0,
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

      const normalized = rows.map(normalizeMasterPlant);

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

      const offset = (query.page - 1) * query.page_size;

      const conditions: string[] = [];
      const conditionParams: unknown[] = [];

      if (query.search) {
        conditions.push("(plant_code LIKE ? OR common_name LIKE ? OR scientific_name LIKE ?)");
        const value = `%${query.search}%`;
        conditionParams.push(value, value, value);
      }

      if (typeof query.is_active === "boolean") {
        conditions.push("is_active = ?");
        conditionParams.push(toSqliteBoolean(query.is_active));
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const totalRow = db
        .prepare(`SELECT COUNT(*) AS total FROM master_plants ${whereClause}`)
        .get(...conditionParams) as { total: number };
      const groupRows = db
        .prepare(`SELECT DISTINCT "group" AS groupName FROM master_plants WHERE "group" IS NOT NULL AND "group" != '' ORDER BY "group" ASC`)
        .all() as Array<{ groupName: string }>;

      const rows = db
        .prepare(
          `SELECT * FROM master_plants ${whereClause} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .all(...conditionParams, query.page_size, offset) as MasterPlantRow[];

      const normalized = rows.map((row) => ({
        ...normalizeMasterPlant(row),
        i18n: fetchI18n(db, row.id),
      }));

      res.json({
        data: normalized,
        pagination: {
          page: query.page,
          page_size: query.page_size,
          total: totalRow.total,
        },
        groupOptions: groupRows.map((row) => row.groupName),
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

      res.json({ data: { ...normalizeMasterPlant(row), i18n: fetchI18n(db, row.id) } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = withSourceIdentity(createMasterPlantSchema.parse(req.body));
      const conflict = sourceConflict(db, payload);
      if (conflict) {
        res.status(409).json({ error: "A master plant with this identity already exists" });
        return;
      }

      if (syncService?.isEnabled()) {
        try {
          await syncService.syncUpsert(payload as unknown as Record<string, unknown>);
        } catch (error) {
          queuePlantSync(db, payload);
          res.status(503).json({
            error: "Convex source write failed; the change was queued for retry",
            retryable: true,
            outbox: true,
            detail: error instanceof Error ? error.message : String(error),
          });
          return;
        }
      }

      const localPayload = {
        ...payload,
        sync_origin: syncService?.isEnabled() ? "mirror" as const : "local" as const,
      };
      const rowId = db.transaction(() => upsertMasterPlantRow(db, localPayload))();
      const row = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(rowId) as MasterPlantRow;

      res.status(201).json({
        data: { ...normalizeMasterPlant(row), i18n: fetchI18n(db, row.id) },
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
      const mergedPayload = withSourceIdentity(createMasterPlantSchema.parse({
        ...normalizeMasterPlant(currentRow),
        i18n: currentI18n,
        ...payload,
        // Clearing the UI field must not silently rotate the stable upstream
        // identity. An explicit source-id change is still supported.
        source_id: payload.source_id == null ? currentRow.source_id : payload.source_id,
      }));
      const conflict = sourceConflict(db, mergedPayload, currentRow.id);
      if (conflict) {
        res.status(409).json({ error: "A master plant with this identity already exists" });
        return;
      }

      if (syncService?.isEnabled()) {
        try {
          await syncService.syncUpsert(mergedPayload as unknown as Record<string, unknown>);
        } catch (error) {
          queuePlantSync(db, mergedPayload);
          res.status(503).json({
            error: "Convex source write failed; the change was queued for retry",
            retryable: true,
            outbox: true,
            detail: error instanceof Error ? error.message : String(error),
          });
          return;
        }
      }

      const rowId = db.transaction(() => upsertMasterPlantRow(db, {
        ...mergedPayload,
        sync_origin: syncService?.isEnabled() ? "mirror" as const : currentRow.sync_origin as "local" | "convex" | "mirror",
      }))();
      const updatedRow = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(rowId) as MasterPlantRow;
      res.json({ data: { ...normalizeMasterPlant(updatedRow), i18n: fetchI18n(db, rowId) } });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
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

      if (syncService?.isEnabled()) {
        try {
          await syncService.syncDelete(syncIdentity(currentRow));
        } catch (error) {
          enqueueSyncOutbox(db, {
            entityType: "master_plant",
            sourceSystem: currentRow.source_system,
            sourceId: currentRow.source_id ?? String(currentRow.id),
            operation: "delete_plant",
            payload: { id: currentRow.id },
          });
          res.status(503).json({
            error: "Convex source delete failed; the deletion was queued for retry",
            retryable: true,
            outbox: true,
            detail: error instanceof Error ? error.message : String(error),
          });
          return;
        }
      }

      db.prepare(`DELETE FROM master_plants WHERE id = ?`).run(id);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function handleMasterPlantsError(error: unknown, res: Response): boolean {
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

  return false;
}
