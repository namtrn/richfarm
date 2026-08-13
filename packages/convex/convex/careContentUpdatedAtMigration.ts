import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { requireAdminServiceToken } from './lib/adminAuth';

const DEFAULT_CONTENT_UPDATED_AT = Date.parse('2026-07-13T00:00:00.000Z');
const RECENT_CONTENT_UPDATED_AT = Date.parse('2026-08-13T00:00:00.000Z');
const RECENT_STABLE_IDENTITIES = new Set([
  'sqlite:459',
  'sqlite:983',
]);
const RECENT_LOCALES = new Set(['vi', 'en']);

/**
 * One-time, idempotent dev release backfill for the user-visible care date.
 * The exceptional Basella rows are resolved by sourceSystem/sourceId, never
 * by mutable display or scientific names.
 */
export const backfill = mutation({
  args: {
    serviceToken: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const dryRun = args.dryRun !== false;
    const [plants, careRows] = await Promise.all([
      ctx.db.query('plantsMaster').collect(),
      ctx.db.query('plantCareI18n').collect(),
    ]);
    const identityById = new Map(plants.map((plant: any) => [
      String(plant._id),
      `${plant.sourceSystem ?? ''}:${plant.sourceId ?? ''}`,
    ]));
    const eligible = careRows.filter((row: any) =>
      row.contentStatus === 'published' &&
      typeof row.careContent === 'string' &&
      row.careContent.trim() !== '',
    );
    const recent = eligible.filter((row: any) =>
      RECENT_STABLE_IDENTITIES.has(identityById.get(String(row.plantId)) ?? '') &&
      RECENT_LOCALES.has(row.locale),
    );

    if (recent.length !== 4) {
      throw new Error(`Expected 4 recent Basella locale rows by stable identity; found ${recent.length}`);
    }

    let changed = 0;
    for (const row of eligible) {
      const isRecent = recent.some((candidate: any) => candidate._id === row._id);
      const contentUpdatedAt = isRecent ? RECENT_CONTENT_UPDATED_AT : DEFAULT_CONTENT_UPDATED_AT;
      if (row.contentUpdatedAt === contentUpdatedAt) continue;
      changed += 1;
      if (!dryRun) await ctx.db.patch(row._id, { contentUpdatedAt });
    }

    return {
      dryRun,
      scanned: careRows.length,
      eligible: eligible.length,
      recent: recent.length,
      changed,
      defaultContentUpdatedAt: DEFAULT_CONTENT_UPDATED_AT,
      recentContentUpdatedAt: RECENT_CONTENT_UPDATED_AT,
      recentIdentities: [...RECENT_STABLE_IDENTITIES],
    };
  },
});
