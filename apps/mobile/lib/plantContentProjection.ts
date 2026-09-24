type SyncIdentityKind = 'guest' | 'account';

type SelectPlantContentArgs<T> = {
  identityKind?: SyncIdentityKind;
  hasProjection: boolean;
  projectionComplete: boolean;
  projected?: readonly T[];
  fallback?: readonly T[];
  belongsToPlant: (entry: T) => boolean;
};

/**
 * Guest writes are intentionally local-only, so their pending outbox overlay
 * is the source of truth before an authoritative projection exists. Account
 * screens keep the remote fallback until the projection is complete.
 */
export function selectPlantContent<T>({
  identityKind,
  hasProjection,
  projectionComplete,
  projected,
  fallback,
  belongsToPlant,
}: SelectPlantContentArgs<T>): T[] | undefined {
  const useProjection = hasProjection && (identityKind === 'guest' || projectionComplete);
  const rows = useProjection ? projected : fallback;
  return rows?.filter(belongsToPlant);
}
