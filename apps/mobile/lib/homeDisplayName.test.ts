import { describe, expect, it } from 'vitest';
import { resolveHomeDisplayName } from './homeDisplayName';

describe('resolveHomeDisplayName', () => {
  it('uses the farmer default when farmer mode is active', () => {
    expect(resolveHomeDisplayName(undefined, 'farmer', 'Gardener', 'Farmer')).toBe('Farmer');
  });

  it('keeps the gardener default for gardener or unset mode', () => {
    expect(resolveHomeDisplayName(undefined, 'gardener', 'Gardener', 'Farmer')).toBe('Gardener');
    expect(resolveHomeDisplayName(undefined, undefined, 'Gardener', 'Farmer')).toBe('Gardener');
  });

  it('keeps a user-provided name in either mode', () => {
    expect(resolveHomeDisplayName('Alex', 'farmer', 'Gardener', 'Farmer')).toBe('Alex');
  });
});
