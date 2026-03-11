import { useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../packages/convex/convex/_generated/api';
import { Id } from '../../../packages/convex/convex/_generated/dataModel';
import { useDeviceId } from '../lib/deviceId';
import { useNetworkStatus } from './useNetworkStatus';
import { useQueryCache } from '../lib/queryCache';
import { useTranslation } from 'react-i18next';
import { usePlantLibrary } from './usePlantLibrary';
import { useHasAuthSession, useSessionScopedCacheKey } from '../lib/sessionCache';

export function usePlants(status?: string) {
    const { deviceId } = useDeviceId();
    const { i18n } = useTranslation();
    const { isKnown, isOffline } = useNetworkStatus();
    const shouldBypassRemote = isKnown && isOffline;
    const hasSession = useHasAuthSession();
    const locale = i18n.language?.split('-')[0] ?? i18n.language;
    const remotePlants = useQuery(api.plants.getUserPlants, deviceId ? { status, deviceId } : 'skip');

    const cacheKey = useSessionScopedCacheKey(
        'rf_plants_v2',
        `${status ? `_${status}` : ''}${locale ? `_${locale}` : ''}`
    );
    const { cached, cacheLoaded } = useQueryCache(cacheKey, remotePlants);

    const plants = !hasSession ? [] : remotePlants ?? cached;
    const { plants: libraryPlants } = usePlantLibrary(locale);
    const libraryById = useMemo(
        () => new Map((libraryPlants ?? []).map((plant: any) => [String(plant._id), plant])),
        [libraryPlants]
    );
    const localizedPlants = useMemo(
        () =>
            (plants ?? []).map((plant: any) => {
                if (!plant?.plantMasterId) return plant;
                const localized = libraryById.get(String(plant.plantMasterId));
                if (!localized) return plant;
                return {
                    ...plant,
                    displayName: localized.displayName,
                    scientificName: localized.scientificName,
                    localeUsed: localized.localeUsed,
                };
            }),
        [plants, libraryById]
    );

    const addPlantMutation = useMutation(api.plants.addPlant);
    const updateStatusMutation = useMutation(api.plants.updatePlantStatus);
    const updatePlantMutation = useMutation(api.plants.updatePlant);
    const deletePlantMutation = useMutation(api.plants.deletePlant);

    const addPlant = async (args: {
        plantMasterId?: Id<'plantsMaster'>;
        nickname?: string;
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
        plants: localizedPlants,
        isLoading: plants === undefined && !cacheLoaded && !shouldBypassRemote,
        addPlant,
        updateStatus,
        updatePlant,
        deletePlant,
    };
}
