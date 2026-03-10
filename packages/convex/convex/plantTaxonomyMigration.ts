import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  buildTaxonomyFields,
  DEFAULT_CULTIVAR_NORMALIZED,
  formatGenus,
  formatSpecies,
  matchesTaxonomyIdentity,
  normalizeTaxonomyToken,
  parseTaxonomyFromScientificName,
  taxonomyIdentityFromPlant,
  type TaxonomyParseStatus,
} from "./lib/plantTaxonomy";
import { plantTaxonomyI18nSeed } from "./data/plantTaxonomyI18nSeed";
import { getPlantCareI18nRowsByPlantId, upsertPlantCareI18n } from "./lib/plantCare";

const MAX_BATCH = 5000;

async function runBackfillTaxonomy(
  ctx: any,
  args: { dryRun?: boolean; limit?: number }
) {
  const dryRun = args.dryRun ?? false;
  const limit = Math.max(1, Math.min(args.limit ?? 1000, MAX_BATCH));

  const allPlants = await ctx.db.query("plantsMaster").collect();
  const candidates = allPlants
    .filter((plant: any) => {
      if (!plant.scientificName) return false;
      const parsed = parseTaxonomyFromScientificName(plant.scientificName);
      const parsedGenus = parsed.genus ? formatGenus(parsed.genus) : "";
      const parsedSpecies = parsed.species ? formatSpecies(parsed.species) : "";
      const currentGenus =
        typeof plant.genus === "string" ? formatGenus(plant.genus) : "";
      const currentSpecies =
        typeof plant.species === "string" ? formatSpecies(plant.species) : "";
      return (
        !plant.genus ||
        !plant.species ||
        !plant.taxonomyParseStatus ||
        (parsedGenus && parsedGenus !== currentGenus) ||
        (parsedSpecies && parsedSpecies !== currentSpecies)
      );
    })
    .slice(0, limit);
  const totalCandidates = candidates.length;

  let patched = 0;
  let manualReview = 0;
  let skipped = 0;

  for (const plant of candidates) {
    const current = plant as any;
    const patch: Record<string, unknown> = {};

    const existingGenus = typeof current.genus === "string" ? current.genus.trim() : "";
    const existingSpecies =
      typeof current.species === "string" ? current.species.trim() : "";
    const existingCultivar =
      typeof current.cultivar === "string" ? current.cultivar.trim() : "";
    const parsed = parseTaxonomyFromScientificName(current.scientificName);

    let genus = existingGenus ? formatGenus(existingGenus) : "";
    let species = existingSpecies ? formatSpecies(existingSpecies) : "";
    let parseStatus: TaxonomyParseStatus =
      current.taxonomyParseStatus === "manual_review" ? "manual_review" : "ok";

    if (parsed.genus) {
      genus = formatGenus(parsed.genus);
    }
    if (parsed.species) {
      species = formatSpecies(parsed.species);
    }
    if (!genus || !species) {
      if (!genus) genus = parsed.genus ?? "";
      if (!species) species = parsed.species ?? "";
      parseStatus = parsed.parseStatus;
    } else if (parsed.parseStatus === "ok") {
      parseStatus = "ok";
    }

    if (!genus || !species) {
      parseStatus = "manual_review";
    }

    if (genus && current.genus !== genus) patch.genus = genus;

    if (species && current.species !== species) patch.species = species;

    const cultivarValue = existingCultivar || undefined;
    if (current.cultivar !== cultivarValue) {
      patch.cultivar = cultivarValue;
    }

    if (current.taxonomyParseStatus !== parseStatus) {
      patch.taxonomyParseStatus = parseStatus;
    }

    if (Object.keys(patch).length === 0) {
      skipped += 1;
      continue;
    }

    if (!dryRun) {
      await ctx.db.patch(plant._id, patch);
    }
    patched += 1;
    if (parseStatus === "manual_review") {
      manualReview += 1;
    }
  }

  return {
    dryRun,
    totalPlants: allPlants.length,
    scanned: totalCandidates,
    patched,
    skipped,
    manualReview,
    defaultCultivarToken: DEFAULT_CULTIVAR_NORMALIZED,
    remainingCandidatesEstimate: Math.max(totalCandidates - patched - skipped, 0),
  };
}

