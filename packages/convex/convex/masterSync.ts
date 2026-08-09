import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  buildTaxonomyFields,
  DEFAULT_CULTIVAR_NORMALIZED,
  isInfraspecificCultivar,
  matchesTaxonomyIdentity,
  requireTaxonomyIdentity,
  taxonomyFieldsForStorage,
  withComputedPlantTaxonomy,
} from "./lib/plantTaxonomy";
import { requireAdminServiceToken } from "./lib/adminAuth";
import { isDisplayBasePlant } from "../../shared/src/plantBase";
import { recomputeCareStatus } from "../../shared/src/plantCareStatus";

const nullableString = v.optional(v.union(v.string(), v.null()));
const nullableNumber = v.optional(v.union(v.number(), v.null()));
const contentStatus = v.optional(v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("needs_review"),
  v.literal("archived"),
));
const reviewStatus = v.optional(v.union(
  v.literal("unreviewed"),
  v.literal("in_review"),
  v.literal("reviewed"),
));

const localizedRowValidator = v.object({
  common_name: v.string(),
  description: nullableString,
  care_content_json: v.optional(v.any()),
  content_version: v.optional(v.number()),
  source: nullableString,
  source_url: nullableString,
  content_status: contentStatus,
  review_status: reviewStatus,
  reviewed_at: nullableString,
  reviewed_by: nullableString,
  content_origin: v.optional(v.union(
    v.literal("authored"),
    v.literal("inherited"),
    v.literal("imported"),
  )),
});

const careFieldEvidenceValidator = v.optional(v.record(v.string(), v.any()));

const backendRowValidator = v.object({
  // SQLite's numeric id is useful as a legacy fallback, but source_id is the
  // canonical identity and API writes may not have a local row yet.
  id: v.optional(v.number()),
  plant_code: v.string(),
  common_name: v.string(),
  scientific_name: nullableString,
  source_system: v.optional(v.string()),
  source_id: nullableString,
  record_version: v.optional(v.number()),
  category: v.string(),
  group: v.string(),
  family: nullableString,
  purposes: v.array(v.string()),
  growth_stage: v.string(),
  typical_days_to_harvest: nullableNumber,
  germination_days: nullableNumber,
  watering_frequency_days: nullableNumber,
  fertilizing_frequency_days: nullableNumber,
  soil_ph_min: nullableNumber,
  soil_ph_max: nullableNumber,
  moisture_target: nullableNumber,
  light_hours: nullableNumber,
  light_requirements: nullableString,
  spacing_cm: nullableNumber,
  max_plants_per_m2: nullableNumber,
  seed_rate_per_m2: nullableNumber,
  water_liters_per_m2: nullableNumber,
  yield_kg_per_m2: nullableNumber,
  image_url: nullableString,
  is_active: v.boolean(),
  notes: nullableString,
  source_url: nullableString,
  content_status: v.optional(v.union(
    v.literal("draft"),
    v.literal("published"),
    v.literal("needs_review"),
    v.literal("archived"),
  )),
  content_version: v.optional(v.number()),
  review_status: v.optional(v.union(
    v.literal("unreviewed"),
    v.literal("in_review"),
    v.literal("reviewed"),
  )),
  reviewed_at: nullableString,
  reviewed_by: nullableString,
  sync_origin: v.optional(v.string()),
  metadata_json: v.optional(v.any()),
  care_status: v.optional(v.union(
    v.literal("missing"),
    v.literal("awaiting_review"),
    v.literal("verified"),
    v.literal("not_applicable"),
  )),
  care_field_evidence: careFieldEvidenceValidator,
  i18n: v.record(v.string(), localizedRowValidator),
  created_at: nullableString,
  updated_at: nullableString,
});

const sourceValidator = v.string();

function toScientificName(row: {
  scientific_name?: string | null;
  common_name: string;
  plant_code: string;
}): string {
  const normalized = (row.scientific_name ?? "").trim();
  return normalized || `${row.common_name.trim()} (${row.plant_code.trim()})`;
}

