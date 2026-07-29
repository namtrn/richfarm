import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ConvexReactClient } from 'convex/react';
import { api } from '../../../../packages/convex/convex/_generated/api';
import type { EntityOperationPayload, EntityType, SyncPhotoPayload } from './types';
import { loadOutbox, type OutboxEnvelope } from './queue';

type SnapshotDomain = EntityType | 'tombstone';
export type ProjectionEnvelope = {
  version: 1;
  scope: string;
  generation: string;
  hydratedAt: number;
  complete: boolean;
  entities: Record<EntityType, Record<string, unknown>>;
  tombstones: Record<string, unknown>;
};

const domains: SnapshotDomain[] = [
  'tombstone', 'garden', 'bed', 'plant', 'activity', 'harvest', 'photo',
  'carePlan', 'reminder', 'reminderOutcome',
];
const projectionListeners = new Set<(scope: string) => void>();

function notifyProjectionListeners(scope: string) {
  for (const listener of projectionListeners) listener(scope);
}

export function subscribeAuthoritativeProjection(scope: string, listener: () => void) {
  const wrapped = (changedScope: string) => {
    if (changedScope === scope) listener();
  };
  projectionListeners.add(wrapped);
  return () => projectionListeners.delete(wrapped);
}

function projectionKey(scope: string) {
  return `rf_sync_projection_v1_${encodeURIComponent(scope)}`;
}

function emptyProjection(scope: string, generation: string): ProjectionEnvelope {
  return {
    version: 1,
    scope,
    generation,
    hydratedAt: Date.now(),
    complete: false,
    entities: {
      garden: {}, bed: {}, plant: {}, activity: {}, harvest: {}, photo: {},
      carePlan: {}, reminder: {}, reminderOutcome: {},
    },
    tombstones: {},
  };
}

export async function loadAuthoritativeProjection(scope: string) {
  const raw = await AsyncStorage.getItem(projectionKey(scope));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ProjectionEnvelope;
    return parsed.version === 1 && parsed.scope === scope ? parsed : null;
  } catch {
    return null;
  }
}

function logicalId(row: Record<string, unknown> | undefined, fallback: string) {
  return String(row?._id ?? row?.entityUuid ?? fallback);
}

