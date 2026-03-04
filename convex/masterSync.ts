import { mutation } from "./_generated/server";
import { v } from "convex/values";

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

export const upsertPlantFromBackend = mutation({
  args: {
    source: sourceValidator,
    row: backendRowValidator,
  },
  handler: async (ctx, args) => {
    const scientificName = toScientificName(args.row);

    const existing = await ctx.db
      .query("plantsMaster")
      .withIndex("by_scientific_name", (q) => q.eq("scientificName", scientificName))
      .first();

    const commonNames = [{ locale: "vi", name: args.row.common_name }];

    const patch = {
      scientificName,
      description: args.row.notes ?? undefined,
      commonNames,
      group: args.row.group || "other",
      family: args.row.family ?? undefined,
      purposes: args.row.purposes,
      growthStage: args.row.growth_stage,
      typicalDaysToHarvest: args.row.typical_days_to_harvest ?? undefined,
      germinationDays: args.row.germination_days ?? undefined,
      lightRequirements: args.row.light_hours ? `hours_${args.row.light_hours}` : undefined,
      soilPref:
        args.row.soil_ph_min != null || args.row.soil_ph_max != null
          ? `ph_${args.row.soil_ph_min ?? "x"}_${args.row.soil_ph_max ?? "x"}`
          : undefined,
      wateringFrequencyDays: args.row.moisture_target != null ? Math.max(1, Math.round((100 - args.row.moisture_target) / 10)) : undefined,
      spacingCm: args.row.spacing_cm ?? undefined,
      waterLitersPerM2: args.row.water_liters_per_m2 ?? undefined,
      yieldKgPerM2: args.row.yield_kg_per_m2 ?? undefined,
      imageUrl: args.row.image_url ?? undefined,
      isActive: args.row.is_active,
      source: `backend:${args.source}:id_${args.row.id}`,
    };

    if (!existing) {
      const inserted = await ctx.db.insert("plantsMaster", patch);
      return { action: "inserted", id: inserted };
    }

    await ctx.db.patch(existing._id, patch);
    return { action: "updated", id: existing._id };
  },
});

export const deletePlantFromBackend = mutation({
  args: {
    source: sourceValidator,
    id: v.number(),
  },
  handler: async (ctx, args) => {
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
