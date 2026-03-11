import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useMutation } from 'convex/react';
import { api } from '../../../packages/convex/convex/_generated/api';
import { useAuth } from '../lib/auth';
import { registerForPushNotificationsAsync } from '../lib/notifications';

export function useNotifications(enabled: boolean = true) {
  const { user, deviceId } = useAuth();
  const enabledRef = useRef(enabled);
  const registerDeviceToken = useMutation(
    api.notifications.registerDeviceToken
  );
  const lastTokenRef = useRef<string | null>(null);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (!enabledRef.current || !deviceId || !user) return;
    let cancelled = false;

    (async () => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (!token || cancelled) return;
        if (lastTokenRef.current === token) return;

        await registerDeviceToken({
          token,
          deviceId,
          platform: Platform.OS,
        });
        lastTokenRef.current = token;
      } catch {
        // Ignore registration errors; will retry on next app start.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deviceId, user, registerDeviceToken]);
}
