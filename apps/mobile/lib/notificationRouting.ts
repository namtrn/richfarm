export type NotificationPayload = Record<string, unknown> | undefined;

export type NotificationReminder = {
  _id: string | number;
  entityUuid?: string | number | null;
  userPlantId?: string | number | null;
};

export type NotificationRoute = {
  pathname: '/(tabs)/reminder';
  params: {
    reminderId?: string;
    userPlantId?: string;
    batchKey?: string;
    reminderIds?: string;
  };
};

export function extractNotificationReminderIds(data: NotificationPayload) {
  const reminderIds = [
    ...(typeof data?.reminderId === 'string' ? [data.reminderId] : []),
    ...(Array.isArray(data?.reminderIds)
      ? data.reminderIds.filter((value): value is string => typeof value === 'string')
      : []),
  ];
  return [...new Set(reminderIds)];
}

export function notificationResponseKey(
  identifier: string | undefined,
  data: NotificationPayload,
) {
  const reminderIds = extractNotificationReminderIds(data);
  const batchKey = typeof data?.batchKey === 'string' ? data.batchKey : '';
  return `${identifier ?? 'notification'}:${reminderIds.join(',')}:${batchKey}`;
}

export function resolveNotificationRoute(
  reminders: NotificationReminder[],
  data: NotificationPayload,
): NotificationRoute | null {
  const reminderIds = extractNotificationReminderIds(data);
  const matching = reminders.filter((reminder) => reminderIds.some((id) =>
    String(reminder._id) === id || String(reminder.entityUuid) === id
  ));
  if (matching.length === 0) return null;

  if (matching.length === 1) {
    const reminder = matching[0];
    return {
      pathname: '/(tabs)/reminder',
      params: {
        reminderId: String(reminder._id),
        userPlantId: reminder.userPlantId ? String(reminder.userPlantId) : undefined,
      },
    };
  }

  return {
    pathname: '/(tabs)/reminder',
    params: {
      batchKey: typeof data?.batchKey === 'string' ? data.batchKey : undefined,
      reminderIds: matching.map((reminder) => String(reminder._id)).join(','),
    },
  };
}