export const backfillTaxonomyFields = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => runBackfillTaxonomy(ctx, args),
});

export const runTaxonomyBackfill = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    confirm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    if (!dryRun && args.confirm !== "BACKFILL_TAXONOMY") {
      throw new Error(
        "Missing confirm token. Re-run with { confirm: \"BACKFILL_TAXONOMY\" } when dryRun=false"
      );
    }

    return await runBackfillTaxonomy(ctx, {
      dryRun,
      limit: args.limit,
    });
  },
});

export const listTaxonomyManualReview = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 1000));
    const plants = await ctx.db.query("plantsMaster").collect();

    return plants
      .filter((plant: any) => {
        return (
          plant.taxonomyParseStatus === "manual_review" ||
          !plant.genus ||
          !plant.species
        );
      })
      .slice(0, limit)
      .map((plant: any) => ({
        plantId: plant._id,
        scientificName: plant.scientificName,
        genus: plant.genus ?? null,
        species: plant.species ?? null,
        cultivar: plant.cultivar ?? null,
        taxonomyParseStatus: plant.taxonomyParseStatus ?? "manual_review",
      }));
  },
});

export const removeLegacyCommonNames = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const limit = Math.max(1, Math.min(args.limit ?? 1000, MAX_BATCH));
    const plants = await ctx.db.query("plantsMaster").collect();

    const legacyRows = plants
      .filter((plant: any) =>
        Object.prototype.hasOwnProperty.call(plant, "commonNames")
      )
      .slice(0, limit);

    let removed = 0;
    for (const plant of legacyRows) {
      if (!dryRun) {
        const { commonNames: _legacy, ...cleaned } = plant as any;
        await ctx.db.replace((plant as any)._id, cleaned);
      }
      removed += 1;
    }

    return {
      dryRun,
      scanned: legacyRows.length,
      removed,
      remainingEstimate: Math.max(
        plants.filter((plant: any) =>
          Object.prototype.hasOwnProperty.call(plant, "commonNames")
        ).length - removed,
        0
      ),
    };
  },
});

export const backfillInfraspecificCultivar = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const limit = Math.max(1, Math.min(args.limit ?? 1000, MAX_BATCH));
    const plants = await ctx.db.query("plantsMaster").collect();

    const candidates = plants
      .filter((plant: any) => {
        const cultivarNormalized =
          taxonomyIdentityFromPlant(plant).cultivarNormalized ?? DEFAULT_CULTIVAR_NORMALIZED;
        const cultivar = typeof plant.cultivar === "string" ? plant.cultivar.trim() : "";
        return cultivarNormalized === DEFAULT_CULTIVAR_NORMALIZED && !cultivar;
      })
      .slice(0, limit);

    let patched = 0;
    let skipped = 0;
    let conflict = 0;

    for (const plant of candidates) {
      const next = buildTaxonomyFields({
        scientificName: (plant as any).scientificName,
        cultivar: (plant as any).cultivar,
      });
      const nextCultivar = next.cultivar ?? undefined;
      const nextCultivarNormalized =
        next.cultivarNormalized ?? DEFAULT_CULTIVAR_NORMALIZED;

      if (nextCultivarNormalized === DEFAULT_CULTIVAR_NORMALIZED && !nextCultivar) {
        skipped += 1;
        continue;
      }

      if (!next.genusNormalized || !next.speciesNormalized) {
        skipped += 1;
        continue;
      }

      const existing = plants.find((row: any) =>
        matchesTaxonomyIdentity(row, {
          genusNormalized: next.genusNormalized!,
          speciesNormalized: next.speciesNormalized!,
          cultivarNormalized: nextCultivarNormalized,
        })
      );
      if (existing && existing._id !== (plant as any)._id) {
        conflict += 1;
        continue;
      }

      if (!dryRun) {
        await ctx.db.patch((plant as any)._id, {
          cultivar: nextCultivar,
        });
      }
      patched += 1;
    }

    return {
      dryRun,
      scanned: candidates.length,
      patched,
      skipped,
      conflict,
    };
  },
});

