import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { useDeviceId } from '../lib/deviceId';

export function useBeds(gardenId?: Id<'gardens'>) {
  const { deviceId } = useDeviceId();

  const beds = gardenId
    ? useQuery(
        api.gardens.getBedsInGarden,
        deviceId ? { gardenId, deviceId } : 'skip'
      )
    : useQuery(api.beds.getBeds, deviceId ? { deviceId } : 'skip');

  const createBedMutation = useMutation(api.beds.createBed);
  const updateBedMutation = useMutation(api.beds.updateBed);
  const deleteBedMutation = useMutation(api.beds.deleteBed);

  const createBed = async (args: {
    name: string;
    locationType: string;
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
    beds: beds ?? [],
    isLoading: beds === undefined,
    createBed,
    updateBed,
    deleteBed,
  };
}
