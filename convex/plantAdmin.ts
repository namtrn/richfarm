import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  buildTaxonomyFields,
  DEFAULT_CULTIVAR_NORMALIZED,
  isInfraspecificCultivar,
  requireTaxonomyIdentity,
  type TaxonomyIdentity,
} from "./lib/plantTaxonomy";

async function upsertPlantI18n(
  ctx: any,
  plantId: any,
  locale: "vi" | "en",
  commonName: string,
  description?: string,
) {
  const existing = await ctx.db
    .query("plantI18n")
    .withIndex("by_plant_locale", (q: any) => q.eq("plantId", plantId).eq("locale", locale))
    .first();

  if (!existing) {
    await ctx.db.insert("plantI18n", {
      plantId,
      locale,
      commonName,
      description: description?.trim() || undefined,
    });
    return;
  }

  await ctx.db.patch(existing._id, {
    commonName,
    description: description?.trim() || undefined,
  });
}

async function findDuplicateByTaxonomy(ctx: any, taxonomy: TaxonomyIdentity) {
  return await ctx.db
    .query("plantsMaster")
    .withIndex("by_genus_species_cultivar", (q: any) =>
      q
        .eq("genusNormalized", taxonomy.genusNormalized)
        .eq("speciesNormalized", taxonomy.speciesNormalized)
        .eq("cultivarNormalized", taxonomy.cultivarNormalized)
    )
    .first();
}

async function assertBaseExistsForVariant(
  ctx: any,
  taxonomy: TaxonomyIdentity,
  options?: { excludingPlantId?: any }
) {
  if (taxonomy.cultivarNormalized === DEFAULT_CULTIVAR_NORMALIZED) {
    return;
  }
  if (isInfraspecificCultivar(taxonomy.cultivarNormalized)) {
    return;
  }

  const base = await ctx.db
    .query("plantsMaster")
    .withIndex("by_genus_species_cultivar", (q: any) =>
      q
        .eq("genusNormalized", taxonomy.genusNormalized)
        .eq("speciesNormalized", taxonomy.speciesNormalized)
        .eq("cultivarNormalized", DEFAULT_CULTIVAR_NORMALIZED)
    )
    .first();

  if (!base || (options?.excludingPlantId && base._id === options.excludingPlantId)) {
    throw new Error("Base species row is required before creating or updating a variant");
  }
}

export const updatePlant = mutation({
  args: {
    plantId: v.id("plantsMaster"),
    scientificName: v.string(),
    cultivar: v.optional(v.string()),
    group: v.string(),
    purposes: v.optional(v.array(v.string())),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.union(v.string(), v.null())),
    viCommonName: v.string(),
    viDescription: v.optional(v.string()),
    enCommonName: v.string(),
    enDescription: v.optional(v.string()),
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
  },
  handler: async (ctx, args) => {
    const plant = await ctx.db.get(args.plantId);
    if (!plant) {
      throw new Error("Plant not found");
    }

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
    await assertBaseExistsForVariant(ctx, taxonomyIdentity, {
      excludingPlantId: args.plantId,
    });

    await ctx.db.patch(args.plantId, {
      scientificName,
      group: args.group.trim(),
      description: args.description?.trim() || undefined,
      imageUrl: args.imageUrl ?? undefined,
      ...taxonomy,
      ...(args.purposes !== undefined && {
        purposes: args.purposes.map((item) => item.trim()).filter(Boolean),
      }),
      typicalDaysToHarvest: args.typicalDaysToHarvest,
      wateringFrequencyDays: args.wateringFrequencyDays,
      germinationDays: args.germinationDays,
      spacingCm: args.spacingCm,
      lightRequirements: args.lightRequirements?.trim() || undefined,
      maxPlantsPerM2: args.maxPlantsPerM2,
      seedRatePerM2: args.seedRatePerM2,
      waterLitersPerM2: args.waterLitersPerM2,
      yieldKgPerM2: args.yieldKgPerM2,
    });

    await upsertPlantI18n(ctx, args.plantId, "vi", args.viCommonName, args.viDescription);
    await upsertPlantI18n(ctx, args.plantId, "en", args.enCommonName, args.enDescription);

    return { ok: true };
  },
});

