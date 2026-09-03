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
import { upsertPlantCareI18n } from "./lib/plantCare";
import { isDisplayBasePlant } from "../../shared/src/plantBase";
import { normalizeCareFieldEvidence, recomputeCareStatus } from "../../shared/src/plantCareStatus";
import type { CareFieldEvidence } from "../../shared/src/plantCareStatus";
import { normalizePropagationMethods } from "../../shared/src/plantPropagation";
import { isValidCountryCode, SUBDIVISION_CODE_PATTERN } from "../../shared/src/countries";
import {
  canonicalIdentityFromTaxonomy,
  upsertCanonicalPlant,
} from "./lib/canonicalPlantUpsert";
import {
  bumpReconciliationCatalog,
  catalogCountsValidator,
  catalogMetadataValidator,
  readReconciliationCatalogMetadata,
  rebuildReconciliationCatalog,
} from "./lib/reconciliationCatalog";

type LegacyPropagationSource = "seed" | "cutting" | "bulb";

function normalizeLegacyPropagationSource(value: unknown): LegacyPropagationSource | undefined {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "seed" || normalized === "cutting" || normalized === "bulb"
    ? normalized
    : undefined;
}

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
const propagationMethod = v.union(
  v.literal("seed"), v.literal("stem_cutting"), v.literal("leaf_cutting"),
  v.literal("root_cutting"), v.literal("division"), v.literal("air_layering"),
  v.literal("ground_layering"), v.literal("grafting"), v.literal("budding"),
  v.literal("bulb"), v.literal("corm"), v.literal("tuber"), v.literal("rhizome"),
  v.literal("runner"), v.literal("offset"), v.literal("sucker"), v.literal("spore"),
  v.literal("tissue_culture"),
);
const sourceRefValidator = v.object({
  sourceSystem: v.optional(v.string()),
  sourceName: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  sourceLocator: v.optional(v.string()),
});