export const backfillTaxonomyI18n = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    locale: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const limit = Math.max(1, Math.min(args.limit ?? 1000, MAX_BATCH));
    const localeFilter = String(args.locale ?? "").trim().toLowerCase();
    const seedRows = plantTaxonomyI18nSeed
      .filter((row) => !localeFilter || row.locale === localeFilter)
      .slice(0, limit);

    const existingRows = await ctx.db.query("plantTaxonomyI18n").collect();
    const existingByKey = new Map<string, any>();
    for (const row of existingRows) {
      existingByKey.set(`${row.taxonomyKey}|${row.locale}`, row);
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of seedRows) {
      const key = `${row.taxonomyKey}|${row.locale}`;
      const existing = existingByKey.get(key);
      if (!existing) {
        if (!dryRun) {
          await ctx.db.insert("plantTaxonomyI18n", {
            taxonomyKey: row.taxonomyKey,
            rank: row.rank,
            locale: row.locale,
            family: row.family,
            genus: row.genus,
            genusNormalized: row.genusNormalized,
            species: row.species,
            speciesNormalized: row.speciesNormalized,
            commonName: row.commonName,
          });
        }
        inserted += 1;
        continue;
      }

      const changed =
        existing.rank !== row.rank ||
        existing.family !== row.family ||
        existing.genus !== row.genus ||
        existing.genusNormalized !== row.genusNormalized ||
        existing.species !== row.species ||
        existing.speciesNormalized !== row.speciesNormalized ||
        existing.commonName !== row.commonName;

      if (!changed) {
        skipped += 1;
        continue;
      }

      if (!dryRun) {
        await ctx.db.patch(existing._id, {
          rank: row.rank,
          family: row.family,
          genus: row.genus,
          genusNormalized: row.genusNormalized,
          species: row.species,
          speciesNormalized: row.speciesNormalized,
          commonName: row.commonName,
        });
      }
      updated += 1;
    }

    return {
      dryRun,
      locale: localeFilter || "all",
      scanned: seedRows.length,
      inserted,
      updated,
      skipped,
      totalSeedRows: plantTaxonomyI18nSeed.length,
    };
  },
});

const idEquals = (a: any, b: any) => String(a) === String(b);

const dedupeIdArray = (ids: any[]) => {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const id of ids) {
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
};

