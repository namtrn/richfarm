import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { useDeviceId } from '../lib/deviceId';
import { useNetworkStatus } from './useNetworkStatus';
import { useQueryCache } from '../lib/queryCache';

export function usePlants(status?: string) {
    const { deviceId } = useDeviceId();
    const { isKnown, isOffline } = useNetworkStatus();
    const shouldBypassRemote = isKnown && isOffline;
    const remotePlants = useQuery(api.plants.getUserPlants, { status, deviceId });

    const cacheKey = deviceId
        ? `rf_plants_v1_${deviceId}${status ? `_${status}` : ''}`
        : null;
    const { cached, cacheLoaded } = useQueryCache(cacheKey, remotePlants);

    const plants = remotePlants ?? cached;

    const addPlantMutation = useMutation(api.plants.addPlant);
    const updateStatusMutation = useMutation(api.plants.updatePlantStatus);
    const updatePlantMutation = useMutation(api.plants.updatePlant);
    const deletePlantMutation = useMutation(api.plants.deletePlant);

    const addPlant = async (args: {
        nickname?: string;
        plantMasterId?: Id<'plantsMaster'>;
        bedId?: Id<'beds'>;
        positionInBed?: { x: number; y: number; width: number; height: number };
        plantedAt?: number;
        notes?: string;
    }) => {
        return await addPlantMutation({ ...args, deviceId });
    };

    const updateStatus = async (
        plantId: Id<'userPlants'>,
        status: string,
        notes?: string
    ) => {
        return await updateStatusMutation({ plantId, status, notes, deviceId });
    };

    const updatePlant = async (
        plantId: Id<'userPlants'>,
        updates: {
            plantMasterId?: Id<'plantsMaster'>;
            nickname?: string;
            notes?: string;
            bedId?: Id<'beds'>;
            positionInBed?: { x: number; y: number; width: number; height: number };
            expectedHarvestDate?: number;
        }
    ) => {
        return await updatePlantMutation({ plantId, ...updates, deviceId });
    };

    const deletePlant = async (plantId: Id<'userPlants'>) => {
        return await deletePlantMutation({ plantId, deviceId });
    };

    return {
        plants: plants ?? (shouldBypassRemote ? [] : []),
        isLoading: plants === undefined && !cacheLoaded && !shouldBypassRemote,
        addPlant,
        updateStatus,
        updatePlant,
        deletePlant,
    };
}