function normalizeCareFieldEvidenceMap(value: unknown): Record<string, CareFieldEvidence> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const output: Record<string, CareFieldEvidence> = {};
  for (const [field, raw] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizeCareFieldEvidence(raw);
    if (normalized) output[field] = normalized;
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

const localizedRowValidator = v.object({
  common_name: v.string(),
  description: nullableString,
  // Final contract: canonical Markdown. Null/absent preserves or clears via
  // the shared three-state normalization in upsertPlantCareI18n; objects are
  // rejected (they were only accepted by the temporary compatibility
  // validator during the Phase 4 rollout window).
  care_content: v.optional(v.union(v.string(), v.null())),
  content_updated_at: nullableString,
  content_version: v.optional(v.number()),
  source: nullableString,
  source_url: nullableString,
  content_status: contentStatus,
  review_status: reviewStatus,
  reviewed_at: nullableString,
  reviewed_by: nullableString,
  source_refs: v.optional(v.array(sourceRefValidator)),
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
  // Trusted taxonomy fields are forwarded when the API already has them;
  // legacy callers may omit them and continue through the existing Convex
  // taxonomy compatibility path.
  genus: nullableString,
  species: nullableString,
  // Structured canonical identity fields are part of the SQLite authoring
  // snapshot. The current Convex writer still derives its lookup taxonomy
  // from genus/species, but it must accept these additive fields so a complete
  // backend snapshot is not rejected before the mutation can run.
  infraspecific_rank: nullableString,
  infraspecific_name: nullableString,
  cultivar: nullableString,
  identity_scope: nullableString,
  parent_master_plant_id: nullableNumber,
  parent_canonical_key: nullableString,
  taxonomy_parse_status: v.optional(v.union(v.literal("ok"), v.literal("manual_review"))),
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
  propagation_methods: v.optional(v.array(propagationMethod)),
  // Geography assignments (design doc §2.3): arrays ride inside the existing
  // upsert_plant payload; present = full-set replace, omitted = preserve.
  // Provenance maps are keyed by code and applied with the same replace
  // semantics so source references survive end to end for every category.
  origin_countries: v.optional(v.array(v.string())),
  origin_country_source_refs: v.optional(v.record(v.string(), v.array(sourceRefValidator))),
  proven_regions: v.optional(v.array(v.object({
    country_code: v.string(),
    subdivision_code: v.optional(v.string()),
    source_refs: v.optional(v.array(sourceRefValidator)),
  }))),
  adaptation_term_codes: v.optional(v.array(v.string())),
  adaptation_term_source_refs: v.optional(v.record(v.string(), v.array(sourceRefValidator))),
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
  await bumpReconciliationCatalog(ctx, { i18n: existing ? 0 : 1 });

  // Care is canonical Markdown and is normalized through the shared
  // three-state helper: undefined preserves, null/empty deletes, non-empty
  // string upserts. A valid Markdown string never deletes an existing row.
  await upsertPlantCareI18n(ctx, plantId, normalizedLocale, row.care_content, row.content_version, {
    source: row.source?.trim() || undefined,
    sourceUrl: row.source_url?.trim() || undefined,
    sourceRefs: row.source_refs,
    contentStatus: row.content_status ?? "published",
    reviewedAt: normalizeReviewedAt(row.reviewed_at),
    reviewedBy: row.reviewed_by?.trim() || undefined,
    contentUpdatedAt: row.content_updated_at ? Date.parse(row.content_updated_at) : undefined,
  });
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
  const relationIds = new Set([...relationsFrom, ...relationsTo].map((row: any) => String(row._id)));
  await bumpReconciliationCatalog(ctx, {
    i18n: -(i18nRows.length + careRows.length),
    care: careProfile ? -1 : 0,
    propagation: careProfile && Array.isArray(careProfile.propagationMethods) && careProfile.propagationMethods.length > 0 ? -1 : 0,
    relationships: -relationIds.size,
  });
}

/**
 * Replace-semantics geography sync (design doc §2.3, resolved archived rule):
 * present fields replace the plant's own join rows; omitted fields leave them
 * untouched. Unknown country codes and unknown term codes always throw.
 * Archived term codes are rejected only when they are NOT already assigned to
 * the plant — codes already present are preserved and never re-added, so a
 * re-save of a plant that holds an archived term succeeds while a new
 * assignment to it fails. All validation happens before any write.
 */
async function applyPlantGeographyFromBackend(ctx: any, plantId: any, row: any) {
  const originPresent = row.origin_countries !== undefined;
  const provenPresent = row.proven_regions !== undefined;
  const termsPresent = row.adaptation_term_codes !== undefined;
  if (!originPresent && !provenPresent && !termsPresent) return;

  // Convex indexes are not uniqueness constraints. Reject duplicate payload
  // assignments before deleting/replacing any existing rows so the API/SQLite
  // boundary and the authoritative Convex boundary have identical semantics.
  const seenOriginCodes = new Set<string>();
  for (const code of row.origin_countries ?? []) {
    if (seenOriginCodes.has(code)) {
      throw new Error(`Duplicate origin country assignment: ${code}`);
    }
    seenOriginCodes.add(code);
  }
  const seenProvenRegions = new Set<string>();
  for (const region of row.proven_regions ?? []) {
    const key = `${region.country_code}\u0000${region.subdivision_code ?? ""}`;
    if (seenProvenRegions.has(key)) {
      const suffix = region.subdivision_code ? `/${region.subdivision_code}` : "";
      throw new Error(`Duplicate proven region assignment: ${region.country_code}${suffix}`);
    }
    seenProvenRegions.add(key);
  }
  const seenTermCodes = new Set<string>();
  for (const code of row.adaptation_term_codes ?? []) {
    if (seenTermCodes.has(code)) {
      throw new Error(`Duplicate adaptation term assignment: ${code}`);
    }
    seenTermCodes.add(code);
  }

  const existingTermAssignments = await ctx.db
    .query("plantAdaptationTerms")
    .withIndex("by_plant", (q: any) => q.eq("plantId", plantId))
    .collect();
  const existingTermCodes = new Set(
    existingTermAssignments.map((assignment: any) => assignment.termCode),
  );
  const termByCode = new Map<string, any>(
    (await ctx.db.query("adaptationTerms").collect()).map((term: any) => [term.code, term]),
  );

  for (const code of row.origin_countries ?? []) {
    if (!isValidCountryCode(code)) throw new Error(`Unknown country code: ${code}`);
  }
  for (const region of row.proven_regions ?? []) {
    if (!isValidCountryCode(region.country_code)) {
      throw new Error(`Unknown country code: ${region.country_code}`);
    }
    if (region.subdivision_code !== undefined && !SUBDIVISION_CODE_PATTERN.test(region.subdivision_code)) {
      throw new Error(`Invalid subdivision code: ${region.subdivision_code}`);
    }
  }
  for (const code of row.adaptation_term_codes ?? []) {
    const term = termByCode.get(code);
    if (!term) throw new Error(`Unknown adaptation term code: ${code}`);
    if (term.status === "archived" && !existingTermCodes.has(code)) {
      throw new Error(`Adaptation term code is archived and cannot be newly assigned: ${code}`);
    }
  }

  let geographyDelta = 0;
  if (originPresent) {
    const originRefs = row.origin_country_source_refs ?? {};
    const existingOrigins = await ctx.db
      .query("plantOriginCountries")
      .withIndex("by_plant", (q: any) => q.eq("plantId", plantId))
      .collect();
    geographyDelta -= existingOrigins.length;
    for (const existing of existingOrigins) {
      await ctx.db.delete(existing._id);
    }
    for (const code of row.origin_countries ?? []) {
      await ctx.db.insert("plantOriginCountries", {
        plantId,
        countryCode: code,
        ...(originRefs[code] !== undefined ? { sourceRefs: originRefs[code] } : {}),
      });
    }
    geographyDelta += (row.origin_countries ?? []).length;
  }
  if (provenPresent) {
    const existingRegions = await ctx.db
      .query("plantProvenRegions")
      .withIndex("by_plant", (q: any) => q.eq("plantId", plantId))
      .collect();
    geographyDelta -= existingRegions.length;
    for (const existing of existingRegions) {
      await ctx.db.delete(existing._id);
    }
    for (const region of row.proven_regions ?? []) {
      await ctx.db.insert("plantProvenRegions", {
        plantId,
        countryCode: region.country_code,
        ...(region.subdivision_code ? { subdivisionCode: region.subdivision_code } : {}),
        ...(region.source_refs !== undefined ? { sourceRefs: region.source_refs } : {}),
      });
    }
    geographyDelta += (row.proven_regions ?? []).length;
  }
  if (termsPresent) {
    const termRefs = row.adaptation_term_source_refs ?? {};
    geographyDelta -= existingTermAssignments.length;
    for (const existing of existingTermAssignments) {
      await ctx.db.delete(existing._id);
    }
    for (const code of row.adaptation_term_codes ?? []) {
      await ctx.db.insert("plantAdaptationTerms", {
        plantId,
        termCode: code,
        ...(termRefs[code] !== undefined ? { sourceRefs: termRefs[code] } : {}),
      });
    }
    geographyDelta += (row.adaptation_term_codes ?? []).length;
  }
  await bumpReconciliationCatalog(ctx, { geography: geographyDelta });
}

const snapshotPageValidator = v.object({
  rows: v.array(v.any()),
  nextCursor: v.union(v.string(), v.null()),
  revision: v.string(),
  expectedCount: v.number(),
  expectedCounts: catalogCountsValidator,
  sourceDataChanged: v.boolean(),
});

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

    const bySourceRows = await ctx.db
      .query("plantsMaster")
      .withIndex("by_source_identity", (q: any) =>
        q.eq("sourceSystem", sourceSystem).eq("sourceId", sourceId),
      )
      .take(2);
    if (bySourceRows.length > 1) {
      throw new Error("Multiple plants share the backend source identity");
    }
    const bySource = bySourceRows[0];
    const allPlants = (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);
    const byTaxonomy = allPlants.find((plant: any) => matchesTaxonomyIdentity(plant, taxonomyIdentity));
    if (bySource && byTaxonomy && bySource._id !== byTaxonomy._id) {
      throw new Error("Source identity conflicts with an existing taxonomy identity");
    }
    const existing = bySource ?? byTaxonomy;

    const legacyPropagationSource = existing
      ? normalizeLegacyPropagationSource(existing.source)
      : undefined;
    // Legacy rows are intentionally eligible for the source discriminator
    // migration only while both identity fields are absent (or carry the
    // canonical Convex signature). A backend retry that finds such a row by
    // taxonomy must not stamp its incoming identity onto the row before that
    // migration runs, otherwise the row becomes ineligible and the only copy
    // of its propagation discriminator can be lost.
    const preserveLegacyIdentity = Boolean(legacyPropagationSource);
    const persistedSourceSystem = preserveLegacyIdentity
      ? (typeof existing?.sourceSystem === "string" && existing.sourceSystem.trim()
        ? existing.sourceSystem.trim()
        : undefined)
      : sourceSystem;
    const persistedSourceId = preserveLegacyIdentity
      ? (typeof existing?.sourceId === "string" && existing.sourceId.trim()
        ? existing.sourceId.trim()
        : undefined)
      : sourceId;
    const patch = {
      scientificName,
      group: args.row.group || "other",
      family: args.row.family?.trim() || undefined,
      purposes: args.row.purposes,
      growthStage: args.row.growth_stage || undefined,
      imageUrl: args.row.image_url?.trim() || undefined,
      isActive: args.row.is_active,
      notes: args.row.notes?.trim() || undefined,
      sourceSystem: persistedSourceSystem,
      sourceId: persistedSourceId,
      recordVersion: args.row.record_version ?? 1,
      // Keep the only copy of a legacy propagation discriminator until the
      // dedicated migration writes plantCare.propagationMethods.
      source: legacyPropagationSource ?? `backend:${sourceSystem}:id_${sourceId}`,
      sourceUrl: args.row.source_url?.trim() || undefined,
      contentStatus: args.row.content_status ?? "published",
      contentVersion: args.row.content_version ?? 1,
      reviewStatus: args.row.review_status ?? "unreviewed",
      reviewedAt: normalizeReviewedAt(args.row.reviewed_at),
      reviewedBy: args.row.reviewed_by?.trim() || undefined,
      ...taxonomyFieldsForStorage(taxonomy),
    };

    const canonicalIdentity = canonicalIdentityFromTaxonomy({
      scientificName,
      genus: taxonomy.genus,
      species: taxonomy.species,
      cultivar: taxonomy.cultivar,
    });
    const canonicalResult = await upsertCanonicalPlant(ctx, {
      identity: canonicalIdentity,
      plant: {
        ...patch,
        purposes: patch.purposes ?? [],
      },
      sourceSystem,
      sourceId,
      existingPlantId: existing?._id,
      updateFields: patch,
    });
    const plantId = canonicalResult.plantId;

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
      ...(args.row.propagation_methods !== undefined
        ? { propagationMethods: normalizePropagationMethods(args.row.propagation_methods) }
        : {}),
      source: args.source,
      sourceUrl: args.row.source_url?.trim() || undefined,
      contentStatus: args.row.content_status ?? "published",
      contentVersion: args.row.content_version ?? 1,
      reviewedAt: normalizeReviewedAt(args.row.reviewed_at),
      reviewedBy: args.row.reviewed_by?.trim() || undefined,
    };
    const careStatusPatch = {
      careStatus: args.row.care_status ?? recomputeCareStatus(carePayload, args.row.care_field_evidence as any),
      careFieldEvidence: normalizeCareFieldEvidenceMap(args.row.care_field_evidence),
    };
    const previousPropagation = Array.isArray(careExisting?.propagationMethods) && careExisting.propagationMethods.length > 0;
    const nextPropagation = Array.isArray(carePayload.propagationMethods) && carePayload.propagationMethods.length > 0
      ? true
      : carePayload.propagationMethods === undefined
        ? previousPropagation
        : false;
    if (careExisting) await ctx.db.patch(careExisting._id, { ...carePayload, ...careStatusPatch });
    else await ctx.db.insert("plantCare", { ...carePayload, ...careStatusPatch });
    await bumpReconciliationCatalog(ctx, {
      care: careExisting ? 0 : 1,
      propagation: Number(nextPropagation) - Number(previousPropagation),
    });

    // The backend row is a full source-of-truth snapshot. Remove locales that
    // were deleted upstream so a retry/reconciliation cannot resurrect stale
    // translations or structured care content.
    const keepLocales = new Set(Object.keys(args.row.i18n).map((locale) => locale.trim().toLowerCase()));
    const [existingI18nRows, existingCareI18nRows] = await Promise.all([
      ctx.db.query("plantI18n").withIndex("by_plant_locale", (q: any) => q.eq("plantId", plantId)).collect(),
      ctx.db.query("plantCareI18n").withIndex("by_plant_locale", (q: any) => q.eq("plantId", plantId)).collect(),
    ]);
    let removedI18n = 0;
    let removedCareI18n = 0;
    for (const row of existingI18nRows) {
      if (!keepLocales.has(row.locale)) {
        await ctx.db.delete(row._id);
        removedI18n += 1;
      }
    }
    for (const row of existingCareI18nRows) {
      if (!keepLocales.has(row.locale)) {
        await ctx.db.delete(row._id);
        removedCareI18n += 1;
      }
    }
    if (removedI18n || removedCareI18n) {
      await bumpReconciliationCatalog(ctx, { i18n: -(removedI18n + removedCareI18n) });
    }

    for (const [locale, localized] of Object.entries(args.row.i18n)) {
      await upsertPlantI18n(ctx, plantId, locale, localized);
    }

    await applyPlantGeographyFromBackend(ctx, plantId, args.row);

    return {
      action: existing ? "updated" : "inserted",
      id: plantId,
      sourceSystem: persistedSourceSystem,
      sourceId: persistedSourceId,
    };
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
    await bumpReconciliationCatalog(ctx, { plants: -1 });
    return { action: "deleted" as const, id: candidate._id };
  },
});

