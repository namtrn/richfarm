import { describe, expect, it } from 'vitest';
import {
  applyPendingPreferencePatches,
  pruneAcknowledgedPreferencePatchesFromQueue,
  type PreferencePatchOperation,
} from './preferencesQueue';

const operation = (appMode: 'gardener' | 'farmer', createdAt: number): PreferencePatchOperation => ({
  operationId: `mode-${createdAt}`,
  baseRevision: 0,
  patch: { appMode },
  createdAt,
  attempts: 0,
});

describe('applyPendingPreferencePatches', () => {
  it('shows the latest queued guest mode before remote settings exist', () => {
    expect(applyPendingPreferencePatches(undefined, [
      operation('gardener', 1),
      operation('farmer', 2),
    ])).toMatchObject({ appMode: 'farmer' });
  });

  it('preserves base settings while applying queued fields', () => {
    expect(applyPendingPreferencePatches(
      { unitSystem: 'metric', appMode: 'gardener' },
      [operation('farmer', 1)]
    )).toEqual({ unitSystem: 'metric', appMode: 'farmer' });
  });

  it('keeps an acknowledged mode optimistic until the remote revision catches up', async () => {
    const acknowledged = [{ ...operation('farmer', 1), acknowledgedRevision: 4 }];
    expect(applyPendingPreferencePatches(
      { revision: 3, appMode: 'gardener' },
      acknowledged
    )).toMatchObject({ appMode: 'farmer' });

    expect(pruneAcknowledgedPreferencePatchesFromQueue(acknowledged, 3)).toHaveLength(1);
    expect(pruneAcknowledgedPreferencePatchesFromQueue(acknowledged, 4)).toEqual([]);
  });
});
