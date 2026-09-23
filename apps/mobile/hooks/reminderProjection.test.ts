import { describe, expect, it } from 'vitest';
import {
  filterDeletedPlantReminders,
  isReminderOverdue,
  isReminderSnoozed,
  selectReminderRows,
} from './reminderProjection';

describe('reminder projection selection', () => {
  it('uses an empty complete projection instead of stale fallback rows', () => {
    expect(selectReminderRows([], [{ _id: 'stale' }], true)).toEqual([]);
  });

  it('keeps fallback rows while an empty projection is still hydrating', () => {
    expect(selectReminderRows([], [{ _id: 'cached' }], false)).toEqual([{ _id: 'cached' }]);
  });

  it('merges partial projected rows over fallback by entityUuid or legacy _id', () => {
    expect(selectReminderRows(
      [{ _id: 'legacy-1', entityUuid: 'pending', title: 'new' }],
      [
        { _id: 'legacy-1', entityUuid: 'pending', title: 'old' },
        { _id: 'legacy-2', title: 'legacy' },
        { entityUuid: 'keep', title: 'cached' },
      ],
      false,
    )).toEqual([
      { _id: 'legacy-2', title: 'legacy' },
      { entityUuid: 'keep', title: 'cached' },
      { _id: 'legacy-1', entityUuid: 'pending', title: 'new' },
    ]);
  });
});

describe('reminder visibility', () => {
  it('does not classify a reminder with a future snooze as overdue', () => {
    expect(isReminderSnoozed({ snoozedUntil: 2_000 }, 1_000)).toBe(true);
    expect(isReminderOverdue({ enabled: true, nextRunAt: 500, snoozedUntil: 2_000 }, 1_000)).toBe(false);
    expect(isReminderOverdue({ enabled: true, nextRunAt: 500 }, 1_000)).toBe(true);
  });

  it('removes deleted-plant reminders from stale fallback rows after a partial merge', () => {
    const merged = selectReminderRows(
      [{ entityUuid: 'projected-live', userPlantId: 'live' }],
      [
        { entityUuid: 'stale-deleted', userPlantId: 'deleted' },
        { entityUuid: 'cached-live', userPlantId: 'live' },
        { entityUuid: 'independent' },
      ],
      false,
    );

    expect(filterDeletedPlantReminders(merged, new Set(['deleted']))).toEqual([
      { entityUuid: 'cached-live', userPlantId: 'live' },
      { entityUuid: 'independent' },
      { entityUuid: 'projected-live', userPlantId: 'live' },
    ]);
  });
});
