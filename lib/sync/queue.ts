import AsyncStorage from '@react-native-async-storage/async-storage';
import { SyncAction } from './types';

const STORAGE_KEY = 'rf_sync_queue_v1';

function normalizeQueue(value: unknown): SyncAction[] {
  return Array.isArray(value) ? (value as SyncAction[]) : [];
}

export async function loadSyncQueue(): Promise<SyncAction[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return normalizeQueue(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function saveSyncQueue(queue: SyncAction[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export async function enqueueSyncAction(action: SyncAction): Promise<void> {
  const queue = await loadSyncQueue();
  queue.push(action);
  await saveSyncQueue(queue);
}

export async function enqueueSyncActions(actions: SyncAction[]): Promise<void> {
  const queue = await loadSyncQueue();
  await saveSyncQueue(queue.concat(actions));
}

export async function removeSyncActions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const queue = await loadSyncQueue();
  const next = queue.filter((item) => !ids.includes(item.id));
  await saveSyncQueue(next);
}

export async function markSyncAttempt(
  id: string,
  error?: string
): Promise<void> {
  const queue = await loadSyncQueue();
  const next = queue.map((item) => {
    if (item.id !== id) return item;
    return {
      ...item,
      attempts: item.attempts + 1,
      lastError: error,
    };
  });
  await saveSyncQueue(next);
}
