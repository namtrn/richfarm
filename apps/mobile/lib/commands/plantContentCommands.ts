import type { LocalSyncIdentity } from '../sync/identity';
import { enqueueForIdentity, runForIdentityDestination } from '../sync/guestClaim';
import { enqueueSyncAction, updateOutbox } from '../sync/queue';
import type { EntityOperationPayload, SyncAction } from '../sync/types';
import type { PlantActivityType } from '../plantLocalData';
import { serializePlantCommand } from './plantCommandSerialization';
import { removeManagedPlantPhoto, stageManagedPlantPhoto } from '../photo/managedPlantPhotos';

export type CommandResult = {
  operationId: string;
  entityUuid: string;
  status: 'local_only' | 'queued';
};

type Runtime = {
  identity: LocalSyncIdentity;
  scopeToken: string;
  isCurrentScope: (scope: string, scopeToken: string) => boolean;
  createId: () => string;
  now: () => number;
  scheduleSync: (plantUuid: string) => void;
};

type ChildIdentity = {
  plantUuid: string;
  operationId?: string;
  entityUuid?: string;
};

export type AppendActivityInput = ChildIdentity & {
  type: PlantActivityType;
  note?: string;
  date: number;
};

export type AppendHarvestInput = ChildIdentity & {
  quantity?: string;
  unit?: string;
  note?: string;
  date: number;
};

export type AddPhotoInput = ChildIdentity & {
  sourceUri: string;
  source: 'camera' | 'gallery';
  note?: string;
  takenAt: number;
};

export type RemovePlantChildInput = {
  plantUuid: string;
  entityType: 'activity' | 'harvest' | 'photo';
  entityUuid: string;
  pendingOperationId?: string;
  managedUri?: string;
  baseRevision?: number;
};

function normalizeText(value?: string) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function entityAction(input: {
  operationId: string;
  entityUuid: string;
  plantUuid: string;
  entityType: 'activity' | 'harvest' | 'photo';
  operationType: 'create' | 'delete';
  payload?: Record<string, unknown>;
  baseRevision?: number;
  createdAt: number;
}): SyncAction {
  const payload: EntityOperationPayload = {
    operationId: input.operationId,
    entityType: input.entityType,
    entityUuid: input.entityUuid,
    operationType: input.operationType,
    baseRevision: input.baseRevision,
    parentRefs: { plantUuid: input.plantUuid },
    payload: input.payload,
  };
  return {
    id: input.operationId,
    plantId: input.plantUuid,
    type: 'entity',
    payload,
    createdAt: input.createdAt,
    attempts: 0,
  };
}

async function persistCreate(
  runtime: Runtime,
  input: ChildIdentity,
  entityType: 'activity' | 'harvest',
  payload: Record<string, unknown>,
): Promise<CommandResult> {
  if (!input.plantUuid.trim()) throw new Error('plant_uuid_required');
  const operationId = input.operationId ?? runtime.createId();
  const entityUuid = input.entityUuid ?? runtime.createId();
  const scope = runtime.identity.scopeKey;
  const token = runtime.scopeToken;
  await serializePlantCommand(scope, input.plantUuid, async () => {
    await enqueueForIdentity(runtime.identity, entityAction({
      operationId,
      entityUuid,
      plantUuid: input.plantUuid,
      entityType,
      operationType: 'create',
      payload,
      createdAt: runtime.now(),
    }));
  });
  if (runtime.identity.kind === 'account' && runtime.isCurrentScope(scope, token)) {
    runtime.scheduleSync(input.plantUuid);
  }
  return { operationId, entityUuid, status: runtime.identity.kind === 'guest' ? 'local_only' : 'queued' };
}

