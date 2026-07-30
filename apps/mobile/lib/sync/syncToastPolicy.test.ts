import { describe, expect, it } from 'vitest';
import { selectSyncToastKind } from './syncToastPolicy';

const base = {
  status: 'idle' as const,
  isOffline: false,
  isLocalOnly: false,
  hasPending: false,
  hasQuarantine: false,
  previouslyHadPending: false,
};

describe('sync toast policy', () => {
  it('prioritizes durable review attention over other transient states', () => {
    expect(selectSyncToastKind({
      ...base,
      status: 'attention',
      isOffline: true,
      hasPending: true,
      hasQuarantine: true,
    })).toBe('attention');
  });

  it('uses a local-save toast for guest data and an offline toast for account data', () => {
    expect(selectSyncToastKind({
      ...base,
      status: 'offline',
      isOffline: true,
      isLocalOnly: true,
      hasPending: true,
    })).toBe('local');
    expect(selectSyncToastKind({
      ...base,
      status: 'offline',
      isOffline: true,
      hasPending: true,
    })).toBe('offline');
  });

  it('shows completion once pending work reconciles', () => {
    expect(selectSyncToastKind({
      ...base,
      previouslyHadPending: true,
    })).toBe('complete');
  });
});
