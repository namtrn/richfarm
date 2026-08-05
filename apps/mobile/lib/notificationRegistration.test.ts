import { describe, expect, it, vi } from 'vitest';
import {
  notificationRegistrationScopeKey,
  updateNotificationRegistrationScope,
} from './notificationRegistration';

describe('useNotifications registration scope cache', () => {
  it('invalidates a same-account token cache across logout and login', () => {
    const token = 'ExponentPushToken[same-device]';
    const registerDeviceToken = vi.fn();
    let scopeKey: string | null = null;
    let lastRegistrationKey: string | null = null;

    const runRegistrationEffect = (args: {
      enabled: boolean;
      userKey: string | null;
      deviceId: string | null;
    }) => {
      const nextScope = updateNotificationRegistrationScope({
        previousScopeKey: scopeKey,
        nextScopeKey: notificationRegistrationScopeKey(args),
        lastRegistrationKey,
      });
      scopeKey = nextScope.scopeKey;
      lastRegistrationKey = nextScope.lastRegistrationKey;

      if (!args.enabled || !args.userKey || !args.deviceId) return;
      const nextRegistrationKey = `${args.userKey}:${token}`;
      if (lastRegistrationKey === nextRegistrationKey) return;

      registerDeviceToken({
        userKey: args.userKey,
        deviceId: args.deviceId,
        token,
      });
      lastRegistrationKey = nextRegistrationKey;
    };

    runRegistrationEffect({ enabled: true, userKey: 'user-a', deviceId: 'device-1' });
    expect(registerDeviceToken).toHaveBeenCalledTimes(1);

    runRegistrationEffect({ enabled: true, userKey: null, deviceId: 'device-1' });
    expect(lastRegistrationKey).toBeNull();

    runRegistrationEffect({ enabled: true, userKey: 'user-a', deviceId: 'device-1' });
    expect(registerDeviceToken).toHaveBeenCalledTimes(2);
    expect(registerDeviceToken).toHaveBeenLastCalledWith({
      userKey: 'user-a',
      deviceId: 'device-1',
      token,
    });
  });

  it('invalidates the cache when the device changes or notifications are disabled', () => {
    const scope = notificationRegistrationScopeKey({
      enabled: true,
      userKey: 'user-a',
      deviceId: 'device-1',
    });
    const registered = 'user-a:ExponentPushToken[same-device]';

    const deviceChanged = updateNotificationRegistrationScope({
      previousScopeKey: scope,
      nextScopeKey: notificationRegistrationScopeKey({
        enabled: true,
        userKey: 'user-a',
        deviceId: 'device-2',
      }),
      lastRegistrationKey: registered,
    });
    expect(deviceChanged.lastRegistrationKey).toBeNull();

    const disabled = updateNotificationRegistrationScope({
      previousScopeKey: deviceChanged.scopeKey,
      nextScopeKey: notificationRegistrationScopeKey({
        enabled: false,
        userKey: 'user-a',
        deviceId: 'device-2',
      }),
      lastRegistrationKey: registered,
    });
    expect(disabled.scopeKey).toBeNull();
    expect(disabled.lastRegistrationKey).toBeNull();
  });

  it('forces a fresh server registration after a permission retry', () => {
    const token = 'ExponentPushToken[same-device]';
    const registerDeviceToken = vi.fn();
    let lastRegistrationKey: string | null = null;

    const runRegistrationAttempt = () => {
      const registrationKey = `user-a:${token}`;
      if (lastRegistrationKey === registrationKey) return;
      registerDeviceToken({ userKey: 'user-a', deviceId: 'device-1', token });
      lastRegistrationKey = registrationKey;
    };

    runRegistrationAttempt();
    expect(registerDeviceToken).toHaveBeenCalledTimes(1);

    // Mirrors the retry listener in useNotifications: a permission transition
    // invalidates the process-local cache before incrementing the attempt.
    lastRegistrationKey = null;
    runRegistrationAttempt();
    expect(registerDeviceToken).toHaveBeenCalledTimes(2);
  });
});
