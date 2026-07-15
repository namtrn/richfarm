import { PlantActivityType } from '../plantLocalData';

export type EntityType = 'garden' | 'bed' | 'plant' | 'activity' | 'harvest' | 'photo';
export type SyncActionType = 'photo' | 'activity' | 'harvest' | 'entity';

export type EntityOperationPayload = {
  operationId: string;
  syncGeneration?: string;
  entityType: EntityType;
  entityUuid: string;
  operationType: 'create' | 'update' | 'delete';
  baseRevision?: number;
  parentRefs?: { gardenUuid?: string | null; bedUuid?: string | null; plantUuid?: string | null };
  payload?: unknown;
};

export type SyncPhotoPayload = {
  localId: string;
  uri: string;
  note?: string;
  date: number;
  source?: 'camera' | 'gallery';
  storageId?: string;
};

export type SyncActivityPayload = {
  localId: string;
  type: PlantActivityType;
  note?: string;
  date: number;
};

export type SyncHarvestPayload = {
  localId: string;
  quantity?: string;
  unit?: string;
  note?: string;
  date: number;
};

export type SyncActionPayload =
  | SyncPhotoPayload
  | SyncActivityPayload
  | SyncHarvestPayload
  | EntityOperationPayload;

export type SyncAction = {
  id: string;
  plantId?: string;
  deviceId?: string;
  type: SyncActionType;
  payload: SyncActionPayload;
  createdAt: number;
  attempts: number;
  lastError?: string;
  nextAttemptAt?: number;
};

export type BackendPhotoInput = {
  plantId: string;
  deviceId?: string;
  localId: string;
  capturedAt: number;
  note?: string;
  localUri: string;
  source?: 'camera' | 'gallery';
  storageId?: string;
};

export type BackendActivityInput = {
  plantId: string;
  deviceId?: string;
  localId: string;
  type: PlantActivityType;
  note?: string;
  occurredAt: number;
};

export type BackendHarvestInput = {
  plantId: string;
  deviceId?: string;
  localId: string;
  quantity?: string;
  unit?: string;
  note?: string;
  harvestedAt: number;
};

export type SyncBatch = {
  photos: BackendPhotoInput[];
  activities: BackendActivityInput[];
  harvests: BackendHarvestInput[];
};
