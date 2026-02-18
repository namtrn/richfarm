import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { useDeviceId } from '../lib/deviceId';

export function usePlants(status?: string) {
    const { deviceId } = useDeviceId();
    const plants = useQuery(api.plants.getUserPlants, { status, deviceId });

    const addPlantMutation = useMutation(api.plants.addPlant);
    const updateStatusMutation = useMutation(api.plants.updatePlantStatus);
    const updatePlantMutation = useMutation(api.plants.updatePlant);
    const deletePlantMutation = useMutation(api.plants.deletePlant);

    const addPlant = async (args: {
        nickname?: string;
        plantMasterId?: Id<'plantsMaster'>;
        bedId?: Id<'beds'>;
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
            expectedHarvestDate?: number;
        }
    ) => {
        return await updatePlantMutation({ plantId, ...updates, deviceId });
    };

    const deletePlant = async (plantId: Id<'userPlants'>) => {
        return await deletePlantMutation({ plantId, deviceId });
    };

    return {
        plants: plants ?? [],
        isLoading: plants === undefined,
        addPlant,
        updateStatus,
        updatePlant,
        deletePlant,
    };
}
