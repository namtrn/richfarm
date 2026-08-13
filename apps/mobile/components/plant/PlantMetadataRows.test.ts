import { describe, expect, it } from 'vitest';
import { flattenAdaptationLabels } from '../../lib/plantDetailMetadata';
import en from '../../lib/locales/en.json';
import vi from '../../lib/locales/vi.json';

describe('plant detail metadata', () => {
  it('flattens canonical adaptation dimensions in display order', () => {
    expect(flattenAdaptationLabels({
      climate: [{ code: 'tropical', label: 'Nhiệt đới' }],
      temperature: [{ code: 'hot', label: 'Nóng' }],
      moisture: [{ code: 'humid', label: 'Ẩm' }],
      season: [{ code: 'frost_free', label: 'Không sương giá' }],
    })).toEqual(['Nóng', 'Ẩm', 'Nhiệt đới', 'Không sương giá']);
  });

  it('keeps missing geography absent', () => {
    expect(flattenAdaptationLabels(undefined)).toEqual([]);
    expect(flattenAdaptationLabels({})).toEqual([]);
  });

  it('uses the explicit growing-conditions heading in English and Vietnamese', () => {
    expect(en.library.detail_growing_conditions).toBe('Growing conditions');
    expect(vi.library.detail_growing_conditions).toBe('Điều kiện trồng');
  });
});