/** Returns the server snapshot with the current outbox applied as an optimistic overlay. */
export function composeRenderedProjection(
  scope: string,
  authoritative: ProjectionEnvelope | null,
  outbox: OutboxEnvelope
): ProjectionEnvelope | null {
  if (!authoritative && outbox.operations.length === 0) return null;
  const rendered: ProjectionEnvelope = authoritative
    ? JSON.parse(JSON.stringify(authoritative))
    : emptyProjection(scope, outbox.syncGeneration ?? 'pending');
  for (const action of outbox.operations) {
    if (action.type === 'photo' && action.plantId) {
      const photo = action.payload as SyncPhotoPayload;
      const plant = rendered.entities.plant[action.plantId] as Record<string, unknown> | undefined;
      if (!plant || rendered.tombstones[`plant:${action.plantId}`]) continue;
      rendered.entities.photo[photo.localId] = {
        _id: photo.localId,
        entityUuid: photo.localId,
        localId: photo.localId,
        userPlantId: logicalId(plant, action.plantId),
        plantUuid: action.plantId,
        photoUrl: photo.managedUri ?? photo.uri,
        managedUri: photo.managedUri,
        takenAt: photo.date,
        source: photo.source,
        phase: photo.phase ?? 'staged',
        _operationId: action.id,
        _pending: true,
      };
      continue;
    }
    if (action.type !== 'entity') continue;
    const op = action.payload as EntityOperationPayload;
    const collection = rendered.entities[op.entityType];
    if (rendered.tombstones[`${op.entityType}:${op.entityUuid}`]) continue;
    const parentTypes: Array<[keyof NonNullable<EntityOperationPayload['parentRefs']>, EntityType]> = [
      ['gardenUuid', 'garden'], ['bedUuid', 'bed'], ['plantUuid', 'plant'],
      ['carePlanUuid', 'carePlan'], ['reminderUuid', 'reminder'],
    ];
    const hasInvalidParent = parentTypes.some(([key, type]) => {
      const uuid = op.parentRefs?.[key];
      return typeof uuid === 'string'
        && (Boolean(rendered.tombstones[`${type}:${uuid}`]) || !rendered.entities[type][uuid]);
    });
    if (hasInvalidParent) continue;
    if (op.operationType === 'delete') {
      delete collection[op.entityUuid];
      continue;
    }
    const current = (collection[op.entityUuid] ?? {}) as Record<string, unknown>;
    if (
      op.operationType === 'update'
      && (Object.keys(current).length === 0 || current.revision !== op.baseRevision)
    ) continue;
    const payload = op.payload && typeof op.payload === 'object' && !Array.isArray(op.payload)
      ? op.payload as Record<string, unknown>
      : {};
    const row: Record<string, unknown> = {
      ...current,
      ...payload,
      _id: logicalId(current, op.entityUuid),
      entityUuid: op.entityUuid,
      _operationId: action.id,
      revision: current.revision ?? op.baseRevision ?? 0,
      _pending: true,
    };
    if (op.parentRefs?.gardenUuid !== undefined) {
      row.gardenId = op.parentRefs.gardenUuid === null
        ? undefined
        : logicalId(rendered.entities.garden[op.parentRefs.gardenUuid] as Record<string, unknown>, op.parentRefs.gardenUuid);
    }
    if (op.parentRefs?.bedUuid !== undefined) {
      row.bedId = op.parentRefs.bedUuid === null
        ? undefined
        : logicalId(rendered.entities.bed[op.parentRefs.bedUuid] as Record<string, unknown>, op.parentRefs.bedUuid);
    }
    if (op.parentRefs?.plantUuid !== undefined) {
      row.userPlantId = op.parentRefs.plantUuid === null
        ? undefined
        : logicalId(rendered.entities.plant[op.parentRefs.plantUuid] as Record<string, unknown>, op.parentRefs.plantUuid);
    }
    if (op.parentRefs?.carePlanUuid !== undefined) {
      row.carePlanId = op.parentRefs.carePlanUuid === null
        ? undefined
        : logicalId(rendered.entities.carePlan[op.parentRefs.carePlanUuid] as Record<string, unknown>, op.parentRefs.carePlanUuid);
    }
    if (op.parentRefs?.reminderUuid !== undefined) {
      row.reminderId = op.parentRefs.reminderUuid === null
        ? undefined
        : logicalId(rendered.entities.reminder[op.parentRefs.reminderUuid] as Record<string, unknown>, op.parentRefs.reminderUuid);
    }
    collection[op.entityUuid] = row;
    if (op.entityType === 'reminderOutcome' && op.parentRefs?.reminderUuid) {
      const reminder = rendered.entities.reminder[op.parentRefs.reminderUuid] as Record<string, unknown> | undefined;
      if (reminder) {
        const outcome = payload.outcome;
        const occurredAt = typeof payload.occurredAt === 'number' ? payload.occurredAt : action.createdAt;
        if (outcome === 'snoozed' && typeof payload.snoozedUntil === 'number') {
          reminder.snoozedUntil = payload.snoozedUntil;
        } else if (outcome === 'disabled' || outcome === 'deleted') {
          reminder.enabled = false;
        } else if (outcome !== 'edited') {
          reminder.lastRunAt = occurredAt;
          reminder._pendingOutcome = outcome;
        }
      }
    }
  }
  return rendered;
}

export async function loadRenderedProjection(scope: string): Promise<ProjectionEnvelope | null> {
  const [authoritative, outbox] = await Promise.all([
    loadAuthoritativeProjection(scope),
    loadOutbox(scope),
  ]);
  return composeRenderedProjection(scope, authoritative, outbox);
}

export async function reconcileAuthoritativeSnapshot(input: {
  client: ConvexReactClient;
  deviceId?: string;
  scope: string;
  generation: string;
  isCurrent: () => boolean;
}) {
  const projection = emptyProjection(input.scope, input.generation);
  for (const domain of domains) {
    let cursor: string | null = null;
    do {
      const result: any = await input.client.query(api.syncV2.snapshotPage, {
        deviceId: input.deviceId,
        generation: input.generation,
        domain,
        paginationOpts: { numItems: 100, cursor },
      });
      if (!input.isCurrent()) return { status: 'scope_changed' as const };
      if (result.status !== 'ok') return { status: result.status as 'unauthorized' | 'wrong_generation' };
      for (const row of result.page as Array<Record<string, unknown>>) {
        const entityUuid = typeof row.entityUuid === 'string' ? row.entityUuid : `legacy:${String(row._id)}`;
        if (domain === 'tombstone') {
          const entityType = String(row.entityType) as EntityType;
          projection.tombstones[`${entityType}:${entityUuid}`] = row;
          delete projection.entities[entityType]?.[entityUuid];
        } else if (!projection.tombstones[`${domain}:${entityUuid}`]) {
          projection.entities[domain][entityUuid] = row;
        }
      }
      cursor = result.isDone ? null : result.continueCursor;
    } while (cursor);
  }
  projection.complete = true;
  projection.hydratedAt = Date.now();
  if (!input.isCurrent()) return { status: 'scope_changed' as const };
  await AsyncStorage.setItem(projectionKey(input.scope), JSON.stringify(projection));
  notifyProjectionListeners(input.scope);
  return { status: 'ok' as const, projection };
}
