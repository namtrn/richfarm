import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { getUserByIdentityOrDevice, getOrCreateUserFromIdentity } from './lib/user';
import {
  canonicalize,
  checkReceipt,
  getTombstone,
  recordReceipt,
  writeTombstone,
  type SyncEntityType,
} from './lib/syncProtocol';
import { appendPlantActivity, recomputeActivitySnapshot } from './lib/plantActivities';
import { isPremiumActive } from './lib/subscription';

const entityTypeValidator = v.union(
  v.literal('garden'), v.literal('bed'), v.literal('plant'),
  v.literal('activity'), v.literal('harvest'), v.literal('photo')
);
const operationTypeValidator = v.union(
  v.literal('create'), v.literal('update'), v.literal('delete')
);
const MANUAL_ACTIVITY_TYPES = new Set([
  'watering', 'fertilizing', 'pruning', 'pest_spotted', 'treatment',
  'photo', 'note', 'transplanted', 'harvest', 'custom',
]);

type OperationType = 'create' | 'update' | 'delete';
type ParentRefs = { gardenUuid?: string | null; bedUuid?: string | null; plantUuid?: string | null };
type Operation = {
  operationId: string;
  syncGeneration: string;
  entityType: SyncEntityType;
  entityUuid: string;
  type: OperationType;
  baseRevision?: number;
  parentRefs?: ParentRefs;
  payload?: unknown;
};

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') return {};
  return payload as Record<string, unknown>;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

async function lookupEntity(
  ctx: MutationCtx,
  userId: Id<'users'>,
  entityType: SyncEntityType,
  entityUuid: string
): Promise<any | null> {
  switch (entityType) {
    case 'garden': return await ctx.db.query('gardens').withIndex('by_user_entity_uuid', (q) => q.eq('userId', userId).eq('entityUuid', entityUuid)).unique();
    case 'bed': return await ctx.db.query('beds').withIndex('by_user_entity_uuid', (q) => q.eq('userId', userId).eq('entityUuid', entityUuid)).unique();
    case 'plant': return await ctx.db.query('userPlants').withIndex('by_user_entity_uuid', (q) => q.eq('userId', userId).eq('entityUuid', entityUuid)).unique();
    case 'activity': return await ctx.db.query('logs').withIndex('by_user_entity_uuid', (q) => q.eq('userId', userId).eq('entityUuid', entityUuid)).unique();
    case 'harvest': return await ctx.db.query('harvestRecords').withIndex('by_user_entity_uuid', (q) => q.eq('userId', userId).eq('entityUuid', entityUuid)).unique();
    case 'photo': return await ctx.db.query('plantPhotos').withIndex('by_user_entity_uuid', (q) => q.eq('userId', userId).eq('entityUuid', entityUuid)).unique();
  }
}

async function resolveParents(
  ctx: MutationCtx,
  userId: Id<'users'>,
  refs?: ParentRefs,
  options?: { allowGardenBedMismatch?: boolean }
) {
  const garden = refs?.gardenUuid ? await lookupEntity(ctx, userId, 'garden', refs.gardenUuid) : null;
  const bed = refs?.bedUuid ? await lookupEntity(ctx, userId, 'bed', refs.bedUuid) : null;
  const plant = refs?.plantUuid ? await lookupEntity(ctx, userId, 'plant', refs.plantUuid) : null;
  if (refs?.gardenUuid && (!garden || garden.isDeleted)) return { error: 'garden_missing_or_deleted' as const };
  if (refs?.bedUuid && !bed) return { error: 'bed_missing_or_deleted' as const };
  if (refs?.plantUuid && (!plant || plant.isDeleted)) return { error: 'plant_missing_or_deleted' as const };
  if (!options?.allowGardenBedMismatch && bed && garden && bed.gardenId !== garden._id) {
    return { error: 'garden_bed_mismatch' as const };
  }
  return { garden, bed, plant };
}

