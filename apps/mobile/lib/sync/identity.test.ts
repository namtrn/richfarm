import { describe, expect, it, vi, beforeEach } from 'vitest';

const storage = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
  },
}));
vi.mock('../auth-client', () => ({ authClient: { useSession: vi.fn() } }));
vi.mock('../deviceId', () => ({ useDeviceId: vi.fn() }));

import { accountScopeKey, guestScopeKey, resolveLocalSyncIdentity } from './identity';

describe('local sync identity', () => {
  beforeEach(() => storage.clear());

  it('constructs canonical scope keys', () => {
    expect(guestScopeKey('install', 'dataset')).toBe('guest:v1:install:dataset');
    expect(accountScopeKey('install', 'user')).toBe('account:v1:install:user');
  });

  it('keeps one guest dataset id across resolutions', async () => {
    const first = await resolveLocalSyncIdentity('install');
    const second = await resolveLocalSyncIdentity('install');
    expect(first.kind).toBe('guest');
    expect(second).toEqual(first);
  });

  it('does not load guest state for an account identity', async () => {
    await expect(resolveLocalSyncIdentity('install', ' user-a ')).resolves.toEqual({
      kind: 'account', installationId: 'install', accountUserId: 'user-a',
      scopeKey: 'account:v1:install:user-a',
    });
    expect(storage.size).toBe(0);
  });
});
