import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  buildTaxonomyFields,
  DEFAULT_CULTIVAR_NORMALIZED,
  matchesTaxonomyIdentity,
  requireTaxonomyIdentity,
  taxonomyFieldsForStorage,
  withComputedPlantTaxonomy,
  type TaxonomyIdentity,
} from "./lib/plantTaxonomy";
import {
  buildGenusTaxonomyKey,
  buildSpeciesTaxonomyKey,
  normalizeTaxonomyLocale,
} from "./lib/plantTaxonomyI18n";
import { buildPlantSeedKey, plantsMasterSeed } from "./data/plantsMasterSeed";
import { isDisplayBasePlant } from "../../shared/src/plantBase";
import { buildPlantUiGroupMap } from "../../shared/src/plantUiGrouping";
import {
  getPlantCareI18nMap,
  getPlantCareI18nRowsByPlantId,
  getPlantCareProfileByPlantId,
  getPlantCareProfileMap,
  mergeCareIntoI18nRows,
  mergeCareProfileIntoPlant,
  upsertPlantCareI18n,
  upsertPlantCareProfile,
} from "./lib/plantCare";
import { requireAdminServiceToken } from "./lib/adminAuth";
import { normalizePropagationMethods, PROPAGATION_METHODS } from "../../shared/src/plantPropagation";
import {
  ADAPTATION_DIMENSIONS,
  ADAPTATION_TERMS,
  isAdaptationDimension,
} from "../../shared/src/adaptationTerms";
import { TERM_CODE_PATTERN } from "../../shared/src/countries";

const adminTokenArg = { serviceToken: v.string() };
const propagationMethodValidator = v.union(
  ...(PROPAGATION_METHODS.map((method) => v.literal(method)) as any),
);

function validatePlantMetadata(args: {
  soilPhMin?: number;
  soilPhMax?: number;
  moistureTarget?: number;
  lightHours?: number;
  recordVersion?: number;
  contentVersion?: number;
  sourceUrl?: string;
  growthStage?: string;
}) {
  if (args.soilPhMin !== undefined && (args.soilPhMin < 0 || args.soilPhMin > 14)) {
    throw new Error("Soil pH minimum must be between 0 and 14");
  }
  if (args.soilPhMax !== undefined && (args.soilPhMax < 0 || args.soilPhMax > 14)) {
    throw new Error("Soil pH maximum must be between 0 and 14");
  }
  if (args.soilPhMin !== undefined && args.soilPhMax !== undefined && args.soilPhMin > args.soilPhMax) {
    throw new Error("Soil pH minimum must be less than or equal to maximum");
  }
  if (args.moistureTarget !== undefined && (args.moistureTarget < 0 || args.moistureTarget > 100)) {
    throw new Error("Moisture target must be between 0 and 100");
  }
  if (args.lightHours !== undefined && (args.lightHours < 0 || args.lightHours > 24)) {
    throw new Error("Light hours must be between 0 and 24");
  }
  if (args.recordVersion !== undefined && args.recordVersion < 1) {
    throw new Error("Record version must be positive");
  }
  if (args.contentVersion !== undefined && args.contentVersion < 1) {
    throw new Error("Content version must be positive");
  }
  if (args.sourceUrl && !/^https?:\/\//i.test(args.sourceUrl.trim())) {
    throw new Error("Source URL must use http or https");
  }
  if (args.growthStage && !["seedling", "vegetative", "flowering", "harvest"].includes(args.growthStage.trim())) {
    throw new Error("Invalid growth stage");
  }
}

async function ensureSourceIdentityAvailable(
  ctx: any,
  sourceSystem?: string,
  sourceId?: string,
  excludedPlantId?: any,
) {
  const normalizedSystem = sourceSystem?.trim();
  const normalizedId = sourceId?.trim();
  if (!normalizedSystem || !normalizedId) return;
  const existing = await ctx.db
    .query("plantsMaster")
    .withIndex("by_source_identity", (q: any) =>
      q.eq("sourceSystem", normalizedSystem).eq("sourceId", normalizedId),
    )
    .first();
  if (existing && existing._id !== excludedPlantId) {
    throw new Error("A plant with the same source identity already exists");
  }
}

async function upsertPlantI18n(
  ctx: any,
  plantId: any,
  locale: "vi" | "en",
  commonName: string,
  description?: string,
  options?: {
    source?: string;
    sourceUrl?: string;
    contentStatus?: "draft" | "published" | "needs_review" | "archived";
    contentVersion?: number;
    reviewStatus?: "unreviewed" | "in_review" | "reviewed";
    reviewedAt?: number;
    reviewedBy?: string;
  },
) {
  const normalizedCommonName = commonName.trim();
  if (!normalizedCommonName) {
    throw new Error(`A ${locale} common name is required`);
  }
  const existing = await ctx.db
    .query("plantI18n")
    .withIndex("by_plant_locale", (q: any) => q.eq("plantId", plantId).eq("locale", locale))
    .first();

  if (!existing) {
    await ctx.db.insert("plantI18n", {
      plantId,
      locale,
      commonName: normalizedCommonName,
      description: description?.trim() || undefined,
      source: options?.source?.trim() || undefined,
      sourceUrl: options?.sourceUrl?.trim() || undefined,
      contentStatus: options?.contentStatus,
      contentVersion: options?.contentVersion,
      reviewStatus: options?.reviewStatus,
      reviewedAt: options?.reviewedAt,
      reviewedBy: options?.reviewedBy?.trim() || undefined,
    });
    return;
  }

  await ctx.db.patch(existing._id, {
    commonName: normalizedCommonName,
    description: description?.trim() || undefined,
    ...(options?.source !== undefined && { source: options.source.trim() || undefined }),
    ...(options?.sourceUrl !== undefined && { sourceUrl: options.sourceUrl.trim() || undefined }),
    ...(options?.contentStatus !== undefined && { contentStatus: options.contentStatus }),
    ...(options?.contentVersion !== undefined && { contentVersion: options.contentVersion }),
    ...(options?.reviewStatus !== undefined && { reviewStatus: options.reviewStatus }),
    ...(options?.reviewedAt !== undefined && { reviewedAt: options.reviewedAt }),
    ...(options?.reviewedBy !== undefined && { reviewedBy: options.reviewedBy.trim() || undefined }),
  });
}

async function upsertPlantTaxonomyI18n(
  ctx: any,
  args: {
    taxonomyKey: string;
    rank: "family" | "genus" | "species";
    locale: string;
    family?: string;
    genus?: string;
    genusNormalized?: string;
    species?: string;
    speciesNormalized?: string;
    commonName?: string;
    description?: string;
  },
) {
  const locale = normalizeTaxonomyLocale(args.locale);
  if (!locale) return;

  const existing = await ctx.db
    .query("plantTaxonomyI18n")
    .withIndex("by_taxonomy_locale", (q: any) =>
      q.eq("taxonomyKey", args.taxonomyKey).eq("locale", locale),
    )
    .unique();

  const commonName = String(args.commonName ?? "").trim();
  const description = args.description?.trim() || undefined;
  if (!commonName) {
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return;
  }

  const payload = {
    taxonomyKey: args.taxonomyKey,
    rank: args.rank,
    locale,
    family: args.family?.trim() || undefined,
    genus: args.genus?.trim() || undefined,
    genusNormalized: args.genusNormalized?.trim() || undefined,
    species: args.species?.trim() || undefined,
    speciesNormalized: args.speciesNormalized?.trim() || undefined,
    commonName,
    description,
  };

  if (!existing) {
    await ctx.db.insert("plantTaxonomyI18n", payload);
    return;
  }

  await ctx.db.patch(existing._id, payload);
}

async function syncPlantTaxonomyCommonNames(
  ctx: any,
  taxonomy: {
    family?: string;
    genus?: string;
    genusNormalized?: string;
    species?: string;
    speciesNormalized?: string;
  },
  names: {
    commonGenusNameVi?: string;
    commonGenusNameEn?: string;
    commonSpeciesNameVi?: string;
    commonSpeciesNameEn?: string;
  },
) {
  const family = normalizeFamily(taxonomy.family);
  const genusNormalized = String(taxonomy.genusNormalized ?? "").trim();
  const genus = String(taxonomy.genus ?? "").trim();
  if (genusNormalized && genus) {
    const taxonomyKey = buildGenusTaxonomyKey(genusNormalized);
    await upsertPlantTaxonomyI18n(ctx, {
      taxonomyKey,
      rank: "genus",
      locale: "vi",
      family,
      genus,
      genusNormalized,
      commonName: names.commonGenusNameVi,
    });
    await upsertPlantTaxonomyI18n(ctx, {
      taxonomyKey,
      rank: "genus",
      locale: "en",
      family,
      genus,
      genusNormalized,
      commonName: names.commonGenusNameEn,
    });
  }

  const speciesNormalized = String(taxonomy.speciesNormalized ?? "").trim();
  const species = String(taxonomy.species ?? "").trim();
  if (genusNormalized && genus && speciesNormalized && species) {
    const taxonomyKey = buildSpeciesTaxonomyKey(genusNormalized, speciesNormalized);
    await upsertPlantTaxonomyI18n(ctx, {
      taxonomyKey,
      rank: "species",
      locale: "vi",
      family,
      genus,
      genusNormalized,
      species,
      speciesNormalized,
      commonName: names.commonSpeciesNameVi,
    });
    await upsertPlantTaxonomyI18n(ctx, {
      taxonomyKey,
      rank: "species",
      locale: "en",
      family,
      genus,
      genusNormalized,
      species,
      speciesNormalized,
      commonName: names.commonSpeciesNameEn,
    });
  }
}

