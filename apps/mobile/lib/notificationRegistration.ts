export function notificationRegistrationScopeKey(args: {
  enabled: boolean;
  userKey: string | null | undefined;
  deviceId: string | null | undefined;
}): string | null {
  if (!args.enabled || !args.userKey || !args.deviceId) return null;
  return `${args.userKey}:${args.deviceId}`;
}

export function updateNotificationRegistrationScope(args: {
  previousScopeKey: string | null;
  nextScopeKey: string | null;
  lastRegistrationKey: string | null;
}) {
  return {
    scopeKey: args.nextScopeKey,
    lastRegistrationKey:
      args.previousScopeKey === args.nextScopeKey
        ? args.lastRegistrationKey
        : null,
  };
}
