export type NotificationPayload = Record<string, unknown> | undefined;

export type NotificationReminder = {
  _id: string | number;
  entityUuid?: string | number | null;
  userId?: string | number | null;
  userPlantId?: string | number | null;
  nextRunAt?: string | number | null;
  enabled?: boolean;
  isDeleted?: boolean;
  tombstoned?: boolean;
  _tombstoned?: boolean;
  _pendingOutcome?: string;
};

export type NotificationPlant = {
  _id: string | number;
  entityUuid?: string | number | null;
  userId?: string | number | null;
  status?: string;
  isDeleted?: boolean;
  tombstoned?: boolean;
  _tombstoned?: boolean;
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

export function extractNotificationOccurrenceKeys(data: NotificationPayload) {
  const values = Array.isArray(data?.occurrenceKeys)
    ? data.occurrenceKeys
    : typeof data?.occurrenceKey === 'string'
      ? [data.occurrenceKey]
      : [];
  return [...new Set(values.filter((value): value is string => typeof value === 'string'))];
}

export function notificationResponseKey(
  identifier: string | undefined,
  data: NotificationPayload,
) {
  const reminderIds = extractNotificationReminderIds(data);
  const occurrenceKeys = extractNotificationOccurrenceKeys(data);
  const batchKey = typeof data?.batchKey === 'string' ? data.batchKey : '';
  const userId = typeof data?.userId === 'string' ? data.userId : '';
  if (reminderIds.length > 0 || occurrenceKeys.length > 0 || batchKey || userId) {
    // The semantic occurrence is more stable than the platform response
    // identifier, which can differ when a warm and cold listener observe the
    // same notification.
    return `semantic:${userId}:${[...reminderIds].sort().join(',')}:${[...occurrenceKeys].sort().join(',')}:${batchKey}`;
  }
  return `${identifier ?? 'notification'}::::`;
}

function occurrenceAwareReminderIds(data: NotificationPayload) {
  if (Array.isArray(data?.reminderIds)) {
    return data.reminderIds.filter((value): value is string => typeof value === 'string');
  }
  return typeof data?.reminderId === 'string' ? [data.reminderId] : [];
}

export function resolveNotificationRoute(
  reminders: NotificationReminder[],
  data: NotificationPayload,
  plants?: NotificationPlant[],
): NotificationRoute | null {
  const reminderIds = extractNotificationReminderIds(data);
  const occurrenceKeys = extractNotificationOccurrenceKeys(data);
  const occurrenceIds = occurrenceAwareReminderIds(data);
  const payloadUserId = typeof data?.userId === 'string' ? data.userId : undefined;
  const isPhase2Payload = data?.version === 'care-plan-v2';
  if (isPhase2Payload && !payloadUserId) return null;
  const matching = reminders.filter((reminder) => {
    if (payloadUserId && String(reminder.userId) !== payloadUserId) return false;
    if (
      reminder.enabled === false
      || reminder.isDeleted
      || reminder.tombstoned
      || reminder._tombstoned
      || reminder._pendingOutcome === 'deleted'
    ) return false;
    if (plants && reminder.userPlantId) {
      const plant = plants.find((candidate) =>
        String(candidate._id) === String(reminder.userPlantId)
        || String(candidate.entityUuid) === String(reminder.userPlantId)
      );
      if (
        !plant
        || (payloadUserId && plant.userId !== undefined && String(plant.userId) !== payloadUserId)
        || plant.isDeleted
        || plant.tombstoned
        || plant._tombstoned
        || plant.status === 'harvested'
        || plant.status === 'archived'
      ) return false;
    }
    return reminderIds.some((id) =>
      String(reminder._id) === id || String(reminder.entityUuid) === id
    );
  }).filter((reminder) => {
    if (occurrenceKeys.length === 0) return true;
    const index = occurrenceIds.findIndex((id) =>
      String(reminder._id) === id || String(reminder.entityUuid) === id
    );
    if (index < 0 || reminder.nextRunAt === undefined || reminder.nextRunAt === null) return false;
    const currentKey = `${reminder.entityUuid ?? reminder._id}:${reminder.nextRunAt}`;
    return occurrenceKeys[index] === currentKey;
  });
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
