import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { upsertPlantCareProfile } from "./lib/plantCare";

export const migratePlantMasterCareProfile = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("plantsMaster").collect();
    const limit = Math.max(1, Math.min(args.limit ?? rows.length, rows.length || 1));
    let migrated = 0;
    let cleaned = 0;

    for (const row of (rows as any[]).slice(0, limit)) {
      const payload = {
        typicalDaysToHarvest: row.typicalDaysToHarvest,
        germinationDays: row.germinationDays,
        lightRequirements: row.lightRequirements,
        soilPref: row.soilPref,
        spacingCm: row.spacingCm,
        maxPlantsPerM2: row.maxPlantsPerM2,
        seedRatePerM2: row.seedRatePerM2,
        waterLitersPerM2: row.waterLitersPerM2,
        yieldKgPerM2: row.yieldKgPerM2,
        wateringFrequencyDays: row.wateringFrequencyDays,
        fertilizingFrequencyDays: row.fertilizingFrequencyDays,
      };
      const hasLegacyCare = Object.values(payload).some((value) => value !== undefined);
      if (!hasLegacyCare) continue;

      await upsertPlantCareProfile(ctx, row._id, payload);
      migrated += 1;

      await ctx.db.replace(row._id, {
        scientificName: row.scientificName,
        genus: row.genus ?? undefined,
        species: row.species ?? undefined,
        cultivar: row.cultivar ?? undefined,
        taxonomyParseStatus: row.taxonomyParseStatus ?? undefined,
        group: row.group,
        basePlantId: row.basePlantId ?? undefined,
        commonNameGroupKey: row.commonNameGroupKey ?? undefined,
        commonNameGroupVi: row.commonNameGroupVi ?? undefined,
        commonNameGroupEn: row.commonNameGroupEn ?? undefined,
        family: row.family ?? undefined,
        purposes: row.purposes ?? [],
        pestsDiseases: row.pestsDiseases ?? undefined,
        imageUrl: row.imageUrl ?? undefined,
        source: row.source ?? undefined,
      });
      cleaned += 1;
    }

    return { migrated, cleaned, scanned: Math.min(limit, rows.length) };
  },
});
