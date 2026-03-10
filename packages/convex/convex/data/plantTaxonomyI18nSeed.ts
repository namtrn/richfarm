import { plantI18nLocaleSeed } from "./plantI18n";
import { buildTaxonomyFields } from "../lib/plantTaxonomy";
import {
  buildGenusTaxonomyKey,
  buildSpeciesTaxonomyKey,
} from "../lib/plantTaxonomyI18n";

type Locale = "vi" | "en";
type Rank = "genus" | "species";

export type PlantTaxonomyI18nSeedRow = {
  taxonomyKey: string;
  rank: Rank;
  locale: Locale;
  family?: string;
  genus: string;
  genusNormalized: string;
  species?: string;
  speciesNormalized?: string;
  commonName: string;
};

function dedupeRows(rows: PlantTaxonomyI18nSeedRow[]) {
  const map = new Map<string, PlantTaxonomyI18nSeedRow>();
  for (const row of rows) {
    map.set(`${row.taxonomyKey}|${row.locale}`, row);
  }
  return Array.from(map.values());
}

function normalizeName(value?: string) {
  return String(value ?? "").trim();
}

function isSupportedLocale(locale: string): locale is Locale {
  return locale === "vi" || locale === "en";
}

// Source of truth: generated locale seed, which is built from
// packages/convex/data/plantI18nSource/*.json.
const basePlantI18nRows = plantI18nLocaleSeed.filter(
  (row) => isSupportedLocale(row.locale) && !row.cultivar?.trim(),
);

const speciesRows: PlantTaxonomyI18nSeedRow[] = [];
const genusNamesByLocale = new Map<string, Map<Locale, Set<string>>>();
const genusMeta = new Map<
  string,
  {
    genus: string;
    genusNormalized: string;
    speciesKeys: Set<string>;
  }
>();

for (const row of basePlantI18nRows) {
  const taxonomy = buildTaxonomyFields({
    scientificName: row.scientificName,
  });
  if (
    !taxonomy.genus ||
    !taxonomy.genusNormalized ||
    !taxonomy.species ||
    !taxonomy.speciesNormalized
  ) {
    continue;
  }

  const commonName = normalizeName(row.commonName);
  if (!commonName) continue;

  speciesRows.push({
    taxonomyKey: buildSpeciesTaxonomyKey(
      taxonomy.genusNormalized,
      taxonomy.speciesNormalized,
    ),
    rank: "species",
    locale: row.locale as Locale,
    genus: taxonomy.genus,
    genusNormalized: taxonomy.genusNormalized,
    species: taxonomy.species,
    speciesNormalized: taxonomy.speciesNormalized,
    commonName,
  });

  const localeNames = genusNamesByLocale.get(taxonomy.genusNormalized) ?? new Map();
  const currentNames = localeNames.get(row.locale) ?? new Set<string>();
  currentNames.add(commonName);
  localeNames.set(row.locale, currentNames);
  genusNamesByLocale.set(taxonomy.genusNormalized, localeNames);

  const meta = genusMeta.get(taxonomy.genusNormalized) ?? {
    genus: taxonomy.genus,
    genusNormalized: taxonomy.genusNormalized,
    speciesKeys: new Set<string>(),
  };
  meta.speciesKeys.add(taxonomy.speciesNormalized);
  genusMeta.set(taxonomy.genusNormalized, meta);
}

const genusRows: PlantTaxonomyI18nSeedRow[] = [];
for (const [genusNormalized, meta] of genusMeta.entries()) {
  const localeNames = genusNamesByLocale.get(genusNormalized);
  if (!localeNames) continue;

  for (const locale of ["vi", "en"] as const) {
    const names = Array.from(localeNames.get(locale) ?? []);

    // Only emit genus common names when the JSON source is unambiguous for that genus.
    if (names.length !== 1) continue;

    genusRows.push({
      taxonomyKey: buildGenusTaxonomyKey(genusNormalized),
      rank: "genus",
      locale,
      genus: meta.genus,
      genusNormalized: meta.genusNormalized,
      commonName: names[0],
    });
  }
}

export const plantTaxonomyI18nSeed: PlantTaxonomyI18nSeedRow[] = dedupeRows([
  ...genusRows,
  ...speciesRows,
]);
