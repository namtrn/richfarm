import { isDisplayBasePlant } from "../../../shared/src/plantBase";
import {
  isPlaceholderPlantDescription,
  shouldUseBasePlantDescription,
} from "./plantContentQuality";
import { withComputedPlantTaxonomy } from "./plantTaxonomy";

type CanonicalOptions = {
  locale?: string;
  group?: string;
  family?: string;
  purpose?: string;
  search?: string;
  limit?: number;
  includeInactive?: boolean;
};

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim();

const localeOf = (value?: string) => (value ?? "en").split("-")[0].toLowerCase() || "en";

function speciesKeyOf(plant: any) {
  if (plant.genusNormalized && plant.speciesNormalized) {
    return `${plant.genusNormalized}:${plant.speciesNormalized}`;
  }
  return normalize(plant.scientificName);
}

function isProductionPlant(plant: any, includeInactive: boolean) {
  if (!includeInactive && plant.isActive === false) return false;
  if (plant.contentStatus === "archived") return false;
  if (!includeInactive && plant.contentStatus && plant.contentStatus !== "published") return false;
  return true;
}

function chooseRow(rows: any[], locale: string, requireUsableDescription = false) {
  const usable = rows.filter((row) =>
    (row.contentStatus === undefined || row.contentStatus === "published") &&
    String(row.commonName ?? "").trim() &&
    (!requireUsableDescription || !isPlaceholderPlantDescription(row.description)),
  );
  return usable.find((row) => row.locale === locale) ??
    usable.find((row) => row.locale === "en") ??
    usable[0] ?? null;
}

function productionRows(rows: any[], includeInactive: boolean) {
  if (includeInactive) return rows;
  return rows
    .filter((row) =>
      (row.contentStatus === undefined || row.contentStatus === "published") &&
      String(row.commonName ?? "").trim(),
    )
    .map((row) => ({
      ...row,
      description: isPlaceholderPlantDescription(row.description)
        ? undefined
        : row.description,
    }));
}

function baseCandidate(plant: any, plants: any[]) {
  const explicitBaseId = plant.basePlantId;
  if (explicitBaseId) {
    const explicit = plants.find((candidate) => String(candidate._id) === String(explicitBaseId));
    if (explicit && isDisplayBasePlant(explicit) && isProductionPlant(explicit, false)) return explicit;
  }
  const key = speciesKeyOf(plant);
  return plants.find((candidate) =>
    candidate._id !== plant._id &&
    isDisplayBasePlant(candidate) &&
    isProductionPlant(candidate, false) &&
    speciesKeyOf(candidate) === key,
  ) ?? null;
}

function mergeLocaleContent(plant: any, rows: any[], base: any | null, baseRows: any[], locale: string) {
  const picked = chooseRow(rows, locale);
  const pickedContent = chooseRow(rows, locale, true);
  const pickedBase = base ? chooseRow(baseRows, locale) : null;
  const pickedBaseContent = base ? chooseRow(baseRows, locale, true) : null;
  let description = pickedContent?.description?.trim() || undefined;
  if (shouldUseBasePlantDescription({
    cultivarDescription: description,
    baseDescription: pickedBaseContent?.description,
    cultivar: plant.cultivar,
    cultivarCommonName: picked?.commonName,
    baseCommonName: pickedBase?.commonName,
  })) {
    description = isPlaceholderPlantDescription(pickedBaseContent?.description)
      ? undefined
      : pickedBaseContent?.description?.trim() || undefined;
  }

  const care = picked?.careContent
    ? picked
    : pickedBase?.careContent
      ? pickedBase
      : picked;
  return {
    displayName: picked?.commonName ?? plant.scientificName,
    description: isPlaceholderPlantDescription(description) ? undefined : description,
    localeUsed: pickedContent?.locale ?? picked?.locale ?? "latin",
    careContent: care?.careContent,
    contentVersion: care?.contentVersion,
  };
}

