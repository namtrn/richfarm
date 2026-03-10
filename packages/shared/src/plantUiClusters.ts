import { isDisplayBasePlant } from "./plantBase";
import { buildPlantUiGroupMap } from "./plantUiGrouping";

function normalizeLocale(locale?: string) {
  const normalized = String(locale ?? "").split("-")[0]?.toLowerCase();
  return normalized || undefined;
}

function getLocalizedPlantName(plant: any, locale?: string) {
  const normalizedLocale = normalizeLocale(locale);
  const rows = Array.isArray(plant?.i18nRows) ? plant.i18nRows : [];
  const exact = normalizedLocale
    ? rows.find(
        (row: any) =>
          String(row?.locale ?? "").split("-")[0]?.toLowerCase() ===
          normalizedLocale,
      )
    : null;
  const english = rows.find(
    (row: any) => String(row?.locale ?? "").split("-")[0]?.toLowerCase() === "en",
  );

  return String(
    exact?.commonName ??
      plant?.displayName ??
      english?.commonName ??
      plant?.scientificName ??
      "Plant",
  ).trim();
}

function comparePlantsByDisplayOrder(a: any, b: any, locale?: string) {
  const aIsBase = isDisplayBasePlant(a);
  const bIsBase = isDisplayBasePlant(b);
  if (aIsBase !== bIsBase) return aIsBase ? -1 : 1;

  return getLocalizedPlantName(a, locale).localeCompare(
    getLocalizedPlantName(b, locale),
    normalizeLocale(locale),
  );
}

export type PlantUiCluster<TPlant> = {
  key: string;
  label: string;
  basePlant: TPlant;
  plants: TPlant[];
};

export function buildSortedPlantUiClusters<TPlant extends { _id?: unknown }>(
  plants: TPlant[],
  locale?: string,
): PlantUiCluster<TPlant>[] {
  const groupMap = buildPlantUiGroupMap(plants, locale);
  const grouped = new Map<string, { label: string; plants: TPlant[] }>();

  for (const plant of plants) {
    const group = groupMap.get(String(plant?._id ?? ""));
    const key = String(group?.key ?? `fallback:${String(plant?._id ?? "")}`);
    const label = String(group?.label ?? getLocalizedPlantName(plant, locale));
    const existing = grouped.get(key);

    if (existing) {
      existing.plants.push(plant);
      continue;
    }

    grouped.set(key, {
      label,
      plants: [plant],
    });
  }

  return Array.from(grouped.entries())
    .map(([key, group]) => {
      const sortedPlants = [...group.plants].sort((a, b) =>
        comparePlantsByDisplayOrder(a, b, locale),
      );
      const basePlant =
        sortedPlants.find((plant) => isDisplayBasePlant(plant)) ??
        sortedPlants[0];

      return {
        key,
        label: group.label,
        basePlant,
        plants: sortedPlants,
      };
    })
    .sort((a, b) =>
      a.label.localeCompare(b.label, normalizeLocale(locale)),
    );
}