async function createEntity(ctx: MutationCtx, userId: Id<'users'>, op: Operation) {
  const payload = payloadRecord(op.payload);
  const parents = await resolveParents(ctx, userId, op.parentRefs);
  if ('error' in parents) return { status: 'invalid_parent' as const, reason: parents.error };
  const now = Date.now();
  switch (op.entityType) {
    case 'garden': {
      const name = stringValue(payload.name);
      const locationType = stringValue(payload.locationType);
      if (!name || !locationType) return { status: 'invalid_parent' as const, reason: 'invalid_garden_payload' };
      const owner = await ctx.db.get(userId);
      if (!isPremiumActive(owner)) {
        const existing = await ctx.db.query('gardens').withIndex('by_user', (q) => q.eq('userId', userId))
          .filter((q) => q.neq(q.field('isDeleted'), true)).take(1);
        if (existing.length >= 1) return { status: 'invalid_parent' as const, reason: 'garden_limit_free' };
      }
      await ctx.db.insert('gardens', {
        userId, entityUuid: op.entityUuid, revision: 1, name, locationType,
        areaM2: numberValue(payload.areaM2), description: stringValue(payload.description), isDeleted: false,
      });
      break;
    }
    case 'bed': {
      const name = stringValue(payload.name);
      const locationType = stringValue(payload.locationType);
      if (!name || !locationType) return { status: 'invalid_parent' as const, reason: 'invalid_bed_payload' };
      const owner = await ctx.db.get(userId);
      if (!isPremiumActive(owner)) {
        const existing = await ctx.db.query('beds').withIndex('by_user', (q) => q.eq('userId', userId)).take(3);
        if (existing.length >= 3) return { status: 'invalid_parent' as const, reason: 'bed_limit_free' };
      }
      await ctx.db.insert('beds', {
        userId, entityUuid: op.entityUuid, revision: 1, name, locationType,
        gardenId: parents.bed?.gardenId ?? parents.garden?._id,
        bedType: stringValue(payload.bedType), tiers: numberValue(payload.tiers),
        dimensions: objectValue(payload.dimensions) as any,
        areaM2: numberValue(payload.areaM2), sunlightHours: numberValue(payload.sunlightHours),
        soilType: stringValue(payload.soilType), layoutJson: stringValue(payload.layoutJson),
      });
      break;
    }
    case 'plant': {
      const status = stringValue(payload.status);
      if (!status) return { status: 'invalid_parent' as const, reason: 'invalid_plant_payload' };
      const plantMasterId = stringValue(payload.plantMasterId)
        ? ctx.db.normalizeId('plantsMaster', stringValue(payload.plantMasterId)!) ?? undefined
        : undefined;
      const plantId = await ctx.db.insert('userPlants', {
        userId, entityUuid: op.entityUuid, revision: 1, version: 1, status,
        plantMasterId, nickname: stringValue(payload.nickname), notes: stringValue(payload.notes),
        gardenId: parents.bed?.gardenId ?? parents.garden?._id,
        bedId: parents.bed?._id,
        positionInBed: objectValue(payload.positionInBed) as any,
        plantedAt: numberValue(payload.plantedAt), seedStartDate: numberValue(payload.seedStartDate),
        transplantDate: numberValue(payload.transplantDate),
        expectedHarvestDate: numberValue(payload.expectedHarvestDate), isDeleted: false,
      });
      await appendPlantActivity(ctx, {
        userId, userPlantId: plantId, type: 'plant_added', occurredAt: now, source: 'system',
        value: { initialStatus: status, plantMasterId },
      });
      if (status === 'growing') {
        await appendPlantActivity(ctx, {
          userId, userPlantId: plantId, type: 'status_changed', occurredAt: now, source: 'system',
          value: { fromStatus: null, toStatus: 'growing' },
        });
      }
      break;
    }
    case 'activity': {
      if (!parents.plant) return { status: 'invalid_parent' as const, reason: 'plant_required' };
      const type = stringValue(payload.type);
      if (!type || !MANUAL_ACTIVITY_TYPES.has(type)) {
        return { status: 'invalid_parent' as const, reason: 'invalid_activity_type' };
      }
      await ctx.db.insert('logs', {
        userId, userPlantId: parents.plant._id, entityUuid: op.entityUuid, revision: 1,
        localId: op.entityUuid, type, occurredAt: numberValue(payload.occurredAt) ?? now,
        recordedAt: now, source: 'manual', note: stringValue(payload.note), title: stringValue(payload.title),
        value: payload.value,
      });
      const snapshot = await recomputeActivitySnapshot(ctx, parents.plant._id, type);
      if (Object.keys(snapshot).length) await ctx.db.patch(parents.plant._id, snapshot);
      break;
    }
    case 'harvest': {
      if (!parents.plant) return { status: 'invalid_parent' as const, reason: 'plant_required' };
      const harvestDate = numberValue(payload.harvestDate) ?? now;
      const harvestId = await ctx.db.insert('harvestRecords', {
        userId, userPlantId: parents.plant._id, entityUuid: op.entityUuid, revision: 1,
        localId: op.entityUuid, harvestDate, quantity: numberValue(payload.quantity),
        unit: stringValue(payload.unit), quality: stringValue(payload.quality), notes: stringValue(payload.notes),
      });
      await ctx.db.insert('logs', {
        userId, userPlantId: parents.plant._id, entityUuid: `harvest-log:${op.entityUuid}`, revision: 1,
        localId: `harvest:${op.entityUuid}`, type: 'harvest', occurredAt: harvestDate,
        recordedAt: now, source: 'manual', note: stringValue(payload.notes), harvestRecordId: harvestId,
        value: { quantity: numberValue(payload.quantity), unit: stringValue(payload.unit) },
      });
      const snapshot = await recomputeActivitySnapshot(ctx, parents.plant._id, 'harvest');
      await ctx.db.patch(parents.plant._id, snapshot);
      break;
    }
    case 'photo': {
      if (!parents.plant) return { status: 'invalid_parent' as const, reason: 'plant_required' };
      const storageValue = stringValue(payload.storageId);
      if (!storageValue) return { status: 'invalid_parent' as const, reason: 'storage_id_required' };
      const storageId = storageValue as Id<'_storage'>;
      const photoUrl = await ctx.storage.getUrl(storageId);
      if (!photoUrl) return { status: 'invalid_parent' as const, reason: 'storage_not_found' };
      await ctx.db.insert('plantPhotos', {
        userId, userPlantId: parents.plant._id, entityUuid: op.entityUuid, revision: 1,
        localId: op.entityUuid, storageId, photoUrl,
        takenAt: numberValue(payload.takenAt) ?? now, uploadedAt: now,
        isPrimary: booleanValue(payload.isPrimary) ?? false,
        source: stringValue(payload.source) ?? 'gallery', analysisStatus: 'pending',
      });
      const reservation = await ctx.db.query('syncUploadReservations')
        .withIndex('by_user_operation', (q) => q.eq('userId', userId).eq('operationId', op.operationId))
        .unique();
      if (reservation && reservation.storageId === storageId && reservation.entityUuid === op.entityUuid) {
        await ctx.db.patch(reservation._id, { committedAt: now });
      }
      break;
    }
  }
  return { status: 'applied' as const, revision: 1 };
}

