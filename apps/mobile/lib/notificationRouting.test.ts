import { describe, expect, it } from 'vitest';
import {
  extractNotificationReminderIds,
  notificationResponseKey,
  resolveNotificationRoute,
} from './notificationRouting';

const reminders = [
  { _id: 'reminder-a', entityUuid: 'entity-a', userPlantId: 'plant-a' },
  { _id: 'reminder-b', entityUuid: 'entity-b', userPlantId: 'plant-b' },
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
      'expo-response-1:entity-a,reminder-a:2026-08-03:garden-a:bed-a',
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
});
