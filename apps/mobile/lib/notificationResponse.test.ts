import { describe, expect, it } from 'vitest';
import {
  decideNotificationResponse,
  shouldClearPendingNotificationResponse,
} from './notificationResponse';

const response = {
  notification: {
    request: {
      identifier: 'cold-response',
      content: {
        data: {
          version: 'care-plan-v2',
          userId: 'account-a',
          reminderId: 'entity-a',
          occurrenceKey: 'entity-a:100',
        },
      },
    },
  },
};

const reminders = [{
  _id: 'reminder-a', entityUuid: 'entity-a', userId: 'account-a',
  userPlantId: 'plant-a', nextRunAt: 100, enabled: true,
}];

describe('notification response lifecycle', () => {
  it('retains a cold-start response until authoritative hydration, including null-to-account scope transition', () => {
    const handled = new Set<string>();
    const waiting = decideNotificationResponse({
      response,
      authoritative: false,
      reminders: [],
      handledKeys: handled,
    });

    expect(waiting).toEqual({ status: 'wait' });
    expect(handled).toHaveLength(0);
    expect(shouldClearPendingNotificationResponse(null, 'account-a')).toBe(false);

    const decision = decideNotificationResponse({
      response,
      authoritative: true,
      reminders,
      handledKeys: handled,
    });
    expect(decision.status).toBe('handled');
    if (decision.status !== 'handled') return;
    expect(decision.route).toEqual({
      pathname: '/(tabs)/reminder',
      params: { reminderId: 'reminder-a', userPlantId: 'plant-a' },
    });

    handled.add(decision.responseKey);
    expect(decideNotificationResponse({
      response,
      authoritative: true,
      reminders,
      handledKeys: handled,
    })).toMatchObject({ status: 'handled', route: null, duplicate: true });
  });

  it('clears a pending response when leaving or switching account scope, but not during cold-start scope acquisition', () => {
    expect(shouldClearPendingNotificationResponse(null, 'account-a')).toBe(false);
    expect(shouldClearPendingNotificationResponse('account-a', null)).toBe(true);
    expect(shouldClearPendingNotificationResponse('account-a', 'account-b')).toBe(true);
    expect(shouldClearPendingNotificationResponse('account-a', 'account-a')).toBe(false);
  });

  it('makes a wrong-account decision only after authoritative hydration', () => {
    const wrongAccount = {
      ...response,
      notification: {
        ...response.notification,
        request: {
          ...response.notification.request,
          content: { data: { ...response.notification.request.content.data, userId: 'account-b' } },
        },
      },
    };
    expect(decideNotificationResponse({
      response: wrongAccount,
      authoritative: false,
      reminders: [],
    })).toEqual({ status: 'wait' });
    expect(decideNotificationResponse({
      response: wrongAccount,
      authoritative: true,
      reminders,
    })).toMatchObject({ status: 'handled', route: null, duplicate: false });
  });
});
