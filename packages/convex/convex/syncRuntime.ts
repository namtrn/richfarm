import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import { requireUser } from './lib/user';
import { recordSyncOutcome } from './lib/syncProtocol';

const CONFIG_KEY = 'phase-1.5';
export const DEFAULT_SYNC_THRESHOLDS = {
  conflictRate: 0.02,
  wrongGenerationRate: 0.01,
  retryableRate: 0.05,
  quarantineRate: 0.02,
  minimumSampleSize: 100,
};

function compareVersions(left: string, right: string) {
  const parse = (value: string) => value.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function validateThresholds(thresholds: typeof DEFAULT_SYNC_THRESHOLDS) {
  for (const key of ['conflictRate', 'wrongGenerationRate', 'retryableRate', 'quarantineRate'] as const) {
    const value = thresholds[key];
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`INVALID_SYNC_THRESHOLD:${key}`);
    }
  }
  if (!Number.isInteger(thresholds.minimumSampleSize) || thresholds.minimumSampleSize < 1) {
    throw new Error('INVALID_SYNC_THRESHOLD:minimumSampleSize');
  }
}

export async function assertLegacyWriteAllowed(ctx: MutationCtx, clientVersion?: string) {
  const config = await ctx.db.query('syncRuntimeConfig').withIndex('by_key', (q) => q.eq('key', CONFIG_KEY)).unique();
  if (config?.legacyEnforcementAt === undefined || Date.now() < config.legacyEnforcementAt) return;
  if (!clientVersion || compareVersions(clientVersion, config.minimumSafeClientVersion) < 0) {
    throw new Error('SYNC_CLIENT_UPGRADE_REQUIRED');
  }
}

export const configure = internalMutation({
  args: {
    minimumSafeClientVersion: v.string(),
    legacyEnforcementAt: v.optional(v.number()),
    rolloutPaused: v.boolean(),
    pauseReason: v.optional(v.string()),
    thresholds: v.optional(v.object({
      conflictRate: v.number(), wrongGenerationRate: v.number(), retryableRate: v.number(),
      quarantineRate: v.number(), minimumSampleSize: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const thresholds = args.thresholds ?? DEFAULT_SYNC_THRESHOLDS;
    if (!args.minimumSafeClientVersion.trim()) throw new Error('INVALID_MINIMUM_SAFE_CLIENT_VERSION');
    validateThresholds(thresholds);
    const current = await ctx.db.query('syncRuntimeConfig').withIndex('by_key', (q) => q.eq('key', CONFIG_KEY)).unique();
    const value = { key: CONFIG_KEY, ...args, thresholds, updatedAt: Date.now() };
    if (current) {
      await ctx.db.patch(current._id, value);
      return current._id;
    }
    return await ctx.db.insert('syncRuntimeConfig', value);
  },
});

export const policy = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query('syncRuntimeConfig').withIndex('by_key', (q) => q.eq('key', CONFIG_KEY)).unique();
    return config ?? {
      key: CONFIG_KEY,
      minimumSafeClientVersion: '1.0.0',
      rolloutPaused: false,
      thresholds: DEFAULT_SYNC_THRESHOLDS,
      updatedAt: 0,
    };
  },
});

export const recordClientOutcome = mutation({
  args: {
    deviceId: v.optional(v.string()),
    appVersion: v.string(),
    entityType: v.string(),
    status: v.union(v.literal('quarantined'), v.literal('retryable_error')),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.deviceId);
    await recordSyncOutcome(ctx, args);
    return null;
  },
});

export const recordOutcome = internalMutation({
  args: {
    appVersion: v.optional(v.string()),
    entityType: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await recordSyncOutcome(ctx, args);
    return null;
  },
});

function resolveObservationWindow(args: {
  bucket?: string;
  startBucket?: string;
  endBucket?: string;
}) {
  const exactBucket = args.bucket?.trim();
  const startBucket = args.startBucket?.trim();
  const endBucket = args.endBucket?.trim();
  if (exactBucket && (startBucket || endBucket)) {
    throw new Error('INVALID_ROLLOUT_OBSERVATION_WINDOW');
  }
  if (Boolean(startBucket) !== Boolean(endBucket)) {
    throw new Error('INVALID_ROLLOUT_OBSERVATION_WINDOW');
  }
  const start = exactBucket || startBucket || new Date().toISOString().slice(0, 13);
  const end = exactBucket || endBucket || start;
  if (!start || !end || start > end) {
    throw new Error('INVALID_ROLLOUT_OBSERVATION_WINDOW');
  }
  return {
    startBucket: start,
    endBucket: end,
    label: start === end ? start : `${start}..${end}`,
  };
}

export const rolloutHealth = query({
  args: {
    bucket: v.optional(v.string()),
    startBucket: v.optional(v.string()),
    endBucket: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const observationWindow = resolveObservationWindow(args);
    const rows = await ctx.db.query('syncOutcomeMetrics')
      .withIndex('by_bucket_dimensions', (q) => q
        .gte('bucket', observationWindow.startBucket)
        .lte('bucket', observationWindow.endBucket))
      .collect();
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    const count = (statuses: string[]) => rows.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row.count, 0);
    const config = await ctx.db.query('syncRuntimeConfig').withIndex('by_key', (q) => q.eq('key', CONFIG_KEY)).unique();
    const thresholds = config?.thresholds ?? DEFAULT_SYNC_THRESHOLDS;
    const rates = {
      conflictRate: total ? count(['operation_conflict', 'revision_conflict']) / total : 0,
      wrongGenerationRate: total ? count(['wrong_generation']) / total : 0,
      retryableRate: total ? count(['retryable_error']) / total : 0,
      quarantineRate: total ? count(['quarantined']) / total : 0,
    };
    const breached = total >= thresholds.minimumSampleSize
      ? Object.entries(rates)
        .filter(([key, rate]) => {
          const threshold = thresholds[key as keyof typeof rates];
          // A configured zero threshold means zero tolerance, but a healthy
          // zero-error bucket should not pause merely because 0 >= 0.
          return rate > 0 && rate >= threshold;
        })
        .map(([key]) => key)
      : [];
    return {
      bucket: observationWindow.label,
      observationWindow: {
        startBucket: observationWindow.startBucket,
        endBucket: observationWindow.endBucket,
      },
      total,
      rates,
      thresholds,
      breached,
      shouldPause: Boolean(config?.rolloutPaused || breached.length),
    };
  },
});
