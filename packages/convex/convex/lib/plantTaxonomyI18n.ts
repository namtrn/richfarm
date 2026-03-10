export const TAXONOMY_RANK_VALUES = ["family", "genus", "species"] as const;

export type TaxonomyRank = (typeof TAXONOMY_RANK_VALUES)[number];

export function normalizeTaxonomyLocale(locale?: string | null) {
  return String(locale ?? "").trim().toLowerCase();
}

export function buildFamilyTaxonomyKey(family: string) {
  return `family:${family.trim()}`;
}

export function buildGenusTaxonomyKey(genusNormalized: string) {
  return `genus:${genusNormalized.trim()}`;
}

export function buildSpeciesTaxonomyKey(
  genusNormalized: string,
  speciesNormalized: string,
) {
  return `species:${genusNormalized.trim()}:${speciesNormalized.trim()}`;
}