export const listPlants = query({
  args: {},
  handler: async (ctx) => {
    const plants = await ctx.db.query("plantsMaster").collect();
    const i18nRows = await ctx.db.query("plantI18n").collect();
    const i18nByPlantId = new Map<string, Array<{
      locale: string;
      commonName: string;
      description?: string;
      careContent?: string;
      contentVersion?: number;
    }>>();

    for (const row of i18nRows) {
      const key = row.plantId.toString();
      const list = i18nByPlantId.get(key) ?? [];
      list.push({
        locale: row.locale,
        commonName: row.commonName,
        description: row.description ?? undefined,
        careContent: row.careContent ?? undefined,
        contentVersion: row.contentVersion ?? undefined,
      });
      i18nByPlantId.set(key, list);
    }

    return plants.map((plant) => ({
      _id: plant._id,
      scientificName: plant.scientificName,
      // Taxonomy fields (optional in schema — may be undefined for legacy rows)
      genus: plant.genus ?? undefined,
      species: plant.species ?? undefined,
      cultivar: plant.cultivar ?? undefined,
      genusNormalized: plant.genusNormalized ?? undefined,
      speciesNormalized: plant.speciesNormalized ?? undefined,
      cultivarNormalized: plant.cultivarNormalized ?? undefined,
      group: plant.group,
      description: plant.description ?? undefined,
      imageUrl: plant.imageUrl ?? null,
      purposes: plant.purposes ?? [],
      typicalDaysToHarvest: plant.typicalDaysToHarvest ?? undefined,
      wateringFrequencyDays: plant.wateringFrequencyDays ?? undefined,
      lightRequirements: plant.lightRequirements ?? undefined,
      germinationDays: plant.germinationDays ?? undefined,
      spacingCm: plant.spacingCm ?? undefined,
      maxPlantsPerM2: plant.maxPlantsPerM2 ?? undefined,
      seedRatePerM2: plant.seedRatePerM2 ?? undefined,
      waterLitersPerM2: plant.waterLitersPerM2 ?? undefined,
      yieldKgPerM2: plant.yieldKgPerM2 ?? undefined,
      source: plant.source ?? undefined,
      i18nRows: i18nByPlantId.get(plant._id.toString()) ?? [],
    }));


  },
});

export const createPlant = mutation({
  args: {
    scientificName: v.string(),
    cultivar: v.optional(v.string()),
    group: v.string(),
    purposes: v.optional(v.array(v.string())),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.union(v.string(), v.null())),
    viCommonName: v.string(),
    viDescription: v.optional(v.string()),
    enCommonName: v.string(),
    enDescription: v.optional(v.string()),
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
  },
  handler: async (ctx, args) => {
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
    await assertBaseExistsForVariant(ctx, taxonomyIdentity);

    const group = args.group.trim() || "other";
    const purposes = (args.purposes ?? []).map((item) => item.trim()).filter(Boolean);

    const plantId = await ctx.db.insert("plantsMaster", {
      scientificName,
      group,
      description: args.description?.trim() || undefined,
      imageUrl: args.imageUrl ?? undefined,
      purposes,
      typicalDaysToHarvest: args.typicalDaysToHarvest,
      wateringFrequencyDays: args.wateringFrequencyDays,
      germinationDays: args.germinationDays,
      spacingCm: args.spacingCm,
      lightRequirements: args.lightRequirements?.trim() || undefined,
      maxPlantsPerM2: args.maxPlantsPerM2,
      seedRatePerM2: args.seedRatePerM2,
      waterLitersPerM2: args.waterLitersPerM2,
      yieldKgPerM2: args.yieldKgPerM2,
      ...taxonomy,
    });

    await upsertPlantI18n(ctx, plantId, "vi", args.viCommonName, args.viDescription);
    await upsertPlantI18n(ctx, plantId, "en", args.enCommonName, args.enDescription);

    return { plantId };
  },
});

