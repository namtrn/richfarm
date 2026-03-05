import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  buildTaxonomyFields,
  DEFAULT_CULTIVAR_NORMALIZED,
  isInfraspecificCultivar,
  requireTaxonomyIdentity,
} from "./lib/plantTaxonomy";
import { plantI18nSeed, plantsMasterSeed } from "./data/plantsMasterSeed";

const SAMPLE_LIMIT_DEFAULT = 25;

function taxonomyIdentityKey(input: {
  genusNormalized: string;
  speciesNormalized: string;
  cultivarNormalized: string;
}) {
  return `${input.genusNormalized}|${input.speciesNormalized}|${input.cultivarNormalized}`;
}

function buildDbTaxonomyKey(plant: any) {
  if (
    !plant?.genusNormalized ||
    !plant?.speciesNormalized ||
    !plant?.cultivarNormalized
  ) {
    return null;
  }
  return taxonomyIdentityKey({
    genusNormalized: plant.genusNormalized,
    speciesNormalized: plant.speciesNormalized,
    cultivarNormalized: plant.cultivarNormalized,
  });
}

function buildSeedTaxonomyKey(input: {
  scientificName: string;
  cultivar?: string | null;
}) {
  const taxonomy = buildTaxonomyFields({
    scientificName: input.scientificName,
    cultivar: input.cultivar,
  });
  const identity = requireTaxonomyIdentity(
    taxonomy,
    `Seed taxonomy ${input.scientificName}${input.cultivar ? ` (${input.cultivar})` : ""}`
  );
  return taxonomyIdentityKey(identity);
}

async function buildInvariantReport(ctx: any, sampleLimit: number) {
  const plants = await ctx.db.query("plantsMaster").collect();
  const i18nRows = await ctx.db.query("plantI18n").collect();

  const missingIdentity: Array<{ plantId: any; scientificName: string }> = [];
  const keyToPlantIds = new Map<string, string[]>();

  for (const plant of plants) {
    const key = buildDbTaxonomyKey(plant);
    if (!key) {
      missingIdentity.push({
        plantId: plant._id,
        scientificName: plant.scientificName ?? "",
      });
      continue;
    }
    const list = keyToPlantIds.get(key) ?? [];
    list.push(String(plant._id));
    keyToPlantIds.set(key, list);
  }

  const duplicateIdentity = Array.from(keyToPlantIds.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, plantIds: ids }));

  const variantWithoutBase: Array<{ plantId: any; key: string }> = [];
  for (const plant of plants) {
    const key = buildDbTaxonomyKey(plant);
    if (!key) continue;
    if (plant.cultivarNormalized === DEFAULT_CULTIVAR_NORMALIZED) {
      continue;
    }
    if (isInfraspecificCultivar(plant.cultivarNormalized)) {
      continue;
    }
    const baseKey = taxonomyIdentityKey({
      genusNormalized: plant.genusNormalized,
      speciesNormalized: plant.speciesNormalized,
      cultivarNormalized: DEFAULT_CULTIVAR_NORMALIZED,
    });
    if (!keyToPlantIds.has(baseKey)) {
      variantWithoutBase.push({ plantId: plant._id, key });
    }
  }

  const localesByPlant = new Map<string, Set<string>>();
  for (const row of i18nRows) {
    const id = String(row.plantId);
    const set = localesByPlant.get(id) ?? new Set<string>();
    set.add(String(row.locale ?? "").toLowerCase());
    localesByPlant.set(id, set);
  }

  const missingI18nLocales: Array<{ plantId: any; missingLocales: string[] }> = [];
  for (const plant of plants) {
    const locales = localesByPlant.get(String(plant._id)) ?? new Set<string>();
    const missingLocales = ["en", "vi"].filter((locale) => !locales.has(locale));
    if (missingLocales.length > 0) {
      missingI18nLocales.push({
        plantId: plant._id,
        missingLocales,
      });
    }
  }

  const plantIdSet = new Set(plants.map((plant: any) => String(plant._id)));
  const orphanI18n = i18nRows
    .filter((row: any) => !plantIdSet.has(String(row.plantId)))
    .map((row: any) => ({
      i18nId: row._id,
      plantId: row.plantId,
      locale: row.locale,
    }));

  return {
    totals: {
      plants: plants.length,
      plantI18n: i18nRows.length,
    },
    issues: {
      missingIdentityCount: missingIdentity.length,
      duplicateIdentityCount: duplicateIdentity.length,
      variantWithoutBaseCount: variantWithoutBase.length,
      missingI18nLocalesCount: missingI18nLocales.length,
      orphanI18nCount: orphanI18n.length,
    },
    samples: {
      missingIdentity: missingIdentity.slice(0, sampleLimit),
      duplicateIdentity: duplicateIdentity.slice(0, sampleLimit),
      variantWithoutBase: variantWithoutBase.slice(0, sampleLimit),
      missingI18nLocales: missingI18nLocales.slice(0, sampleLimit),
      orphanI18n: orphanI18n.slice(0, sampleLimit),
    },
  };
}