async function updateEntity(ctx: MutationCtx, userId: Id<'users'>, op: Operation, entity: any) {
  const currentRevision = entity.revision ?? 1;
  if (op.baseRevision !== currentRevision) return { status: 'revision_conflict' as const, revision: currentRevision };
  const payload = payloadRecord(op.payload);
  const parents = await resolveParents(ctx, userId, op.parentRefs, {
    // Plant updates validate the resulting state below. This lets a Garden-only
    // move detach an incompatible existing Bed instead of rejecting too early.
    allowGardenBedMismatch: op.entityType === 'plant',
  });
  if ('error' in parents) return { status: 'invalid_parent' as const, reason: parents.error };
  const revision = currentRevision + 1;
  switch (op.entityType) {
    case 'garden':
      await ctx.db.patch(entity._id, {
        ...(stringValue(payload.name) !== undefined && { name: stringValue(payload.name)! }),
        ...(stringValue(payload.locationType) !== undefined && { locationType: stringValue(payload.locationType)! }),
        ...(numberValue(payload.areaM2) !== undefined && { areaM2: numberValue(payload.areaM2) }),
        ...(stringValue(payload.bedType) !== undefined && { bedType: stringValue(payload.bedType) }),
        ...(numberValue(payload.tiers) !== undefined && { tiers: numberValue(payload.tiers) }),
        ...(objectValue(payload.dimensions) !== undefined && { dimensions: objectValue(payload.dimensions) as any }),
        ...(numberValue(payload.sunlightHours) !== undefined && { sunlightHours: numberValue(payload.sunlightHours) }),
        ...(stringValue(payload.soilType) !== undefined && { soilType: stringValue(payload.soilType) }),
        ...(stringValue(payload.description) !== undefined && { description: stringValue(payload.description) }),
        revision,
      });
      break;
    case 'bed': {
      const gardenId = op.parentRefs?.gardenUuid === null ? undefined : (parents.garden?._id ?? entity.gardenId);
      if (gardenId !== entity.gardenId) {
        const assignedPlant = await ctx.db.query('userPlants')
          .withIndex('by_bed', (q) => q.eq('bedId', entity._id)).first();
        if (assignedPlant) return { status: 'invalid_parent' as const, reason: 'bed_not_empty' };
      }
      await ctx.db.patch(entity._id, {
        ...(stringValue(payload.name) !== undefined && { name: stringValue(payload.name)! }),
        ...(stringValue(payload.locationType) !== undefined && { locationType: stringValue(payload.locationType)! }),
        ...(numberValue(payload.areaM2) !== undefined && { areaM2: numberValue(payload.areaM2) }),
        ...(op.parentRefs?.gardenUuid !== undefined && { gardenId }), revision,
      });
      break;
    }
    case 'plant': {
      const previousGardenId = entity.gardenId;
      const previousBedId = entity.bedId;
      const previousStatus = entity.status;
      const currentBed = entity.bedId ? await ctx.db.get(entity.bedId) : null;
      const finalBed = op.parentRefs?.bedUuid === undefined
        ? currentBed
        : op.parentRefs.bedUuid === null ? null : parents.bed;
      const requestedGarden = op.parentRefs?.gardenUuid === undefined
        ? entity.gardenId
        : op.parentRefs.gardenUuid === null ? undefined : parents.garden?._id;
      if (
        finalBed
        && op.parentRefs?.gardenUuid !== undefined
        && op.parentRefs?.bedUuid !== undefined
        && requestedGarden !== finalBed.gardenId
      ) {
        return { status: 'invalid_parent' as const, reason: 'garden_bed_mismatch' };
      }
      const finalBedIsCompatible = !finalBed || requestedGarden === undefined || finalBed.gardenId === requestedGarden;
      const nextBed = finalBedIsCompatible ? finalBed : null;
      const nextGarden = nextBed?.gardenId ?? requestedGarden;
      await ctx.db.patch(entity._id, {
        ...(stringValue(payload.status) !== undefined && { status: stringValue(payload.status)! }),
        ...(stringValue(payload.nickname) !== undefined && { nickname: stringValue(payload.nickname) }),
        ...(stringValue(payload.notes) !== undefined && { notes: stringValue(payload.notes) }),
        ...(stringValue(payload.plantMasterId) !== undefined && {
          plantMasterId: ctx.db.normalizeId('plantsMaster', stringValue(payload.plantMasterId)!) ?? undefined,
        }),
        ...(objectValue(payload.positionInBed) !== undefined && { positionInBed: objectValue(payload.positionInBed) as any }),
        ...(op.parentRefs?.bedUuid === null && { positionInBed: undefined }),
        ...(numberValue(payload.expectedHarvestDate) !== undefined && { expectedHarvestDate: numberValue(payload.expectedHarvestDate) }),
        ...(op.parentRefs?.bedUuid !== undefined || !finalBedIsCompatible ? { bedId: nextBed?._id } : {}),
        ...(op.parentRefs?.gardenUuid !== undefined || op.parentRefs?.bedUuid !== undefined || !finalBedIsCompatible
          ? { gardenId: nextGarden }
          : {}),
        revision, version: (entity.version ?? 1) + 1,
      });
      const nextStatus = stringValue(payload.status) ?? previousStatus;
      if (nextStatus !== previousStatus) {
        await appendPlantActivity(ctx, {
          userId, userPlantId: entity._id, type: 'status_changed', source: 'system',
          value: { fromStatus: previousStatus, toStatus: nextStatus },
        });
      }
      if (nextGarden !== previousGardenId || nextBed?._id !== previousBedId) {
        await appendPlantActivity(ctx, {
          userId, userPlantId: entity._id, type: 'location_changed', source: 'system',
          value: {
            fromGardenId: previousGardenId, fromBedId: previousBedId,
            gardenId: nextGarden, bedId: nextBed?._id,
          },
        });
      }
      break;
    }
    case 'activity': {
      await ctx.db.patch(entity._id, {
        ...(numberValue(payload.occurredAt) !== undefined && { occurredAt: numberValue(payload.occurredAt) }),
        ...(stringValue(payload.note) !== undefined && { note: stringValue(payload.note) }),
        ...(stringValue(payload.title) !== undefined && { title: stringValue(payload.title) }), revision,
      });
      const snapshot = await recomputeActivitySnapshot(ctx, entity.userPlantId, entity.type);
      if (Object.keys(snapshot).length) await ctx.db.patch(entity.userPlantId, snapshot);
      break;
    }
    case 'harvest': {
      await ctx.db.patch(entity._id, {
        ...(numberValue(payload.harvestDate) !== undefined && { harvestDate: numberValue(payload.harvestDate) }),
        ...(numberValue(payload.quantity) !== undefined && { quantity: numberValue(payload.quantity) }),
        ...(stringValue(payload.unit) !== undefined && { unit: stringValue(payload.unit) }),
        ...(stringValue(payload.quality) !== undefined && { quality: stringValue(payload.quality) }),
        ...(stringValue(payload.notes) !== undefined && { notes: stringValue(payload.notes) }), revision,
      });
      const logs = await ctx.db.query('logs').withIndex('by_harvest_record', (q) => q.eq('harvestRecordId', entity._id)).collect();
      for (const log of logs) {
        await ctx.db.patch(log._id, {
          ...(numberValue(payload.harvestDate) !== undefined && { occurredAt: numberValue(payload.harvestDate) }),
          ...(stringValue(payload.notes) !== undefined && { note: stringValue(payload.notes) }),
        });
      }
      const snapshot = await recomputeActivitySnapshot(ctx, entity.userPlantId, 'harvest');
      await ctx.db.patch(entity.userPlantId, snapshot);
      break;
    }
    case 'photo':
      await ctx.db.patch(entity._id, {
        ...(numberValue(payload.takenAt) !== undefined && { takenAt: numberValue(payload.takenAt) }),
        ...(booleanValue(payload.isPrimary) !== undefined && { isPrimary: booleanValue(payload.isPrimary)! }),
        revision,
      });
      break;
  }
  return { status: 'applied' as const, revision };
}

