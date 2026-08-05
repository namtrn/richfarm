import { describe, expect, it } from 'vitest';
import {
  extractNotificationReminderIds,
  notificationResponseKey,
  resolveNotificationRoute,
} from './notificationRouting';

const reminders = [
  { _id: 'reminder-a', entityUuid: 'entity-a', userId: 'account-a', userPlantId: 'plant-a', nextRunAt: 100, enabled: true },
  { _id: 'reminder-b', entityUuid: 'entity-b', userId: 'account-a', userPlantId: 'plant-b', nextRunAt: 200, enabled: true },
];

describe('notification routing', () => {
  it('deduplicates reminder IDs and response keys', () => {
    const data = {
      reminderId: 'entity-a',
      reminderIds: ['reminder-a', 'entity-a', 'reminder-a', 42],
      batchKey: '2026-08-03:garden-a:bed-a',
    };
    expect(extractNotificationReminderIds(data)).toEqual(['entity-a', 'reminder-a']);
    expect(notificationResponseKey('expo-response-1', data)).toBe(
      'semantic::entity-a,reminder-a::2026-08-03:garden-a:bed-a',
    );
    expect(notificationResponseKey('expo-response-1', data)).toBe(
      notificationResponseKey('expo-response-1', data),
    );
  });

  it('routes a single authoritative reminder to its plant context', () => {
    expect(resolveNotificationRoute(reminders, { reminderId: 'entity-a' })).toEqual({
      pathname: '/(tabs)/reminder',
      params: { reminderId: 'reminder-a', userPlantId: 'plant-a' },
    });
  });

  it('routes a matching batch and ignores unknown stale IDs', () => {
    expect(resolveNotificationRoute(reminders, {
      reminderIds: ['reminder-b', 'reminder-a', 'deleted-reminder'],
      batchKey: '2026-08-03:garden-a:bed-a',
    })).toEqual({
      pathname: '/(tabs)/reminder',
      params: {
        batchKey: '2026-08-03:garden-a:bed-a',
        reminderIds: 'reminder-a,reminder-b',
      },
    });
  });

  it('drops stale or wrong-account payloads with no authoritative match', () => {
    expect(resolveNotificationRoute(reminders, { reminderId: 'deleted-reminder' })).toBeNull();
    expect(resolveNotificationRoute(reminders, { reminderId: 'account-b-reminder' })).toBeNull();
  });

  it('drops a stale occurrence even when the reminder still exists', () => {
    expect(resolveNotificationRoute(reminders, {
      reminderIds: ['reminder-a'], occurrenceKeys: ['entity-a:99'],
    })).toBeNull();
    expect(resolveNotificationRoute(reminders, {
      reminderIds: ['reminder-a'], occurrenceKeys: ['entity-a:100'],
    })).toEqual({
      pathname: '/(tabs)/reminder',
      params: { reminderId: 'reminder-a', userPlantId: 'plant-a' },
    });
  });

  it('rejects a wrong-account or disabled reminder even when the identifier matches', () => {
    expect(resolveNotificationRoute(reminders, {
      userId: 'account-b', reminderId: 'reminder-a',
    })).toBeNull();
    expect(resolveNotificationRoute([
      { ...reminders[0], enabled: false },
    ], {
      userId: 'account-a', reminderId: 'reminder-a',
    })).toBeNull();
  });

  it('rejects tombstoned reminders and inactive authoritative plants', () => {
    expect(resolveNotificationRoute([
      { ...reminders[0], tombstoned: true },
    ], { reminderId: 'reminder-a' })).toBeNull();
    expect(resolveNotificationRoute(reminders, {
      version: 'care-plan-v2', userId: 'account-a', reminderId: 'reminder-a',
    }, [
      { _id: 'plant-a', userId: 'account-a', status: 'harvested' },
    ])).toBeNull();
    expect(resolveNotificationRoute(reminders, {
      version: 'care-plan-v2', reminderId: 'reminder-a',
    }, [
      { _id: 'plant-a', userId: 'account-a', status: 'growing' },
    ])).toBeNull();
  });

  it('accepts a singular occurrence key and deduplicates semantic response keys', () => {
    expect(resolveNotificationRoute(reminders, {
      userId: 'account-a', reminderId: 'entity-a', occurrenceKey: 'entity-a:100',
    })).toEqual({
      pathname: '/(tabs)/reminder',
      params: { reminderId: 'reminder-a', userPlantId: 'plant-a' },
    });
    const data = {
      userId: 'account-a', reminderIds: ['reminder-a'], occurrenceKeys: ['entity-a:100'],
      batchKey: 'day:garden:bed',
    };
    expect(notificationResponseKey('response-a', data)).toBe(
      notificationResponseKey('response-b', data),
    );
  });
});
