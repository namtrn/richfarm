export type TestTriggerableReminder = {
  _id: string;
  carePlanId?: unknown;
  taskType?: unknown;
  enabled?: boolean;
  isDeleted?: boolean;
};

export function selectTestTriggerableCareReminder(
  reminders: TestTriggerableReminder[],
  reminderId?: string,
) {
  return reminders.find((reminder) => {
    if (reminderId && String(reminder._id) !== String(reminderId)) return false;
    return reminder.enabled !== false
      && !reminder.isDeleted
      && Boolean(reminder.carePlanId || reminder.taskType);
  });
}

export function getTestDueAt(now: number) {
  if (!Number.isFinite(now)) {
    throw new Error('test_trigger_invalid_time');
  }
  return now - 60_000;
}