export async function loadCanonicalPlantLibrary(ctx: any, options: CanonicalOptions = {}) {
  const locale = localeOf(options.locale);
  const includeInactive = options.includeInactive === true;
  const allPlants = (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);
  const allI18n = await ctx.db.query("plantI18n").collect();
  const allCare = await ctx.db.query("plantCare").collect();
  const allCareI18n = await ctx.db.query("plantCareI18n").collect();
  const i18nByPlant = new Map<string, any[]>();
  const careI18nByPlantLocale = new Map<string, any>();
  const careByPlant = new Map<string, any>();
  for (const row of allI18n) {
    const rows = i18nByPlant.get(String(row.plantId)) ?? [];
    rows.push({ ...row, locale: localeOf(row.locale) });
    i18nByPlant.set(String(row.plantId), rows);
  }
  for (const row of allCareI18n) {
    careI18nByPlantLocale.set(`${row.plantId}:${localeOf(row.locale)}`, row);
  }
  for (const row of allCare) careByPlant.set(String(row.plantId), row);
  for (const [plantId, rows] of i18nByPlant) {
    for (const row of rows) {
      const care = careI18nByPlantLocale.get(`${plantId}:${row.locale}`);
      if (care && (includeInactive || care.contentStatus === undefined || care.contentStatus === "published")) {
        row.careContent = care.careContent;
        row.contentVersion = row.contentVersion ?? care.contentVersion;
        row.careSource = care.source;
        row.careSourceUrl = care.sourceUrl;
      }
    }
  }

  const sourcePlants = allPlants.filter((plant: any) => {
    if (!isProductionPlant(plant, includeInactive)) return false;
    if (options.group && normalize(plant.group) !== normalize(options.group)) return false;
    if (options.family && normalize(plant.family) !== normalize(options.family)) return false;
    if (options.purpose && !(plant.purposes ?? []).some((purpose: string) => normalize(purpose) === normalize(options.purpose))) return false;
    return true;
  });

  const projected: any[] = sourcePlants.map((plant: any) => {
    const rows = productionRows(i18nByPlant.get(String(plant._id)) ?? [], includeInactive);
    const base = baseCandidate(plant, allPlants);
    const baseRows = base
      ? productionRows(i18nByPlant.get(String(base._id)) ?? [], includeInactive)
      : [];
    const localized = mergeLocaleContent(plant, rows, base, baseRows, locale);
    const careProfile = careByPlant.get(String(plant._id));
    const baseCare = base ? careByPlant.get(String(base._id)) : undefined;
    const isPublishedCare = (profile: any) => profile && (
      includeInactive || profile.contentStatus === undefined || profile.contentStatus === "published"
    );
    const care = isPublishedCare(careProfile)
      ? careProfile
      : isPublishedCare(baseCare)
        ? baseCare
        : undefined;
    const searchable = [
      localized.displayName,
      plant.scientificName,
      plant.cultivar,
      plant.family,
      plant.group,
      ...(plant.purposes ?? []),
      ...rows.map((row) => row.commonName),
    ].map(normalize).join(" ");

    return {
      _id: plant._id,
      scientificName: plant.scientificName,
      family: plant.family ?? undefined,
      genus: plant.genus ?? undefined,
      species: plant.species ?? undefined,
      genusNormalized: plant.genusNormalized ?? undefined,
      speciesNormalized: plant.speciesNormalized ?? undefined,
      cultivar: plant.cultivar ?? null,
      cultivarNormalized: plant.cultivarNormalized,
      basePlantId: plant.basePlantId ?? (base?._id ?? undefined),
      commonNameGroupKey: plant.commonNameGroupKey ?? undefined,
      commonNameGroupVi: plant.commonNameGroupVi ?? undefined,
      commonNameGroupEn: plant.commonNameGroupEn ?? undefined,
      displayName: localized.displayName,
      commonName: localized.displayName,
      description: localized.description,
      localeUsed: localized.localeUsed,
      careContent: localized.careContent,
      contentVersion: localized.contentVersion ?? plant.contentVersion,
      i18nRows: rows,
      group: plant.group,
      imageUrl: plant.imageUrl ?? null,
      hasImage: Boolean(plant.imageUrl),
      isBaseVariant: isDisplayBasePlant(plant),
      speciesKey: speciesKeyOf(plant),
      purposes: plant.purposes ?? [],
      source: plant.source,
      sourceSystem: plant.sourceSystem,
      sourceId: plant.sourceId,
      recordVersion: plant.recordVersion,
      sourceUrl: plant.sourceUrl,
      isActive: plant.isActive !== false,
      contentStatus: plant.contentStatus ?? "published",
      reviewStatus: plant.reviewStatus ?? "unreviewed",
      reviewedAt: plant.reviewedAt,
      reviewedBy: plant.reviewedBy,
      growthStage: plant.growthStage,
      notes: plant.notes,
      typicalDaysToHarvest: care?.typicalDaysToHarvest,
      germinationDays: care?.germinationDays,
      wateringFrequencyDays: care?.wateringFrequencyDays,
      fertilizingFrequencyDays: care?.fertilizingFrequencyDays,
      lightRequirements: care?.lightRequirements,
      lightHours: care?.lightHours ?? plant.lightHours,
      soilPhMin: care?.soilPhMin ?? plant.soilPhMin,
      soilPhMax: care?.soilPhMax ?? plant.soilPhMax,
      moistureTarget: care?.moistureTarget ?? plant.moistureTarget,
      spacingCm: care?.spacingCm,
      maxPlantsPerM2: care?.maxPlantsPerM2,
      seedRatePerM2: care?.seedRatePerM2,
      waterLitersPerM2: care?.waterLitersPerM2,
      yieldKgPerM2: care?.yieldKgPerM2,
      _searchText: searchable,
    };
  }).filter((plant: any) => Boolean(plant.description?.trim()));

  const searched = options.search
    ? projected.filter((plant) => plant._searchText.includes(normalize(options.search)))
    : projected;
  const sorted = searched.sort((left: any, right: any) => {
    const groupCompare = String(left.group ?? "").localeCompare(String(right.group ?? ""));
    if (groupCompare !== 0) return groupCompare;
    if (left.isBaseVariant !== right.isBaseVariant) return left.isBaseVariant ? -1 : 1;
    return String(left.displayName).localeCompare(String(right.displayName));
  });
  return sorted
    .map(({ _searchText, ...plant }: any) => plant)
    .slice(0, Math.max(1, Math.min(options.limit ?? 10000, 10000)));
}

export async function getCanonicalPlantById(ctx: any, plantId: any, locale?: string, includeInactive = false) {
  const plants = await loadCanonicalPlantLibrary(ctx, { locale, includeInactive, limit: 10000 });
  return plants.find((plant: any) => String(plant._id) === String(plantId)) ?? null;
}
