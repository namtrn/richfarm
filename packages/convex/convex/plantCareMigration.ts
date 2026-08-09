import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { upsertPlantCareProfile } from "./lib/plantCare";
import { requireAdminServiceToken } from "./lib/adminAuth";

export const migratePlantMasterCareProfile = mutation({
  args: {
    serviceToken: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
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

      // Remove only the legacy fields. A replace with a hand-written subset
      // would silently drop Phase 3 source, active, review, and care metadata.
      await ctx.db.patch(row._id, {
        typicalDaysToHarvest: undefined,
        germinationDays: undefined,
        lightRequirements: undefined,
        soilPref: undefined,
        spacingCm: undefined,
        maxPlantsPerM2: undefined,
        seedRatePerM2: undefined,
        waterLitersPerM2: undefined,
        yieldKgPerM2: undefined,
        wateringFrequencyDays: undefined,
        fertilizingFrequencyDays: undefined,
      } as any);
      cleaned += 1;
    }

    return { migrated, cleaned, scanned: Math.min(limit, rows.length) };
  },
});