async function deleteEntity(ctx: MutationCtx, userId: Id<'users'>, op: Operation, entity: any) {
  const currentRevision = entity.revision ?? 1;
  if (op.baseRevision !== currentRevision) return { status: 'revision_conflict' as const, revision: currentRevision };
  const tombstone = await writeTombstone(ctx, {
    userId, entityType: op.entityType, entityUuid: op.entityUuid,
    deleteOperationId: op.operationId, previousRevision: currentRevision,
  });
  const revision = tombstone?.deletedRevision ?? currentRevision + 1;
  switch (op.entityType) {
    case 'garden': {
      const beds = await ctx.db.query('beds').withIndex('by_garden', (q) => q.eq('gardenId', entity._id)).collect();
      for (const bed of beds) {
        const bedUuid = bed.entityUuid ?? `legacy:${bed._id}`;
        await writeTombstone(ctx, { userId, entityType: 'bed', entityUuid: bedUuid, deleteOperationId: op.operationId, previousRevision: bed.revision });
        await ctx.db.delete(bed._id);
      }
      const plants = await ctx.db.query('userPlants').withIndex('by_garden', (q) => q.eq('gardenId', entity._id)).collect();
      for (const plant of plants) await ctx.db.patch(plant._id, { gardenId: undefined, bedId: undefined, revision: (plant.revision ?? 1) + 1, version: (plant.version ?? 1) + 1 });
      await ctx.db.patch(entity._id, { isDeleted: true, revision });
      break;
    }
    case 'bed': {
      const plants = await ctx.db.query('userPlants').withIndex('by_bed', (q) => q.eq('bedId', entity._id)).collect();
      for (const plant of plants) await ctx.db.patch(plant._id, { bedId: undefined, revision: (plant.revision ?? 1) + 1, version: (plant.version ?? 1) + 1 });
      await ctx.db.delete(entity._id);
      break;
    }
    case 'plant': await ctx.db.patch(entity._id, { isDeleted: true, revision, version: (entity.version ?? 1) + 1 }); break;
    case 'activity': {
      await ctx.db.delete(entity._id);
      const snapshot = await recomputeActivitySnapshot(ctx, entity.userPlantId, entity.type);
      if (Object.keys(snapshot).length) await ctx.db.patch(entity.userPlantId, snapshot);
      break;
    }
    case 'harvest': {
      const logs = await ctx.db.query('logs').withIndex('by_harvest_record', (q) => q.eq('harvestRecordId', entity._id)).collect();
      for (const log of logs) await ctx.db.delete(log._id);
      await ctx.db.delete(entity._id);
      const snapshot = await recomputeActivitySnapshot(ctx, entity.userPlantId, 'harvest');
      await ctx.db.patch(entity.userPlantId, snapshot);
      break;
    }
    case 'photo': await ctx.db.delete(entity._id); break;
  }
  return { status: 'applied' as const, revision };
}

