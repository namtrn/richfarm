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

    it('merges partial projected rows over fallback rows by entity identity', () => {
        expect(selectReminderRows(
            [{ entityUuid: 'pending', title: 'new' }],
            [
                { entityUuid: 'keep', title: 'cached' },
                { entityUuid: 'pending', title: 'old' },
                { title: 'legacy-without-id' },
            ],
            false,
        )).toEqual([
            { entityUuid: 'keep', title: 'cached' },
            { title: 'legacy-without-id' },
            { entityUuid: 'pending', title: 'new' },
        ]);
    });

    it('deduplicates legacy rows by their _id when entityUuid is absent', () => {
        expect(selectReminderRows(
            [{ _id: 'legacy-1', title: 'projected' }],
            [{ _id: 'legacy-1', title: 'fallback' }, { _id: 'legacy-2' }],
            false,
        )).toEqual([{ _id: 'legacy-2' }, { _id: 'legacy-1', title: 'projected' }]);
    });
});

describe('reminder snooze visibility', () => {
    it('hides a reminder until its future snooze time', () => {
        expect(isReminderSnoozed({ snoozedUntil: 2_000 }, 1_000)).toBe(true);
        expect(isReminderSnoozed({ snoozedUntil: 1_000 }, 1_000)).toBe(false);
    });

    it('does not classify a snoozed overdue reminder as overdue', () => {
        expect(isReminderOverdue({ enabled: true, nextRunAt: 500, snoozedUntil: 2_000 }, 1_000)).toBe(false);
        expect(isReminderOverdue({ enabled: true, nextRunAt: 500 }, 1_000)).toBe(true);
    });

    it('removes reminders whose linked plant is explicitly deleted', () => {
        expect(filterDeletedPlantReminders(
            [{ userPlantId: 'deleted' }, { userPlantId: 'live' }, { title: 'garden' }],
            new Set(['deleted']),
        )).toEqual([{ userPlantId: 'live' }, { title: 'garden' }]);
    });

    it('filters deleted plants from stale fallback rows during partial projection hydration', () => {
        const merged = selectReminderRows(
            [{ entityUuid: 'projected-live', userPlantId: 'live' }],
            [
                { entityUuid: 'stale-deleted', userPlantId: 'deleted' },
                { entityUuid: 'cached-live', userPlantId: 'live' },
            ],
            false,
        );

        expect(filterDeletedPlantReminders(merged, new Set(['deleted']))).toEqual([
            { entityUuid: 'cached-live', userPlantId: 'live' },
            { entityUuid: 'projected-live', userPlantId: 'live' },
        ]);
    });
});
