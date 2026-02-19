import {
  BackendActivityInput,
  BackendHarvestInput,
  BackendPhotoInput,
  SyncAction,
  SyncBatch,
} from './types';

export function mapSyncActionToPhoto(
  action: SyncAction
): BackendPhotoInput | null {
  if (action.type !== 'photo') return null;
  const payload = action.payload as {
    localId: string;
    uri: string;
    note?: string;
    date: number;
  };

  return {
    plantId: action.plantId,
    deviceId: action.deviceId,
    localId: payload.localId,
    capturedAt: payload.date,
    note: payload.note,
    localUri: payload.uri,
  };
}

export function mapSyncActionToActivity(
  action: SyncAction
): BackendActivityInput | null {
  if (action.type !== 'activity') return null;
  const payload = action.payload as {
    localId: string;
    type: BackendActivityInput['type'];
    note?: string;
    date: number;
  };

  return {
    plantId: action.plantId,
    deviceId: action.deviceId,
    localId: payload.localId,
    type: payload.type,
    note: payload.note,
    occurredAt: payload.date,
  };
}

export function mapSyncActionToHarvest(
  action: SyncAction
): BackendHarvestInput | null {
  if (action.type !== 'harvest') return null;
  const payload = action.payload as {
    localId: string;
    quantity?: string;
    unit?: string;
    note?: string;
    date: number;
  };

  return {
    plantId: action.plantId,
    deviceId: action.deviceId,
    localId: payload.localId,
    quantity: payload.quantity,
    unit: payload.unit,
    note: payload.note,
    harvestedAt: payload.date,
  };
}

export function buildSyncBatch(actions: SyncAction[]): SyncBatch {
  const photos: BackendPhotoInput[] = [];
  const activities: BackendActivityInput[] = [];
  const harvests: BackendHarvestInput[] = [];

  for (const action of actions) {
    const photo = mapSyncActionToPhoto(action);
    if (photo) {
      photos.push(photo);
      continue;
    }
    const activity = mapSyncActionToActivity(action);
    if (activity) {
      activities.push(activity);
      continue;
    }
    const harvest = mapSyncActionToHarvest(action);
    if (harvest) {
      harvests.push(harvest);
    }
  }

  return { photos, activities, harvests };
}
