import { mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  buildTaxonomyFields,
  DEFAULT_CULTIVAR_NORMALIZED,
  isInfraspecificCultivar,
  matchesTaxonomyIdentity,
  requireTaxonomyIdentity,
  taxonomyFieldsForStorage,
  withComputedPlantTaxonomy,
} from "./lib/plantTaxonomy";
import { upsertPlantCareProfile } from "./lib/plantCare";
import { requireAdminAccess } from "./lib/admin";

const backendRowValidator = v.object({
  id: v.number(),
  plant_code: v.string(),
  common_name: v.string(),
  scientific_name: v.optional(v.union(v.string(), v.null())),
  category: v.string(),
  group: v.string(),
  family: v.optional(v.union(v.string(), v.null())),
  purposes: v.array(v.string()),
  growth_stage: v.string(),
  typical_days_to_harvest: v.optional(v.union(v.number(), v.null())),
  germination_days: v.optional(v.union(v.number(), v.null())),
  soil_ph_min: v.optional(v.union(v.number(), v.null())),
  soil_ph_max: v.optional(v.union(v.number(), v.null())),
  moisture_target: v.optional(v.union(v.number(), v.null())),
  light_hours: v.optional(v.union(v.number(), v.null())),
  spacing_cm: v.optional(v.union(v.number(), v.null())),
  water_liters_per_m2: v.optional(v.union(v.number(), v.null())),
  yield_kg_per_m2: v.optional(v.union(v.number(), v.null())),
  image_url: v.optional(v.union(v.string(), v.null())),
  is_active: v.boolean(),
  notes: v.optional(v.union(v.string(), v.null())),
  metadata_json: v.optional(v.any()),
  i18n: v.object({
    vi: v.object({
      common_name: v.string(),
      description: v.optional(v.string()),
    }),
    en: v.object({
      common_name: v.string(),
      description: v.optional(v.string()),
    }),
  }),
  created_at: v.string(),
  updated_at: v.string(),
});

const sourceValidator = v.union(v.literal("sqlite"), v.literal("manual"));

function toScientificName(row: { scientific_name?: string | null; common_name: string; plant_code: string }): string {
  const normalized = (row.scientific_name ?? "").trim();
  if (normalized) {
    return normalized;
  }

  return `${row.common_name.trim()} (${row.plant_code.trim()})`;
}

function extractCultivar(row: { metadata_json?: any }) {
  if (!row.metadata_json || typeof row.metadata_json !== "object") {
    return undefined;
  }
  const raw = row.metadata_json.cultivar;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

async function assertBaseExistsForVariant(ctx: any, taxonomy: {
  genusNormalized: string;
  speciesNormalized: string;
  cultivarNormalized: string;
}) {
  if (taxonomy.cultivarNormalized === DEFAULT_CULTIVAR_NORMALIZED) {
    return;
  }
  if (isInfraspecificCultivar(taxonomy.cultivarNormalized)) {
    return;
  }

  const base = (await ctx.db.query("plantsMaster").collect())
    .map(withComputedPlantTaxonomy)
    .find((plant: any) =>
      matchesTaxonomyIdentity(plant, {
        genusNormalized: taxonomy.genusNormalized,
        speciesNormalized: taxonomy.speciesNormalized,
        cultivarNormalized: DEFAULT_CULTIVAR_NORMALIZED,
      }),
    );

  if (!base) {
    throw new Error(
      `Backend row requires base species before variant: ${taxonomy.genusNormalized} ${taxonomy.speciesNormalized}`
    );
  }
}

export const upsertPlantFromBackend = mutation({
  args: {
    adminKey: v.string(),
    source: sourceValidator,
    row: backendRowValidator,
  },
  handler: async (ctx, args) => {
    requireAdminAccess(args.adminKey);
    const scientificName = toScientificName(args.row);
    const cultivar = extractCultivar(args.row);
    const taxonomy = buildTaxonomyFields({ scientificName, cultivar });
    const taxonomyIdentity = requireTaxonomyIdentity(
      taxonomy,
      `Backend row ${args.row.id}`
    );
    await assertBaseExistsForVariant(ctx, taxonomyIdentity);

    const existing = (await ctx.db.query("plantsMaster").collect())
      .map(withComputedPlantTaxonomy)
      .find((plant: any) => matchesTaxonomyIdentity(plant, taxonomyIdentity));

    const patch = {
      scientificName,
      description: args.row.notes ?? undefined,
      group: args.row.group || "other",
      family: args.row.family ?? undefined,
      purposes: args.row.purposes,
      growthStage: args.row.growth_stage,
      imageUrl: args.row.image_url ?? undefined,
      isActive: args.row.is_active,
      source: `backend:${args.source}:id_${args.row.id}`,
      ...taxonomyFieldsForStorage(taxonomy),
    };

    let plantId = existing?._id;

    if (!plantId) {
      plantId = await ctx.db.insert("plantsMaster", patch);
    } else {
      await ctx.db.patch(plantId, patch);
    }
    await upsertPlantCareProfile(ctx, plantId, {
      typicalDaysToHarvest: args.row.typical_days_to_harvest ?? undefined,
      germinationDays: args.row.germination_days ?? undefined,
      lightRequirements: args.row.light_hours ? `hours_${args.row.light_hours}` : undefined,
      soilPref:
        args.row.soil_ph_min != null || args.row.soil_ph_max != null
          ? `ph_${args.row.soil_ph_min ?? "x"}_${args.row.soil_ph_max ?? "x"}`
          : undefined,
      wateringFrequencyDays:
        args.row.moisture_target != null
          ? Math.max(1, Math.round((100 - args.row.moisture_target) / 10))
          : undefined,
      spacingCm: args.row.spacing_cm ?? undefined,
      waterLitersPerM2: args.row.water_liters_per_m2 ?? undefined,
      yieldKgPerM2: args.row.yield_kg_per_m2 ?? undefined,
    });

    const locales = [
      { locale: "vi", data: args.row.i18n.vi },
      { locale: "en", data: args.row.i18n.en },
    ];

    for (const item of locales) {
      const existingI18n = await ctx.db
        .query("plantI18n")
        .withIndex("by_plant_locale", (q) => q.eq("plantId", plantId).eq("locale", item.locale))
        .first();

      if (!existingI18n) {
        await ctx.db.insert("plantI18n", {
          plantId,
          locale: item.locale,
          commonName: item.data.common_name,
          description: item.data.description ?? undefined,
        });
      } else {
        await ctx.db.patch(existingI18n._id, {
          commonName: item.data.common_name,
          description: item.data.description ?? undefined,
        });
      }
    }

    return { action: existing ? "updated" : "inserted", id: plantId };
  },
});

export const deletePlantFromBackend = mutation({
  args: {
    adminKey: v.string(),
    source: sourceValidator,
    id: v.number(),
  },
  handler: async (ctx, args) => {
    requireAdminAccess(args.adminKey);
    const sourceTag = `backend:${args.source}:id_${args.id}`;
    const candidate = await ctx.db
      .query("plantsMaster")
      .filter((q) => q.eq(q.field("source"), sourceTag))
      .first();

    if (!candidate) {
      return { action: "noop" as const };
    }

    await ctx.db.delete(candidate._id);
    return { action: "deleted" as const, id: candidate._id };
  },
});
