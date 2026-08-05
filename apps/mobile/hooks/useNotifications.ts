import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import { api } from '../../../packages/convex/convex/_generated/api';
import { useAuth } from '../lib/auth';
import {
  getPushPermissionStatus,
  getLastNotificationResponse,
  type NotificationRegistrationState,
  registerForPushNotificationsAsync,
  subscribeNotificationRegistrationRetry,
  subscribeNotificationResponses,
  subscribePushTokenChanges,
} from '../lib/notifications';
import {
  decideNotificationResponse,
  shouldClearPendingNotificationResponse,
} from '../lib/notificationResponse';
import {
  notificationRegistrationScopeKey,
  updateNotificationRegistrationScope,
} from '../lib/notificationRegistration';
import { useSyncScope } from '../lib/state/syncScopeStore';
import { useSyncProjectionEntities, useSyncProjectionMeta } from './useSyncProjection';

export function useNotifications(enabled: boolean = true) {
  const { user, deviceId } = useAuth();
  const router = useRouter();
  const enabledRef = useRef(enabled);
  const registerDeviceToken = useMutation(
    api.notifications.registerDeviceToken
  );
  const lastRegistrationRef = useRef<string | null>(null);
  const registrationScopeRef = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [registration, setRegistration] = useState<NotificationRegistrationState>({
    status: 'idle',
    permission: 'unknown',
    platform: Platform.OS,
    deviceId,
  });

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const registrationUserKey = user
    ? String((user as any).id ?? (user as any)._id ?? (user as any).email ?? 'account')
    : null;
  const registrationScopeKey = notificationRegistrationScopeKey({
    enabled,
    userKey: registrationUserKey,
    deviceId,
  });

  // The server deactivates this device's token during sign-out. Invalidate the
  // process-local registration cache whenever auth/device scope is torn down or
  // changes, so same-account re-login still rebinds the token.
  useEffect(() => {
    const nextScope = updateNotificationRegistrationScope({
      previousScopeKey: registrationScopeRef.current,
      nextScopeKey: registrationScopeKey,
      lastRegistrationKey: lastRegistrationRef.current,
    });
    registrationScopeRef.current = nextScope.scopeKey;
    lastRegistrationRef.current = nextScope.lastRegistrationKey;
  }, [registrationScopeKey]);

  useEffect(() => {
    const appState = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') setAttempt((value) => value + 1);
    });
    const network = NetInfo.addEventListener((state) => {
      if (state.isConnected) setAttempt((value) => value + 1);
    });
    return () => {
      appState.remove();
      network();
    };
  }, []);

  useEffect(() => {
    if (!enabled || !deviceId || !registrationUserKey) return;
    const subscription = subscribePushTokenChanges(() => {
      setAttempt((value) => value + 1);
    });
    return () => subscription.remove();
  }, [deviceId, enabled, registrationUserKey]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeNotificationRegistrationRetry(() => {
      // Permission can transition from denied/undetermined to granted while
      // this hook remains mounted. A fresh attempt must rebind the server row;
      // otherwise the same token cache would short-circuit registerDeviceToken.
      lastRegistrationRef.current = null;
      setAttempt((value) => value + 1);
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !enabledRef.current || !deviceId || !user) {
      setRegistration({ status: 'idle', permission: 'unknown', platform: Platform.OS, deviceId });
      return;
    }
    let cancelled = false;
    const userKey = registrationUserKey ?? 'account';
    const lastAttemptAt = Date.now();
    setRegistration({ status: 'registering', permission: 'unknown', platform: Platform.OS, deviceId, lastAttemptAt });

    (async () => {
      try {
        const initialPermission = await getPushPermissionStatus();
        if (!cancelled) {
          setRegistration((current) => ({ ...current, permission: initialPermission }));
        }
        const token = await registerForPushNotificationsAsync();
        if (!token) {
          if (!cancelled) {
            setRegistration((current) => ({ ...current, status: 'unsupported' }));
          }
          return;
        }
        if (cancelled) return;
        const registrationKey = `${userKey}:${token}`;
        if (lastRegistrationRef.current === registrationKey) {
          setRegistration((current) => ({ ...current, status: 'registered' }));
          return;
        }

        await registerDeviceToken({
          token,
          deviceId,
          platform: Platform.OS,
        });
        if (cancelled) return;
        lastRegistrationRef.current = registrationKey;
        const finalPermission = await getPushPermissionStatus().catch(() => 'unknown' as const);
        setRegistration((current) => ({ ...current, status: 'registered', permission: finalPermission }));
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'push_registration_failed';
        const permission = await getPushPermissionStatus().catch(() => 'unknown' as const);
        setRegistration((current) => ({ ...current, status: 'failed', permission, error: message }));
        console.warn(`[notifications] ${userKey}: ${message}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt, deviceId, enabled, registerDeviceToken, registrationUserKey, user]);

  const reminders = useSyncProjectionEntities('reminder') as any[];
  const plants = useSyncProjectionEntities('plant') as any[];
  const { isComplete: projectionComplete } = useSyncProjectionMeta();
  const scope = useSyncScope((state) => state.scope);
  const pendingResponse = useRef<any>(null);
  const handledResponses = useRef(new Set<string>());
  const [responseVersion, setResponseVersion] = useState(0);
  const previousScope = useRef(scope);

  useEffect(() => {
    if (previousScope.current !== scope) {
      if (shouldClearPendingNotificationResponse(previousScope.current, scope)) {
        pendingResponse.current = null;
      }
      previousScope.current = scope;
      handledResponses.current.clear();
    }
  }, [scope]);

  useEffect(() => {
    if (!enabled || !user) return;
    let active = true;
    const accept = (response: any) => {
      if (!active) return;
      pendingResponse.current = response;
      // Refs preserve the response across hydration, but do not cause a
      // render. Bump state so a response arriving after projection completion
      // evaluates immediately (warm taps and late cold-start promises).
      setResponseVersion((value) => value + 1);
    };
    const subscription = subscribeNotificationResponses(accept);
    void getLastNotificationResponse().then((response) => {
      if (response) accept(response);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [enabled, registrationUserKey]);

  useEffect(() => {
    if (!enabled || !user || !scope || !projectionComplete) return;
    const response = pendingResponse.current;
    if (!response) return;
    const decision = decideNotificationResponse({
      response,
      authoritative: projectionComplete,
      reminders,
      plants,
      handledKeys: handledResponses.current,
    });
    if (decision.status !== 'handled') return;

    // Mark/clear only after the authoritative projection has produced its
    // route decision. Before that point, retain the response for a retry.
    handledResponses.current.add(decision.responseKey);
    pendingResponse.current = null;
    if (decision.route) router.push(decision.route);
  }, [enabled, plants, projectionComplete, reminders, responseVersion, router, scope, user]);

  return registration;
}