function extractCultivar(row: { metadata_json?: any }) {
  if (!row.metadata_json || typeof row.metadata_json !== "object") return undefined;
  const raw = row.metadata_json.cultivar;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

async function assertBaseExistsForVariant(ctx: any, taxonomy: {
  genusNormalized: string;
  speciesNormalized: string;
  cultivarNormalized: string;
}) {
  if (
    taxonomy.cultivarNormalized === DEFAULT_CULTIVAR_NORMALIZED ||
    isInfraspecificCultivar(taxonomy.cultivarNormalized)
  ) {
    return;
  }

  const base = (await ctx.db.query("plantsMaster").collect())
    .map(withComputedPlantTaxonomy)
    .find((plant: any) =>
      plant.genusNormalized === taxonomy.genusNormalized &&
      plant.speciesNormalized === taxonomy.speciesNormalized &&
      isDisplayBasePlant(plant)
    );

  if (!base) {
    throw new Error(
      `Backend row requires base species before variant: ${taxonomy.genusNormalized} ${taxonomy.speciesNormalized}`,
    );
  }
}

function normalizeReviewedAt(value?: string | null): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

async function upsertPlantI18n(ctx: any, plantId: any, locale: string, row: any) {
  const normalizedLocale = locale.trim().toLowerCase();
  if (!normalizedLocale) {
    throw new Error("Backend row locale is required");
  }
  if (!row?.common_name?.trim()) {
    throw new Error(`Backend row translation is missing common name for locale ${normalizedLocale}`);
  }

  const existing = await ctx.db
    .query("plantI18n")
    .withIndex("by_plant_locale", (q: any) =>
      q.eq("plantId", plantId).eq("locale", normalizedLocale),
    )
    .first();
  const payload = {
    plantId,
    locale: normalizedLocale,
    commonName: row.common_name.trim(),
    description: row.description?.trim() || undefined,
    source: row.source?.trim() || undefined,
    sourceUrl: row.source_url?.trim() || undefined,
    contentStatus: row.content_status ?? "published",
    contentVersion: row.content_version ?? 1,
    reviewStatus: row.review_status ?? "unreviewed",
    reviewedAt: normalizeReviewedAt(row.reviewed_at),
    reviewedBy: row.reviewed_by?.trim() || undefined,
    contentOrigin: row.content_origin ?? "imported",
  };

  if (existing) await ctx.db.patch(existing._id, payload);
  else await ctx.db.insert("plantI18n", payload);

  const careContent = row.care_content_json && typeof row.care_content_json === "object"
    ? JSON.stringify(row.care_content_json)
    : typeof row.care_content_json === "string"
      ? row.care_content_json
      : "";
  if (!careContent || careContent === "{}") {
    const existingCare = await ctx.db
      .query("plantCareI18n")
      .withIndex("by_plant_locale", (q: any) =>
        q.eq("plantId", plantId).eq("locale", normalizedLocale),
      )
      .first();
    if (existingCare) await ctx.db.delete(existingCare._id);
    return;
  }

  const existingCare = await ctx.db
    .query("plantCareI18n")
    .withIndex("by_plant_locale", (q: any) =>
      q.eq("plantId", plantId).eq("locale", normalizedLocale),
    )
    .first();
  const carePayload = {
    plantId,
    locale: normalizedLocale,
    careContent,
    contentVersion: row.content_version ?? 1,
    source: row.source?.trim() || undefined,
    sourceUrl: row.source_url?.trim() || undefined,
    contentStatus: row.content_status ?? "published",
    reviewedAt: normalizeReviewedAt(row.reviewed_at),
    reviewedBy: row.reviewed_by?.trim() || undefined,
  };
  if (existingCare) await ctx.db.patch(existingCare._id, carePayload);
  else await ctx.db.insert("plantCareI18n", carePayload);
}

async function deletePlantRelations(ctx: any, plantId: any) {
  const [i18nRows, careRows, careProfile, relationsFrom, relationsTo, favorites] = await Promise.all([
    ctx.db.query("plantI18n").withIndex("by_plant_locale", (q: any) => q.eq("plantId", plantId)).collect(),
    ctx.db.query("plantCareI18n").withIndex("by_plant_locale", (q: any) => q.eq("plantId", plantId)).collect(),
    ctx.db.query("plantCare").withIndex("by_plant", (q: any) => q.eq("plantId", plantId)).unique(),
    ctx.db.query("plantRelations").withIndex("by_plant", (q: any) => q.eq("plantId", plantId)).collect(),
    ctx.db.query("plantRelations").withIndex("by_related_plant", (q: any) => q.eq("relatedPlantId", plantId)).collect(),
    ctx.db.query("userFavorites").withIndex("by_plant", (q: any) => q.eq("plantMasterId", plantId)).collect(),
  ]);

  for (const row of [...i18nRows, ...careRows, ...relationsFrom, ...relationsTo, ...favorites]) {
    await ctx.db.delete(row._id);
  }
  if (careProfile) await ctx.db.delete(careProfile._id);
}

export const upsertPlantFromBackend = mutation({
  args: {
    serviceToken: v.string(),
    source: sourceValidator,
    row: backendRowValidator,
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);

    const sourceSystem = (args.row.source_system ?? args.source).trim() || args.source;
    const sourceId = (args.row.source_id ?? (args.row.id === undefined ? "" : String(args.row.id))).trim();
    if (!sourceId) {
      throw new Error("Backend row source identity is required");
    }
    const scientificName = toScientificName(args.row);
    const cultivar = extractCultivar(args.row);
    const taxonomy = buildTaxonomyFields({ scientificName, cultivar });
    const taxonomyIdentity = requireTaxonomyIdentity(taxonomy, `Backend row ${sourceId}`);
    await assertBaseExistsForVariant(ctx, taxonomyIdentity);

    const bySource = await ctx.db
      .query("plantsMaster")
      .withIndex("by_source_identity", (q: any) =>
        q.eq("sourceSystem", sourceSystem).eq("sourceId", sourceId),
      )
      .first();
    const allPlants = (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);
    const byTaxonomy = allPlants.find((plant: any) => matchesTaxonomyIdentity(plant, taxonomyIdentity));
    if (bySource && byTaxonomy && bySource._id !== byTaxonomy._id) {
      throw new Error("Source identity conflicts with an existing taxonomy identity");
    }
    const existing = bySource ?? byTaxonomy;

    const patch = {
      scientificName,
      group: args.row.group || "other",
      family: args.row.family?.trim() || undefined,
      purposes: args.row.purposes,
      growthStage: args.row.growth_stage || undefined,
      imageUrl: args.row.image_url?.trim() || undefined,
      isActive: args.row.is_active,
      notes: args.row.notes?.trim() || undefined,
      sourceSystem,
      sourceId,
      recordVersion: args.row.record_version ?? 1,
      source: `backend:${sourceSystem}:id_${sourceId}`,
      sourceUrl: args.row.source_url?.trim() || undefined,
      contentStatus: args.row.content_status ?? "published",
      contentVersion: args.row.content_version ?? 1,
      reviewStatus: args.row.review_status ?? "unreviewed",
      reviewedAt: normalizeReviewedAt(args.row.reviewed_at),
      reviewedBy: args.row.reviewed_by?.trim() || undefined,
      soilPhMin: args.row.soil_ph_min ?? undefined,
      soilPhMax: args.row.soil_ph_max ?? undefined,
      moistureTarget: args.row.moisture_target ?? undefined,
      lightHours: args.row.light_hours ?? undefined,
      ...taxonomyFieldsForStorage(taxonomy),
    };

    const plantId = existing
      ? existing._id
      : await ctx.db.insert("plantsMaster", {
        ...patch,
        purposes: patch.purposes ?? [],
      });
    if (existing) await ctx.db.patch(plantId, patch);

    const careExisting = await ctx.db
      .query("plantCare")
      .withIndex("by_plant", (q: any) => q.eq("plantId", plantId))
      .unique();
    const carePayload = {
      plantId,
      typicalDaysToHarvest: args.row.typical_days_to_harvest ?? undefined,
      germinationDays: args.row.germination_days ?? undefined,
      wateringFrequencyDays: args.row.watering_frequency_days ?? undefined,
      fertilizingFrequencyDays: args.row.fertilizing_frequency_days ?? undefined,
      lightRequirements: args.row.light_requirements?.trim() || undefined,
      lightHours: args.row.light_hours ?? undefined,
      soilPhMin: args.row.soil_ph_min ?? undefined,
      soilPhMax: args.row.soil_ph_max ?? undefined,
      moistureTarget: args.row.moisture_target ?? undefined,
      spacingCm: args.row.spacing_cm ?? undefined,
      maxPlantsPerM2: args.row.max_plants_per_m2 ?? undefined,
      seedRatePerM2: args.row.seed_rate_per_m2 ?? undefined,
      waterLitersPerM2: args.row.water_liters_per_m2 ?? undefined,
      yieldKgPerM2: args.row.yield_kg_per_m2 ?? undefined,
      source: args.source,
      sourceUrl: args.row.source_url?.trim() || undefined,
      contentStatus: args.row.content_status ?? "published",
      contentVersion: args.row.content_version ?? 1,
      reviewedAt: normalizeReviewedAt(args.row.reviewed_at),
      reviewedBy: args.row.reviewed_by?.trim() || undefined,
    };
    const careStatusPatch = {
      careStatus: args.row.care_status ?? recomputeCareStatus(carePayload, args.row.care_field_evidence as any),
      careFieldEvidence: args.row.care_field_evidence,
    };
    if (careExisting) await ctx.db.patch(careExisting._id, { ...carePayload, ...careStatusPatch });
    else await ctx.db.insert("plantCare", { ...carePayload, ...careStatusPatch });

    // The backend row is a full source-of-truth snapshot. Remove locales that
    // were deleted upstream so a retry/reconciliation cannot resurrect stale
    // translations or structured care content.
    const keepLocales = new Set(Object.keys(args.row.i18n).map((locale) => locale.trim().toLowerCase()));
    const [existingI18nRows, existingCareI18nRows] = await Promise.all([
      ctx.db.query("plantI18n").withIndex("by_plant_locale", (q: any) => q.eq("plantId", plantId)).collect(),
      ctx.db.query("plantCareI18n").withIndex("by_plant_locale", (q: any) => q.eq("plantId", plantId)).collect(),
    ]);
    for (const row of existingI18nRows) {
      if (!keepLocales.has(row.locale)) await ctx.db.delete(row._id);
    }
    for (const row of existingCareI18nRows) {
      if (!keepLocales.has(row.locale)) await ctx.db.delete(row._id);
    }

    for (const [locale, localized] of Object.entries(args.row.i18n)) {
      await upsertPlantI18n(ctx, plantId, locale, localized);
    }

    return { action: existing ? "updated" : "inserted", id: plantId, sourceSystem, sourceId };
  },
});