/** Read an indexed child relation with a hard per-plant bound. */
async function readIndexedPlantRows(
  ctx: any,
  table: string,
  index: string,
  plantId: any,
): Promise<any[]> {
  const rows = await ctx.db
    .query(table)
    .withIndex(index, (q: any) => q.eq("plantId", plantId))
    .take(201);
  if (rows.length > 200) throw new Error(`SNAPSHOT_CHILD_LIMIT_EXCEEDED:${table}`);
  return rows;
}

/** Project only the bounded plants page and its indexed child rows. */
async function projectSnapshotPlants(ctx: any, requestedLocale: string, plants: any[]): Promise<any[]> {
  const childSets = await Promise.all(plants.map(async (plant: any) => {
    const [i18nRows, careI18nRows, care, originRows, provenRows, termAssignmentRows] = await Promise.all([
      readIndexedPlantRows(ctx, "plantI18n", "by_plant_locale", plant._id),
      readIndexedPlantRows(ctx, "plantCareI18n", "by_plant_locale", plant._id),
      ctx.db.query("plantCare").withIndex("by_plant", (q: any) => q.eq("plantId", plant._id)).first(),
      readIndexedPlantRows(ctx, "plantOriginCountries", "by_plant", plant._id),
      readIndexedPlantRows(ctx, "plantProvenRegions", "by_plant", plant._id),
      readIndexedPlantRows(ctx, "plantAdaptationTerms", "by_plant", plant._id),
    ]);
    return { plant, i18nRows, careI18nRows, care, originRows, provenRows, termAssignmentRows };
  }));

  return childSets.map(({ plant, i18nRows, careI18nRows, care, originRows, provenRows, termAssignmentRows }: any) => {
    const careI18nByKey = new Map<string, any>();
    for (const row of careI18nRows) careI18nByKey.set(`${row.plantId}:${row.locale}`, row);
    const rows = i18nRows.map((row: any) => {
      const localizedCare = careI18nByKey.get(`${plant._id}:${row.locale}`);
      return {
        locale: row.locale,
        commonName: row.commonName,
        description: row.description ?? undefined,
        careContent: localizedCare?.careContent,
        contentUpdatedAt: localizedCare?.contentUpdatedAt,
        contentVersion: row.contentVersion ?? localizedCare?.contentVersion,
        source: row.source,
        sourceUrl: row.sourceUrl,
        sourceRefs: localizedCare?.sourceRefs,
        contentStatus: row.contentStatus,
        reviewStatus: row.reviewStatus,
        reviewedAt: row.reviewedAt,
        reviewedBy: row.reviewedBy,
        contentOrigin: row.contentOrigin,
      };
    });
    const localized = rows.find((row: any) => row.locale === requestedLocale) ??
      rows.find((row: any) => row.locale === "en") ?? rows[0];
    const originCountrySourceRefs: Record<string, any[]> = {};
    for (const row of originRows) {
      if (row.sourceRefs !== undefined) originCountrySourceRefs[row.countryCode] = row.sourceRefs;
    }
    const adaptationTermSourceRefs: Record<string, any[]> = {};
    for (const row of termAssignmentRows) {
      if (row.sourceRefs !== undefined) adaptationTermSourceRefs[row.termCode] = row.sourceRefs;
    }
    return {
      _id: plant._id,
      scientificName: plant.scientificName,
      genus: plant.genus ?? undefined,
      species: plant.species ?? undefined,
      genusNormalized: plant.genusNormalized ?? undefined,
      speciesNormalized: plant.speciesNormalized ?? undefined,
      taxonomyParseStatus: plant.taxonomyParseStatus,
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
      propagationMethods: normalizePropagationMethods(care?.propagationMethods),
      careStatus: care?.careStatus ?? recomputeCareStatus(care, care?.careFieldEvidence as any),
      careFieldEvidence: care?.careFieldEvidence,
      originCountries: originRows.map((row: any) => row.countryCode),
      originCountrySourceRefs,
      provenRegions: provenRows.map((row: any) => ({
        countryCode: row.countryCode,
        ...(row.subdivisionCode ? { subdivisionCode: row.subdivisionCode } : {}),
      })),
      adaptationTermCodes: termAssignmentRows.map((row: any) => row.termCode),
      adaptationTermSourceRefs,
    };
  });
}

