import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdminServiceToken } from "./lib/adminAuth";

export const migrateLegacyPlantMasterFields = mutation({
  args: {
    serviceToken: v.string(),
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const dryRun = args.dryRun ?? true;
    const rows = await ctx.db.query("plantsMaster").collect();
    const limit = Math.max(1, Math.min(args.limit ?? rows.length, rows.length || 1));

    let migrated = 0;
    let skipped = 0;
    for (const row of (rows as any[]).slice(0, limit)) {
      const needsCleanup =
        row.companionPlants !== undefined ||
        row.avoidPlants !== undefined ||
        row.description !== undefined ||
        row.groupBasePlantId !== undefined ||
        row.uiGroupKey !== undefined ||
        row.uiGroupLabelVi !== undefined ||
        row.uiGroupLabelEn !== undefined ||
        row.genusNormalized !== undefined ||
        row.speciesNormalized !== undefined ||
        row.cultivarNormalized !== undefined;

      if (!needsCleanup) {
        skipped += 1;
        continue;
      }

      if (!dryRun) {
        // Preserve every current canonical field and remove only fields that
        // this legacy migration owns.
        await ctx.db.patch(row._id, {
          companionPlants: undefined,
          avoidPlants: undefined,
          description: undefined,
          groupBasePlantId: undefined,
          uiGroupKey: undefined,
          uiGroupLabelVi: undefined,
          uiGroupLabelEn: undefined,
          genusNormalized: undefined,
          speciesNormalized: undefined,
          cultivarNormalized: undefined,
        } as any);
      }

      migrated += 1;
    }

    return {
      dryRun,
      scanned: Math.min(limit, rows.length),
      migrated,
      skipped,
    };
  },
});
