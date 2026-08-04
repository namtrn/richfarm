import { internalMutation, internalQuery } from './_generated/server';
import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';

const domainValidator = v.union(
  v.literal('garden'), v.literal('bed'), v.literal('plant'),
  v.literal('activity'), v.literal('harvest'), v.literal('photo')
);

function legacyUuid(id: string) {
  return `legacy:${id}`;
}

const BACKFILLABLE_ISSUES = new Set(['missing_uuid', 'missing_revision']);

function nonBackfillableIssues(issues: string[]) {
  return issues.filter((issue) => !BACKFILLABLE_ISSUES.has(issue));
}

async function inspectRow(ctx: any, domain: string, row: any) {
  const issues: string[] = [];
  if (!row.userId) issues.push('missing_owner');
  if (!row.entityUuid) issues.push('missing_uuid');
  if (!row.revision) issues.push('missing_revision');
  if (row.entityUuid && row.userId) {
    const matches = await (() => {
      switch (domain) {
        case 'garden': return ctx.db.query('gardens').withIndex('by_user_entity_uuid', (q: any) => q.eq('userId', row.userId).eq('entityUuid', row.entityUuid)).collect();
        case 'bed': return ctx.db.query('beds').withIndex('by_user_entity_uuid', (q: any) => q.eq('userId', row.userId).eq('entityUuid', row.entityUuid)).collect();
        case 'plant': return ctx.db.query('userPlants').withIndex('by_user_entity_uuid', (q: any) => q.eq('userId', row.userId).eq('entityUuid', row.entityUuid)).collect();
        case 'activity': return ctx.db.query('logs').withIndex('by_user_entity_uuid', (q: any) => q.eq('userId', row.userId).eq('entityUuid', row.entityUuid)).collect();
        case 'harvest': return ctx.db.query('harvestRecords').withIndex('by_user_entity_uuid', (q: any) => q.eq('userId', row.userId).eq('entityUuid', row.entityUuid)).collect();
        case 'photo': return ctx.db.query('plantPhotos').withIndex('by_user_entity_uuid', (q: any) => q.eq('userId', row.userId).eq('entityUuid', row.entityUuid)).collect();
        default: return Promise.resolve([]);
      }
    })();
    if (matches.length > 1) issues.push('duplicate_uuid');
  }
  const parent = async (id: any, label: string) => {
    if (!id) return null;
    try {
      const value = await ctx.db.get(id);
      if (!value) issues.push(`${label}_missing`);
      else if (value.userId !== row.userId) issues.push(`${label}_ownership_mismatch`);
      else if (value.isDeleted === true) issues.push(`${label}_deleted`);
      return value;
    } catch {
      // A malformed legacy reference must be reported as a manual-review row,
      // not abort the cursor and leave the rest of the dataset unaudited.
      issues.push(`${label}_invalid`);
      return null;
    }
  };
  if (domain === 'bed') await parent(row.gardenId, 'garden');
  if (domain === 'plant') {
    const garden = await parent(row.gardenId, 'garden');
    const bed = await parent(row.bedId, 'bed');
    if (bed && garden && bed.gardenId !== garden._id) issues.push('garden_bed_mismatch');
    if (bed && !garden) issues.push('garden_required_for_bed');
  }
  if (domain === 'activity' || domain === 'harvest' || domain === 'photo') {
    await parent(row.userPlantId, 'plant');
  }
  return issues;
}

export const dryRun = internalQuery({
  args: { sampleLimit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.sampleLimit ?? 500, 1000));
    const [gardens, beds, plants, activities, harvests, photos] = await Promise.all([
      ctx.db.query('gardens').take(limit), ctx.db.query('beds').take(limit),
      ctx.db.query('userPlants').take(limit), ctx.db.query('logs').take(limit),
      ctx.db.query('harvestRecords').take(limit), ctx.db.query('plantPhotos').take(limit),
    ]);
    const rows = { garden: gardens, bed: beds, plant: plants, activity: activities, harvest: harvests, photo: photos };
    const report: Record<string, { sampled: number; missingUuid: number; missingRevision: number; duplicateCandidates: number; brokenParents: number; ownershipMismatches: number; manualReview: number }> = {};
    for (const [domain, domainRows] of Object.entries(rows)) {
      const candidates = domainRows.map((row) => `${row.userId}:${row.entityUuid ?? legacyUuid(String(row._id))}`);
      const issues = await Promise.all(domainRows.map((row) => inspectRow(ctx, domain, row)));
      report[domain] = {
        sampled: domainRows.length,
        missingUuid: domainRows.filter((row) => !row.entityUuid).length,
        missingRevision: domainRows.filter((row) => !row.revision).length,
        duplicateCandidates: candidates.length - new Set(candidates).size,
        brokenParents: issues.filter((rowIssues) => rowIssues.some((issue) => issue.endsWith('_missing') || issue === 'garden_bed_mismatch')).length,
        ownershipMismatches: issues.filter((rowIssues) => rowIssues.some((issue) => issue.endsWith('_ownership_mismatch'))).length,
        manualReview: issues.filter((rowIssues) => rowIssues.some((issue) => !['missing_uuid', 'missing_revision'].includes(issue))).length,
      };
    }
    return { limit, report, truncated: Object.values(rows).some((domainRows) => domainRows.length === limit) };
  },
});

export const auditPage = internalQuery({
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
    const issueRows = [];
    for (const row of page.page) {
      const issues = await inspectRow(ctx, args.domain, row);
      if (issues.length) {
        issueRows.push({
          id: String(row._id),
          userId: String(row.userId),
          issues,
          backfillable: nonBackfillableIssues(issues).length === 0,
        });
      }
    }
    return {
      domain: args.domain,
      inspected: page.page.length,
      issueRows,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const backfillPage = internalMutation({
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
    const manualReviewRows: Array<{ id: string; userId: string; issues: string[] }> = [];
    for (const row of page.page) {
      const issues = await inspectRow(ctx, args.domain, row);
      const manualIssues = nonBackfillableIssues(issues);
      if (manualIssues.length) {
        manualReviewRows.push({ id: String(row._id), userId: String(row.userId), issues: manualIssues });
        continue;
      }
      if (row.entityUuid && row.revision) continue;
      await ctx.db.patch(row._id, {
        ...(!row.entityUuid && { entityUuid: legacyUuid(String(row._id)) }),
        ...(!row.revision && { revision: 1 }),
      });
      changed++;
    }
    return {
      domain: args.domain,
      changed,
      skipped: manualReviewRows.length,
      manualReviewRows,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});
