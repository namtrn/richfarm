import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { AppStateStatus } from 'react-native';
import type { authClient } from '../auth-client';
import type { LocalSyncIdentity } from '../sync/identity';

export type RuntimeAuthStatus = 'loading' | 'guest' | 'account';
export type RuntimeNetworkStatus = 'unknown' | 'offline' | 'online';
export type RuntimeSession = ReturnType<typeof authClient.useSession>['data'];

export type MobileRuntimeState = {
  installationId: string | null;
  authStatus: RuntimeAuthStatus;
  session: RuntimeSession;
  identity: LocalSyncIdentity | null;
  activeScope: string | null;
  scopeToken: string;
  identityKey: string | null;
  network: RuntimeNetworkStatus;
  appState: AppStateStatus;
};

let scopeSequence = 0;

function nextScopeToken() {
  scopeSequence += 1;
  return `scope:${scopeSequence}`;
}

export function createMobileRuntimeStore() {
  return createStore<MobileRuntimeState>()(() => ({
    installationId: null,
    authStatus: 'loading',
    session: null,
    identity: null,
    activeScope: null,
    scopeToken: nextScopeToken(),
    identityKey: null,
    network: 'unknown',
    appState: 'active',
  }));
}

export const mobileRuntimeStore = createMobileRuntimeStore();

export function beginRuntimeIdentityTransition(input: {
  installationId: string | null;
  authStatus: RuntimeAuthStatus;
  session: RuntimeSession;
  identityKey: string | null;
}) {
  const current = mobileRuntimeStore.getState();
  const changed = current.identityKey !== input.identityKey;
  mobileRuntimeStore.setState({
    installationId: input.installationId,
    authStatus: input.authStatus,
    session: input.session,
    identityKey: input.identityKey,
    ...(changed
      ? {
          identity: null,
          activeScope: null,
          scopeToken: nextScopeToken(),
        }
      : {}),
  });
}

export function commitRuntimeIdentity(identityKey: string, identity: LocalSyncIdentity) {
  const current = mobileRuntimeStore.getState();
  if (current.identityKey !== identityKey) return false;
  mobileRuntimeStore.setState({
    identity,
    activeScope: identity.scopeKey,
  });
  return true;
}

export function publishRuntimeNetwork(network: RuntimeNetworkStatus) {
  if (mobileRuntimeStore.getState().network !== network) {
    mobileRuntimeStore.setState({ network });
  }
}

export function publishRuntimeAppState(appState: AppStateStatus) {
  if (mobileRuntimeStore.getState().appState !== appState) {
    mobileRuntimeStore.setState({ appState });
  }
}

export function useMobileRuntime<T>(selector: (state: MobileRuntimeState) => T) {
  return useStore(mobileRuntimeStore, selector);
}
