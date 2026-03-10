export type PlantCareProfile = {
  plantId: any;
  typicalDaysToHarvest?: number;
  germinationDays?: number;
  lightRequirements?: string;
  soilPref?: string;
  spacingCm?: number;
  maxPlantsPerM2?: number;
  seedRatePerM2?: number;
  waterLitersPerM2?: number;
  yieldKgPerM2?: number;
  wateringFrequencyDays?: number;
  fertilizingFrequencyDays?: number;
};

export type PlantCareI18nRow = {
  plantId: any;
  locale: string;
  careContent?: string;
  contentVersion?: number;
};

export async function getPlantCareProfileMap(ctx: any) {
  const rows = await ctx.db.query("plantCare").collect();
  return new Map(rows.map((row: any) => [String(row.plantId), row]));
}

export async function getPlantCareProfileByPlantId(ctx: any, plantId: any) {
  return await ctx.db
    .query("plantCare")
    .withIndex("by_plant", (q: any) => q.eq("plantId", plantId))
    .unique();
}

export async function getPlantCareI18nMap(ctx: any) {
  const rows = await ctx.db.query("plantCareI18n").collect();
  const careByPlantLocale = new Map<string, { careContent?: string; contentVersion?: number }>();

  for (const row of rows) {
    careByPlantLocale.set(`${String(row.plantId)}:${row.locale}`, {
      careContent: row.careContent ?? undefined,
      contentVersion: row.contentVersion ?? undefined,
    });
  }

  return careByPlantLocale;
}

export async function getPlantCareI18nRowsByPlantId(ctx: any, plantId: any) {
  return await ctx.db
    .query("plantCareI18n")
    .withIndex("by_plant_locale", (q: any) => q.eq("plantId", plantId))
    .collect();
}

export function mergeCareIntoI18nRows<T extends {
  plantId?: any;
  locale: string;
  careContent?: string;
  contentVersion?: number;
}>(rows: T[], careByPlantLocale: Map<string, { careContent?: string; contentVersion?: number }>) {
  return rows.map((row) => {
    const key = row.plantId ? `${String(row.plantId)}:${row.locale}` : "";
    const care = key ? careByPlantLocale.get(key) : undefined;
    return {
      ...row,
      careContent: care?.careContent ?? row.careContent,
      contentVersion: care?.contentVersion ?? row.contentVersion,
    };
  });
}

export function mergeCareProfileIntoPlant<T extends Record<string, any>>(
  plant: T,
  careProfile?: any,
) {
  return {
    ...plant,
    typicalDaysToHarvest: careProfile?.typicalDaysToHarvest ?? plant.typicalDaysToHarvest,
    germinationDays: careProfile?.germinationDays ?? plant.germinationDays,
    lightRequirements: careProfile?.lightRequirements ?? plant.lightRequirements,
    soilPref: careProfile?.soilPref ?? plant.soilPref,
    spacingCm: careProfile?.spacingCm ?? plant.spacingCm,
    maxPlantsPerM2: careProfile?.maxPlantsPerM2 ?? plant.maxPlantsPerM2,
    seedRatePerM2: careProfile?.seedRatePerM2 ?? plant.seedRatePerM2,
    waterLitersPerM2: careProfile?.waterLitersPerM2 ?? plant.waterLitersPerM2,
    yieldKgPerM2: careProfile?.yieldKgPerM2 ?? plant.yieldKgPerM2,
    wateringFrequencyDays: careProfile?.wateringFrequencyDays ?? plant.wateringFrequencyDays,
    fertilizingFrequencyDays: careProfile?.fertilizingFrequencyDays ?? plant.fertilizingFrequencyDays,
  };
}

export function mergeCareProfileIntoPlants<T extends Record<string, any>>(
  plants: T[],
  careProfileByPlantId: Map<string, any>,
) {
  return plants.map((plant) =>
    mergeCareProfileIntoPlant(plant, careProfileByPlantId.get(String(plant._id))),
  );
}

export async function upsertPlantCareProfile(
  ctx: any,
  plantId: any,
  payload: Omit<PlantCareProfile, "plantId">,
) {
  const existing = await getPlantCareProfileByPlantId(ctx, plantId);
  const hasValue = Object.values(payload).some((value) => value !== undefined);

  if (!hasValue) {
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  }

  const doc = { plantId, ...payload };
  if (existing) {
    await ctx.db.patch(existing._id, doc);
    return existing._id;
  }
  return await ctx.db.insert("plantCare", doc);
}

export async function upsertPlantCareI18n(
  ctx: any,
  plantId: any,
  locale: string,
  careContent?: string,
  contentVersion?: number,
) {
  const normalizedLocale = String(locale).trim().toLowerCase();
  if (!normalizedLocale) {
    throw new Error("Locale is required");
  }

  const existing = await ctx.db
    .query("plantCareI18n")
    .withIndex("by_plant_locale", (q: any) =>
      q.eq("plantId", plantId).eq("locale", normalizedLocale),
    )
    .unique();

  if (!careContent) {
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  }

  const payload = {
    plantId,
    locale: normalizedLocale,
    careContent,
    contentVersion,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }

  return await ctx.db.insert("plantCareI18n", payload);
}