async function findDuplicateByTaxonomy(ctx: any, taxonomy: TaxonomyIdentity) {
  const plants = (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);
  return plants.find((plant: any) => matchesTaxonomyIdentity(plant, taxonomy)) ?? null;
}

function normalizeScientificNameForGrouping(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/[()'",]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFamily(value?: string | null) {
  return String(value ?? "").trim();
}

const seedFamilyByTaxonomyKey = new Map<string, string>();
const seedFamilyByGenusNormalized = new Map<string, string>();

for (const seedPlant of plantsMasterSeed) {
  const family = normalizeFamily((seedPlant as any).family);
  if (!family) continue;

  const taxonomyKey = buildPlantSeedKey({
    scientificName: seedPlant.scientificName,
    cultivar: (seedPlant as any).cultivar,
  });
  seedFamilyByTaxonomyKey.set(taxonomyKey, family);

  const taxonomy = buildTaxonomyFields({
    scientificName: seedPlant.scientificName,
    cultivar: (seedPlant as any).cultivar,
  });
  if (taxonomy.genusNormalized && !seedFamilyByGenusNormalized.has(taxonomy.genusNormalized)) {
    seedFamilyByGenusNormalized.set(taxonomy.genusNormalized, family);
  }
}

function inferPlantFamily(plant: {
  scientificName?: string;
  cultivar?: string;
  genusNormalized?: string;
  family?: string | null;
}) {
  const explicitFamily = normalizeFamily(plant.family);
  if (explicitFamily) return explicitFamily;

  const taxonomyKey = buildPlantSeedKey({
    scientificName: String(plant.scientificName ?? ""),
    cultivar: plant.cultivar,
  });
  const seedFamily = seedFamilyByTaxonomyKey.get(taxonomyKey);
  if (seedFamily) return seedFamily;

  const genusFamily = plant.genusNormalized
    ? seedFamilyByGenusNormalized.get(plant.genusNormalized)
    : undefined;
  return genusFamily;
}

function findScientificBasePlant(
  plants: any[],
  scientificName: string,
  excludingPlantId?: any,
) {
  const scientificKey = normalizeScientificNameForGrouping(scientificName);
  if (!scientificKey) return null;

  const candidates = plants.filter(
    (plant) =>
      isDisplayBasePlant(plant) &&
      normalizeScientificNameForGrouping(plant?.scientificName) === scientificKey &&
      (!excludingPlantId || String(plant._id) !== String(excludingPlantId))
  );

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aCultivar = String(a?.cultivarNormalized ?? "");
    const bCultivar = String(b?.cultivarNormalized ?? "");
    const aIsDefault = aCultivar === DEFAULT_CULTIVAR_NORMALIZED;
    const bIsDefault = bCultivar === DEFAULT_CULTIVAR_NORMALIZED;
    if (aIsDefault !== bIsDefault) return aIsDefault ? -1 : 1;
    return String(a._id).localeCompare(String(b._id));
  });

  return candidates[0] ?? null;
}

async function resolveGroupBasePlantId(
  ctx: any,
  options: {
    plants?: any[];
    plantId?: any;
    scientificName: string;
    cultivarNormalized: string;
    explicitGroupBasePlantId?: any;
  }
) {
  const plants = options.plants ?? (await ctx.db.query("plantsMaster").collect());
  const isBasePlant = isDisplayBasePlant({
    cultivarNormalized: options.cultivarNormalized,
  });

  if (isBasePlant) {
    return options.plantId;
  }

  if (options.explicitGroupBasePlantId) {
    const basePlant = plants.find(
      (plant: any) => String(plant._id) === String(options.explicitGroupBasePlantId)
    );
    if (!basePlant) {
      throw new Error("Group base plant not found");
    }
    if (!isDisplayBasePlant(basePlant)) {
      throw new Error("Group base plant must be a base plant");
    }
    if (
      normalizeScientificNameForGrouping(basePlant.scientificName) !==
      normalizeScientificNameForGrouping(options.scientificName)
    ) {
      throw new Error("Group base plant must share the same scientific name");
    }
    return basePlant._id;
  }

  const basePlant = findScientificBasePlant(
    plants,
    options.scientificName,
    options.plantId
  );
  if (!basePlant) {
    throw new Error("Base plant is required before creating or updating a variant");
  }

  return basePlant._id;
}

async function assertBaseExistsForVariant(
  ctx: any,
  input: {
    scientificName: string;
    cultivarNormalized: string;
  },
  options?: { excludingPlantId?: any }
) {
  if (
    input.cultivarNormalized === DEFAULT_CULTIVAR_NORMALIZED ||
    isDisplayBasePlant({ cultivarNormalized: input.cultivarNormalized })
  ) {
    return;
  }
  const plants = (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);
  const base = findScientificBasePlant(
    plants,
    input.scientificName,
    options?.excludingPlantId
  );

  if (!base || (options?.excludingPlantId && base._id === options.excludingPlantId)) {
    throw new Error("Base plant is required before creating or updating a variant");
  }
}

export const updatePlant = mutation({
  args: {
    ...adminTokenArg,
    plantId: v.id("plantsMaster"),
    scientificName: v.string(),
    cultivar: v.optional(v.string()),
    family: v.optional(v.string()),
    group: v.string(),
    basePlantId: v.optional(v.id("plantsMaster")),
    commonNameGroupKey: v.optional(v.string()),
    commonNameGroupVi: v.optional(v.string()),
    commonNameGroupEn: v.optional(v.string()),
    purposes: v.optional(v.array(v.string())),
    imageUrl: v.optional(v.union(v.string(), v.null())),
    viCommonName: v.string(),
    viDescription: v.optional(v.string()),
    enCommonName: v.string(),
    enDescription: v.optional(v.string()),
    commonGenusNameVi: v.optional(v.string()),
    commonGenusNameEn: v.optional(v.string()),
    commonSpeciesNameVi: v.optional(v.string()),
    commonSpeciesNameEn: v.optional(v.string()),
    // Growing parameters
    typicalDaysToHarvest: v.optional(v.number()),
    wateringFrequencyDays: v.optional(v.number()),
    germinationDays: v.optional(v.number()),
    spacingCm: v.optional(v.number()),
    lightRequirements: v.optional(v.string()),
    maxPlantsPerM2: v.optional(v.number()),
    seedRatePerM2: v.optional(v.number()),
    waterLitersPerM2: v.optional(v.number()),
    yieldKgPerM2: v.optional(v.number()),
    fertilizingFrequencyDays: v.optional(v.number()),
    soilPhMin: v.optional(v.number()),
    soilPhMax: v.optional(v.number()),
    moistureTarget: v.optional(v.number()),
    lightHours: v.optional(v.number()),
    growthStage: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    source: v.optional(v.string()),
    sourceSystem: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    recordVersion: v.optional(v.number()),
    contentStatus: v.optional(v.union(
      v.literal("draft"), v.literal("published"), v.literal("needs_review"), v.literal("archived"),
    )),
    contentVersion: v.optional(v.number()),
    reviewStatus: v.optional(v.union(
      v.literal("unreviewed"), v.literal("in_review"), v.literal("reviewed"),
    )),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.string()),
    propagationMethods: v.optional(v.array(propagationMethodValidator)),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    validatePlantMetadata(args);
    const plant = await ctx.db.get(args.plantId);
    if (!plant) {
      throw new Error("Plant not found");
    }
    await ensureSourceIdentityAvailable(
      ctx,
      args.sourceSystem ?? (plant as any).sourceSystem,
      args.sourceId ?? (plant as any).sourceId,
      args.plantId,
    );

    const scientificName = args.scientificName.trim();
    const cultivar = args.cultivar ?? (plant as any).cultivar;
    const taxonomy = buildTaxonomyFields({ scientificName, cultivar });
    const taxonomyIdentity = requireTaxonomyIdentity(
      taxonomy,
      `Plant ${args.plantId}`
    );
    const duplicate = await findDuplicateByTaxonomy(ctx, taxonomyIdentity);
    if (duplicate && duplicate._id !== args.plantId) {
      throw new Error("Another plant with the same taxonomy already exists");
    }
    await assertBaseExistsForVariant(ctx, {
      scientificName,
      cultivarNormalized: taxonomyIdentity.cultivarNormalized,
    }, {
      excludingPlantId: args.plantId,
    });
    const allPlants = (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);
    const resolvedGroupBasePlantId = await resolveGroupBasePlantId(ctx, {
      plants: allPlants,
      plantId: args.plantId,
      scientificName,
      cultivarNormalized: taxonomyIdentity.cultivarNormalized,
      explicitGroupBasePlantId: args.basePlantId ?? (plant as any).basePlantId,
    });

    await ctx.db.patch(args.plantId, {
      scientificName,
      family: args.family?.trim() || undefined,
      group: args.group.trim(),
      basePlantId: resolvedGroupBasePlantId ?? undefined,
      commonNameGroupKey: args.commonNameGroupKey?.trim() || undefined,
      commonNameGroupVi: args.commonNameGroupVi?.trim() || undefined,
      commonNameGroupEn: args.commonNameGroupEn?.trim() || undefined,
      imageUrl: args.imageUrl ?? undefined,
      ...(args.isActive !== undefined && { isActive: args.isActive }),
      ...(args.source !== undefined && { source: args.source.trim() || undefined }),
      ...(args.sourceSystem !== undefined && { sourceSystem: args.sourceSystem.trim() || undefined }),
      ...(args.sourceId !== undefined && { sourceId: args.sourceId.trim() || undefined }),
      ...(args.sourceUrl !== undefined && { sourceUrl: args.sourceUrl.trim() || undefined }),
      ...(args.recordVersion !== undefined && { recordVersion: args.recordVersion }),
      ...(args.contentStatus !== undefined && { contentStatus: args.contentStatus }),
      ...(args.contentVersion !== undefined && { contentVersion: args.contentVersion }),
      ...(args.reviewStatus !== undefined && { reviewStatus: args.reviewStatus }),
      ...(args.reviewedAt !== undefined && { reviewedAt: args.reviewedAt }),
      ...(args.reviewedBy !== undefined && { reviewedBy: args.reviewedBy.trim() || undefined }),
      ...(args.growthStage !== undefined && { growthStage: args.growthStage.trim() || undefined }),
      ...(args.notes !== undefined && { notes: args.notes.trim() || undefined }),
      ...taxonomyFieldsForStorage(taxonomy),
      ...(args.purposes !== undefined && {
        purposes: args.purposes.map((item) => item.trim()).filter(Boolean),
      }),
    });
    await upsertPlantCareProfile(ctx, args.plantId, {
      typicalDaysToHarvest: args.typicalDaysToHarvest,
      wateringFrequencyDays: args.wateringFrequencyDays,
      germinationDays: args.germinationDays,
      spacingCm: args.spacingCm,
      lightRequirements: args.lightRequirements?.trim() || undefined,
      maxPlantsPerM2: args.maxPlantsPerM2,
      seedRatePerM2: args.seedRatePerM2,
      waterLitersPerM2: args.waterLitersPerM2,
      yieldKgPerM2: args.yieldKgPerM2,
      fertilizingFrequencyDays: args.fertilizingFrequencyDays,
      soilPhMin: args.soilPhMin,
      soilPhMax: args.soilPhMax,
      moistureTarget: args.moistureTarget,
      lightHours: args.lightHours,
      ...(args.propagationMethods !== undefined
        ? { propagationMethods: normalizePropagationMethods(args.propagationMethods) }
        : {}),
    });

    const i18nMetadata = {
      source: args.source,
      sourceUrl: args.sourceUrl,
      contentStatus: args.contentStatus,
      contentVersion: args.contentVersion,
      reviewStatus: args.reviewStatus,
      reviewedAt: args.reviewedAt,
      reviewedBy: args.reviewedBy,
    };
    await upsertPlantI18n(ctx, args.plantId, "vi", args.viCommonName, args.viDescription, i18nMetadata);
    await upsertPlantI18n(ctx, args.plantId, "en", args.enCommonName, args.enDescription, i18nMetadata);
    await syncPlantTaxonomyCommonNames(ctx, {
      family: args.family?.trim() || undefined,
      genus: taxonomy.genus,
      genusNormalized: taxonomy.genusNormalized,
      species: taxonomy.species,
      speciesNormalized: taxonomy.speciesNormalized,
    }, {
      commonGenusNameVi: args.commonGenusNameVi,
      commonGenusNameEn: args.commonGenusNameEn,
      commonSpeciesNameVi: args.commonSpeciesNameVi,
      commonSpeciesNameEn: args.commonSpeciesNameEn,
    });

    return { ok: true };
  },
});

