import type { NotificationRegistrationState } from './notifications';

export type NotificationTokenStatus = {
  deviceId: string;
  platform: string;
  isActive: boolean;
  lastUsedAt: number;
  token: string;
};

export function buildNotificationDevStatusLines(
  registration: NotificationRegistrationState,
  tokens: NotificationTokenStatus[],
) {
  const lines = [
    `hook=${registration.status} permission=${registration.permission} platform=${registration.platform}`,
    `device=${registration.deviceId ?? 'none'} lastAttempt=${registration.lastAttemptAt ? new Date(registration.lastAttemptAt).toISOString() : 'none'}`,
  ];
  if (registration.error) lines.push(`error=${registration.error}`);
  if (tokens.length === 0) {
    lines.push('token=none');
  } else {
    for (const token of tokens) {
      lines.push(
        `token device=${token.deviceId} platform=${token.platform} active=${String(token.isActive)} masked=${token.token} lastUsed=${token.lastUsedAt}`,
      );
    }
  }
  return lines;
}
