import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { loadSyncQueue, subscribeSyncQueue } from '../lib/sync/queue';
import type { SyncAction } from '../lib/sync/types';
import { useNetworkStatus } from './useNetworkStatus';

type SyncStatus = 'loading' | 'idle' | 'offline' | 'pending' | 'retry';

export function useSyncStatus(plantId?: string) {
  const { isOffline, isOnline } = useNetworkStatus();
  const [queue, setQueue] = useState<SyncAction[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      const nextQueue = await loadSyncQueue();
      if (!active) return;
      setQueue(nextQueue);
      setLoaded(true);
    };

    void refresh();

    const unsubscribe = subscribeSyncQueue((nextQueue) => {
      if (!active) return;
      setQueue(nextQueue);
      setLoaded(true);
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
  }, []);

  const relevantQueue = useMemo(
    () => (plantId ? queue.filter((item) => item.plantId === plantId) : queue),
    [plantId, queue]
  );

  const photoCount = relevantQueue.filter((item) => item.type === 'photo').length;
  const activityCount = relevantQueue.filter((item) => item.type === 'activity').length;
  const harvestCount = relevantQueue.filter((item) => item.type === 'harvest').length;
  const retryCount = relevantQueue.filter((item) => item.attempts > 0).length;
  const failedCount = relevantQueue.filter(
    (item) => !!item.lastError && item.lastError !== 'sync_pending'
  ).length;
  const queuedCount = relevantQueue.length;

  const status: SyncStatus = !loaded
    ? 'loading'
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
    status,
    queuedCount,
    failedCount,
    retryCount,
    photoCount,
    activityCount,
    harvestCount,
    hasPending: queuedCount > 0,
    isOffline,
    isOnline,
  };
}
