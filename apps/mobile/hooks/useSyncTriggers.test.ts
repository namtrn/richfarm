import { describe, expect, it } from 'vitest';
import { getSyncRetryDelay } from '../lib/sync/syncTriggerPolicy';

describe('getSyncRetryDelay', () => {
  it('schedules the trailing reconnect attempt instead of dropping it', () => {
    expect(getSyncRetryDelay(10_000, 12_000, 15_000)).toBe(13_000);
  });

  it('allows an attempt after the minimum interval', () => {
    expect(getSyncRetryDelay(10_000, 25_000, 15_000)).toBe(0);
    expect(getSyncRetryDelay(10_000, 30_000, 15_000)).toBe(0);
  });
});