/**
 * Bounded, service-authorized source snapshot page. Every page carries the
 * same catalog revision/counts so the API can reject mixed generations.
 */
export const listPage = query({
  args: {
    serviceToken: v.string(),
    locale: v.optional(v.string()),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  returns: snapshotPageValidator,
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const catalog = await readReconciliationCatalogMetadata(ctx);
    if (!catalog || catalog.initialized !== true) throw new Error("CATALOG_METADATA_UNINITIALIZED");
    const requestedLocale = (args.locale ?? "vi").trim().toLowerCase().split("-")[0] || "vi";
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 500)));
    const pagination = await ctx.db.query("plantsMaster").order("asc").paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    });
    const plants = (pagination.page as any[]).map(withComputedPlantTaxonomy);
    const rows = await projectSnapshotPlants(ctx, requestedLocale, plants);
    return {
      rows,
      nextCursor: pagination.isDone ? null : pagination.continueCursor,
      revision: String(catalog.revision),
      expectedCount: catalog.expectedCount,
      expectedCounts: catalog.expectedCounts,
      sourceDataChanged: false,
    };
  },
});

export const getCatalogMetadata = query({
  args: { serviceToken: v.string() },
  returns: v.union(catalogMetadataValidator, v.null()),
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    return await readReconciliationCatalogMetadata(ctx);
  },
});