async function mergePlantRecords(
  ctx: any,
  args: {
    legacyId: any;
    canonicalId: any;
    dryRun: boolean;
  }
) {
  let userPlantsRewired = 0;
  let favoritesRewired = 0;
  let recipesRewired = 0;
  let masterLinksRewired = 0;
  let i18nMerged = 0;

  const legacyI18n = await ctx.db
    .query("plantI18n")
    .withIndex("by_plant_locale", (q: any) => q.eq("plantId", args.legacyId))
    .collect();
  const legacyCare = await getPlantCareI18nRowsByPlantId(ctx, args.legacyId);
  for (const row of legacyI18n) {
    const existing = await ctx.db
      .query("plantI18n")
      .withIndex("by_plant_locale", (q: any) =>
        q.eq("plantId", args.canonicalId).eq("locale", row.locale)
      )
      .unique();
    if (!existing) {
      if (!args.dryRun) {
        await ctx.db.insert("plantI18n", {
          plantId: args.canonicalId,
          locale: row.locale,
          commonName: row.commonName,
          description: row.description ?? undefined,
        });
      }
      i18nMerged += 1;
    }
    if (!args.dryRun) {
      await ctx.db.delete(row._id);
    }
  }
  for (const row of legacyCare) {
    if (!args.dryRun) {
      await upsertPlantCareI18n(
        ctx,
        args.canonicalId,
        row.locale,
        row.careContent ?? undefined,
        row.contentVersion ?? undefined,
      );
      await ctx.db.delete(row._id);
    }
  }

  const userPlants = await ctx.db.query("userPlants").collect();
  for (const row of userPlants) {
    if (!idEquals((row as any).plantMasterId, args.legacyId)) continue;
    if (!args.dryRun) {
      await ctx.db.patch((row as any)._id, { plantMasterId: args.canonicalId });
    }
    userPlantsRewired += 1;
  }

  const favorites = await ctx.db
    .query("userFavorites")
    .withIndex("by_plant", (q: any) => q.eq("plantMasterId", args.legacyId))
    .collect();
  for (const row of favorites) {
    const collision = await ctx.db
      .query("userFavorites")
      .withIndex("by_user_plant", (q: any) =>
        q.eq("userId", row.userId).eq("plantMasterId", args.canonicalId)
      )
      .first();
    if (!args.dryRun) {
      if (collision) {
        await ctx.db.delete((row as any)._id);
      } else {
        await ctx.db.patch((row as any)._id, { plantMasterId: args.canonicalId });
      }
    }
    favoritesRewired += 1;
  }

  const recipes = await ctx.db.query("preservationRecipes").collect();
  for (const recipe of recipes) {
    const suitablePlants = ((recipe as any).suitablePlants ?? []) as any[];
    if (!suitablePlants.some((id) => idEquals(id, args.legacyId))) continue;
    const replaced = dedupeIdArray(
      suitablePlants.map((id) => (idEquals(id, args.legacyId) ? args.canonicalId : id))
    );
    if (!args.dryRun) {
      await ctx.db.patch((recipe as any)._id, { suitablePlants: replaced });
    }
    recipesRewired += 1;
  }

  if (!args.dryRun) {
    await ctx.db.delete(args.legacyId);
  }

  return {
    userPlantsRewired,
    favoritesRewired,
    recipesRewired,
    masterLinksRewired,
    i18nMerged,
  };
}

export const resolveLegacyInfraspecificDuplicates = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const limit = Math.max(1, Math.min(args.limit ?? 200, MAX_BATCH));
    const plants = await ctx.db.query("plantsMaster").collect();

    const candidates: Array<{
      legacyId: any;
      canonicalId: any;
      scientificName: string;
    }> = [];

    for (const plant of plants) {
      const current = plant as any;
      const cultivarNormalized =
        taxonomyIdentityFromPlant(current).cultivarNormalized ?? DEFAULT_CULTIVAR_NORMALIZED;
      const cultivar = typeof current.cultivar === "string" ? current.cultivar.trim() : "";
      if (cultivarNormalized !== DEFAULT_CULTIVAR_NORMALIZED || cultivar) {
        continue;
      }

      const inferred = buildTaxonomyFields({
        scientificName: current.scientificName,
        cultivar: current.cultivar,
      });
      const inferredCultivarNormalized =
        inferred.cultivarNormalized ?? DEFAULT_CULTIVAR_NORMALIZED;
      if (inferredCultivarNormalized === DEFAULT_CULTIVAR_NORMALIZED) {
        continue;
      }
      if (!inferred.genusNormalized || !inferred.speciesNormalized) {
        continue;
      }

      const canonical = plants.find((row: any) =>
        matchesTaxonomyIdentity(row, {
          genusNormalized: inferred.genusNormalized!,
          speciesNormalized: inferred.speciesNormalized!,
          cultivarNormalized: inferredCultivarNormalized,
        })
      );
      if (!canonical || idEquals(canonical._id, current._id)) {
        continue;
      }

      candidates.push({
        legacyId: current._id,
        canonicalId: canonical._id,
        scientificName: current.scientificName,
      });
      if (candidates.length >= limit) break;
    }

    let merged = 0;
    let userPlantsRewired = 0;
    let favoritesRewired = 0;
    let recipesRewired = 0;
    let masterLinksRewired = 0;
    let i18nMerged = 0;

    for (const pair of candidates) {
      const mergeResult = await mergePlantRecords(ctx, {
        legacyId: pair.legacyId,
        canonicalId: pair.canonicalId,
        dryRun,
      });
      merged += 1;
      userPlantsRewired += mergeResult.userPlantsRewired;
      favoritesRewired += mergeResult.favoritesRewired;
      recipesRewired += mergeResult.recipesRewired;
      masterLinksRewired += mergeResult.masterLinksRewired;
      i18nMerged += mergeResult.i18nMerged;
    }

    return {
      dryRun,
      scanned: candidates.length,
      merged,
      rewired: {
        userPlants: userPlantsRewired,
        favorites: favoritesRewired,
        recipes: recipesRewired,
        masterLinks: masterLinksRewired,
        i18nMerged,
      },
      samples: candidates.slice(0, 20),
    };
  },
});

