import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let notificationHandlerConfigured = false;
const notificationRegistrationRetryListeners = new Set<() => void>();

export type PushPermissionState =
  | 'granted'
  | 'provisional'
  | 'denied'
  | 'undetermined'
  | 'unsupported'
  | 'unknown';

export type NotificationRegistrationState = {
  status: 'idle' | 'registering' | 'registered' | 'unsupported' | 'failed';
  permission: PushPermissionState;
  platform: string;
  deviceId?: string;
  lastAttemptAt?: number;
  error?: string;
};

export type NotificationResponseListener = (
  response: Notifications.NotificationResponse,
) => void;

function ensureNotificationHandler() {
  if (notificationHandlerConfigured) return;
  notificationHandlerConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function getPushPermissionStatus(): Promise<PushPermissionState> {
  if (!Constants.isDevice) return 'unsupported';
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status === 'granted') return 'granted';
  if (permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return 'provisional';
  }
  if (permission.status === 'denied') return 'denied';
  return 'undetermined';
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  ensureNotificationHandler();

  if (!Constants.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  let iosAuthorizationStatus: any;
  if (existingStatus !== 'granted') {
    const permission = await Notifications.requestPermissionsAsync();
    finalStatus = permission.status;
    iosAuthorizationStatus = permission.ios?.status;
  }
  const isGranted = finalStatus === 'granted'
    || iosAuthorizationStatus === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!isGranted) throw new Error('push_permission_denied');

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  return tokenResponse.data;
}

export function subscribeNotificationResponses(listener: NotificationResponseListener) {
  return Notifications.addNotificationResponseReceivedListener(listener);
}

export function subscribePushTokenChanges(listener: (token: string) => void) {
  return Notifications.addPushTokenListener((token) => listener(token.data));
}

export function subscribeNotificationRegistrationRetry(listener: () => void) {
  notificationRegistrationRetryListeners.add(listener);
  return () => {
    notificationRegistrationRetryListeners.delete(listener);
  };
}

export function notifyNotificationPermissionChanged() {
  for (const listener of notificationRegistrationRetryListeners) listener();
}

export async function getLastNotificationResponse() {
  return await Notifications.getLastNotificationResponseAsync();
}