export const ensureSession = mutation({
  args: { deviceId: v.optional(v.string()), appVersion: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getOrCreateUserFromIdentity(ctx, args.deviceId);
    if (!user) return null;
    const existing = await ctx.db.query('syncAccountState').withIndex('by_user', (q) => q.eq('userId', user._id)).unique();
    if (existing) return { userId: user._id, generation: existing.generation };
    const now = Date.now();
    const generation = `sync:${user._id}:${now}`;
    await ctx.db.insert('syncAccountState', { userId: user._id, generation, createdAt: now, updatedAt: now, sequence: 0 });
    return { userId: user._id, generation };
  },
});

export const applyOperation = mutation({
  args: {
    deviceId: v.optional(v.string()), operationId: v.string(), syncGeneration: v.string(),
    appVersion: v.optional(v.string()),
    entityType: entityTypeValidator, entityUuid: v.string(), type: operationTypeValidator,
    baseRevision: v.optional(v.number()),
    parentRefs: v.optional(v.object({
      gardenUuid: v.optional(v.union(v.string(), v.null())),
      bedUuid: v.optional(v.union(v.string(), v.null())),
      plantUuid: v.optional(v.union(v.string(), v.null())),
    })),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const finish = async <T extends { status: string }>(result: T) => {
      await ctx.scheduler.runAfter(0, internal.syncRuntime.recordOutcome, {
        appVersion: args.appVersion,
        entityType: args.entityType,
        status: result.status,
      });
      return result;
    };
    const user = await getUserByIdentityOrDevice(ctx, args.deviceId);
    if (!user) return await finish({ status: 'unauthorized' as const, operationId: args.operationId });
    const state = await ctx.db.query('syncAccountState').withIndex('by_user', (q) => q.eq('userId', user._id)).unique();
    if (!state || state.generation !== args.syncGeneration) return await finish({ status: 'wrong_generation' as const, operationId: args.operationId });
    const fingerprint = canonicalize({ entityType: args.entityType, entityUuid: args.entityUuid, type: args.type, baseRevision: args.baseRevision, parentRefs: args.parentRefs, payload: args.payload });
    const prior = await checkReceipt(ctx, user._id, args.operationId, fingerprint);
    if (prior.status === 'operation_conflict') return await finish({ status: 'operation_conflict' as const, operationId: args.operationId });
    if (prior.status === 'matched') return await finish({
      status: (prior.receiptStatus === 'applied' ? 'already_applied' : prior.receiptStatus) as any,
      operationId: args.operationId,
      revision: prior.revision,
    });
    const op: Operation = args;
    const tombstone = await getTombstone(ctx, user._id, op.entityType, op.entityUuid);
    if (tombstone) {
      await recordReceipt(ctx, { userId: user._id, operationId: op.operationId, entityType: op.entityType, entityUuid: op.entityUuid, operationType: op.type, fingerprint, status: 'discarded_deleted', revision: tombstone.deletedRevision });
      return await finish({ status: 'discarded_deleted' as const, operationId: op.operationId, revision: tombstone.deletedRevision });
    }
    const entity = await lookupEntity(ctx, user._id, op.entityType, op.entityUuid);
    let result;
    if (op.type === 'create') result = entity ? { status: 'discarded_stale' as const, revision: entity.revision ?? 1 } : await createEntity(ctx, user._id, op);
    else if (!entity) result = { status: 'missing_target' as const };
    else if (op.entityType === 'activity' && (entity.source !== 'manual' || entity.harvestRecordId)) {
      result = { status: 'invalid_parent' as const, reason: 'protected_activity' };
    }
    else if (op.type === 'update') result = await updateEntity(ctx, user._id, op, entity);
    else result = await deleteEntity(ctx, user._id, op, entity);
    if (!['revision_conflict', 'invalid_parent', 'missing_target'].includes(result.status)) {
      await recordReceipt(ctx, { userId: user._id, operationId: op.operationId, entityType: op.entityType, entityUuid: op.entityUuid, operationType: op.type, fingerprint, status: result.status, revision: 'revision' in result ? result.revision : undefined });
    }
    if (result.status === 'applied') {
      await ctx.db.patch(state._id, { updatedAt: Date.now(), sequence: (state.sequence ?? 0) + 1 });
    }
    return await finish({ ...result, operationId: op.operationId });
  },
});