export const listPlants = query({
  args: {
    ...adminTokenArg,
    page: v.number(),
    pageSize: v.number(),
    viewMode: v.optional(v.union(v.literal("common"), v.literal("family"))),
    search: v.optional(v.string()),
    groupFilter: v.optional(v.string()),
    filterMissingI18n: v.optional(v.boolean()),
    filterNoImage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const viewMode = args.viewMode ?? "common";
    const plants = (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);
    const i18nRows = await ctx.db.query("plantI18n").collect();
    const careByPlantLocale = await getPlantCareI18nMap(ctx);
    const careProfileByPlantId = await getPlantCareProfileMap(ctx);
    const taxonomyI18nRows = await ctx.db.query("plantTaxonomyI18n").collect();
    const i18nByPlantId = new Map<string, Array<{
      locale: string;
      commonName: string;
      description?: string;
      careContent?: string;
      contentVersion?: number;
      source?: string;
      sourceUrl?: string;
      contentStatus?: string;
      reviewStatus?: string;
      reviewedAt?: number;
      reviewedBy?: string;
    }>>();

    for (const row of mergeCareIntoI18nRows(i18nRows, careByPlantLocale)) {
      const key = row.plantId.toString();
      const list = i18nByPlantId.get(key) ?? [];
      list.push({
        locale: row.locale,
        commonName: row.commonName,
        description: row.description ?? undefined,
        careContent: row.careContent ?? undefined,
        contentVersion: row.contentVersion ?? undefined,
        source: row.source ?? undefined,
        sourceUrl: row.sourceUrl ?? undefined,
        contentStatus: row.contentStatus ?? undefined,
        reviewStatus: row.reviewStatus ?? undefined,
        reviewedAt: row.reviewedAt ?? undefined,
        reviewedBy: row.reviewedBy ?? undefined,
      });
      i18nByPlantId.set(key, list);
    }

    const taxonomyCommonNames = new Map<string, Record<string, string>>();
    for (const row of taxonomyI18nRows) {
      const entry = taxonomyCommonNames.get(row.taxonomyKey) ?? {};
      entry[row.locale] = row.commonName;
      taxonomyCommonNames.set(row.taxonomyKey, entry);
    }

    const genusConsensusFamily = new Map<string, string>();
    for (const plant of plants) {
      const genusNormalized = String(plant.genusNormalized ?? "").trim();
      const family = normalizeFamily((plant as any).family);
      if (!genusNormalized || !family || genusConsensusFamily.has(genusNormalized)) continue;
      genusConsensusFamily.set(genusNormalized, family);
    }

    const hydratedPlants = plants.map((plant) => {
      const plantWithCare = mergeCareProfileIntoPlant(
        plant,
        careProfileByPlantId.get(String(plant._id)),
      );
      const genusNormalized = String(plant.genusNormalized ?? "").trim();
      const speciesNormalized = String(plant.speciesNormalized ?? "").trim();
      const genusTaxonomyKey = genusNormalized
        ? buildGenusTaxonomyKey(genusNormalized)
        : "";
      const speciesTaxonomyKey =
        genusNormalized && speciesNormalized
          ? buildSpeciesTaxonomyKey(genusNormalized, speciesNormalized)
          : "";
      const genusNames = genusTaxonomyKey
        ? taxonomyCommonNames.get(genusTaxonomyKey)
        : undefined;
      const speciesNames = speciesTaxonomyKey
        ? taxonomyCommonNames.get(speciesTaxonomyKey)
        : undefined;

      return {
        _id: plant._id,
        scientificName: plant.scientificName,
        // Taxonomy fields (optional in schema — may be undefined for legacy rows)
        genus: plant.genus ?? undefined,
        species: plant.species ?? undefined,
        cultivar: plant.cultivar ?? undefined,
        genusNormalized: plant.genusNormalized ?? undefined,
        speciesNormalized: plant.speciesNormalized ?? undefined,
        cultivarNormalized: plant.cultivarNormalized ?? undefined,
        family:
          inferPlantFamily({
            scientificName: plant.scientificName,
            cultivar: plant.cultivar ?? undefined,
            genusNormalized: plant.genusNormalized ?? undefined,
            family: (plant as any).family ?? undefined,
          }) ??
          genusConsensusFamily.get(String(plant.genusNormalized ?? "").trim()) ??
          undefined,
        group: plant.group,
        basePlantId: (plant as any).basePlantId ?? undefined,
        commonNameGroupKey: (plant as any).commonNameGroupKey ?? undefined,
        commonNameGroupVi: (plant as any).commonNameGroupVi ?? undefined,
        commonNameGroupEn: (plant as any).commonNameGroupEn ?? undefined,
        commonGenusNameVi: genusNames?.vi ?? undefined,
        commonGenusNameEn: genusNames?.en ?? undefined,
        commonSpeciesNameVi: speciesNames?.vi ?? undefined,
        commonSpeciesNameEn: speciesNames?.en ?? undefined,
        description:
          i18nByPlantId.get(plant._id.toString())?.find((row) => row.locale === "vi")?.description ??
          i18nByPlantId.get(plant._id.toString())?.find((row) => row.locale === "en")?.description ??
          undefined,
        imageUrl: plant.imageUrl ?? null,
        purposes: plant.purposes ?? [],
        typicalDaysToHarvest: plantWithCare.typicalDaysToHarvest ?? undefined,
        wateringFrequencyDays: plantWithCare.wateringFrequencyDays ?? undefined,
        lightRequirements: plantWithCare.lightRequirements ?? undefined,
        germinationDays: plantWithCare.germinationDays ?? undefined,
        spacingCm: plantWithCare.spacingCm ?? undefined,
        maxPlantsPerM2: plantWithCare.maxPlantsPerM2 ?? undefined,
        seedRatePerM2: plantWithCare.seedRatePerM2 ?? undefined,
        waterLitersPerM2: plantWithCare.waterLitersPerM2 ?? undefined,
        yieldKgPerM2: plantWithCare.yieldKgPerM2 ?? undefined,
        fertilizingFrequencyDays: plantWithCare.fertilizingFrequencyDays ?? undefined,
        soilPhMin: plantWithCare.soilPhMin ?? undefined,
        soilPhMax: plantWithCare.soilPhMax ?? undefined,
        moistureTarget: plantWithCare.moistureTarget ?? undefined,
        lightHours: plantWithCare.lightHours ?? undefined,
        isActive: plant.isActive !== false,
        sourceSystem: plant.sourceSystem ?? undefined,
        sourceId: plant.sourceId ?? undefined,
        recordVersion: plant.recordVersion ?? undefined,
        sourceUrl: plant.sourceUrl ?? undefined,
        contentStatus: plant.contentStatus ?? undefined,
        contentVersion: plant.contentVersion ?? undefined,
        reviewStatus: plant.reviewStatus ?? undefined,
        reviewedAt: plant.reviewedAt ?? undefined,
        reviewedBy: plant.reviewedBy ?? undefined,
        growthStage: plant.growthStage ?? undefined,
        notes: plant.notes ?? undefined,
        source: plant.source ?? undefined,
        i18nRows: i18nByPlantId.get(plant._id.toString()) ?? [],
      };
    });
    const groupOptions = Array.from(
      new Set(hydratedPlants.map((plant) => plant.group).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));

    const stats = {
      total: hydratedPlants.length,
      missingI18n: hydratedPlants.filter((plant) => {
        const locales = new Set(plant.i18nRows.map((row) => row.locale));
        return !locales.has("vi") || !locales.has("en");
      }).length,
      missingImages: hydratedPlants.filter((plant) => !plant.imageUrl).length,
    };

    const normalizedSearch = args.search?.trim().toLowerCase() ?? "";
    let filteredPlants = hydratedPlants;

    if (args.groupFilter && args.groupFilter !== "all") {
      filteredPlants = filteredPlants.filter((plant) => plant.group === args.groupFilter);
    }
    if (args.filterMissingI18n) {
      filteredPlants = filteredPlants.filter((plant) => {
        const locales = new Set(plant.i18nRows.map((row) => row.locale));
        return !locales.has("vi") || !locales.has("en");
      });
    }
    if (args.filterNoImage) {
      filteredPlants = filteredPlants.filter((plant) => !plant.imageUrl);
    }
    if (normalizedSearch) {
      filteredPlants = filteredPlants.filter((plant) => {
        const vi = plant.i18nRows.find((row) => row.locale === "vi")?.commonName ?? "";
        const en = plant.i18nRows.find((row) => row.locale === "en")?.commonName ?? "";
        const haystack = [
          plant.scientificName,
          plant.family ?? "",
          plant.genus ?? "",
          plant.species ?? "",
          plant.cultivar ?? "",
          plant.commonGenusNameVi ?? "",
          plant.commonGenusNameEn ?? "",
          plant.commonSpeciesNameVi ?? "",
          plant.commonSpeciesNameEn ?? "",
          plant.group,
          plant.description ?? "",
          vi,
          en,
          ...(plant.purposes ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      });
    }

    if (viewMode === "family") {
      filteredPlants = filteredPlants.filter((plant) =>
        Boolean(String((plant as any).family ?? "").trim())
      );
    }

    const groupMap = buildPlantUiGroupMap(filteredPlants, "vi");
    const sortedPlants = filteredPlants.sort((a, b) => {
      if (viewMode === "family") {
        const aFamily = String((a as any).family ?? "").toLowerCase();
        const bFamily = String((b as any).family ?? "").toLowerCase();
        const familyCmp = aFamily.localeCompare(bFamily);
        if (familyCmp !== 0) return familyCmp;
      }

      const aUiGroup = groupMap.get(String(a._id));
      const bUiGroup = groupMap.get(String(b._id));
      const aGroupLabel = (aUiGroup?.label ?? "").toLowerCase();
      const bGroupLabel = (bUiGroup?.label ?? "").toLowerCase();
      const groupCmp = aGroupLabel.localeCompare(bGroupLabel);
      if (groupCmp !== 0) return groupCmp;

      const aGenus = (a.genusNormalized ?? a.scientificName).toLowerCase();
      const bGenus = (b.genusNormalized ?? b.scientificName).toLowerCase();
      const aSp = a.speciesNormalized ?? "";
      const bSp = b.speciesNormalized ?? "";
      const aCult = a.cultivarNormalized ?? DEFAULT_CULTIVAR_NORMALIZED;
      const bCult = b.cultivarNormalized ?? DEFAULT_CULTIVAR_NORMALIZED;

      const genusCmp = aGenus.localeCompare(bGenus);
      if (genusCmp !== 0) return genusCmp;
      const spCmp = aSp.localeCompare(bSp);
      if (spCmp !== 0) return spCmp;
      const aBase = isDisplayBasePlant(a);
      const bBase = isDisplayBasePlant(b);
      if (aBase !== bBase) return aBase ? -1 : 1;
      return aCult.localeCompare(bCult);
    });

    const clusters = new Map<string, typeof sortedPlants>();
    const clusterOrder: string[] = [];
    const uiGroupMap = buildPlantUiGroupMap(sortedPlants, "vi");
    for (const plant of sortedPlants) {
      const uiGroup = uiGroupMap.get(String(plant._id));
      const clusterKey =
        viewMode === "family"
          ? `family:${String((plant as any).family ?? "").trim()}`
          : uiGroup?.key ?? [
              plant.group,
              plant.genusNormalized ?? plant.genus ?? plant.scientificName,
              plant.speciesNormalized ?? plant.species ?? "",
            ].join("|");
      const existing = clusters.get(clusterKey);
      if (existing) {
        existing.push(plant);
        continue;
      }
      clusters.set(clusterKey, [plant]);
      clusterOrder.push(clusterKey);
    }

    const safePageSize = Math.max(1, Math.floor(args.pageSize || 10));
    const pages: typeof sortedPlants[] = [];
    let currentPage: typeof sortedPlants = [];
    let currentCount = 0;

    for (const clusterKey of clusterOrder) {
      const cluster = clusters.get(clusterKey) ?? [];
      if (currentCount > 0 && currentCount + cluster.length > safePageSize) {
        pages.push(currentPage);
        currentPage = [];
        currentCount = 0;
      }
      currentPage.push(...cluster);
      currentCount += cluster.length;
    }

    if (currentPage.length > 0 || pages.length === 0) {
      pages.push(currentPage);
    }

    const totalPages = pages.length;
    const safePage = Math.min(Math.max(1, Math.floor(args.page || 1)), totalPages);
    const items = pages[safePage - 1] ?? [];

    return {
      items,
      page: safePage,
      pageSize: safePageSize,
      totalItems: sortedPlants.length,
      totalPages,
      viewMode,
      groupOptions,
      stats,
    };
  },
});

export const createPlant = mutation({
  args: {
    ...adminTokenArg,
    scientificName: v.string(),
    cultivar: v.optional(v.string()),
    family: v.optional(v.string()),
    group: v.string(),
    basePlantId: v.optional(v.id("plantsMaster")),
    commonNameGroupKey: v.optional(v.string()),
    commonNameGroupVi: v.optional(v.string()),
    commonNameGroupEn: v.optional(v.string()),
    purposes: v.optional(v.array(v.string())),
    imageUrl: v.optional(v.union(v.string(), v.null())),
    viCommonName: v.string(),
    viDescription: v.optional(v.string()),
    enCommonName: v.string(),
    enDescription: v.optional(v.string()),
    commonGenusNameVi: v.optional(v.string()),
    commonGenusNameEn: v.optional(v.string()),
    commonSpeciesNameVi: v.optional(v.string()),
    commonSpeciesNameEn: v.optional(v.string()),
    // Growing parameters
    typicalDaysToHarvest: v.optional(v.number()),
    wateringFrequencyDays: v.optional(v.number()),
    germinationDays: v.optional(v.number()),
    spacingCm: v.optional(v.number()),
    lightRequirements: v.optional(v.string()),
    maxPlantsPerM2: v.optional(v.number()),
    seedRatePerM2: v.optional(v.number()),
    waterLitersPerM2: v.optional(v.number()),
    yieldKgPerM2: v.optional(v.number()),
    fertilizingFrequencyDays: v.optional(v.number()),
    soilPhMin: v.optional(v.number()),
    soilPhMax: v.optional(v.number()),
    moistureTarget: v.optional(v.number()),
    lightHours: v.optional(v.number()),
    growthStage: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    source: v.optional(v.string()),
    sourceSystem: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    recordVersion: v.optional(v.number()),
    contentStatus: v.optional(v.union(
      v.literal("draft"), v.literal("published"), v.literal("needs_review"), v.literal("archived"),
    )),
    contentVersion: v.optional(v.number()),
    reviewStatus: v.optional(v.union(
      v.literal("unreviewed"), v.literal("in_review"), v.literal("reviewed"),
    )),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.string()),
    propagationMethods: v.optional(v.array(propagationMethodValidator)),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    validatePlantMetadata(args);
    const scientificName = args.scientificName.trim();
    if (!scientificName) {
      throw new Error("Scientific name is required");
    }
    const taxonomy = buildTaxonomyFields({
      scientificName,
      cultivar: args.cultivar,
    });
    const taxonomyIdentity = requireTaxonomyIdentity(
      taxonomy,
      `Plant ${scientificName}${args.cultivar ? ` (${args.cultivar})` : ""}`
    );
    const duplicate = await findDuplicateByTaxonomy(ctx, taxonomyIdentity);
    if (duplicate) {
      throw new Error("Plant with the same taxonomy already exists");
    }
    await assertBaseExistsForVariant(ctx, {
      scientificName,
      cultivarNormalized: taxonomyIdentity.cultivarNormalized,
    });

    const group = args.group.trim() || "other";
    const purposes = (args.purposes ?? []).map((item) => item.trim()).filter(Boolean);
    await ensureSourceIdentityAvailable(ctx, args.sourceSystem, args.sourceId);
    const allPlants = (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);
    const resolvedGroupBasePlantId = await resolveGroupBasePlantId(ctx, {
      plants: allPlants,
      scientificName,
      cultivarNormalized: taxonomyIdentity.cultivarNormalized,
      explicitGroupBasePlantId: args.basePlantId,
    });

    const plantId = await ctx.db.insert("plantsMaster", {
      scientificName,
      family: args.family?.trim() || undefined,
      group,
      basePlantId: resolvedGroupBasePlantId ?? undefined,
      commonNameGroupKey: args.commonNameGroupKey?.trim() || undefined,
      commonNameGroupVi: args.commonNameGroupVi?.trim() || undefined,
      commonNameGroupEn: args.commonNameGroupEn?.trim() || undefined,
      imageUrl: args.imageUrl ?? undefined,
      purposes,
      ...(args.isActive !== undefined && { isActive: args.isActive }),
      ...(args.source !== undefined && { source: args.source.trim() || undefined }),
      ...(args.sourceSystem !== undefined && { sourceSystem: args.sourceSystem.trim() || undefined }),
      ...(args.sourceId !== undefined && { sourceId: args.sourceId.trim() || undefined }),
      ...(args.sourceUrl !== undefined && { sourceUrl: args.sourceUrl.trim() || undefined }),
      ...(args.recordVersion !== undefined && { recordVersion: args.recordVersion }),
      ...(args.contentStatus !== undefined && { contentStatus: args.contentStatus }),
      ...(args.contentVersion !== undefined && { contentVersion: args.contentVersion }),
      ...(args.reviewStatus !== undefined && { reviewStatus: args.reviewStatus }),
      ...(args.reviewedAt !== undefined && { reviewedAt: args.reviewedAt }),
      ...(args.reviewedBy !== undefined && { reviewedBy: args.reviewedBy.trim() || undefined }),
      ...(args.growthStage !== undefined && { growthStage: args.growthStage.trim() || undefined }),
      ...(args.notes !== undefined && { notes: args.notes.trim() || undefined }),
      ...taxonomyFieldsForStorage(taxonomy),
    });
    await upsertPlantCareProfile(ctx, plantId, {
      typicalDaysToHarvest: args.typicalDaysToHarvest,
      wateringFrequencyDays: args.wateringFrequencyDays,
      germinationDays: args.germinationDays,
      spacingCm: args.spacingCm,
      lightRequirements: args.lightRequirements?.trim() || undefined,
      maxPlantsPerM2: args.maxPlantsPerM2,
      seedRatePerM2: args.seedRatePerM2,
      waterLitersPerM2: args.waterLitersPerM2,
      yieldKgPerM2: args.yieldKgPerM2,
      fertilizingFrequencyDays: args.fertilizingFrequencyDays,
      soilPhMin: args.soilPhMin,
      soilPhMax: args.soilPhMax,
      moistureTarget: args.moistureTarget,
      lightHours: args.lightHours,
      ...(args.propagationMethods !== undefined
        ? { propagationMethods: normalizePropagationMethods(args.propagationMethods) }
        : {}),
    });

    if (isDisplayBasePlant({ cultivarNormalized: taxonomyIdentity.cultivarNormalized })) {
      await ctx.db.patch(plantId, {
        basePlantId: plantId,
      });
    }

    const i18nMetadata = {
      source: args.source,
      sourceUrl: args.sourceUrl,
      contentStatus: args.contentStatus,
      contentVersion: args.contentVersion,
      reviewStatus: args.reviewStatus,
      reviewedAt: args.reviewedAt,
      reviewedBy: args.reviewedBy,
    };
    await upsertPlantI18n(ctx, plantId, "vi", args.viCommonName, args.viDescription, i18nMetadata);
    await upsertPlantI18n(ctx, plantId, "en", args.enCommonName, args.enDescription, i18nMetadata);
    await syncPlantTaxonomyCommonNames(ctx, {
      family: args.family?.trim() || undefined,
      genus: taxonomy.genus,
      genusNormalized: taxonomy.genusNormalized,
      species: taxonomy.species,
      speciesNormalized: taxonomy.speciesNormalized,
    }, {
      commonGenusNameVi: args.commonGenusNameVi,
      commonGenusNameEn: args.commonGenusNameEn,
      commonSpeciesNameVi: args.commonSpeciesNameVi,
      commonSpeciesNameEn: args.commonSpeciesNameEn,
    });

    return { plantId };
  },
});

export const deletePlant = mutation({
  args: {
    ...adminTokenArg,
    plantId: v.id("plantsMaster"),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const plant = await ctx.db.get(args.plantId);
    if (!plant) {
      throw new Error("Plant not found");
    }

    // Enforce base invariant: base row cannot be deleted while variants still exist.
    if (isDisplayBasePlant(plant)) {
      const plants = (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);
      const scientificKey = normalizeScientificNameForGrouping(plant.scientificName);
      const hasVariants = plants.some(
        (row: any) =>
          row._id !== args.plantId &&
          normalizeScientificNameForGrouping(row.scientificName) === scientificKey &&
          !isDisplayBasePlant(row)
      );
      if (hasVariants) {
        throw new Error("Cannot delete base plant while variants still exist");
      }
    }

    const referencedUserPlant = (await ctx.db.query("userPlants").collect())
      .find((row: any) => String(row.plantMasterId ?? "") === String(args.plantId) && row.isDeleted !== true);
    if (referencedUserPlant) {
      throw new Error("Cannot delete a plant while user plants still reference it; deactivate it instead");
    }

    const i18nRows = await ctx.db
      .query("plantI18n")
      .withIndex("by_plant_locale", (q: any) => q.eq("plantId", args.plantId))
      .collect();
    const careRows = await getPlantCareI18nRowsByPlantId(ctx, args.plantId);
    const careProfile = await getPlantCareProfileByPlantId(ctx, args.plantId);
    const relationRows = [
      ...await ctx.db.query("plantRelations").withIndex("by_plant", (q: any) => q.eq("plantId", args.plantId)).collect(),
      ...await ctx.db.query("plantRelations").withIndex("by_related_plant", (q: any) => q.eq("relatedPlantId", args.plantId)).collect(),
    ];
    const favoriteRows = await ctx.db
      .query("userFavorites")
      .withIndex("by_plant", (q: any) => q.eq("plantMasterId", args.plantId))
      .collect();

    for (const row of i18nRows) {
      await ctx.db.delete(row._id);
    }
    for (const row of careRows) {
      await ctx.db.delete(row._id);
    }
    if (careProfile) {
      await ctx.db.delete(careProfile._id);
    }
    for (const row of new Map(relationRows.map((item: any) => [String(item._id), item])).values()) {
      await ctx.db.delete((row as any)._id);
    }
    for (const row of favoriteRows) {
      await ctx.db.delete(row._id);
    }

    await ctx.db.delete(args.plantId);
    return { ok: true };
  },
});

export const backfillGroupBasePlants = mutation({
  args: { ...adminTokenArg },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const plants = (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);
    const scientificGroups = new Map<string, any[]>();
    for (const plant of plants) {
      const key =
        normalizeScientificNameForGrouping(plant.scientificName) ||
        String(plant._id);
      const list = scientificGroups.get(key) ?? [];
      list.push(plant);
      scientificGroups.set(key, list);
    }

    let updated = 0;
    const invalidScientificGroups: string[] = [];

    for (const [scientificKey, cluster] of scientificGroups.entries()) {
      const basePlants = cluster.filter((plant) => isDisplayBasePlant(plant));
      if (basePlants.length !== 1) {
        invalidScientificGroups.push(scientificKey);
        continue;
      }
      const basePlant = basePlants[0];
      for (const plant of cluster) {
        if (String((plant as any).basePlantId ?? "") === String(basePlant._id)) continue;
        await ctx.db.patch(plant._id, { basePlantId: basePlant._id });
        updated += 1;
      }
    }

    return { updated, invalidScientificGroups };
  },
});

