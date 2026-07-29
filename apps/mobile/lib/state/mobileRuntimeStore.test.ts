import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginRuntimeIdentityTransition,
  commitRuntimeIdentity,
  mobileRuntimeStore,
} from './mobileRuntimeStore';
import type { LocalSyncIdentity } from '../sync/identity';

const accountIdentity = (accountUserId: string): LocalSyncIdentity => ({
  kind: 'account',
  installationId: 'install-1',
  accountUserId,
  scopeKey: `account:v1:install-1:${accountUserId}`,
});

describe('MobileRuntimeStore scope transitions', () => {
  beforeEach(() => {
    mobileRuntimeStore.setState({
      installationId: null,
      authStatus: 'loading',
      session: null,
      identity: null,
      activeScope: null,
      scopeToken: 'test-initial',
      identityKey: null,
      network: 'unknown',
      appState: 'active',
    });
  });

  it('clears Account A synchronously and rejects its late identity result', () => {
    beginRuntimeIdentityTransition({
      installationId: 'install-1',
      authStatus: 'account',
      session: null,
      identityKey: 'account-a',
    });
    expect(commitRuntimeIdentity('account-a', accountIdentity('a'))).toBe(true);
    const accountAToken = mobileRuntimeStore.getState().scopeToken;

    beginRuntimeIdentityTransition({
      installationId: 'install-1',
      authStatus: 'account',
      session: null,
      identityKey: 'account-b',
    });

    expect(mobileRuntimeStore.getState()).toMatchObject({
      identity: null,
      activeScope: null,
      identityKey: 'account-b',
    });
    expect(mobileRuntimeStore.getState().scopeToken).not.toBe(accountAToken);
    expect(commitRuntimeIdentity('account-a', accountIdentity('a'))).toBe(false);
    expect(commitRuntimeIdentity('account-b', accountIdentity('b'))).toBe(true);
    expect(mobileRuntimeStore.getState().activeScope).toBe('account:v1:install-1:b');
  });

  it('rotates the scope token through Account A, guest and Account B', () => {
    beginRuntimeIdentityTransition({
      installationId: 'install-1',
      authStatus: 'account',
      session: null,
      identityKey: 'account-a',
    });
    commitRuntimeIdentity('account-a', accountIdentity('a'));
    const accountAToken = mobileRuntimeStore.getState().scopeToken;

    beginRuntimeIdentityTransition({
      installationId: 'install-1',
      authStatus: 'guest',
      session: null,
      identityKey: 'guest-a',
    });
    const guestToken = mobileRuntimeStore.getState().scopeToken;
    expect(guestToken).not.toBe(accountAToken);
    expect(mobileRuntimeStore.getState().activeScope).toBeNull();

    beginRuntimeIdentityTransition({
      installationId: 'install-1',
      authStatus: 'account',
      session: null,
      identityKey: 'account-b',
    });
    expect(mobileRuntimeStore.getState().scopeToken).not.toBe(guestToken);
    expect(commitRuntimeIdentity('guest-a', {
      kind: 'guest',
      installationId: 'install-1',
      guestDatasetId: 'guest-a',
      scopeKey: 'guest:v1:install-1:guest-a',
    })).toBe(false);
    expect(commitRuntimeIdentity('account-b', accountIdentity('b'))).toBe(true);
  });
});
