// Phase 3.1 care status contract (plantCare.careStatus / field evidence).
// The contract and the aggregate recompute rule live in the shared package so
// the Convex layer and the API/SQLite mirror use exactly one implementation.
import {
  CARE_STATUSES,
  CONTENT_ORIGINS,
  PROFILE_EVIDENCE_KEY,
  REQUIRED_CARE_FIELDS,
  recomputeCareStatus,
} from "../../../shared/src/plantCareStatus";
import type {
  CareStatus,
  ContentOrigin,
  CareFieldEvidence,
  RequiredCareField,
} from "../../../shared/src/plantCareStatus";

export {
  CARE_STATUSES,
  CONTENT_ORIGINS,
  PROFILE_EVIDENCE_KEY,
  REQUIRED_CARE_FIELDS,
  recomputeCareStatus,
};
export type {
  CareStatus,
  ContentOrigin,
  CareFieldEvidence,
  RequiredCareField,
};

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
  soilPhMin?: number;
  soilPhMax?: number;
  moistureTarget?: number;
  lightHours?: number;
  source?: string;
  sourceUrl?: string;
  contentStatus?: "draft" | "published" | "needs_review" | "archived";
  contentVersion?: number;
  reviewedAt?: number;
  reviewedBy?: string;
  careStatus?: CareStatus;
  careFieldEvidence?: Record<string, CareFieldEvidence>;
};

export type PlantCareI18nRow = {
  plantId: any;
  locale: string;
  careContent?: string;
  contentVersion?: number;
  source?: string;
  sourceUrl?: string;
  contentStatus?: "draft" | "published" | "needs_review" | "archived";
  reviewedAt?: number;
  reviewedBy?: string;
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
  const careByPlantLocale = new Map<string, PlantCareI18nRow>();

  for (const row of rows) {
    careByPlantLocale.set(`${String(row.plantId)}:${row.locale}`, {
      plantId: row.plantId,
      locale: row.locale,
      careContent: row.careContent ?? undefined,
      contentVersion: row.contentVersion ?? undefined,
      source: row.source ?? undefined,
      sourceUrl: row.sourceUrl ?? undefined,
      contentStatus: row.contentStatus ?? undefined,
      reviewedAt: row.reviewedAt ?? undefined,
      reviewedBy: row.reviewedBy ?? undefined,
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
}>(rows: T[], careByPlantLocale: Map<string, PlantCareI18nRow>) {
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
    soilPhMin: careProfile?.soilPhMin ?? plant.soilPhMin,
    soilPhMax: careProfile?.soilPhMax ?? plant.soilPhMax,
    moistureTarget: careProfile?.moistureTarget ?? plant.moistureTarget,
    lightHours: careProfile?.lightHours ?? plant.lightHours,
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
  const providedEntries = Object.entries(payload).filter(([, value]) => value !== undefined);

  // An omitted care patch must be a no-op. This matters for admin edits that
  // only change taxonomy/content metadata: they must not erase an existing
  // profile just because the caller did not include every care field.
  if (providedEntries.length === 0) {
    return existing?._id ?? null;
  }

  const doc = Object.fromEntries(providedEntries);
  if (existing) {
    // Recompute the record-level careStatus from the merged profile whenever
    // fields or evidence change, so the persisted aggregate never drifts.
    const merged = { ...existing, ...doc };
    doc.careStatus = recomputeCareStatus(merged as PlantCareProfile, merged.careFieldEvidence);
    await ctx.db.patch(existing._id, doc);
    return existing._id;
  }
  const inserted: PlantCareProfile = { plantId, ...doc };
  inserted.careStatus = recomputeCareStatus(inserted, inserted.careFieldEvidence);
  return await ctx.db.insert("plantCare", inserted);
}

export async function upsertPlantCareI18n(
  ctx: any,
  plantId: any,
  locale: string,
  careContent?: string,
  contentVersion?: number,
  options?: {
    source?: string;
    sourceUrl?: string;
    contentStatus?: "draft" | "published" | "needs_review" | "archived";
    reviewedAt?: number;
    reviewedBy?: string;
  },
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

  if (careContent === undefined) {
    return existing?._id ?? null;
  }

  if (!careContent.trim()) {
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  }

  const payload = {
    plantId,
    locale: normalizedLocale,
    careContent,
    contentVersion: contentVersion ?? existing?.contentVersion,
    source: options?.source !== undefined
      ? options.source.trim() || undefined
      : existing?.source,
    sourceUrl: options?.sourceUrl !== undefined
      ? options.sourceUrl.trim() || undefined
      : existing?.sourceUrl,
    contentStatus: options?.contentStatus ?? existing?.contentStatus,
    reviewedAt: options?.reviewedAt ?? existing?.reviewedAt,
    reviewedBy: options?.reviewedBy !== undefined
      ? options.reviewedBy.trim() || undefined
      : existing?.reviewedBy,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }

  return await ctx.db.insert("plantCareI18n", payload);
}
