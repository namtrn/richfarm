export function selectReminderRows<T>(
  projectedRows: readonly T[],
  fallbackRows: readonly T[] | undefined,
  projectionComplete: boolean,
): T[] | undefined {
  if (projectionComplete) return [...projectedRows];
  if (projectedRows.length === 0) return fallbackRows ? [...fallbackRows] : undefined;

  const projectedIdentities = new Set(projectedRows.flatMap(getReminderIdentities));
  const mergedFallback = (fallbackRows ?? []).filter((row) => {
    const identities = getReminderIdentities(row);
    return identities.length === 0 || identities.every((identity) => !projectedIdentities.has(identity));
  });
  return [...mergedFallback, ...projectedRows];
}

function getReminderIdentities(row: unknown) {
  const value = row as { entityUuid?: unknown; _id?: unknown } | null | undefined;
  const identities: string[] = [];
  if (typeof value?.entityUuid === 'string' && value.entityUuid.length > 0) {
    identities.push(`entity:${value.entityUuid}`);
  }
  if (value?._id !== undefined && value?._id !== null) {
    identities.push(`legacy:${String(value._id)}`);
  }
  return identities;
}

export function filterDeletedPlantReminders<T extends { userPlantId?: unknown }>(
  reminders: readonly T[] | undefined,
  deletedPlantIdentities: ReadonlySet<string>,
) {
  if (!reminders) return undefined;
  return reminders.filter((reminder) => {
    if (reminder.userPlantId === undefined || reminder.userPlantId === null) return true;
    return !deletedPlantIdentities.has(String(reminder.userPlantId));
  });
}

export function isReminderSnoozed(
  reminder: { snoozedUntil?: number } | null | undefined,
  now: number,
) {
  return typeof reminder?.snoozedUntil === 'number' && reminder.snoozedUntil > now;
}

export function isReminderOverdue(
  reminder: { enabled?: boolean; nextRunAt?: number; snoozedUntil?: number } | null | undefined,
  now: number,
) {
  return Boolean(reminder?.enabled)
    && !isReminderSnoozed(reminder, now)
    && typeof reminder?.nextRunAt === 'number'
    && reminder.nextRunAt < now;
}
