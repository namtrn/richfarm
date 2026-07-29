import { useQuery } from 'convex/react';
import { api } from '../../../packages/convex/convex/_generated/api';
import type { Id } from '../../../packages/convex/convex/_generated/dataModel';
import { useDeviceId } from '../lib/deviceId';
import { useSessionScopedCacheKey } from '../lib/sessionCache';
import { useQueryCache } from '../lib/queryCache';
import { useEntitySync } from './useEntitySync';
import { useSyncProjectionEntities, useSyncProjectionMeta } from './useSyncProjection';

export function useGardens() {
  const { deviceId } = useDeviceId();
  const {
    hasProjection,
    isComplete,
    identity,
    isLoading: isProjectionLoading,
  } = useSyncProjectionMeta();
  const projectedGardens = useSyncProjectionEntities('garden') as any[];
  const remoteGardens = useQuery(
    api.gardens.getGardens,
    deviceId && identity?.kind === 'account' ? { deviceId } : 'skip'
  );
  const cacheKey = useSessionScopedCacheKey('rf_gardens_v2');
  const { cached, cacheLoaded } = useQueryCache(cacheKey, remoteGardens);
  const fallbackGardens = (remoteGardens ?? cached ?? []) as any[];
  const optimisticGardens = hasProjection && !isComplete
    ? [...fallbackGardens.filter((row) => !projectedGardens.some((pending) => pending.entityUuid === row.entityUuid)), ...projectedGardens]
    : hasProjection ? projectedGardens : fallbackGardens;
  const gardens = identity?.kind === 'guest'
    ? projectedGardens
    : isComplete
      ? projectedGardens as typeof remoteGardens
      : optimisticGardens as typeof remoteGardens;
  const { queueOperation } = useEntitySync();

  const createGarden = async (args: {
    name: string;
    locationType: string;
    areaM2?: number;
    description?: string;
  }) => {
    const result = await queueOperation({ entityType: 'garden', operationType: 'create', payload: args });
    return result.entityUuid as Id<'gardens'>;
  };

  const updateGarden = async (gardenId: Id<'gardens'>, updates: {
    name?: string;
    locationType?: string;
    areaM2?: number;
    description?: string;
  }) => {
    const current = projectedGardens?.find(
      (garden) => String(garden._id) === String(gardenId) || garden.entityUuid === String(gardenId)
    );
    await queueOperation({
      entityType: 'garden', entityUuid: current?.entityUuid ?? String(gardenId), operationType: 'update',
      baseRevision: current?.revision ?? 1, payload: updates,
    });
  };

  const deleteGarden = async (gardenId: Id<'gardens'>) => {
    const current = projectedGardens?.find(
      (garden) => String(garden._id) === String(gardenId) || garden.entityUuid === String(gardenId)
    );
    await queueOperation({
      entityType: 'garden', entityUuid: current?.entityUuid ?? String(gardenId), operationType: 'delete',
      baseRevision: current?.revision ?? 1,
    });
  };

  const isLoading = !identity || (identity.kind === 'guest'
    ? isProjectionLoading
    : gardens === undefined && !cacheLoaded);
  return { gardens: gardens ?? [], isLoading, createGarden, updateGarden, deleteGarden };
}
