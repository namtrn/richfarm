import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdminServiceToken } from "./lib/adminAuth";
import { normalizePropagationMethods } from "../../shared/src/plantPropagation";
import { upsertPlantCareProfile } from "./lib/plantCare";

const LEGACY_SOURCE_TO_METHOD = {
  seed: "seed",
  cutting: "stem_cutting",
  bulb: "bulb",
} as const;

type LegacySource = keyof typeof LEGACY_SOURCE_TO_METHOD;

function legacySource(value: unknown): LegacySource | undefined {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized in LEGACY_SOURCE_TO_METHOD ? normalized as LegacySource : undefined;
}

/**
 * Backfill the legacy `plantsMaster.source` propagation values into care.
 *
 * This mutation is intentionally separate from canonical metadata backfill:
 * operators must run it first, while source values are still intact. It never
 * reads or rewrites plantCare/plantCareI18n provenance fields.
 */
export const migrateLegacyPropagationMethods = mutation({
  args: {
    serviceToken: v.string(),
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const dryRun = args.dryRun ?? true;
    const allRows = (await ctx.db.query("plantsMaster").collect()) as any[];
    const requestedLimit = args.limit === undefined ? 500 : Math.floor(args.limit);
    const limit = Math.max(1, Math.min(500, Number.isFinite(requestedLimit) ? requestedLimit : 500));
    const candidates = allRows
      .sort((left: any, right: any) => String(left._id).localeCompare(String(right._id)))
      .filter((row: any) => !args.cursor || String(row._id) > args.cursor);
    // Fetch one sentinel row so callers can distinguish an exact final page
    // from a page that happens to be full and continue with nextCursor.
    const rows = candidates.slice(0, limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const report = {
      dryRun,
      scanned: page.length,
      eligible: 0,
      migrated: 0,
      alreadyMigrated: 0,
      cleaned: 0,
      remaining: 0,
      manualReview: 0,
      failures: [] as Array<{ id: string; source: string; reason: string }>,
      bySource: {
        seed: { eligible: 0, migrated: 0, alreadyMigrated: 0, manualReview: 0, remaining: 0 },
        cutting: { eligible: 0, migrated: 0, alreadyMigrated: 0, manualReview: 0, remaining: 0 },
        bulb: { eligible: 0, migrated: 0, alreadyMigrated: 0, manualReview: 0, remaining: 0 },
      },
      mustRunBeforeBackfillCanonicalMetadata: true,
    };

    for (const row of page) {
      const rawSource = typeof row.source === "string" ? row.source.trim().toLowerCase() : "";
      if (!rawSource) continue;
      const source = legacySource(rawSource);
      if (!source) {
        const bySource = report.bySource as Record<string, {
          eligible: number;
          migrated: number;
          alreadyMigrated: number;
          manualReview: number;
          remaining: number;
        }>;
        const bucket = bySource[rawSource] ?? (bySource[rawSource] = {
          eligible: 0,
          migrated: 0,
          alreadyMigrated: 0,
          manualReview: 0,
          remaining: 0,
        });
        report.manualReview += 1;
        bucket.manualReview += 1;
        report.remaining += 1;
        bucket.remaining += 1;
        continue;
      }
      const sourceSystem = typeof row.sourceSystem === "string" ? row.sourceSystem.trim() : "";
      const sourceId = typeof row.sourceId === "string" ? row.sourceId.trim() : "";
      const signatureBackfill = sourceSystem === "convex" && sourceId === String(row._id);
      const eligible = (!sourceSystem && !sourceId) || signatureBackfill;
      if (!eligible) {
        report.manualReview += 1;
        report.bySource[source].manualReview += 1;
        report.remaining += 1;
        report.bySource[source].remaining += 1;
        continue;
      }

      report.eligible += 1;
      report.bySource[source].eligible += 1;
      const existing = await ctx.db
        .query("plantCare")
        .withIndex("by_plant", (q: any) => q.eq("plantId", row._id))
        .unique();
      const methods = normalizePropagationMethods([
        ...(existing?.propagationMethods ?? []),
        LEGACY_SOURCE_TO_METHOD[source],
      ]);
      if (!methods) {
        report.remaining += 1;
        report.bySource[source].remaining += 1;
        report.failures.push({ id: String(row._id), source, reason: "normalization produced no method" });
        continue;
      }
      const alreadyHadMethod = existing?.propagationMethods?.includes(LEGACY_SOURCE_TO_METHOD[source]) ?? false;
      if (alreadyHadMethod) {
        report.alreadyMigrated += 1;
        report.bySource[source].alreadyMigrated += 1;
      }
      if (dryRun) {
        report.remaining += 1;
        report.bySource[source].remaining += 1;
        continue;
      }

      try {
        await upsertPlantCareProfile(ctx, row._id, { propagationMethods: methods });
        const after = await ctx.db
          .query("plantCare")
          .withIndex("by_plant", (q: any) => q.eq("plantId", row._id))
          .unique();
        if (!after?.propagationMethods?.includes(LEGACY_SOURCE_TO_METHOD[source])) {
          throw new Error("care profile read-back did not contain mapped method");
        }
        await ctx.db.patch(row._id, { source: undefined });
        report.cleaned += 1;
        if (!alreadyHadMethod) {
          report.migrated += 1;
          report.bySource[source].migrated += 1;
        }
      } catch (error) {
        report.remaining += 1;
        report.bySource[source].remaining += 1;
        report.failures.push({
          id: String(row._id),
          source,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      ...report,
      hasMore,
      nextCursor: hasMore ? String(page[page.length - 1]?._id ?? "") : null,
    };
  },
});
