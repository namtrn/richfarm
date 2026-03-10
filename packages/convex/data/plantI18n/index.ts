import { plantI18nEnSeedData } from "./en";
import { plantI18nEsSeedData } from "./es";
import { plantI18nFrSeedData } from "./fr";
import { plantI18nPtSeedData } from "./pt";
import { plantI18nViSeedData } from "./vi";
import { plantI18nZhSeedData } from "./zh";
import type { PlantI18nLocaleRow } from "./types";

function normalizeScientificName(value: string) {
  return value.toLowerCase().replaceAll("×", "x").replace(/\s+/g, " ").trim();
}

function normalizeCultivar(value?: string) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupe(rows: PlantI18nLocaleRow[]) {
  const seen = new Set<string>();
  const result: PlantI18nLocaleRow[] = [];

  for (const row of rows) {
    const key = [
      normalizeScientificName(row.scientificName),
      normalizeCultivar(row.cultivar),
      row.locale.toLowerCase(),
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }

  return result;
}

export const plantI18nLocaleSeed: PlantI18nLocaleRow[] = dedupe([
  ...plantI18nEnSeedData,
  ...plantI18nViSeedData,
  ...plantI18nEsSeedData,
  ...plantI18nFrSeedData,
  ...plantI18nPtSeedData,
  ...plantI18nZhSeedData,
]);