/** Explicit operator-only initialization for deployments predating CID-7. */
export const initializeCatalogMetadata = mutation({
  args: { serviceToken: v.string() },
  returns: catalogMetadataValidator,
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    return await rebuildReconciliationCatalog(ctx);
  },
});

/** Full source-of-truth projection for legacy admin callers. */
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
    const originRows = await ctx.db.query("plantOriginCountries").collect();
    const provenRows = await ctx.db.query("plantProvenRegions").collect();
    const termAssignmentRows = await ctx.db.query("plantAdaptationTerms").collect();
    const i18nByPlant = new Map<string, any[]>();
    for (const row of i18nRows) {
      const list = i18nByPlant.get(String(row.plantId)) ?? [];
      list.push(row);
      i18nByPlant.set(String(row.plantId), list);
    }
    const originByPlant = new Map<string, string[]>();
    const originRefsByPlant = new Map<string, Record<string, any[]>>();
    for (const row of originRows) {
      const list = originByPlant.get(String(row.plantId)) ?? [];
      list.push(row.countryCode);
      originByPlant.set(String(row.plantId), list);
      const refs = originRefsByPlant.get(String(row.plantId)) ?? {};
      if (row.sourceRefs !== undefined) refs[row.countryCode] = row.sourceRefs;
      originRefsByPlant.set(String(row.plantId), refs);
    }
    const provenByPlant = new Map<string, Array<{ countryCode: string; subdivisionCode?: string }>>();
    for (const row of provenRows) {
      const list = provenByPlant.get(String(row.plantId)) ?? [];
      list.push({
        countryCode: row.countryCode,
        ...(row.subdivisionCode ? { subdivisionCode: row.subdivisionCode } : {}),
      });
      provenByPlant.set(String(row.plantId), list);
    }
    const termsByPlant = new Map<string, string[]>();
    const termRefsByPlant = new Map<string, Record<string, any[]>>();
    for (const row of termAssignmentRows) {
      const list = termsByPlant.get(String(row.plantId)) ?? [];
      list.push(row.termCode);
      termsByPlant.set(String(row.plantId), list);
      const refs = termRefsByPlant.get(String(row.plantId)) ?? {};
      if (row.sourceRefs !== undefined) refs[row.termCode] = row.sourceRefs;
      termRefsByPlant.set(String(row.plantId), refs);
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
          contentUpdatedAt: care?.contentUpdatedAt,
          contentVersion: row.contentVersion ?? care?.contentVersion,
          source: row.source,
          sourceUrl: row.sourceUrl,
          sourceRefs: care?.sourceRefs,
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
        genus: plant.genus ?? undefined,
        species: plant.species ?? undefined,
        genusNormalized: plant.genusNormalized ?? undefined,
        speciesNormalized: plant.speciesNormalized ?? undefined,
        taxonomyParseStatus: plant.taxonomyParseStatus,
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
        propagationMethods: normalizePropagationMethods(care?.propagationMethods),
        careStatus: care?.careStatus ?? recomputeCareStatus(care, care?.careFieldEvidence as any),
        careFieldEvidence: care?.careFieldEvidence,
        // Own geography rows (the reconciler mirrors them back to SQLite).
        originCountries: originByPlant.get(String(plant._id)) ?? [],
        originCountrySourceRefs: originRefsByPlant.get(String(plant._id)) ?? {},
        provenRegions: provenByPlant.get(String(plant._id)) ?? [],
        adaptationTermCodes: termsByPlant.get(String(plant._id)) ?? [],
        adaptationTermSourceRefs: termRefsByPlant.get(String(plant._id)) ?? {},
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
      if (!dryRun) {
        await ctx.db.patch(plant._id, patch);
        await bumpReconciliationCatalog(ctx);
      }
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
