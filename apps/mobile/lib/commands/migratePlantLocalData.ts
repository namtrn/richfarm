import AsyncStorage from '@react-native-async-storage/async-storage';
import { inspectPlantLocalData, preservePlantLocalRecovery } from '../plantLocalData';
import { loadOutbox, updateOutbox } from '../sync/queue';
import type { EntityOperationPayload, SyncAction } from '../sync/types';
import { stageManagedPlantPhoto } from '../photo/managedPlantPhotos';
import { serializePlantCommand } from './plantCommandSerialization';

function stableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `migration:${(hash >>> 0).toString(36)}`;
}

function markerKey(scope: string, plantId: string) {
  return `plant_local_migration:v1:${encodeURIComponent(scope)}:${encodeURIComponent(plantId)}`;
}

function entityAction(input: {
  scope: string; plantUuid: string; kind: 'activity' | 'harvest'; entityUuid: string;
  payload: Record<string, unknown>; createdAt: number;
}): SyncAction {
  const operationId = stableId(`${input.scope}:${input.plantUuid}:${input.kind}:${input.entityUuid}`);
  const payload: EntityOperationPayload = {
    operationId, entityType: input.kind, entityUuid: input.entityUuid,
    operationType: 'create', parentRefs: { plantUuid: input.plantUuid }, payload: input.payload,
  };
  return { id: operationId, plantId: input.plantUuid, type: 'entity', payload, createdAt: input.createdAt, attempts: 0 };
}

export async function migratePlantLocalData(input: {
  scope: string;
  legacyPlantId: string;
  plantUuid: string;
}) {
  return serializePlantCommand(input.scope, input.plantUuid, async () => {
    if (await AsyncStorage.getItem(markerKey(input.scope, input.legacyPlantId))) {
      return { status: 'already_migrated' as const, count: 0 };
    }
    const inspected = await inspectPlantLocalData(input.scope, input.legacyPlantId);
    if (inspected.status === 'malformed') {
      await preservePlantLocalRecovery(input.scope, input.legacyPlantId, inspected.raw);
      return { status: 'needs_attention' as const, count: 0 };
    }
    if (inspected.status === 'missing') {
      await AsyncStorage.setItem(markerKey(input.scope, input.legacyPlantId), 'empty');
      return { status: 'empty' as const, count: 0 };
    }
    const current = await loadOutbox(input.scope);
    const knownEntityIds = new Set(
      [...current.operations, ...current.quarantine].map((action) => {
        if (action.type === 'entity') return (action.payload as EntityOperationPayload).entityUuid;
        if (action.type === 'photo') return (action.payload as any).localId;
        return undefined;
      }).filter((value): value is string => !!value),
    );
    const actions: SyncAction[] = [];
    for (const activity of inspected.data.activities) {
      const entityUuid = activity.id;
      if (knownEntityIds.has(entityUuid)) continue;
      actions.push(entityAction({
        scope: input.scope, plantUuid: input.plantUuid, kind: 'activity', entityUuid,
        payload: { type: activity.type, note: activity.note, occurredAt: activity.date },
        createdAt: activity.date,
      }));
    }
    for (const harvest of inspected.data.harvests) {
      const entityUuid = harvest.localId ?? harvest.id;
      if (knownEntityIds.has(entityUuid) || harvest.serverId) continue;
      actions.push(entityAction({
        scope: input.scope, plantUuid: input.plantUuid, kind: 'harvest', entityUuid,
        payload: {
          quantity: harvest.quantity ? Number(harvest.quantity) || undefined : undefined,
          unit: harvest.unit, notes: harvest.note, harvestDate: harvest.date,
        },
        createdAt: harvest.date,
      }));
    }
    for (const photo of inspected.data.photos) {
      if (knownEntityIds.has(photo.id)) continue;
      const managedUri = await stageManagedPlantPhoto({
        sourceUri: photo.uri, scope: input.scope, plantUuid: input.plantUuid, photoUuid: photo.id,
      });
      const operationId = stableId(`${input.scope}:${input.plantUuid}:photo:${photo.id}`);
      actions.push({
        id: operationId, plantId: input.plantUuid, type: 'photo', createdAt: photo.date, attempts: 0,
        payload: {
          localId: photo.id, managedUri, phase: 'staged', note: photo.note,
          date: photo.date, source: photo.source,
        },
      });
    }
    if (actions.length > 0) {
      await updateOutbox(input.scope, (envelope) => ({
        ...envelope,
        operations: [
          ...envelope.operations.filter((existing) => !actions.some((next) => next.id === existing.id)),
          ...actions,
        ],
      }));
    }
    await AsyncStorage.setItem(markerKey(input.scope, input.legacyPlantId), String(actions.length));
    return { status: 'migrated' as const, count: actions.length };
  });
}
