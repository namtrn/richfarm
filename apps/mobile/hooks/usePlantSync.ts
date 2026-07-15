import { useCallback } from 'react';
import { useDeviceId } from '../lib/deviceId';
import {
  PlantActivityEntry,
  PlantActivityType,
  PlantHarvestEntry,
  PlantPhotoEntry,
  createLocalId,
} from '../lib/plantLocalData';
import { enqueueSyncAction, removePendingPlantEntry } from '../lib/sync/queue';
import { SyncAction } from '../lib/sync/types';
import NetInfo from '@react-native-community/netinfo';
import { authClient } from '../lib/auth-client';
import { useSyncExecutor } from '../lib/sync/useSyncExecutor';

export function usePlantSync() {
  const { deviceId } = useDeviceId();
  const { data: session } = authClient.useSession();
  const { execute } = useSyncExecutor();
  const scope = deviceId ? `${deviceId}:${session?.user?.id ?? 'guest'}` : undefined;

  const enqueueAction = useCallback(
    async (action: SyncAction) => {
      await enqueueSyncAction(action, scope);
      const network = await NetInfo.fetch();
      if (network.isConnected && network.isInternetReachable !== false) {
        void execute({ plantId: action.plantId });
      }
      return action;
    },
    [execute, scope]
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
          source: photo.source,
        },
        createdAt: Date.now(),
        attempts: 0,
      };
      return enqueueAction(action);
    },
    [deviceId, enqueueAction]
  );

  const queueActivity = useCallback(
    async (plantId: string, activity: PlantActivityEntry & { type: PlantActivityType }) => {
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
    removePendingActivity: (plantId: string, localId: string) =>
      removePendingPlantEntry('activity', plantId, localId, scope),
    removePendingHarvest: (plantId: string, localId: string) =>
      removePendingPlantEntry('harvest', plantId, localId, scope),
    removePendingPhoto: (plantId: string, localId: string) =>
      removePendingPlantEntry('photo', plantId, localId, scope),
  };
}
