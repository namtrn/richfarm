import {
  notificationResponseKey,
  resolveNotificationRoute,
  type NotificationPlant,
  type NotificationReminder,
  type NotificationRoute,
} from './notificationRouting';

export type NotificationResponseLike = {
  notification?: {
    request?: {
      identifier?: string;
      content?: { data?: Record<string, unknown> };
    };
  };
};

export type NotificationResponseDecision =
  | { status: 'wait' }
  | {
      status: 'handled';
      responseKey: string;
      route: NotificationRoute | null;
      duplicate: boolean;
    };

/**
 * A null scope is the normal cold-start gap between auth and sync identity.
 * Retain a response across that transition, but discard it when leaving an
 * account or switching directly between accounts to avoid cross-account use.
 */
export function shouldClearPendingNotificationResponse(
  previousScope: string | null,
  nextScope: string | null,
) {
  return previousScope !== null
    && (nextScope === null || previousScope !== nextScope);
}

export function decideNotificationResponse(input: {
  response: NotificationResponseLike | null;
  authoritative: boolean;
  reminders: NotificationReminder[];
  plants?: NotificationPlant[];
  handledKeys?: ReadonlySet<string>;
}): NotificationResponseDecision {
  if (!input.response || !input.authoritative) return { status: 'wait' };

  const data = input.response.notification?.request?.content?.data;
  const responseKey = notificationResponseKey(
    input.response.notification?.request?.identifier,
    data,
  );
  if (input.handledKeys?.has(responseKey)) {
    return { status: 'handled', responseKey, route: null, duplicate: true };
  }

  return {
    status: 'handled',
    responseKey,
    route: resolveNotificationRoute(input.reminders, data, input.plants),
    duplicate: false,
  };
}