export const syncSignal = query({
  args: { deviceId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getUserByIdentityOrDevice(ctx, args.deviceId);
    if (!user) return null;
    const state = await ctx.db.query('syncAccountState')
      .withIndex('by_user', (q) => q.eq('userId', user._id)).unique();
    return state ? { generation: state.generation, sequence: state.sequence ?? 0 } : null;
  },
});

const domainValidator = v.union(
  v.literal('garden'), v.literal('bed'), v.literal('plant'), v.literal('activity'),
  v.literal('harvest'), v.literal('photo'), v.literal('tombstone')
);

export const snapshotPage = query({
  args: { deviceId: v.optional(v.string()), generation: v.string(), domain: domainValidator, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await getUserByIdentityOrDevice(ctx, args.deviceId);
    if (!user) return { status: 'unauthorized' as const };
    const state = await ctx.db.query('syncAccountState').withIndex('by_user', (q) => q.eq('userId', user._id)).unique();
    if (!state || state.generation !== args.generation) return { status: 'wrong_generation' as const };
    switch (args.domain) {
      case 'garden': return { status: 'ok' as const, domain: args.domain, ...(await ctx.db.query('gardens').withIndex('by_user', (q) => q.eq('userId', user._id)).paginate(args.paginationOpts)) };
      case 'bed': return { status: 'ok' as const, domain: args.domain, ...(await ctx.db.query('beds').withIndex('by_user', (q) => q.eq('userId', user._id)).paginate(args.paginationOpts)) };
      case 'plant': return { status: 'ok' as const, domain: args.domain, ...(await ctx.db.query('userPlants').withIndex('by_user', (q) => q.eq('userId', user._id)).paginate(args.paginationOpts)) };
      case 'activity': return { status: 'ok' as const, domain: args.domain, ...(await ctx.db.query('logs').withIndex('by_user_entity_uuid', (q) => q.eq('userId', user._id)).paginate(args.paginationOpts)) };
      case 'harvest': return { status: 'ok' as const, domain: args.domain, ...(await ctx.db.query('harvestRecords').withIndex('by_user_entity_uuid', (q) => q.eq('userId', user._id)).paginate(args.paginationOpts)) };
      case 'photo': return { status: 'ok' as const, domain: args.domain, ...(await ctx.db.query('plantPhotos').withIndex('by_user_entity_uuid', (q) => q.eq('userId', user._id)).paginate(args.paginationOpts)) };
      case 'tombstone': return { status: 'ok' as const, domain: args.domain, ...(await ctx.db.query('entityTombstones').withIndex('by_user_deleted_at', (q) => q.eq('userId', user._id)).paginate(args.paginationOpts)) };
    }
  },
});
