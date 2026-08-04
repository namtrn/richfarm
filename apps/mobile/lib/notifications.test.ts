import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
}));

vi.mock('expo-constants', () => ({
  default: {
    isDevice: true,
    expoConfig: { extra: { eas: { projectId: 'project-id' } } },
    easConfig: { projectId: 'project-id' },
  },
}));
vi.mock('expo-notifications', () => ({
  IosAuthorizationStatus: { PROVISIONAL: 'provisional' },
  PermissionStatus: { DENIED: 'denied' },
  AndroidImportance: { DEFAULT: 3 },
  getPermissionsAsync: mocks.getPermissionsAsync,
  requestPermissionsAsync: mocks.requestPermissionsAsync,
  getExpoPushTokenAsync: mocks.getExpoPushTokenAsync,
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  addNotificationResponseReceivedListener: vi.fn(),
  getLastNotificationResponseAsync: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import {
  getPushPermissionStatus,
  registerForPushNotificationsAsync,
} from './notifications';

describe('push permission and registration states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('distinguishes denied, provisional, and granted permission', async () => {
    mocks.getPermissionsAsync.mockResolvedValueOnce({ status: 'denied', ios: { status: 'denied' } });
    expect(await getPushPermissionStatus()).toBe('denied');
    mocks.getPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined', ios: { status: 'provisional' } });
    expect(await getPushPermissionStatus()).toBe('provisional');
    mocks.getPermissionsAsync.mockResolvedValueOnce({ status: 'granted', ios: { status: 'authorized' } });
    expect(await getPushPermissionStatus()).toBe('granted');
  });

  it('surfaces permission denial and provider configuration failures for retry', async () => {
    mocks.getPermissionsAsync.mockResolvedValueOnce({ status: 'denied', ios: { status: 'denied' } });
    mocks.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied', ios: { status: 'denied' } });
    await expect(registerForPushNotificationsAsync()).rejects.toThrow('push_permission_denied');

    mocks.getPermissionsAsync.mockResolvedValueOnce({ status: 'granted', ios: { status: 'authorized' } });
    mocks.getExpoPushTokenAsync.mockRejectedValueOnce(new Error('project_id_missing'));
    await expect(registerForPushNotificationsAsync()).rejects.toThrow('project_id_missing');

    mocks.getPermissionsAsync.mockResolvedValueOnce({ status: 'granted', ios: { status: 'authorized' } });
    mocks.getExpoPushTokenAsync.mockResolvedValueOnce({ data: 'ExponentPushToken[retry]' });
    await expect(registerForPushNotificationsAsync()).resolves.toBe('ExponentPushToken[retry]');
  });
});
