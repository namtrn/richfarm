import { describe, expect, it } from 'vitest';
import { buildNotificationDevStatusLines } from './notificationStatus';

describe('notification development status', () => {
  it('surfaces permission, registration failure, retry timing, and redacted token state', () => {
    const lines = buildNotificationDevStatusLines({
      status: 'failed',
      permission: 'denied',
      platform: 'ios',
      deviceId: 'device-a',
      lastAttemptAt: Date.parse('2026-08-03T00:00:00Z'),
      error: 'push_permission_denied',
    }, [{
      deviceId: 'device-a',
      platform: 'ios',
      isActive: false,
      lastUsedAt: 123,
      token: 'Exponent…e-a]',
    }]);

    expect(lines).toEqual(expect.arrayContaining([
      'hook=failed permission=denied platform=ios',
      'device=device-a lastAttempt=2026-08-03T00:00:00.000Z',
      'error=push_permission_denied',
      'token device=device-a platform=ios active=false masked=Exponent…e-a] lastUsed=123',
    ]));
  });

  it('surfaces provisional permission and an explicit retrying state without token data', () => {
    expect(buildNotificationDevStatusLines({
      status: 'registering',
      permission: 'provisional',
      platform: 'ios',
      deviceId: 'device-a',
      lastAttemptAt: 1,
    }, [])).toEqual([
      'hook=registering permission=provisional platform=ios',
      'device=device-a lastAttempt=1970-01-01T00:00:00.001Z',
      'token=none',
    ]);
  });
});
