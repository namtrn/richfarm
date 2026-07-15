import { mutation, query } from './_generated/server';
import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';

const domainValidator = v.union(
  v.literal('garden'), v.literal('bed'), v.literal('plant'),
  v.literal('activity'), v.literal('harvest'), v.literal('photo')
);

function legacyUuid(id: string) {
  return `legacy:${id}`;
}

export const dryRun = query({
  args: { sampleLimit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.sampleLimit ?? 500, 1000));
    const [gardens, beds, plants, activities, harvests, photos] = await Promise.all([
      ctx.db.query('gardens').take(limit), ctx.db.query('beds').take(limit),
      ctx.db.query('userPlants').take(limit), ctx.db.query('logs').take(limit),
      ctx.db.query('harvestRecords').take(limit), ctx.db.query('plantPhotos').take(limit),
    ]);
    const rows = { garden: gardens, bed: beds, plant: plants, activity: activities, harvest: harvests, photo: photos };
    const report: Record<string, { sampled: number; missingUuid: number; missingRevision: number; duplicateCandidates: number }> = {};
    for (const [domain, domainRows] of Object.entries(rows)) {
      const candidates = domainRows.map((row) => row.entityUuid ?? legacyUuid(String(row._id)));
      report[domain] = {
        sampled: domainRows.length,
        missingUuid: domainRows.filter((row) => !row.entityUuid).length,
        missingRevision: domainRows.filter((row) => !row.revision).length,
        duplicateCandidates: candidates.length - new Set(candidates).size,
      };
    }
    return { limit, report, truncated: Object.values(rows).some((domainRows) => domainRows.length === limit) };
  },
});

export const backfillPage = mutation({
  args: { domain: domainValidator, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await (() => {
      switch (args.domain) {
        case 'garden': return ctx.db.query('gardens').paginate(args.paginationOpts);
        case 'bed': return ctx.db.query('beds').paginate(args.paginationOpts);
        case 'plant': return ctx.db.query('userPlants').paginate(args.paginationOpts);
        case 'activity': return ctx.db.query('logs').paginate(args.paginationOpts);
        case 'harvest': return ctx.db.query('harvestRecords').paginate(args.paginationOpts);
        case 'photo': return ctx.db.query('plantPhotos').paginate(args.paginationOpts);
      }
    })();
    let changed = 0;
    for (const row of page.page) {
      if (row.entityUuid && row.revision) continue;
      await ctx.db.patch(row._id, {
        ...(!row.entityUuid && { entityUuid: legacyUuid(String(row._id)) }),
        ...(!row.revision && { revision: 1 }),
      });
      changed++;
    }
    return { domain: args.domain, changed, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});