export const deletePlantFromBackend = mutation({
  args: {
    serviceToken: v.string(),
    source: sourceValidator,
    id: v.optional(v.number()),
    source_system: v.optional(v.string()),
    source_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);

    const sourceSystem = (args.source_system ?? args.source).trim();
    const sourceId = args.source_id?.trim() || (args.id === undefined ? "" : String(args.id));
    let candidate = sourceId
      ? await ctx.db
        .query("plantsMaster")
        .withIndex("by_source_identity", (q: any) =>
          q.eq("sourceSystem", sourceSystem).eq("sourceId", sourceId),
        )
        .first()
      : null;
    if (!candidate && args.id !== undefined) {
      const sourceTag = `backend:${args.source}:id_${args.id}`;
      candidate = await ctx.db
        .query("plantsMaster")
        .filter((q: any) => q.eq(q.field("source"), sourceTag))
        .first();
    }

    if (!candidate) return { action: "noop" as const };

    // A master row is referenced by user-owned plants. Keep the reference
    // valid rather than deleting the row and leaving an orphaned user plant;
    // callers should deactivate it until those references are removed.
    const referencedUserPlant = (await ctx.db.query("userPlants").collect())
      .find((row: any) => String(row.plantMasterId ?? "") === String(candidate!._id) && row.isDeleted !== true);
    if (referencedUserPlant) {
      throw new Error("Cannot delete a plant while user plants still reference it; deactivate it instead");
    }

    const allPlants: any[] = (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);
    const computedCandidate: any = allPlants.find((plant: any) => plant._id === candidate!._id) ?? candidate;
    const isBase = isDisplayBasePlant(computedCandidate);
    if (isBase) {
      const hasVariants = allPlants.some((row: any) =>
        row._id !== candidate!._id &&
        row.genusNormalized === computedCandidate.genusNormalized &&
        row.speciesNormalized === computedCandidate.speciesNormalized &&
        !isDisplayBasePlant(row),
      );
      if (hasVariants) throw new Error("Cannot delete base plant while variants still exist");
    }

    await deletePlantRelations(ctx, candidate._id);
    await ctx.db.delete(candidate._id);
    return { action: "deleted" as const, id: candidate._id };
  },
});

