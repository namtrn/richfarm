import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

export type SyncEntityType = 'garden' | 'bed' | 'plant' | 'activity' | 'harvest' | 'photo';

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

export async function getTombstone(
  ctx: MutationCtx,
  userId: Id<'users'>,
  entityType: SyncEntityType,
  entityUuid: string
) {
  return await ctx.db
    .query('entityTombstones')
    .withIndex('by_user_entity', (q) =>
      q.eq('userId', userId).eq('entityType', entityType).eq('entityUuid', entityUuid)
    )
    .unique();
}

export async function writeTombstone(
  ctx: MutationCtx,
  input: {
    userId: Id<'users'>;
    entityType: SyncEntityType;
    entityUuid: string;
    deleteOperationId: string;
    previousRevision?: number;
  }
) {
  const existing = await getTombstone(ctx, input.userId, input.entityType, input.entityUuid);
  if (existing) return existing;
  const deletedAt = Date.now();
  const deletedRevision = (input.previousRevision ?? 1) + 1;
  const id = await ctx.db.insert('entityTombstones', {
    userId: input.userId,
    entityType: input.entityType,
    entityUuid: input.entityUuid,
    deleteOperationId: input.deleteOperationId,
    deletedAt,
    deletedRevision,
  });
  return await ctx.db.get(id);
}

export async function checkReceipt(
  ctx: MutationCtx,
  userId: Id<'users'>,
  operationId: string,
  fingerprint: string
) {
  const receipt = await ctx.db
    .query('syncOperationReceipts')
    .withIndex('by_user_operation', (q) =>
      q.eq('userId', userId).eq('operationId', operationId)
    )
    .unique();
  if (!receipt) return { status: 'missing' as const };
  return receipt.fingerprint === fingerprint
    ? {
        status: 'matched' as const,
        receiptStatus: receipt.status,
        revision: receipt.revision,
      }
    : { status: 'operation_conflict' as const };
}

export async function recordReceipt(
  ctx: MutationCtx,
  input: {
    userId: Id<'users'>;
    operationId: string;
    entityType: SyncEntityType;
    entityUuid: string;
    operationType: 'create' | 'update' | 'delete';
    fingerprint: string;
    status: string;
    revision?: number;
  }
) {
  await ctx.db.insert('syncOperationReceipts', { ...input, appliedAt: Date.now() });
}

/** Invalidates syncSignal for writes that still enter through compatibility mutations. */
export async function markSyncDatasetChanged(ctx: MutationCtx, userId: Id<'users'>) {
  const state = await ctx.db.query('syncAccountState')
    .withIndex('by_user', (q) => q.eq('userId', userId)).unique();
  const now = Date.now();
  if (state) {
    await ctx.db.patch(state._id, { updatedAt: now, sequence: (state.sequence ?? 0) + 1 });
    return;
  }
  await ctx.db.insert('syncAccountState', {
    userId,
    generation: `sync:${userId}:${now}`,
    createdAt: now,
    updatedAt: now,
    sequence: 1,
  });
}

export async function recordSyncOutcome(
  ctx: MutationCtx,
  input: { appVersion?: string; entityType: string; status: string }
) {
  const bucket = new Date().toISOString().slice(0, 13);
  const appVersion = input.appVersion?.trim() || 'unknown';
  const existing = await ctx.db.query('syncOutcomeMetrics')
    .withIndex('by_bucket_dimensions', (q) =>
      q.eq('bucket', bucket).eq('appVersion', appVersion).eq('entityType', input.entityType).eq('status', input.status)
    ).unique();
  if (existing) {
    await ctx.db.patch(existing._id, { count: existing.count + 1, updatedAt: Date.now() });
  } else {
    await ctx.db.insert('syncOutcomeMetrics', {
      bucket, appVersion, entityType: input.entityType, status: input.status, count: 1, updatedAt: Date.now(),
    });
  }
}
