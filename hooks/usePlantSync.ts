import { useCallback } from 'react';
import { useDeviceId } from '../lib/deviceId';
import {
  PlantActivityEntry,
  PlantHarvestEntry,
  PlantPhotoEntry,
  createLocalId,
} from '../lib/plantLocalData';
import { enqueueSyncAction } from '../lib/sync/queue';
import { SyncAction } from '../lib/sync/types';

export function usePlantSync() {
  const { deviceId } = useDeviceId();

  const enqueueAction = useCallback(
    async (action: SyncAction) => {
      await enqueueSyncAction(action);
      return action;
    },
    []
  );

  const queuePhoto = useCallback(
    async (plantId: string, photo: PlantPhotoEntry) => {
      const action: SyncAction = {
        id: createLocalId(),
        plantId,
        deviceId,
        type: 'photo',
        payload: {
          localId: photo.id,
          uri: photo.uri,
          note: photo.note,
          date: photo.date,
        },
        createdAt: Date.now(),
        attempts: 0,
      };
      return enqueueAction(action);
    },
    [deviceId, enqueueAction]
  );

  const queueActivity = useCallback(
    async (plantId: string, activity: PlantActivityEntry) => {
      const action: SyncAction = {
        id: createLocalId(),
        plantId,
        deviceId,
        type: 'activity',
        payload: {
          localId: activity.id,
          type: activity.type,
          note: activity.note,
          date: activity.date,
        },
        createdAt: Date.now(),
        attempts: 0,
      };
      return enqueueAction(action);
    },
    [deviceId, enqueueAction]
  );

  const queueHarvest = useCallback(
    async (plantId: string, harvest: PlantHarvestEntry) => {
      const action: SyncAction = {
        id: createLocalId(),
        plantId,
        deviceId,
        type: 'harvest',
        payload: {
          localId: harvest.id,
          quantity: harvest.quantity,
          unit: harvest.unit,
          note: harvest.note,
          date: harvest.date,
        },
        createdAt: Date.now(),
        attempts: 0,
      };
      return enqueueAction(action);
    },
    [deviceId, enqueueAction]
  );

  return {
    queuePhoto,
    queueActivity,
    queueHarvest,
  };
}