export const listPlantGroups = query({
  args: { ...adminTokenArg },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    return await ctx.db
      .query("plantGroups")
      .withIndex("by_sort_order")
      .collect();
  },
});

export const createPlantGroup = mutation({
  args: {
    ...adminTokenArg,
    key: v.string(),
    displayNameVi: v.string(),
    displayNameEn: v.string(),
    descriptionVi: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    iconUrl: v.optional(v.string()),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const key = args.key.trim();
    if (!key) {
      throw new Error("Group key is required");
    }
    const existing = await ctx.db
      .query("plantGroups")
      .withIndex("by_key", (q: any) => q.eq("key", key))
      .unique();
    if (existing) {
      throw new Error("Group key already exists");
    }

    const description =
      args.descriptionVi?.trim() || args.descriptionEn?.trim()
        ? {
          vi: args.descriptionVi?.trim() ?? "",
          en: args.descriptionEn?.trim() ?? "",
        }
        : undefined;

    const groupId = await ctx.db.insert("plantGroups", {
      key,
      displayName: {
        vi: args.displayNameVi.trim(),
        en: args.displayNameEn.trim(),
      },
      description,
      iconUrl: args.iconUrl?.trim() || undefined,
      sortOrder: args.sortOrder,
    });

    return { groupId };
  },
});

