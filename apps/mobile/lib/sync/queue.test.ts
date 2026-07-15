import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
  },
}));

import {
  enqueueSyncAction,
  loadOutbox,
  loadSyncQueue,
  quarantineLegacyQueue,
  quarantineSyncAction,
  setSyncGeneration,
} from './queue';
import type { SyncAction } from './types';

function action(id: string): SyncAction {
  return {
    id,
    plantId: 'plant',
    type: 'activity',
    payload: { localId: id, type: 'watering', date: 1 },
    createdAt: 1,
    attempts: 0,
  };
}

describe('user-scoped outbox v2', () => {
  beforeEach(() => storage.clear());

  it('isolates accounts and serializes concurrent appends', async () => {
    await Promise.all([
      enqueueSyncAction(action('a1'), 'device:user-a'),
      enqueueSyncAction(action('a2'), 'device:user-a'),
      enqueueSyncAction(action('b1'), 'device:user-b'),
    ]);
    expect((await loadSyncQueue('device:user-a')).map((item) => item.id)).toEqual(['a1', 'a2']);
    expect((await loadSyncQueue('device:user-b')).map((item) => item.id)).toEqual(['b1']);
  });

  it('persists generation and moves terminal operations to quarantine', async () => {
    await enqueueSyncAction(action('terminal'), 'device:user');
    await setSyncGeneration('generation-1', 'device:user');
    await quarantineSyncAction('terminal', 'revision_conflict', 'device:user');
    const outbox = await loadOutbox('device:user');
    expect(outbox.syncGeneration).toBe('generation-1');
    expect(outbox.operations).toHaveLength(0);
    expect(outbox.quarantine[0]?.lastError).toBe('revision_conflict');
  });

  it('quarantines v1 data instead of adopting it into a signed-in account', async () => {
    storage.set('rf_sync_queue_v1', JSON.stringify([action('legacy')]));
    expect(await quarantineLegacyQueue()).toBe(1);
    expect(await loadSyncQueue('device:user')).toEqual([]);
    expect((await loadOutbox()).quarantine.map((item) => item.id)).toEqual(['legacy']);
  });
});