export function createPlantContentCommands(runtime: Runtime) {
  return {
    appendActivity(input: AppendActivityInput) {
      if (!Number.isFinite(input.date)) return Promise.reject(new Error('activity_date_invalid'));
      return persistCreate(runtime, input, 'activity', {
        type: input.type,
        note: normalizeText(input.note),
        occurredAt: input.date,
      });
    },
    appendHarvest(input: AppendHarvestInput) {
      if (!Number.isFinite(input.date)) return Promise.reject(new Error('harvest_date_invalid'));
      const quantity = normalizeText(input.quantity);
      const parsedQuantity = quantity === undefined ? undefined : Number(quantity);
      if (parsedQuantity !== undefined && !Number.isFinite(parsedQuantity)) {
        return Promise.reject(new Error('harvest_quantity_invalid'));
      }
      return persistCreate(runtime, input, 'harvest', {
        quantity: parsedQuantity,
        unit: normalizeText(input.unit),
        notes: normalizeText(input.note),
        harvestDate: input.date,
      });
    },
    async stageAndAddPhoto(input: AddPhotoInput): Promise<CommandResult> {
      if (!input.plantUuid.trim()) throw new Error('plant_uuid_required');
      if (!input.sourceUri.trim()) throw new Error('photo_source_required');
      if (!Number.isFinite(input.takenAt)) throw new Error('photo_date_invalid');
      const operationId = input.operationId ?? runtime.createId();
      const entityUuid = input.entityUuid ?? runtime.createId();
      const token = runtime.scopeToken;
      let managedUri: string | undefined;
      let destinationScope: string = runtime.identity.scopeKey;
      await serializePlantCommand(runtime.identity.scopeKey, input.plantUuid, async () => {
        await runForIdentityDestination(runtime.identity, async (destination) => {
          destinationScope = destination;
          managedUri = await stageManagedPlantPhoto({
            sourceUri: input.sourceUri,
            scope: destination,
            plantUuid: input.plantUuid,
            photoUuid: entityUuid,
          });
          try {
            await enqueueSyncAction({
              id: operationId,
              plantId: input.plantUuid,
              type: 'photo',
              createdAt: runtime.now(),
              attempts: 0,
              payload: {
                localId: entityUuid,
                managedUri,
                phase: 'staged',
                note: normalizeText(input.note),
                date: input.takenAt,
                source: input.source,
              },
            }, destination);
          } catch (error) {
            removeManagedPlantPhoto(managedUri);
            throw error;
          }
        });
      });
      if (
        runtime.identity.kind === 'account'
        && runtime.isCurrentScope(destinationScope, token)
      ) runtime.scheduleSync(input.plantUuid);
      return {
        operationId,
        entityUuid,
        status: runtime.identity.kind === 'guest' ? 'local_only' : 'queued',
      };
    },
    async removeChild(input: RemovePlantChildInput): Promise<CommandResult> {
      const scope = runtime.identity.scopeKey;
      const token = runtime.scopeToken;
      const operationId = input.pendingOperationId ?? runtime.createId();
      let destinationScope = scope as string;
      await serializePlantCommand(scope, input.plantUuid, async () => {
        await runForIdentityDestination(runtime.identity, async (destination) => {
          destinationScope = destination;
          if (input.pendingOperationId) {
            await updateOutbox(destination, (envelope) => ({
              ...envelope,
              operations: envelope.operations.filter((operation) => operation.id !== input.pendingOperationId),
            }));
            removeManagedPlantPhoto(input.managedUri);
            return;
          }
          await enqueueSyncAction(entityAction({
            operationId,
            entityUuid: input.entityUuid,
            plantUuid: input.plantUuid,
            entityType: input.entityType,
            operationType: 'delete',
            baseRevision: input.baseRevision,
            createdAt: runtime.now(),
          }), destination);
        });
      });
      if (runtime.identity.kind === 'account' && runtime.isCurrentScope(destinationScope, token)) {
        runtime.scheduleSync(input.plantUuid);
      }
      return {
        operationId,
        entityUuid: input.entityUuid,
        status: runtime.identity.kind === 'guest' ? 'local_only' : 'queued',
      };
    },
  };
}