export const updatePlantGroup = mutation({
  args: {
    ...adminTokenArg,
    groupId: v.id("plantGroups"),
    key: v.string(),
    displayNameVi: v.string(),
    displayNameEn: v.string(),
    descriptionVi: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    iconUrl: v.optional(v.string()),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const group = await ctx.db.get(args.groupId);
    if (!group) {
      throw new Error("Group not found");
    }
    const key = args.key.trim();
    if (!key) {
      throw new Error("Group key is required");
    }
    if (key !== group.key) {
      const existing = await ctx.db
        .query("plantGroups")
        .withIndex("by_key", (q: any) => q.eq("key", key))
        .unique();
      if (existing && existing._id !== group._id) {
        throw new Error("Group key already exists");
      }
    }

    const description =
      args.descriptionVi?.trim() || args.descriptionEn?.trim()
        ? {
          vi: args.descriptionVi?.trim() ?? "",
          en: args.descriptionEn?.trim() ?? "",
        }
        : undefined;

    await ctx.db.patch(args.groupId, {
      key,
      displayName: {
        vi: args.displayNameVi.trim(),
        en: args.displayNameEn.trim(),
      },
      description,
      iconUrl: args.iconUrl?.trim() || undefined,
      sortOrder: args.sortOrder,
    });

    return { ok: true };
  },
});

