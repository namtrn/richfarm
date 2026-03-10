import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const migrateLegacyPlantMasterFields = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
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
