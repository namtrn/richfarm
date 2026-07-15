import { useQuery } from 'convex/react';
import { api } from '../../../packages/convex/convex/_generated/api';
import { Id } from '../../../packages/convex/convex/_generated/dataModel';
import { useDeviceId } from '../lib/deviceId';
import { useNetworkStatus } from './useNetworkStatus';
import { useQueryCache } from '../lib/queryCache';
import { useHasAuthSession, useSessionScopedCacheKey } from '../lib/sessionCache';
import { useEntitySync } from './useEntitySync';
import { useSyncProjection } from './useSyncProjection';

export function useBeds(gardenId?: Id<'gardens'>) {
  const { deviceId } = useDeviceId();
  const { isKnown, isOffline } = useNetworkStatus();
  const shouldBypassRemote = isKnown && isOffline;
  const hasSession = useHasAuthSession();

  // Two unconditional hooks — React rules require hooks to always be called.
  // The correct one runs; the other is skipped via 'skip'.
  const bedsFromGarden = useQuery(
    api.gardens.getBedsInGarden,
    gardenId && deviceId ? { gardenId, deviceId } : 'skip'
  );
  const allBeds = useQuery(
    api.beds.getBeds,
    !gardenId && deviceId ? { deviceId } : 'skip'
  );
  const remoteBeds = bedsFromGarden ?? allBeds;
  const { projection, entities } = useSyncProjection();
  const projectedBeds = entities('bed') as any[] | undefined;
  const projectedGardens = entities('garden') as any[] | undefined;

  const cacheKey = useSessionScopedCacheKey(
    'rf_beds_v2',
    gardenId ? `_${gardenId}` : ''
  );
  const { cached, cacheLoaded } = useQueryCache(cacheKey, remoteBeds);

  const projectionBeds = projectedBeds?.filter(
    (bed) => !gardenId || String(bed.gardenId) === String(gardenId)
  ) as typeof remoteBeds;
  const fallbackBeds = (remoteBeds ?? cached ?? []) as any[];
  const optimisticBeds = (projection && !projection.complete
    ? [...fallbackBeds.filter((row) => !projectionBeds?.some((pending: any) => pending.entityUuid === row.entityUuid)), ...(projectionBeds ?? [])]
    : projection ? projectionBeds : fallbackBeds) as typeof remoteBeds;
  const beds: typeof remoteBeds = !hasSession ? [] : projection?.complete ? projectionBeds : optimisticBeds;

  const { queueOperation } = useEntitySync();
  const uuidFor = (rows: any[] | undefined, id: unknown) =>
    rows?.find((row) => String(row._id) === String(id) || row.entityUuid === id)?.entityUuid;

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
    const { gardenId: parentGardenId, ...payload } = args;
    const result = await queueOperation({
      entityType: 'bed', operationType: 'create', payload,
      parentRefs: parentGardenId ? { gardenUuid: uuidFor(projectedGardens, parentGardenId) } : undefined,
    });
    return result.entityUuid as Id<'beds'>;
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
    const current = projectedBeds?.find((bed) => String(bed._id) === String(bedId));
    const { gardenId: parentGardenId, ...payload } = updates;
    await queueOperation({
      entityType: 'bed', entityUuid: current?.entityUuid ?? String(bedId), operationType: 'update',
      baseRevision: current?.revision ?? 1, payload,
      parentRefs: parentGardenId !== undefined
        ? { gardenUuid: uuidFor(projectedGardens, parentGardenId) ?? null }
        : undefined,
    });
  };

  const deleteBed = async (bedId: Id<'beds'>) => {
    const current = projectedBeds?.find((bed) => String(bed._id) === String(bedId));
    await queueOperation({
      entityType: 'bed', entityUuid: current?.entityUuid ?? String(bedId), operationType: 'delete',
      baseRevision: current?.revision ?? 1,
    });
  };

  return {
    beds: beds ?? [],
    isLoading: beds === undefined && !cacheLoaded && !shouldBypassRemote,
    createBed,
    updateBed,
    deleteBed,
  };
}
