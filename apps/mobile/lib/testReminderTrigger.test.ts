import { describe, expect, it } from 'vitest';
import {
  getTestDueAt,
  selectTestTriggerableCareReminder,
} from './testReminderTrigger';

describe('test reminder trigger', () => {
  it('selects only an enabled care-plan reminder', () => {
    const selected = selectTestTriggerableCareReminder([
      { _id: 'legacy', enabled: true },
      { _id: 'deleted', enabled: true, taskType: 'watering', isDeleted: true },
      { _id: 'disabled', enabled: false, taskType: 'watering' },
      { _id: 'care', enabled: true, carePlanId: 'plan-1', taskType: 'watering' },
    ]);

    expect(selected?._id).toBe('care');
  });

  it('respects an explicit reminder id without falling back', () => {
    expect(selectTestTriggerableCareReminder([
      { _id: 'care-a', enabled: true, taskType: 'watering' },
      { _id: 'care-b', enabled: true, taskType: 'fertilizing' },
    ], 'care-b')?._id).toBe('care-b');
    expect(selectTestTriggerableCareReminder([
      { _id: 'care-a', enabled: true, taskType: 'watering' },
    ], 'missing')).toBeUndefined();
  });

  it('moves the occurrence one minute into the past deterministically', () => {
    expect(getTestDueAt(1_000_000)).toBe(940_000);
    expect(() => getTestDueAt(Number.NaN)).toThrow('test_trigger_invalid_time');
  });
});
