import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { loadOutbox, subscribeSyncQueue } from '../lib/sync/queue';
import type { SyncAction } from '../lib/sync/types';
import { useNetworkStatus } from './useNetworkStatus';
import { useLocalSyncIdentity } from '../lib/sync/identity';

type SyncStatus = 'loading' | 'idle' | 'offline' | 'pending' | 'retry' | 'attention';

export function useSyncStatus(plantId?: string) {
  const { isOffline, isOnline } = useNetworkStatus();
  const { identity } = useLocalSyncIdentity();
  const scope = identity?.scopeKey;
  const [queue, setQueue] = useState<SyncAction[]>([]);
  const [quarantine, setQuarantine] = useState<SyncAction[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      const outbox = await loadOutbox(scope);
      if (!active) return;
      setQueue(outbox.operations);
      setQuarantine(outbox.quarantine);
      setLoaded(true);
    };

    void refresh();

    const unsubscribe = subscribeSyncQueue(scope, () => {
      if (!active) return;
      void refresh();
    });

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh();
      }
    });

    return () => {
      active = false;
      unsubscribe();
      subscription.remove();
    };
  }, [scope]);

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
