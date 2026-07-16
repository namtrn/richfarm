import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
  },
}));
vi.mock('../auth-client', () => ({ authClient: { useSession: vi.fn() } }));
vi.mock('../deviceId', () => ({ useDeviceId: vi.fn() }));

import { claimGuestDataset, enqueueForIdentity, loadGuestClaim } from './guestClaim';
import { loadOutbox } from './queue';
import type { LocalSyncIdentity } from './identity';
import type { SyncAction } from './types';

const guest: Extract<LocalSyncIdentity, { kind: 'guest' }> = {
  kind: 'guest', installationId: 'install', guestDatasetId: 'dataset',
  scopeKey: 'guest:v1:install:dataset',
};
const accountA: Extract<LocalSyncIdentity, { kind: 'account' }> = {
  kind: 'account', installationId: 'install', accountUserId: 'a',
  scopeKey: 'account:v1:install:a',
};
const accountB: Extract<LocalSyncIdentity, { kind: 'account' }> = {
  kind: 'account', installationId: 'install', accountUserId: 'b',
  scopeKey: 'account:v1:install:b',
};

function action(id: string, name = 'Garden'): SyncAction {
  return {
    id, type: 'entity', createdAt: 1, attempts: 0,
    payload: {
      operationId: id, entityType: 'garden', entityUuid: `garden:${id}`,
      operationType: 'create', payload: { name, locationType: 'outdoor' },
    },
  };
}

describe('guest claim', () => {
  beforeEach(() => storage.clear());

  it('preserves operation ids and deduplicates an interrupted import', async () => {
    await enqueueForIdentity(guest, action('op-1'));
    await claimGuestDataset(guest, accountA);
    await claimGuestDataset(guest, accountA);
    const target = await loadOutbox(accountA.scopeKey);
    expect(target.operations.map((item) => item.id)).toEqual(['op-1']);
    expect((await loadGuestClaim('dataset'))?.targetAccountUserId).toBe('a');
  });

  it('never rebinds a dataset to another account', async () => {
    await enqueueForIdentity(guest, action('op-1'));
    await claimGuestDataset(guest, accountA);
    await expect(claimGuestDataset(guest, accountB)).rejects.toThrow(
      'guest_dataset_bound_to_another_account'
    );
  });

  it('routes a guest write racing after binding into the target account', async () => {
    await enqueueForIdentity(guest, action('before'));
    await claimGuestDataset(guest, accountA);
    await enqueueForIdentity(guest, action('after'));
    expect((await loadOutbox(accountA.scopeKey)).operations.map((item) => item.id)).toEqual([
      'before', 'after',
    ]);
    expect((await loadOutbox(guest.scopeKey)).operations.map((item) => item.id)).toEqual(['before']);
  });

  it('quarantines the incoming copy when an operation id has different content', async () => {
    await enqueueForIdentity(accountA, action('same', 'Account version'));
    await enqueueForIdentity(guest, action('same', 'Guest version'));
    const record = await claimGuestDataset(guest, accountA);
    const target = await loadOutbox(accountA.scopeKey);
    expect(record.status).toBe('needs_attention');
    expect(target.operations[0]?.payload).toMatchObject({ payload: { name: 'Account version' } });
    expect(target.quarantine[0]?.lastError).toBe('claim_operation_conflict');
  });
});