export const deletePlantGroup = mutation({
  args: {
    ...adminTokenArg,
    groupId: v.id("plantGroups"),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    await ctx.db.delete(args.groupId);
    return { ok: true };
  },
});

export const listPlantI18n = query({
  args: { ...adminTokenArg },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const rows = await ctx.db.query("plantI18n").collect();
    const careByPlantLocale = await getPlantCareI18nMap(ctx);
    const plants = (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);
    const plantById = new Map(plants.map((plant) => [plant._id.toString(), plant]));

    return mergeCareIntoI18nRows(rows, careByPlantLocale).map((row) => {
      const plant = plantById.get(row.plantId.toString());
      return {
        _id: row._id,
        plantId: row.plantId,
        locale: row.locale,
        commonName: row.commonName,
        description: row.description ?? undefined,
        careContent: row.careContent ?? undefined,
        source: row.source ?? undefined,
        sourceUrl: row.sourceUrl ?? undefined,
        contentStatus: row.contentStatus ?? undefined,
        contentVersion: row.contentVersion ?? undefined,
        reviewStatus: row.reviewStatus ?? undefined,
        reviewedAt: row.reviewedAt ?? undefined,
        reviewedBy: row.reviewedBy ?? undefined,
        plantScientificName: plant?.scientificName ?? "",
        plantGroup: plant?.group ?? "",
      };
    });
  },
});

export const exportPlantI18nSource = query({
  args: {
    ...adminTokenArg,
    locale: v.optional(v.string()),
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const localeFilter = args.locale?.trim().toLowerCase();
    const rows = await ctx.db.query("plantI18n").collect();
    const careByPlantLocale = await getPlantCareI18nMap(ctx);
    const plants = (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);
    const plantById = new Map(plants.map((plant) => [plant._id.toString(), plant]));

    const exported = mergeCareIntoI18nRows(rows, careByPlantLocale)
      .filter((row) => !localeFilter || row.locale === localeFilter)
      .map((row) => {
        const plant = plantById.get(row.plantId.toString());
        return {
          scientificName: plant?.scientificName ?? "",
          cultivar: plant?.cultivar ?? undefined,
          locale: row.locale,
          commonName: row.commonName,
          description: row.description ?? undefined,
          careContent: row.careContent ?? undefined,
          source: row.source ?? undefined,
          sourceUrl: row.sourceUrl ?? undefined,
          contentStatus: row.contentStatus ?? undefined,
          contentVersion: row.contentVersion ?? undefined,
          reviewStatus: row.reviewStatus ?? undefined,
          reviewedAt: row.reviewedAt ?? undefined,
          reviewedBy: row.reviewedBy ?? undefined,
        };
      })
      .filter((row) => row.scientificName)
      .sort((a, b) => {
        const byScientific = a.scientificName.localeCompare(b.scientificName);
        if (byScientific !== 0) return byScientific;
        const byCultivar = String(a.cultivar ?? "").localeCompare(String(b.cultivar ?? ""));
        if (byCultivar !== 0) return byCultivar;
        return a.locale.localeCompare(b.locale);
      });

    const offset = Math.max(0, args.offset ?? 0);
    const limit = Math.max(1, Math.min(args.limit ?? exported.length, 500));

    return {
      total: exported.length,
      offset,
      limit,
      rows: exported.slice(offset, offset + limit),
    };
  },
});

export const createPlantI18n = mutation({
  args: {
    ...adminTokenArg,
    plantId: v.id("plantsMaster"),
    locale: v.string(),
    commonName: v.string(),
    description: v.optional(v.string()),
    // Absent preserves an existing care row, while null/empty clears it.
    // Keep non-empty Markdown byte-for-byte; do not normalize or trim it here.
    careContent: v.optional(v.union(v.string(), v.null())),
    contentVersion: v.optional(v.number()),
    source: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    contentStatus: v.optional(v.union(
      v.literal("draft"), v.literal("published"), v.literal("needs_review"), v.literal("archived"),
    )),
    reviewStatus: v.optional(v.union(
      v.literal("unreviewed"), v.literal("in_review"), v.literal("reviewed"),
    )),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const plant = await ctx.db.get(args.plantId);
    if (!plant) {
      throw new Error("Plant not found");
    }
    const locale = args.locale.trim().toLowerCase();
    if (!locale) {
      throw new Error("Locale is required");
    }
    const existing = await ctx.db
      .query("plantI18n")
      .withIndex("by_plant_locale", (q: any) =>
        q.eq("plantId", args.plantId).eq("locale", locale)
      )
      .unique();
    if (existing) {
      throw new Error("Locale already exists for this plant");
    }

    const rowId = await ctx.db.insert("plantI18n", {
      plantId: args.plantId,
      locale,
      commonName: args.commonName.trim(),
      description: args.description?.trim() || undefined,
      source: args.source?.trim() || undefined,
      sourceUrl: args.sourceUrl?.trim() || undefined,
      contentStatus: args.contentStatus,
      contentVersion: args.contentVersion,
      reviewStatus: args.reviewStatus,
      reviewedAt: args.reviewedAt,
      reviewedBy: args.reviewedBy?.trim() || undefined,
    });
    await upsertPlantCareI18n(
      ctx,
      args.plantId,
      locale,
      args.careContent,
      args.contentVersion ?? undefined,
      {
        source: args.source,
        sourceUrl: args.sourceUrl,
        contentStatus: args.contentStatus,
        reviewedAt: args.reviewedAt,
        reviewedBy: args.reviewedBy,
      },
    );

    return { rowId };
  },
});

export const updatePlantI18n = mutation({
  args: {
    ...adminTokenArg,
    rowId: v.id("plantI18n"),
    locale: v.string(),
    commonName: v.string(),
    description: v.optional(v.string()),
    // Absent preserves an existing care row, while null/empty clears it.
    // Keep non-empty Markdown byte-for-byte; do not normalize or trim it here.
    careContent: v.optional(v.union(v.string(), v.null())),
    contentVersion: v.optional(v.number()),
    source: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    contentStatus: v.optional(v.union(
      v.literal("draft"), v.literal("published"), v.literal("needs_review"), v.literal("archived"),
    )),
    reviewStatus: v.optional(v.union(
      v.literal("unreviewed"), v.literal("in_review"), v.literal("reviewed"),
    )),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const row = await ctx.db.get(args.rowId);
    if (!row) {
      throw new Error("Row not found");
    }
    const locale = args.locale.trim().toLowerCase();
    if (!locale) {
      throw new Error("Locale is required");
    }
    if (locale !== row.locale) {
      if (row.locale === "vi" || row.locale === "en") {
        throw new Error("Required vi/en locales cannot be renamed");
      }
      const existing = await ctx.db
        .query("plantI18n")
        .withIndex("by_plant_locale", (q: any) =>
          q.eq("plantId", row.plantId).eq("locale", locale)
        )
        .unique();
      if (existing && existing._id !== row._id) {
        throw new Error("Locale already exists for this plant");
      }
      const previousCare = await ctx.db
        .query("plantCareI18n")
        .withIndex("by_plant_locale", (q: any) =>
          q.eq("plantId", row.plantId).eq("locale", row.locale)
        )
        .unique();
      if (previousCare) {
        // Locale rows own care independently. Move the existing care row
        // instead of deleting it so an omitted careContent patch preserves
        // the exact Markdown and all care metadata. An explicit null/empty
        // value is applied by upsertPlantCareI18n after this move and clears
        // the renamed row as requested.
        await ctx.db.patch(previousCare._id, { locale });
      }
    }

    await ctx.db.patch(args.rowId, {
      locale,
      commonName: args.commonName.trim(),
      description: args.description?.trim() || undefined,
      ...(args.source !== undefined && { source: args.source.trim() || undefined }),
      ...(args.sourceUrl !== undefined && { sourceUrl: args.sourceUrl.trim() || undefined }),
      ...(args.contentStatus !== undefined && { contentStatus: args.contentStatus }),
      ...(args.contentVersion !== undefined && { contentVersion: args.contentVersion }),
      ...(args.reviewStatus !== undefined && { reviewStatus: args.reviewStatus }),
      ...(args.reviewedAt !== undefined && { reviewedAt: args.reviewedAt }),
      ...(args.reviewedBy !== undefined && { reviewedBy: args.reviewedBy.trim() || undefined }),
    });
    await upsertPlantCareI18n(
      ctx,
      row.plantId,
      locale,
      args.careContent,
      args.contentVersion ?? undefined,
      {
        source: args.source,
        sourceUrl: args.sourceUrl,
        contentStatus: args.contentStatus,
        reviewedAt: args.reviewedAt,
        reviewedBy: args.reviewedBy,
      },
    );

    return { ok: true };
  },
});

