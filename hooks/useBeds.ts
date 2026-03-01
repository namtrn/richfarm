import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { useDeviceId } from '../lib/deviceId';
import { useNetworkStatus } from './useNetworkStatus';
import { useQueryCache } from '../lib/queryCache';

export function useBeds(gardenId?: Id<'gardens'>) {
  const { deviceId } = useDeviceId();
  const { isKnown, isOffline } = useNetworkStatus();
  const shouldBypassRemote = isKnown && isOffline;

  const remoteBeds = gardenId
    ? useQuery(
      api.gardens.getBedsInGarden,
      deviceId ? { gardenId, deviceId } : 'skip'
    )
    : useQuery(api.beds.getBeds, deviceId ? { deviceId } : 'skip');

  const cacheKey = deviceId
    ? `rf_beds_v1_${deviceId}${gardenId ? `_${gardenId}` : ''}`
    : null;
  const { cached, cacheLoaded } = useQueryCache(cacheKey, remoteBeds);

  const beds = remoteBeds ?? cached;

  const createBedMutation = useMutation(api.beds.createBed);
  const updateBedMutation = useMutation(api.beds.updateBed);
  const deleteBedMutation = useMutation(api.beds.deleteBed);

  const createBed = async (args: {
    name: string;
    locationType: string;
    bedType?: string;
    tiers?: number;
    dimensions?: { widthCm: number; heightCm: number };
    areaM2?: number;
    sunlightHours?: number;
    soilType?: string;
    gardenId?: Id<'gardens'>;
  }) => {
    return await createBedMutation({ ...args, deviceId });
  };

  const updateBed = async (
    bedId: Id<'beds'>,
    updates: {
      name?: string;
      gardenId?: Id<'gardens'>;
      bedType?: string;
      tiers?: number;
      dimensions?: { widthCm: number; heightCm: number };
      locationType?: string;
      areaM2?: number;
      sunlightHours?: number;
      soilType?: string;
    }
  ) => {
    return await updateBedMutation({ bedId, ...updates, deviceId });
  };

  const deleteBed = async (bedId: Id<'beds'>) => {
    return await deleteBedMutation({ bedId, deviceId });
  };

  return {
    beds: beds ?? (shouldBypassRemote ? [] : []),
    isLoading: beds === undefined && !cacheLoaded && !shouldBypassRemote,
    createBed,
    updateBed,
    deleteBed,
  };
}
