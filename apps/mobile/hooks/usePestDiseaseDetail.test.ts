import { describe, expect, it } from 'vitest';
import { classifyPestDiseaseDetail } from './usePestDiseaseDetail';

describe('pest/disease detail render states', () => {
  it('covers invalid, loading, empty, error, and ready states', () => {
    expect(classifyPestDiseaseDetail(null, undefined)).toBe('invalid');
    expect(classifyPestDiseaseDetail('aphids', undefined)).toBe('loading');
    expect(classifyPestDiseaseDetail('aphids', null)).toBe('empty');
    expect(classifyPestDiseaseDetail('aphids', undefined, new Error('network'))).toBe('error');
    expect(classifyPestDiseaseDetail('aphids', { key: 'aphids' } as any)).toBe('ready');
  });
});