export const deletePlantI18n = mutation({
  args: {
    ...adminTokenArg,
    rowId: v.id("plantI18n"),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const row = await ctx.db.get(args.rowId);
    if (row) {
      if (row.locale === "vi" || row.locale === "en") {
        throw new Error("Required vi/en locales cannot be deleted");
      }
      const careRows = await getPlantCareI18nRowsByPlantId(ctx, row.plantId);
      const matchingCare = careRows.find((careRow: any) => careRow.locale === row.locale);
      if (matchingCare) {
        await ctx.db.delete(matchingCare._id);
      }
    }
    await ctx.db.delete(args.rowId);
    return { ok: true };
  },
});

export const listPlantPhotos = query({
  args: { ...adminTokenArg },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const photos = await ctx.db.query("plantPhotos").collect();
    return photos.map((photo) => ({
      _id: photo._id,
      userPlantId: photo.userPlantId,
      userId: photo.userId,
      localId: photo.localId ?? undefined,
      photoUrl: photo.photoUrl,
      thumbnailUrl: photo.thumbnailUrl ?? undefined,
      storageId: photo.storageId ?? undefined,
      takenAt: photo.takenAt,
      uploadedAt: photo.uploadedAt,
      isPrimary: photo.isPrimary,
      source: photo.source,
      analysisStatus: photo.analysisStatus,
      analysisResult: photo.analysisResult ?? undefined,
      aiModelVersion: photo.aiModelVersion ?? undefined,
    }));
  },
});

export const createPlantPhoto = mutation({
  args: {
    ...adminTokenArg,
    userPlantId: v.id("userPlants"),
    userId: v.id("users"),
    localId: v.optional(v.string()),
    photoUrl: v.string(),
    thumbnailUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    takenAt: v.number(),
    uploadedAt: v.number(),
    isPrimary: v.boolean(),
    source: v.string(),
    analysisStatus: v.string(),
    analysisResult: v.optional(v.any()),
    aiModelVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const photoId = await ctx.db.insert("plantPhotos", {
      userPlantId: args.userPlantId,
      userId: args.userId,
      localId: args.localId,
      photoUrl: args.photoUrl.trim(),
      thumbnailUrl: args.thumbnailUrl?.trim() || undefined,
      storageId: args.storageId,
      takenAt: args.takenAt,
      uploadedAt: args.uploadedAt,
      isPrimary: args.isPrimary,
      source: args.source.trim(),
      analysisStatus: args.analysisStatus.trim(),
      analysisResult: args.analysisResult,
      aiModelVersion: args.aiModelVersion?.trim() || undefined,
    });

    return { photoId };
  },
});

export const updatePlantPhoto = mutation({
  args: {
    ...adminTokenArg,
    photoId: v.id("plantPhotos"),
    userPlantId: v.id("userPlants"),
    userId: v.id("users"),
    localId: v.optional(v.string()),
    photoUrl: v.string(),
    thumbnailUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    takenAt: v.number(),
    uploadedAt: v.number(),
    isPrimary: v.boolean(),
    source: v.string(),
    analysisStatus: v.string(),
    analysisResult: v.optional(v.any()),
    aiModelVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const photo = await ctx.db.get(args.photoId);
    if (!photo) {
      throw new Error("Photo not found");
    }

    await ctx.db.patch(args.photoId, {
      userPlantId: args.userPlantId,
      userId: args.userId,
      localId: args.localId,
      photoUrl: args.photoUrl.trim(),
      thumbnailUrl: args.thumbnailUrl?.trim() || undefined,
      storageId: args.storageId,
      takenAt: args.takenAt,
      uploadedAt: args.uploadedAt,
      isPrimary: args.isPrimary,
      source: args.source.trim(),
      analysisStatus: args.analysisStatus.trim(),
      analysisResult: args.analysisResult,
      aiModelVersion: args.aiModelVersion?.trim() || undefined,
    });

    return { ok: true };
  },
});

export const deletePlantPhoto = mutation({
  args: {
    ...adminTokenArg,
    photoId: v.id("plantPhotos"),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    await ctx.db.delete(args.photoId);
    return { ok: true };
  },
});
export const bulkUpdatePlantI18n = mutation({
  args: {
    ...adminTokenArg,
    updates: v.array(v.object({
      plantId: v.id("plantsMaster"),
      locale: v.string(),
      commonName: v.string(),
      description: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    let updatedCount = 0;
    for (const update of args.updates) {
      const existing = await ctx.db
        .query("plantI18n")
        .withIndex("by_plant_locale", (q: any) =>
          q.eq("plantId", update.plantId).eq("locale", update.locale)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          commonName: update.commonName,
          description: update.description?.trim() || undefined,
        });
        updatedCount++;
      } else {
        await ctx.db.insert("plantI18n", {
          plantId: update.plantId,
          locale: update.locale,
          commonName: update.commonName,
          description: update.description?.trim() || undefined,
        });
        updatedCount++;
      }
    }
    return { updatedCount };
  },
});

// ==========================================
// Adaptation taxonomy administration (design doc §6.1–6.2)
// ==========================================
// Editor/editor+admin split is enforced at the API proxy allowlist layer:
// create/reorder/archive are admin-only; list/update (labels and per-locale
// translations) are available to editors as well. Every function re-validates
// the server service token.
const translationStatusValidator = v.union(
  v.literal("missing"),
  v.literal("machine_translated"),
  v.literal("qa_passed"),
  v.literal("human_reviewed"),
  v.literal("approved"),
);

const DIMENSION_ORDER = new Map<string, number>(
  ADAPTATION_DIMENSIONS.map((dimension, index) => [dimension, index]),
);

export const listAdaptationTerms = query({
  args: { ...adminTokenArg },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const terms = await ctx.db.query("adaptationTerms").collect();
    const i18nRows = await ctx.db.query("adaptationTermI18n").collect();
    const assignments = await ctx.db.query("plantAdaptationTerms").collect();

    const usageByCode = new Map<string, number>();
    for (const row of assignments) {
      usageByCode.set(row.termCode, (usageByCode.get(row.termCode) ?? 0) + 1);
    }
    const translationsByCode = new Map<string, Array<{
      locale: string;
      label: string;
      description?: string;
      translationStatus: string;
    }>>();
    for (const row of i18nRows) {
      const list = translationsByCode.get(row.termCode) ?? [];
      list.push({
        locale: row.locale,
        label: row.label,
        description: row.description ?? undefined,
        translationStatus: row.translationStatus,
      });
      translationsByCode.set(row.termCode, list);
    }

    return terms
      .sort((left, right) => {
        const leftDimension = DIMENSION_ORDER.get(left.dimension) ?? 999;
        const rightDimension = DIMENSION_ORDER.get(right.dimension) ?? 999;
        if (leftDimension !== rightDimension) return leftDimension - rightDimension;
        return left.sortOrder - right.sortOrder;
      })
      .map((term) => ({
        _id: term._id,
        code: term.code,
        dimension: term.dimension,
        status: term.status,
        sortOrder: term.sortOrder,
        usageCount: usageByCode.get(term.code) ?? 0,
        translations: translationsByCode.get(term.code) ?? [],
      }));
  },
});

/**
 * Read-only release gate for the approved Release 1 taxonomy. This deliberately
 * reads the raw Convex rows (rather than the grouped editor projection) so it
 * can detect orphan translations/assignments and duplicate join rows that
 * Convex indexes alone do not prevent. Production scripts should fail closed
 * on `clean: false` and must never call a mutation as part of this check.
 */
