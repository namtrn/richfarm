import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  buildTaxonomyFields,
  DEFAULT_CULTIVAR_NORMALIZED,
  formatGenus,
  formatSpecies,
  normalizeCultivar,
  normalizeTaxonomyToken,
  parseTaxonomyFromScientificName,
  type TaxonomyParseStatus,
} from "./lib/plantTaxonomy";

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
      return (
        !plant.genus ||
        !plant.species ||
        !plant.genusNormalized ||
        !plant.speciesNormalized ||
        !plant.cultivarNormalized ||
        !plant.taxonomyParseStatus
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

    let genus = existingGenus ? formatGenus(existingGenus) : "";
    let species = existingSpecies ? formatSpecies(existingSpecies) : "";
    let parseStatus: TaxonomyParseStatus =
      current.taxonomyParseStatus === "manual_review" ? "manual_review" : "ok";

    if (!genus || !species) {
      const parsed = parseTaxonomyFromScientificName(current.scientificName);
      if (!genus) genus = parsed.genus ?? "";
      if (!species) species = parsed.species ?? "";
      parseStatus = parsed.parseStatus;
    }

    if (!genus || !species) {
      parseStatus = "manual_review";
    }

    if (genus) {
      const genusNormalized = normalizeTaxonomyToken(genus);
      if (current.genus !== genus) patch.genus = genus;
      if (current.genusNormalized !== genusNormalized) {
        patch.genusNormalized = genusNormalized;
      }
    }

    if (species) {
      const speciesNormalized = normalizeTaxonomyToken(species);
      if (current.species !== species) patch.species = species;
      if (current.speciesNormalized !== speciesNormalized) {
        patch.speciesNormalized = speciesNormalized;
      }
    }

    const cultivarValue = existingCultivar || undefined;
    const cultivarNormalized = normalizeCultivar(existingCultivar);
    if (current.cultivar !== cultivarValue) {
      patch.cultivar = cultivarValue;
    }
    if (current.cultivarNormalized !== cultivarNormalized) {
      patch.cultivarNormalized = cultivarNormalized;
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
        const cultivarNormalized = plant.cultivarNormalized ?? DEFAULT_CULTIVAR_NORMALIZED;
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

      const existing = await ctx.db
        .query("plantsMaster")
        .withIndex("by_genus_species_cultivar", (q: any) =>
          q
            .eq("genusNormalized", next.genusNormalized!)
            .eq("speciesNormalized", next.speciesNormalized!)
            .eq("cultivarNormalized", nextCultivarNormalized)
        )
        .first();
      if (existing && existing._id !== (plant as any)._id) {
        conflict += 1;
        continue;
      }

      if (!dryRun) {
        await ctx.db.patch((plant as any)._id, {
          cultivar: nextCultivar,
          cultivarNormalized: nextCultivarNormalized,
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
        current.cultivarNormalized ?? DEFAULT_CULTIVAR_NORMALIZED;
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

      const canonical = await ctx.db
        .query("plantsMaster")
        .withIndex("by_genus_species_cultivar", (q: any) =>
          q
            .eq("genusNormalized", inferred.genusNormalized!)
            .eq("speciesNormalized", inferred.speciesNormalized!)
            .eq("cultivarNormalized", inferredCultivarNormalized)
        )
        .first();
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
      const legacyId = pair.legacyId;
      const canonicalId = pair.canonicalId;

      const legacyI18n = await ctx.db
        .query("plantI18n")
        .withIndex("by_plant_locale", (q: any) => q.eq("plantId", legacyId))
        .collect();
      for (const row of legacyI18n) {
        const existing = await ctx.db
          .query("plantI18n")
          .withIndex("by_plant_locale", (q: any) =>
            q.eq("plantId", canonicalId).eq("locale", row.locale)
          )
          .unique();
        if (!existing) {
          if (!dryRun) {
            await ctx.db.insert("plantI18n", {
              plantId: canonicalId,
              locale: row.locale,
              commonName: row.commonName,
              description: row.description ?? undefined,
              careContent: row.careContent ?? undefined,
              contentVersion: row.contentVersion ?? undefined,
            });
          }
          i18nMerged += 1;
        }
        if (!dryRun) {
          await ctx.db.delete(row._id);
        }
      }

      const userPlants = await ctx.db.query("userPlants").collect();
      for (const row of userPlants) {
        if (!idEquals((row as any).plantMasterId, legacyId)) continue;
        if (!dryRun) {
          await ctx.db.patch((row as any)._id, { plantMasterId: canonicalId });
        }
        userPlantsRewired += 1;
      }

      const favorites = await ctx.db
        .query("userFavorites")
        .withIndex("by_plant", (q: any) => q.eq("plantMasterId", legacyId))
        .collect();
      for (const row of favorites) {
        const collision = await ctx.db
          .query("userFavorites")
          .withIndex("by_user_plant", (q: any) =>
            q.eq("userId", row.userId).eq("plantMasterId", canonicalId)
          )
          .first();
        if (!dryRun) {
          if (collision) {
            await ctx.db.delete((row as any)._id);
          } else {
            await ctx.db.patch((row as any)._id, { plantMasterId: canonicalId });
          }
        }
        favoritesRewired += 1;
      }

      const recipes = await ctx.db.query("preservationRecipes").collect();
      for (const recipe of recipes) {
        const suitablePlants = ((recipe as any).suitablePlants ?? []) as any[];
        if (!suitablePlants.some((id) => idEquals(id, legacyId))) continue;
        const replaced = dedupeIdArray(
          suitablePlants.map((id) => (idEquals(id, legacyId) ? canonicalId : id))
        );
        if (!dryRun) {
          await ctx.db.patch((recipe as any)._id, { suitablePlants: replaced });
        }
        recipesRewired += 1;
      }

      const masterRows = await ctx.db.query("plantsMaster").collect();
      for (const row of masterRows) {
        const companion = (((row as any).companionPlants ?? []) as any[]);
        const avoid = (((row as any).avoidPlants ?? []) as any[]);
        const companionHit = companion.some((id) => idEquals(id, legacyId));
        const avoidHit = avoid.some((id) => idEquals(id, legacyId));
        if (!companionHit && !avoidHit) continue;

        const patch: Record<string, unknown> = {};
        if (companionHit) {
          patch.companionPlants = dedupeIdArray(
            companion.map((id) => (idEquals(id, legacyId) ? canonicalId : id))
          );
        }
        if (avoidHit) {
          patch.avoidPlants = dedupeIdArray(
            avoid.map((id) => (idEquals(id, legacyId) ? canonicalId : id))
          );
        }
        if (!dryRun) {
          await ctx.db.patch((row as any)._id, patch);
        }
        masterLinksRewired += 1;
      }

      if (!dryRun) {
        await ctx.db.delete(legacyId);
      }
      merged += 1;
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
