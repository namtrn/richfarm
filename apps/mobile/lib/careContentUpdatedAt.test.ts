import { describe, expect, it } from 'vitest';
import { formatCareContentUpdatedAt } from './careContentUpdatedAt';

describe('formatCareContentUpdatedAt', () => {
  const timestamp = Date.parse('2026-08-13T00:00:00.000Z');
  it('formats in the active locale', () => {
    expect(formatCareContentUpdatedAt(timestamp, 'vi')).toContain('2026');
    expect(formatCareContentUpdatedAt(timestamp, 'en')).toContain('2026');
  });
  it('omits invalid values', () => {
    expect(formatCareContentUpdatedAt(undefined, 'vi')).toBeNull();
    expect(formatCareContentUpdatedAt(Number.NaN, 'vi')).toBeNull();
  });
});