export const adaptationReleasePreflight = query({
  args: { ...adminTokenArg },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);

    const expectedCodes = new Set<string>(ADAPTATION_TERMS.map((term) => term.code));
    const expectedDimensionByCode = new Map<string, string>(
      ADAPTATION_TERMS.map((term) => [term.code, term.dimension]),
    );
    const [terms, translations, plants, origins, provenRegions, assignments] = await Promise.all([
      ctx.db.query("adaptationTerms").collect(),
      ctx.db.query("adaptationTermI18n").collect(),
      ctx.db.query("plantsMaster").collect(),
      ctx.db.query("plantOriginCountries").collect(),
      ctx.db.query("plantProvenRegions").collect(),
      ctx.db.query("plantAdaptationTerms").collect(),
    ]);

    const actualCodes = new Set(terms.map((term) => term.code));
    const extraTermCodes = terms
      .map((term) => term.code)
      .filter((code) => !expectedCodes.has(code));
    const missingTermCodes = ADAPTATION_TERMS
      .map((term) => term.code)
      .filter((code) => !actualCodes.has(code));
    const inactiveTermCodes = terms
      .filter((term) => term.status !== "active")
      .map((term) => term.code);
    const invalidDimensions = terms
      .filter((term) => expectedDimensionByCode.get(term.code) !== term.dimension)
      .map((term) => term.code);

    const translationKeys = new Set<string>();
    const duplicateTranslationKeys: string[] = [];
    const orphanTranslations = translations.filter((row) => !actualCodes.has(row.termCode));
    const extraTranslationLocales = translations
      .filter((row) => row.locale !== "vi" && row.locale !== "en")
      .map((row) => `${row.termCode}:${row.locale}`);
    for (const row of translations) {
      const key = `${row.termCode}:${row.locale}`;
      if (translationKeys.has(key)) duplicateTranslationKeys.push(key);
      translationKeys.add(key);
    }
    const missingRequiredTranslations = ADAPTATION_TERMS.flatMap((term) =>
      (["vi", "en"] as const)
        .filter((locale) => {
          const row = translations.find((candidate) =>
            candidate.termCode === term.code && candidate.locale === locale,
          );
          return !row?.label?.trim();
        })
        .map((locale) => `${term.code}:${locale}`),
    );

    const plantIds = new Set(plants.map((plant) => String(plant._id)));
    const orphanOriginAssignments = origins.filter((row) => !plantIds.has(String(row.plantId))).length;
    const orphanProvenRegionAssignments = provenRegions.filter((row) => !plantIds.has(String(row.plantId))).length;
    const orphanAdaptationAssignments = assignments.filter((row) => !plantIds.has(String(row.plantId))).length;
    const orphanAdaptationTermCodes = assignments.filter((row) => !actualCodes.has(row.termCode)).length;

    const duplicateKeys = (rows: Array<{ key: string }>) => {
      const counts = new Map<string, number>();
      for (const row of rows) counts.set(row.key, (counts.get(row.key) ?? 0) + 1);
      return [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
    };
    const duplicateOriginAssignments = duplicateKeys(origins.map((row) => ({
      key: `${row.plantId}:${row.countryCode}`,
    })));
    const duplicateProvenRegionAssignments = duplicateKeys(provenRegions.map((row) => ({
      key: `${row.plantId}:${row.countryCode}\u0000${row.subdivisionCode ?? ""}`,
    })));
    const duplicateAdaptationAssignments = duplicateKeys(assignments.map((row) => ({
      key: `${row.plantId}:${row.termCode}`,
    })));

    const clean = terms.length === ADAPTATION_TERMS.length &&
      extraTermCodes.length === 0 &&
      missingTermCodes.length === 0 &&
      inactiveTermCodes.length === 0 &&
      invalidDimensions.length === 0 &&
      translations.length === ADAPTATION_TERMS.length * 2 &&
      extraTranslationLocales.length === 0 &&
      duplicateTranslationKeys.length === 0 &&
      missingRequiredTranslations.length === 0 &&
      orphanTranslations.length === 0 &&
      orphanOriginAssignments === 0 &&
      orphanProvenRegionAssignments === 0 &&
      orphanAdaptationAssignments === 0 &&
      orphanAdaptationTermCodes === 0 &&
      duplicateOriginAssignments.length === 0 &&
      duplicateProvenRegionAssignments.length === 0 &&
      duplicateAdaptationAssignments.length === 0;

    return {
      clean,
      expected: {
        termCount: ADAPTATION_TERMS.length,
        translationCount: ADAPTATION_TERMS.length * 2,
        codes: [...expectedCodes],
      },
      taxonomy: {
        termCount: terms.length,
        activeTermCount: terms.filter((term) => term.status === "active").length,
        translationCount: translations.length,
        extraTermCodes,
        missingTermCodes,
        inactiveTermCodes,
        invalidDimensions,
        extraTranslationLocales,
        missingRequiredTranslations,
      },
      orphans: {
        i18n: orphanTranslations.length,
        origin: orphanOriginAssignments,
        provenRegions: orphanProvenRegionAssignments,
        adaptationTerms: orphanAdaptationAssignments,
        adaptationTermCodes: orphanAdaptationTermCodes,
      },
      duplicates: {
        translations: duplicateTranslationKeys,
        origin: duplicateOriginAssignments,
        provenRegions: duplicateProvenRegionAssignments,
        adaptationTerms: duplicateAdaptationAssignments,
      },
    };
  },
});

export const createAdaptationTerm = mutation({
  args: {
    ...adminTokenArg,
    code: v.string(),
    dimension: v.string(),
    sortOrder: v.number(),
    labelVi: v.string(),
    labelEn: v.string(),
    descriptionVi: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const code = args.code.trim();
    if (!TERM_CODE_PATTERN.test(code)) {
      throw new Error("Invalid adaptation term code");
    }
    if (!isAdaptationDimension(args.dimension)) {
      throw new Error("Invalid adaptation dimension");
    }
    if (!args.labelVi.trim() || !args.labelEn.trim()) {
      throw new Error("Both Vietnamese and English labels are required before a term can be active");
    }
    const existing = await ctx.db
      .query("adaptationTerms")
      .withIndex("by_code", (q: any) => q.eq("code", code))
      .unique();
    if (existing) {
      throw new Error("Adaptation term code already exists");
    }

    const now = Date.now();
    const termId = await ctx.db.insert("adaptationTerms", {
      code,
      dimension: args.dimension,
      status: "active",
      sortOrder: args.sortOrder,
      createdAt: now,
      updatedAt: now,
    });
    for (const [locale, label, description] of [
      ["vi", args.labelVi, args.descriptionVi],
      ["en", args.labelEn, args.descriptionEn],
    ] as const) {
      await ctx.db.insert("adaptationTermI18n", {
        termCode: code,
        locale,
        label: label.trim(),
        description: description?.trim() || undefined,
        translationStatus: "human_reviewed",
        updatedAt: now,
      });
    }
    return { termId };
  },
});

export const updateAdaptationTerm = mutation({
  args: {
    ...adminTokenArg,
    termId: v.id("adaptationTerms"),
    labelVi: v.string(),
    labelEn: v.string(),
    descriptionVi: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const term = await ctx.db.get(args.termId);
    if (!term) {
      throw new Error("Adaptation term not found");
    }
    if (!args.labelVi.trim() || !args.labelEn.trim()) {
      throw new Error("Both Vietnamese and English labels are required before a term can be active");
    }
    const now = Date.now();
    for (const [locale, label, description] of [
      ["vi", args.labelVi, args.descriptionVi],
      ["en", args.labelEn, args.descriptionEn],
    ] as const) {
      const existing = await ctx.db
        .query("adaptationTermI18n")
        .withIndex("by_term_locale", (q: any) =>
          q.eq("termCode", term.code).eq("locale", locale),
        )
        .unique();
      const payload = {
        label: label.trim(),
        description: description?.trim() || undefined,
        translationStatus: "human_reviewed",
        updatedAt: now,
      };
      if (existing) await ctx.db.patch(existing._id, payload);
      else await ctx.db.insert("adaptationTermI18n", { termCode: term.code, locale, ...payload });
    }
    await ctx.db.patch(args.termId, { updatedAt: now });
    return { ok: true };
  },
});

export const updateAdaptationTermTranslation = mutation({
  args: {
    ...adminTokenArg,
    termId: v.id("adaptationTerms"),
    locale: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    translationStatus: v.optional(translationStatusValidator),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const term = await ctx.db.get(args.termId);
    if (!term) {
      throw new Error("Adaptation term not found");
    }
    const locale = args.locale.trim().toLowerCase();
    if (locale !== "vi" && locale !== "en") {
      throw new Error("Only vi and en translations are supported in Release 1");
    }
    if (!args.label.trim() && (args.translationStatus ?? "human_reviewed") !== "missing") {
      throw new Error("Translation label is required");
    }
    const now = Date.now();
    const payload = {
      label: args.label.trim(),
      description: args.description?.trim() || undefined,
      translationStatus: args.translationStatus ?? "human_reviewed",
      updatedAt: now,
    };
    const existing = await ctx.db
      .query("adaptationTermI18n")
      .withIndex("by_term_locale", (q: any) =>
        q.eq("termCode", term.code).eq("locale", locale),
      )
      .unique();
    if (existing) await ctx.db.patch(existing._id, payload);
    else await ctx.db.insert("adaptationTermI18n", { termCode: term.code, locale, ...payload });
    return { ok: true };
  },
});

export const reorderAdaptationTerms = mutation({
  args: {
    ...adminTokenArg,
    dimension: v.string(),
    termIds: v.array(v.id("adaptationTerms")),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    if (!isAdaptationDimension(args.dimension)) {
      throw new Error("Invalid adaptation dimension");
    }
    const now = Date.now();
    for (let index = 0; index < args.termIds.length; index += 1) {
      const term = await ctx.db.get(args.termIds[index]);
      if (!term) {
        throw new Error("Adaptation term not found");
      }
      if (term.dimension !== args.dimension) {
        throw new Error("Cannot reorder a term across dimensions");
      }
      await ctx.db.patch(args.termIds[index], { sortOrder: index + 1, updatedAt: now });
    }
    return { ok: true };
  },
});

export const archiveAdaptationTerm = mutation({
  args: {
    ...adminTokenArg,
    termId: v.id("adaptationTerms"),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const term = await ctx.db.get(args.termId);
    if (!term) {
      throw new Error("Adaptation term not found");
    }
    if (!args.archived) {
      // Publication gate: a term may only return to active with both labels.
      const vi = await ctx.db
        .query("adaptationTermI18n")
        .withIndex("by_term_locale", (q: any) =>
          q.eq("termCode", term.code).eq("locale", "vi"),
        )
        .unique();
      const en = await ctx.db
        .query("adaptationTermI18n")
        .withIndex("by_term_locale", (q: any) =>
          q.eq("termCode", term.code).eq("locale", "en"),
        )
        .unique();
      if (!vi?.label?.trim() || !en?.label?.trim()) {
        throw new Error("Both Vietnamese and English labels are required before a term can be active");
      }
    }
    await ctx.db.patch(args.termId, {
      status: args.archived ? "archived" : "active",
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});
