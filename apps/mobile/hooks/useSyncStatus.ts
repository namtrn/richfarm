import { useMemo } from 'react';
import { useMobileRuntime } from '../lib/state/mobileRuntimeStore';
import { useSyncScope } from '../lib/state/syncScopeStore';

type SyncStatus = 'loading' | 'idle' | 'offline' | 'pending' | 'retry' | 'attention';

export function useSyncStatus(plantId?: string) {
  const identity = useMobileRuntime((state) => state.identity);
  const activeScope = useMobileRuntime((state) => state.activeScope);
  const network = useMobileRuntime((state) => state.network);
  const storeScope = useSyncScope((state) => state.scope);
  const hydration = useSyncScope((state) => state.hydration);
  const outbox = useSyncScope((state) => state.outbox);
  const visibleOutbox = activeScope === storeScope ? outbox : null;
  const queue = visibleOutbox?.operations ?? [];
  const quarantine = visibleOutbox?.quarantine ?? [];
  const loaded = activeScope === storeScope
    && hydration !== 'loading'
    && hydration !== 'idle';

  const relevantQueue = useMemo(
    () => (plantId ? queue.filter((item) => item.plantId === plantId) : queue),
    [plantId, queue]
  );
  const relevantQuarantine = useMemo(
    () => (plantId ? quarantine.filter((item) => item.plantId === plantId) : quarantine),
    [plantId, quarantine]
  );

  const photoCount = relevantQueue.filter((item) => item.type === 'photo').length;
  const activityCount = relevantQueue.filter((item) => item.type === 'activity').length;
  const harvestCount = relevantQueue.filter((item) => item.type === 'harvest').length;
  const retryCount = relevantQueue.filter((item) => item.attempts > 0).length;
  const failedCount = relevantQueue.filter(
    (item) => !!item.lastError && item.lastError !== 'sync_pending'
  ).length;
  const queuedCount = relevantQueue.length;
  const quarantineCount = relevantQuarantine.length;
  const isOffline = network === 'offline';
  const isOnline = network === 'online';

  const status: SyncStatus = !loaded
    ? 'loading'
    : quarantineCount > 0
      ? 'attention'
      : queuedCount === 0
        ? 'idle'
        : isOffline
          ? 'offline'
          : failedCount > 0
            ? 'retry'
            : 'pending';

  return {
    loaded,
    queue: relevantQueue,
    quarantine: relevantQuarantine,
    status,
    queuedCount,
    failedCount,
    retryCount,
    photoCount,
    activityCount,
    harvestCount,
    hasPending: queuedCount > 0,
    quarantineCount,
    hasQuarantine: quarantineCount > 0,
    isOffline,
    isOnline,
    isLocalOnly: identity?.kind === 'guest',
  };
}
