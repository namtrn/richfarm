import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../packages/convex/convex/_generated/api';
import { Id } from '../../../packages/convex/convex/_generated/dataModel';
import { useDeviceId } from '../lib/deviceId';
import { useNetworkStatus } from './useNetworkStatus';
import { useQueryCache } from '../lib/queryCache';
import { useTranslation } from 'react-i18next';
import { usePlantLibrary } from './usePlantLibrary';
import { useSessionScopedCacheKey } from '../lib/sessionCache';
import { useEntitySync } from './useEntitySync';
import { useSyncProjectionEntities, useSyncProjectionMeta } from './useSyncProjection';

export type PlantStatus =
    | 'planning'
    | 'planting'
    | 'growing'
    | 'dormant'
    | 'harvested'
    | 'archived'
    | 'failed'
    | 'paused';

export function usePlants(status?: PlantStatus) {
    const { deviceId } = useDeviceId();
    const { i18n } = useTranslation();
    const { isKnown, isOffline } = useNetworkStatus();
    const shouldBypassRemote = isKnown && isOffline;
    const { hasProjection, isComplete, identity } = useSyncProjectionMeta();
    const projectedPlants = useSyncProjectionEntities('plant') as any[];
    const projectedGardens = useSyncProjectionEntities('garden') as any[];
    const projectedBeds = useSyncProjectionEntities('bed') as any[];
    const locale = i18n.language?.split('-')[0] ?? i18n.language;
    const remotePlants = useQuery(
        api.plants.getUserPlants,
        deviceId && identity?.kind === 'account' ? { status, deviceId } : 'skip'
    );

    const cacheKey = useSessionScopedCacheKey(
        'rf_plants_v2',
        `${status ? `_${status}` : ''}${locale ? `_${locale}` : ''}`
    );
    const { cached, cacheLoaded } = useQueryCache(cacheKey, remotePlants);

    const filteredProjection = projectedPlants?.filter((plant) => !status || plant.status === status);
    const fallbackPlants = (remotePlants ?? cached ?? []) as any[];
    const optimisticPlants = hasProjection && !isComplete
        ? [...fallbackPlants.filter((row) => !filteredProjection?.some((pending) => pending.entityUuid === row.entityUuid)), ...(filteredProjection ?? [])]
        : hasProjection ? filteredProjection : fallbackPlants;
    const plants = identity?.kind === 'guest'
        ? filteredProjection
        : isComplete ? filteredProjection : optimisticPlants;
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

    const { queueOperation } = useEntitySync();
    const uuidFor = (rows: any[] | undefined, id: unknown) =>
        rows?.find((row) => String(row._id) === String(id) || row.entityUuid === id)?.entityUuid;
    const currentPlant = (id: Id<'userPlants'>) =>
        projectedPlants?.find((plant) => String(plant._id) === String(id) || plant.entityUuid === String(id));

    const addPlant = async (args: {
        plantMasterId?: Id<'plantsMaster'>;
        nickname?: string;
        gardenId?: Id<'gardens'> | null;
        bedId?: Id<'beds'> | null;
        positionInBed?: { x: number; y: number; width: number; height: number };
        plantedAt?: number;
        expectedHarvestDate?: number;
        status?: PlantStatus;
        notes?: string;
        clientRequestId?: string;
    }) => {
        const { gardenId, bedId, clientRequestId: _clientRequestId, ...payload } = args;
        const result = await queueOperation({
            entityType: 'plant', operationType: 'create',
            payload: { ...payload, status: payload.status ?? 'planning' },
            parentRefs: {
                gardenUuid: gardenId ? uuidFor(projectedGardens, gardenId) : null,
                bedUuid: bedId ? uuidFor(projectedBeds, bedId) : null,
            },
        });
        return result.entityUuid as Id<'userPlants'>;
    };

    const updateStatus = async (
        plantId: Id<'userPlants'>,
        status: PlantStatus,
        notes?: string,
        location?: { gardenId?: Id<'gardens'> | null; bedId?: Id<'beds'> | null }
    ) => {
        const current = currentPlant(plantId);
        await queueOperation({
            entityType: 'plant', entityUuid: current?.entityUuid ?? String(plantId), operationType: 'update',
            baseRevision: current?.revision ?? 1, payload: { status, notes },
            parentRefs: location ? {
                gardenUuid: location.gardenId ? uuidFor(projectedGardens, location.gardenId) : null,
                bedUuid: location.bedId ? uuidFor(projectedBeds, location.bedId) : null,
            } : undefined,
        });
    };

    const updatePlant = async (
        plantId: Id<'userPlants'>,
        updates: {
            plantMasterId?: Id<'plantsMaster'>;
            nickname?: string;
            notes?: string;
            gardenId?: Id<'gardens'> | null;
            bedId?: Id<'beds'> | null;
            positionInBed?: { x: number; y: number; width: number; height: number };
            expectedHarvestDate?: number;
        }
    ) => {
        const current = currentPlant(plantId);
        const { gardenId, bedId, ...payload } = updates;
        await queueOperation({
            entityType: 'plant', entityUuid: current?.entityUuid ?? String(plantId), operationType: 'update',
            baseRevision: current?.revision ?? 1, payload,
            parentRefs: gardenId !== undefined || bedId !== undefined ? {
                ...(gardenId !== undefined && { gardenUuid: gardenId ? uuidFor(projectedGardens, gardenId) : null }),
                ...(bedId !== undefined && { bedUuid: bedId ? uuidFor(projectedBeds, bedId) : null }),
            } : undefined,
        });
    };

    const deletePlant = async (plantId: Id<'userPlants'>) => {
        const current = currentPlant(plantId);
        await queueOperation({
            entityType: 'plant', entityUuid: current?.entityUuid ?? String(plantId), operationType: 'delete',
            baseRevision: current?.revision ?? 1,
        });
    };

    return {
        plants: localizedPlants,
        isLoading: !identity || (plants === undefined && !cacheLoaded && !shouldBypassRemote),
        addPlant,
        updateStatus,
        updatePlant,
        deletePlant,
    };
}