export const deletePlant = mutation({
  args: {
    plantId: v.id("plantsMaster"),
  },
  handler: async (ctx, args) => {
    const plant = await ctx.db.get(args.plantId);
    if (!plant) {
      throw new Error("Plant not found");
    }

    // Enforce base invariant: base row cannot be deleted while variants still exist.
    if (
      (plant as any).cultivarNormalized === DEFAULT_CULTIVAR_NORMALIZED &&
      (plant as any).genusNormalized &&
      (plant as any).speciesNormalized
    ) {
      const sameSpeciesRows = await ctx.db
        .query("plantsMaster")
        .withIndex("by_genus_species", (q: any) =>
          q
            .eq("genusNormalized", (plant as any).genusNormalized)
            .eq("speciesNormalized", (plant as any).speciesNormalized)
        )
        .collect();

      const hasVariants = sameSpeciesRows.some(
        (row: any) =>
          row._id !== args.plantId &&
          row.cultivarNormalized &&
          row.cultivarNormalized !== DEFAULT_CULTIVAR_NORMALIZED
      );
      if (hasVariants) {
        throw new Error("Cannot delete base plant while variants still exist");
      }
    }

    const i18nRows = await ctx.db
      .query("plantI18n")
      .withIndex("by_plant_locale", (q: any) => q.eq("plantId", args.plantId))
      .collect();

    for (const row of i18nRows) {
      await ctx.db.delete(row._id);
    }

    await ctx.db.delete(args.plantId);
    return { ok: true };
  },
});

export const listPlantGroups = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("plantGroups")
      .withIndex("by_sort_order")
      .collect();
  },
});

export const createPlantGroup = mutation({
  args: {
    key: v.string(),
    displayNameVi: v.string(),
    displayNameEn: v.string(),
    descriptionVi: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    iconUrl: v.optional(v.string()),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
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
    groupId: v.id("plantGroups"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.groupId);
    return { ok: true };
  },
});

export const listPlantI18n = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("plantI18n").collect();
    const plants = await ctx.db.query("plantsMaster").collect();
    const plantById = new Map(plants.map((plant) => [plant._id.toString(), plant]));

    return rows.map((row) => {
      const plant = plantById.get(row.plantId.toString());
      return {
        _id: row._id,
        plantId: row.plantId,
        locale: row.locale,
        commonName: row.commonName,
        description: row.description ?? undefined,
        careContent: row.careContent ?? undefined,
        contentVersion: row.contentVersion ?? undefined,
        plantScientificName: plant?.scientificName ?? "",
        plantGroup: plant?.group ?? "",
      };
    });
  },
});

export const createPlantI18n = mutation({
  args: {
    plantId: v.id("plantsMaster"),
    locale: v.string(),
    commonName: v.string(),
    description: v.optional(v.string()),
    careContent: v.optional(v.string()),
    contentVersion: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
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
      careContent: args.careContent?.trim() || undefined,
      contentVersion: args.contentVersion ?? undefined,
    });

    return { rowId };
  },
});

export const updatePlantI18n = mutation({
  args: {
    rowId: v.id("plantI18n"),
    locale: v.string(),
    commonName: v.string(),
    description: v.optional(v.string()),
    careContent: v.optional(v.string()),
    contentVersion: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.rowId);
    if (!row) {
      throw new Error("Row not found");
    }
    const locale = args.locale.trim().toLowerCase();
    if (!locale) {
      throw new Error("Locale is required");
    }
    if (locale !== row.locale) {
      const existing = await ctx.db
        .query("plantI18n")
        .withIndex("by_plant_locale", (q: any) =>
          q.eq("plantId", row.plantId).eq("locale", locale)
        )
        .unique();
      if (existing && existing._id !== row._id) {
        throw new Error("Locale already exists for this plant");
      }
    }

    await ctx.db.patch(args.rowId, {
      locale,
      commonName: args.commonName.trim(),
      description: args.description?.trim() || undefined,
      careContent: args.careContent?.trim() || undefined,
      contentVersion: args.contentVersion ?? undefined,
    });

    return { ok: true };
  },
});

export const deletePlantI18n = mutation({
  args: {
    rowId: v.id("plantI18n"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.rowId);
    return { ok: true };
  },
});

export const listPlantPhotos = query({
  args: {},
  handler: async (ctx) => {
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
    photoId: v.id("plantPhotos"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.photoId);
    return { ok: true };
  },
});
