import { describe, expect, it } from 'vitest';
import { selectPlantContent } from './plantContentProjection';

const belongsToPlant = (entry: { plantUuid: string }) => entry.plantUuid === 'plant-a';

// Regression: ISSUE-001 — guest plant content was hidden until projection hydration.
// Found by /qa on 2026-09-16
// Report: .gstack/qa-reports/qa-report-richfarm-mobile-2026-09-16.md
describe('selectPlantContent', () => {
  it('renders guest pending content from an incomplete projection', () => {
    expect(selectPlantContent({
      identityKind: 'guest',
      hasProjection: true,
      projectionComplete: false,
      projected: [{ plantUuid: 'plant-a', value: 'offline' }, { plantUuid: 'plant-b', value: 'other' }],
      fallback: [{ plantUuid: 'plant-a', value: 'remote' }],
      belongsToPlant,
    })).toEqual([{ plantUuid: 'plant-a', value: 'offline' }]);
  });

  it('keeps the remote fallback for an account until projection hydration completes', () => {
    expect(selectPlantContent({
      identityKind: 'account',
      hasProjection: true,
      projectionComplete: false,
      projected: [{ plantUuid: 'plant-a', value: 'pending' }],
      fallback: [{ plantUuid: 'plant-a', value: 'remote' }],
      belongsToPlant,
    })).toEqual([{ plantUuid: 'plant-a', value: 'remote' }]);
  });

  it('uses the authoritative projection after hydration', () => {
    expect(selectPlantContent({
      identityKind: 'account',
      hasProjection: true,
      projectionComplete: true,
      projected: [{ plantUuid: 'plant-a', value: 'authoritative' }],
      fallback: [{ plantUuid: 'plant-a', value: 'remote' }],
      belongsToPlant,
    })).toEqual([{ plantUuid: 'plant-a', value: 'authoritative' }]);
  });
});
