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
  enqueueSyncActions,
  clearSyncNamespace,
  getSyncRecoveryStorageKey,
  loadOutbox,
  loadSyncQueue,
  quarantineLegacyQueue,
  quarantineSyncAction,
  removePendingPlantEntry,
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

  it('upserts a retried operation ID instead of duplicating it', async () => {
    await enqueueSyncAction(action('same'), 'device:user');
    await enqueueSyncAction({ ...action('same'), attempts: 2 }, 'device:user');
    const queue = await loadSyncQueue('device:user');
    expect(queue).toHaveLength(1);
    expect(queue[0]?.attempts).toBe(2);
  });

  it('deduplicates operation IDs within a batch import', async () => {
    await enqueueSyncActions([
      action('batch-1'),
      { ...action('batch-1'), attempts: 3 },
      action('batch-2'),
    ], 'device:user');
    const queue = await loadSyncQueue('device:user');
    expect(queue.map((item) => item.id)).toEqual(['batch-1', 'batch-2']);
    expect(queue[0]?.attempts).toBe(3);
  });

  it('quarantines a conflicting duplicate ID instead of overwriting the active operation', async () => {
    const original = action('batch-conflict');
    const conflicting = {
      ...original,
      payload: { ...original.payload, date: 2 },
    };
    await enqueueSyncActions([original, conflicting], 'device:user');
    const outbox = await loadOutbox('device:user');
    expect(outbox.operations).toEqual([original]);
    expect(outbox.quarantine).toContainEqual(expect.objectContaining({
      id: 'batch-conflict',
      payload: conflicting.payload,
      lastError: 'batch_operation_conflict',
    }));
  });

  it('quarantines a batch conflict against an operation already on disk', async () => {
    const original = action('persisted-conflict');
    await enqueueSyncAction(original, 'device:user');
    await enqueueSyncActions([{
      ...original,
      payload: { ...original.payload, note: 'different fingerprint' },
    }], 'device:user');
    const outbox = await loadOutbox('device:user');
    expect(outbox.operations).toEqual([original]);
    expect(outbox.quarantine[0]).toMatchObject({
      id: original.id,
      lastError: 'batch_operation_conflict',
    });
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

  it.each([
    ['malformed JSON', '{not-json', 'malformed_json'],
    ['unsupported version', JSON.stringify({ version: 1, scope: 'device:user', operations: [], quarantine: [] }), 'unsupported_version'],
    ['wrong scope', JSON.stringify({ version: 2, scope: 'device:other', operations: [], quarantine: [] }), 'scope_mismatch'],
  ] as const)('preserves %s outbox data in recovery', async (_label, raw, reason) => {
    storage.set('rf_sync_outbox_v2_device%3Auser', raw);
    const first = await loadOutbox('device:user');
    expect(first).toMatchObject({
      scope: 'device:user',
      operations: [],
      quarantine: [],
      needsAttention: true,
      recovery: { reason },
    });
    expect(storage.get(getSyncRecoveryStorageKey('device:user'))).toBe(raw);

    // A second load models an app restart: the recovery marker remains durable
    // and is not interpreted as a healthy empty queue.
    const afterRestart = await loadOutbox('device:user');
    expect(afterRestart.needsAttention).toBe(true);
    expect(afterRestart.recovery?.reason).toBe(reason);
  });

  it('preserves a malformed legacy queue and does not delete its source key', async () => {
    const raw = '{legacy-corrupt';
    storage.set('rf_sync_queue_v1', raw);
    expect(await quarantineLegacyQueue()).toBe(0);
    expect(storage.get('rf_sync_queue_v1')).toBe(raw);
    expect(storage.get(getSyncRecoveryStorageKey())).toBe(raw);
    expect((await loadOutbox()).recovery?.reason).toBe('malformed_legacy_queue');
    expect((await loadOutbox()).needsAttention).toBe(true);
  });

  it('cancels a pending Photo before upload when the user removes it locally', async () => {
    await enqueueSyncAction({
      id: 'photo-op', plantId: 'plant', type: 'photo', createdAt: 1, attempts: 0,
      payload: { localId: 'photo-local', uri: 'file://photo.jpg', date: 1 },
    }, 'device:user');
    await removePendingPlantEntry('photo', 'plant', 'photo-local', 'device:user');
    expect(await loadSyncQueue('device:user')).toEqual([]);
  });

  it('clears only the deleted account sync namespace', async () => {
    await enqueueSyncAction(action('a'), 'device:user-a');
    await enqueueSyncAction(action('b'), 'device:user-b');
    await clearSyncNamespace('device:user-a');
    expect(await loadSyncQueue('device:user-a')).toEqual([]);
    expect((await loadSyncQueue('device:user-b')).map((item) => item.id)).toEqual(['b']);
  });
});
