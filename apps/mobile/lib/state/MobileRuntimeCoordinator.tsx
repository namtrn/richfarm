import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { authClient } from '../auth-client';
import { getDeviceId } from '../deviceId';
import {
  resolveLocalSyncIdentity,
  subscribeLocalSyncIdentityInvalidation,
} from '../sync/identity';
import {
  beginRuntimeIdentityTransition,
  commitRuntimeIdentity,
  publishRuntimeAppState,
  publishRuntimeNetwork,
  type RuntimeAuthStatus,
} from './mobileRuntimeStore';

export function MobileRuntimeCoordinator({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const [installationId, setInstallationId] = useState<string | null>(null);
  const [identityEpoch, setIdentityEpoch] = useState(0);
  const sessionUser = session?.user as { id?: string; isAnonymous?: boolean } | undefined;
  const accountUserId = sessionUser?.isAnonymous !== true && typeof sessionUser?.id === 'string'
    ? sessionUser.id.trim() || null
    : null;
  const authStatus: RuntimeAuthStatus = isPending
    ? 'loading'
    : accountUserId
      ? 'account'
      : 'guest';
  const identityKey = useMemo(() => {
    if (!installationId || isPending) return null;
    return `${installationId}:${accountUserId ?? 'guest'}:${identityEpoch}`;
  }, [accountUserId, identityEpoch, installationId, isPending]);

  useEffect(() => {
    let active = true;
    void getDeviceId().then((value) => {
      if (active) setInstallationId(value);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => subscribeLocalSyncIdentityInvalidation(() => {
    setIdentityEpoch((value) => value + 1);
  }), []);

  useLayoutEffect(() => {
    beginRuntimeIdentityTransition({
      installationId,
      authStatus,
      session,
      identityKey,
    });
  }, [authStatus, identityKey, installationId, session]);

  useEffect(() => {
    if (!installationId || !identityKey || isPending) return;
    let active = true;
    void resolveLocalSyncIdentity(installationId, accountUserId).then((identity) => {
      if (active) commitRuntimeIdentity(identityKey, identity);
    });
    return () => {
      active = false;
    };
  }, [accountUserId, identityKey, installationId, isPending]);

  useEffect(() => {
    publishRuntimeAppState(AppState.currentState);
    const subscription = AppState.addEventListener('change', publishRuntimeAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => NetInfo.addEventListener((state) => {
    const known = state.isConnected !== null || state.isInternetReachable !== null;
    const offline = state.isConnected === false || state.isInternetReachable === false;
    publishRuntimeNetwork(!known ? 'unknown' : offline ? 'offline' : 'online');
  }), []);

  return children;
}
