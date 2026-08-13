import { matchesSearch } from './search';

type PlantI18nRow = {
  commonName?: unknown;
};

type SearchablePlant = {
  displayName?: unknown;
  scientificName?: unknown;
  group?: unknown;
  i18nRows?: unknown;
};

function asSearchText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Match canonical plants by the active display name and every localized name. */
export function matchesPlantLibrarySearch(query: string, plant: SearchablePlant): boolean {
  const localizedNames = Array.isArray(plant.i18nRows)
    ? (plant.i18nRows as PlantI18nRow[]).map((row) => asSearchText(row?.commonName))
    : [];
  const group = asSearchText(plant.group);

  return matchesSearch(query, [
    asSearchText(plant.displayName),
    asSearchText(plant.scientificName),
    group,
    group?.replace(/_/g, ' '),
    ...localizedNames,
  ]);
}

/** Common browse is base-only; an active search intentionally includes cultivars. */
export function shouldRestrictCommonBrowseToBasePlants(query: string): boolean {
  return query.trim().length === 0;
}