/** Full source-of-truth projection for the trusted API reconciler. */
export const listAll = query({
  args: {
    serviceToken: v.string(),
    locale: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const requestedLocale = (args.locale ?? "vi").trim().toLowerCase().split("-")[0] || "vi";
    const plants = (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);
    const i18nRows = await ctx.db.query("plantI18n").collect();
    const careRows = await ctx.db.query("plantCare").collect();
    const careI18nRows = await ctx.db.query("plantCareI18n").collect();
    const i18nByPlant = new Map<string, any[]>();
    for (const row of i18nRows) {
      const list = i18nByPlant.get(String(row.plantId)) ?? [];
      list.push(row);
      i18nByPlant.set(String(row.plantId), list);
    }
    const careI18nByKey = new Map<string, any>();
    for (const row of careI18nRows) careI18nByKey.set(`${row.plantId}:${row.locale}`, row);
    const careByPlant = new Map(careRows.map((row: any) => [String(row.plantId), row]));

    return plants.map((plant: any) => {
      const rows = (i18nByPlant.get(String(plant._id)) ?? []).map((row: any) => {
        const care = careI18nByKey.get(`${plant._id}:${row.locale}`);
        return {
          locale: row.locale,
          commonName: row.commonName,
          description: row.description ?? undefined,
          careContent: care?.careContent,
          contentVersion: row.contentVersion ?? care?.contentVersion,
          source: row.source,
          sourceUrl: row.sourceUrl,
          contentStatus: row.contentStatus,
          reviewStatus: row.reviewStatus,
          reviewedAt: row.reviewedAt,
          reviewedBy: row.reviewedBy,
          contentOrigin: row.contentOrigin,
        };
      });
      const localized = rows.find((row: any) => row.locale === requestedLocale) ??
        rows.find((row: any) => row.locale === "en") ?? rows[0];
      const care = careByPlant.get(String(plant._id));

      return {
        _id: plant._id,
        scientificName: plant.scientificName,
        displayName: localized?.commonName ?? plant.scientificName,
        description: localized?.description,
        i18nRows: rows,
        group: plant.group,
        family: plant.family,
        cultivar: plant.cultivar ?? null,
        cultivarNormalized: plant.cultivarNormalized,
        basePlantId: plant.basePlantId,
        imageUrl: plant.imageUrl ?? null,
        purposes: plant.purposes ?? [],
        source: plant.source,
        sourceSystem: plant.sourceSystem,
        sourceId: plant.sourceId,
        recordVersion: plant.recordVersion,
        sourceUrl: plant.sourceUrl,
        isActive: plant.isActive !== false,
        contentStatus: plant.contentStatus,
        contentVersion: plant.contentVersion,
        reviewStatus: plant.reviewStatus,
        reviewedAt: plant.reviewedAt,
        reviewedBy: plant.reviewedBy,
        growthStage: plant.growthStage,
        notes: plant.notes,
        typicalDaysToHarvest: care?.typicalDaysToHarvest,
        germinationDays: care?.germinationDays,
        wateringFrequencyDays: care?.wateringFrequencyDays,
        fertilizingFrequencyDays: care?.fertilizingFrequencyDays,
        soilPhMin: care?.soilPhMin ?? plant.soilPhMin,
        soilPhMax: care?.soilPhMax ?? plant.soilPhMax,
        moistureTarget: care?.moistureTarget ?? plant.moistureTarget,
        lightHours: care?.lightHours ?? plant.lightHours,
        lightRequirements: care?.lightRequirements,
        spacingCm: care?.spacingCm,
        maxPlantsPerM2: care?.maxPlantsPerM2,
        seedRatePerM2: care?.seedRatePerM2,
        waterLitersPerM2: care?.waterLitersPerM2,
        yieldKgPerM2: care?.yieldKgPerM2,
        careStatus: care?.careStatus ?? recomputeCareStatus(care, care?.careFieldEvidence as any),
        careFieldEvidence: care?.careFieldEvidence,
      };
    });
  },
});

