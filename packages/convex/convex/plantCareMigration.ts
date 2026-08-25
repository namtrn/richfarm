import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getPlantCareProfileByPlantId, upsertPlantCareProfile } from "./lib/plantCare";
import { requireAdminServiceToken } from "./lib/adminAuth";
import { bumpReconciliationCatalog } from "./lib/reconciliationCatalog";

// These fields existed on plantsMaster before care became its own canonical
// document. Keep the list explicit so a future schema edit cannot silently
// drop another legacy field during the cutover.
const LEGACY_CARE_FIELDS = [
  "typicalDaysToHarvest",
  "germinationDays",
  "lightRequirements",
  "soilPref",
  "spacingCm",
  "maxPlantsPerM2",
  "seedRatePerM2",
  "waterLitersPerM2",
  "yieldKgPerM2",
  "wateringFrequencyDays",
  "fertilizingFrequencyDays",
  "soilPhMin",
  "soilPhMax",
  "moistureTarget",
  "lightHours",
] as const;

function hasLegacyValue(value: unknown): boolean {
  // Numeric zero is valid for these fields; only absent/null values are
  // treated as missing during the migration.
  return value !== undefined && value !== null;
}

export const migratePlantMasterCareProfile = mutation({
  args: {
    serviceToken: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    // Safe default: production operators must pass dryRun: false explicitly.
    const dryRun = args.dryRun ?? true;
    const allRows = (await ctx.db.query("plantsMaster").collect()) as any[];
    const requestedLimit = args.limit === undefined
      ? allRows.length || 1
      : Math.floor(args.limit);
    const limit = Math.max(1, Math.min(requestedLimit, allRows.length || 1));
    const candidates = allRows
      .sort((left: any, right: any) => String(left._id).localeCompare(String(right._id)))
      .filter((row: any) => !args.cursor || String(row._id) > args.cursor);
    const rows = candidates.slice(0, limit);
    let migrated = 0;
    let cleaned = 0;
    let alreadyMigrated = 0;
    let remaining = 0;
    const conflicts: Array<{ id: string; fields: string[] }> = [];
    const failures: Array<{ id: string; reason: string }> = [];

    for (const row of rows) {
      const legacyValues: Record<string, unknown> = {};
      for (const field of LEGACY_CARE_FIELDS) {
        if (hasLegacyValue(row[field])) legacyValues[field] = row[field];
      }
      const hasLegacyCare = Object.keys(legacyValues).length > 0;
      if (!hasLegacyCare) continue;
      // In dry-run mode every candidate remains on plantsMaster by design;
      // the count is a page-level rollout gate for the eventual schema cutover.
      if (dryRun) remaining += 1;

      const existing = await getPlantCareProfileByPlantId(ctx, row._id);
      const payload: Record<string, unknown> = {};
      const conflictingFields: string[] = [];
      for (const [field, value] of Object.entries(legacyValues)) {
        if (existing?.[field] === undefined) payload[field] = value;
        else if (existing[field] !== value) conflictingFields.push(field);
      }
      if (conflictingFields.length > 0) {
        conflicts.push({ id: String(row._id), fields: conflictingFields });
      }

      // A previously completed migration can be safely re-run. Do not
      // overwrite a curated care value with a stale copy from plantsMaster.
      if (Object.keys(payload).length === 0 && conflictingFields.length === 0) {
        alreadyMigrated += 1;
      }

      if (!dryRun && Object.keys(payload).length > 0) {
        try {
          await upsertPlantCareProfile(ctx, row._id, payload as any);
          const after = await getPlantCareProfileByPlantId(ctx, row._id);
          for (const [field, value] of Object.entries(payload)) {
            if (after?.[field] !== value) {
              throw new Error(`care profile read-back mismatch for ${field}`);
            }
          }
          migrated += 1;
        } catch (error) {
          failures.push({
            id: String(row._id),
            reason: error instanceof Error ? error.message : String(error),
          });
          remaining += 1;
          continue;
        }
      }

      if (!dryRun) {
        // Remove only fields that are now represented in plantCare. Conflicts
        // stay on the legacy row for manual review instead of losing data.
        const clearPatch: Record<string, undefined> = {};
        for (const field of Object.keys(legacyValues)) {
          if (!conflictingFields.includes(field)) clearPatch[field] = undefined;
        }
        if (Object.keys(clearPatch).length > 0) {
          try {
            await ctx.db.patch(row._id, clearPatch as any);
            await bumpReconciliationCatalog(ctx);
            cleaned += 1;
          } catch (error) {
            failures.push({
              id: String(row._id),
              reason: error instanceof Error ? error.message : String(error),
            });
            remaining += 1;
            continue;
          }
        }
        if (conflictingFields.length > 0) remaining += 1;
      }
    }

    const hasMore = candidates.length > rows.length;
    return {
      dryRun,
      migrated,
      cleaned,
      alreadyMigrated,
      remaining,
      conflicts,
      failures,
      scanned: rows.length,
      hasMore,
      nextCursor: hasMore ? String(rows[rows.length - 1]?._id ?? "") : null,
    };
  },
});