export const resolveDuplicateTaxonomyIdentities = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    confirm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    if (!dryRun && args.confirm !== "RESOLVE_DUPLICATE_TAXONOMY") {
      throw new Error(
        "Missing confirm token. Re-run with { confirm: \"RESOLVE_DUPLICATE_TAXONOMY\" } when dryRun=false"
      );
    }

    const limit = Math.max(1, Math.min(args.limit ?? 200, MAX_BATCH));
    const plants = await ctx.db.query("plantsMaster").collect();
    const groups = new Map<string, any[]>();

    for (const plant of plants) {
      const current = plant as any;
      const identity = taxonomyIdentityFromPlant(current);
      if (
        !identity.genusNormalized ||
        !identity.speciesNormalized ||
        !identity.cultivarNormalized
      ) {
        continue;
      }
      const key = `${identity.genusNormalized}|${identity.speciesNormalized}|${identity.cultivarNormalized}`;
      const list = groups.get(key) ?? [];
      list.push(current);
      groups.set(key, list);
    }

    const candidates = Array.from(groups.entries())
      .filter(([, rows]) => rows.length > 1)
      .slice(0, limit);

    let merged = 0;
    let userPlantsRewired = 0;
    let favoritesRewired = 0;
    let recipesRewired = 0;
    let masterLinksRewired = 0;
    let i18nMerged = 0;

    const samples: Array<{
      key: string;
      canonicalId: any;
      legacyIds: any[];
      scientificNames: string[];
    }> = [];

    for (const [key, rows] of candidates) {
      const sorted = [...rows].sort((a, b) => {
        const aSeed = a.source === "seed" ? 1 : 0;
        const bSeed = b.source === "seed" ? 1 : 0;
        if (aSeed !== bSeed) return bSeed - aSeed;
        return Number(a._creationTime ?? 0) - Number(b._creationTime ?? 0);
      });
      const canonical = sorted[0];
      const legacyRows = sorted.slice(1);

      samples.push({
        key,
        canonicalId: canonical._id,
        legacyIds: legacyRows.map((row) => row._id),
        scientificNames: sorted.map((row) => row.scientificName),
      });

      for (const legacy of legacyRows) {
        const mergeResult = await mergePlantRecords(ctx, {
          legacyId: legacy._id,
          canonicalId: canonical._id,
          dryRun,
        });
        merged += 1;
        userPlantsRewired += mergeResult.userPlantsRewired;
        favoritesRewired += mergeResult.favoritesRewired;
        recipesRewired += mergeResult.recipesRewired;
        masterLinksRewired += mergeResult.masterLinksRewired;
        i18nMerged += mergeResult.i18nMerged;
      }
    }

    return {
      dryRun,
      scanned: candidates.length,
      merged,
      rewired: {
        userPlants: userPlantsRewired,
        favorites: favoritesRewired,
        recipes: recipesRewired,
        masterLinks: masterLinksRewired,
        i18nMerged,
      },
      samples: samples.slice(0, 20),
    };
  },
});
