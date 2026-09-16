export type PlantNameSource = {
  nickname?: string | null;
  displayName?: string | null;
  commonName?: string | null;
  scientificName?: string | null;
  i18n?: Record<string, string | { commonName?: string | null; common_name?: string | null }> | null;
};

type PlantNameOptions = { locale?: string | null; fallback: string };

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function language(locale?: string | null) {
  return clean(locale)?.replace('_', '-').toLowerCase().split('-')[0];
}

function localizedCommonName(plant: PlantNameSource, locale?: string | null) {
  const rows = Object.entries(plant.i18n ?? {});
  const read = (value: string | { commonName?: string | null; common_name?: string | null } | undefined) =>
    clean(typeof value === 'string' ? value : value?.commonName ?? value?.common_name);
  const wanted = language(locale);
  const exact = rows.find(([key]) => language(key) === wanted)?.[1];
  const english = rows.find(([key]) => language(key) === 'en')?.[1];
  return read(exact) ?? clean(plant.displayName) ?? clean(plant.commonName) ?? read(english) ?? read(rows[0]?.[1]);
}

export function getPlantCatalogName(plant: PlantNameSource, options: PlantNameOptions) {
  return localizedCommonName(plant, options.locale) ?? clean(plant.scientificName) ?? options.fallback;
}

export function getPlantInstanceName(plant: PlantNameSource, options: PlantNameOptions) {
  return clean(plant.nickname) ?? getPlantCatalogName(plant, options);
}