export const taxonomyInvariantReport = query({
  args: {
    sampleLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sampleLimit = Math.max(1, args.sampleLimit ?? SAMPLE_LIMIT_DEFAULT);
    return await buildInvariantReport(ctx, sampleLimit);
  },
});

export const assertTaxonomyInvariants = mutation({
  args: {
    sampleLimit: v.optional(v.number()),
    failOnMissingI18nLocales: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const sampleLimit = Math.max(1, args.sampleLimit ?? SAMPLE_LIMIT_DEFAULT);
    const failOnMissingI18nLocales = args.failOnMissingI18nLocales ?? false;
    const report = await buildInvariantReport(ctx, sampleLimit);

    const hasCriticalIssue =
      report.issues.missingIdentityCount > 0 ||
      report.issues.duplicateIdentityCount > 0 ||
      report.issues.variantWithoutBaseCount > 0 ||
      report.issues.orphanI18nCount > 0 ||
      (failOnMissingI18nLocales && report.issues.missingI18nLocalesCount > 0);

    if (hasCriticalIssue) {
      throw new Error(`Taxonomy invariants failed: ${JSON.stringify(report.issues)}`);
    }

    return report;
  },
});

export const seedAlignmentReport = query({
  args: {
    sampleLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sampleLimit = Math.max(1, args.sampleLimit ?? SAMPLE_LIMIT_DEFAULT);
    const plants = await ctx.db.query("plantsMaster").collect();
    const i18nRows = await ctx.db.query("plantI18n").collect();

    const dbPlantKeyCount = new Map<string, number>();
    for (const plant of plants) {
      const key = buildDbTaxonomyKey(plant);
      if (!key) continue;
      dbPlantKeyCount.set(key, (dbPlantKeyCount.get(key) ?? 0) + 1);
    }

    const seedPlantKeys = plantsMasterSeed.map((seed) =>
      buildSeedTaxonomyKey({
        scientificName: seed.scientificName,
        cultivar: (seed as any).cultivar,
      })
    );
    const uniqueSeedPlantKeys = Array.from(new Set(seedPlantKeys));

    const missingSeedPlants = uniqueSeedPlantKeys
      .filter((key) => !dbPlantKeyCount.has(key))
      .slice(0, sampleLimit);
    const duplicateSeedPlants = uniqueSeedPlantKeys
      .filter((key) => (dbPlantKeyCount.get(key) ?? 0) > 1)
      .slice(0, sampleLimit);

    const dbPlantIdByKey = new Map<string, string>();
    for (const plant of plants) {
      const key = buildDbTaxonomyKey(plant);
      if (!key || dbPlantIdByKey.has(key)) continue;
      dbPlantIdByKey.set(key, String(plant._id));
    }

    const i18nKeySet = new Set(
      i18nRows.map(
        (row) => `${String(row.plantId)}|${String(row.locale ?? "").toLowerCase()}`
      )
    );
    const missingSeedI18n: string[] = [];
    for (const row of plantI18nSeed) {
      const seedKey = buildSeedTaxonomyKey({
        scientificName: row.scientificName,
        cultivar: row.cultivar,
      });
      const plantId = dbPlantIdByKey.get(seedKey);
      if (!plantId) {
        missingSeedI18n.push(`${seedKey}|${row.locale.toLowerCase()}`);
        continue;
      }
      const i18nKey = `${plantId}|${row.locale.toLowerCase()}`;
      if (!i18nKeySet.has(i18nKey)) {
        missingSeedI18n.push(i18nKey);
      }
    }

    return {
      totals: {
        seedPlants: uniqueSeedPlantKeys.length,
        seedI18n: plantI18nSeed.length,
      },
      issues: {
        missingSeedPlantsCount: missingSeedPlants.length,
        duplicateSeedPlantsCount: duplicateSeedPlants.length,
        missingSeedI18nCount: missingSeedI18n.length,
      },
      samples: {
        missingSeedPlants,
        duplicateSeedPlants,
        missingSeedI18n: missingSeedI18n.slice(0, sampleLimit),
      },
    };
  },
});