/**
 * Additive, idempotent backfill for rows created before the canonical contract.
 * Run in bounded batches from the trusted API/operator; it never deletes data.
 */
export const backfillCanonicalMetadata = mutation({
  args: {
    serviceToken: v.string(),
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const dryRun = args.dryRun ?? true;
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 500)));
    const plants = (await ctx.db.query("plantsMaster").collect())
      .sort((left: any, right: any) => String(left._id).localeCompare(String(right._id)))
      .filter((plant: any) => !args.cursor || String(plant._id) > args.cursor)
      .slice(0, limit);
    let changed = 0;
    for (const plant of plants) {
      const patch: Record<string, unknown> = {};
      if (!(plant as any).sourceSystem) patch.sourceSystem = "convex";
      if (!(plant as any).sourceId) patch.sourceId = String(plant._id);
      if ((plant as any).recordVersion === undefined) patch.recordVersion = 1;
      if ((plant as any).isActive === undefined) patch.isActive = true;
      if (!(plant as any).contentStatus) patch.contentStatus = "published";
      if ((plant as any).contentVersion === undefined) patch.contentVersion = 1;
      if (!(plant as any).reviewStatus) patch.reviewStatus = "unreviewed";
      if (Object.keys(patch).length === 0) continue;
      changed++;
      if (!dryRun) await ctx.db.patch(plant._id, patch);
    }

    return {
      dryRun,
      scanned: plants.length,
      changed,
      hasMore: plants.length === limit,
      nextCursor: plants.length === limit ? String(plants[plants.length - 1]?._id ?? "") : null,
    };
  },
});
