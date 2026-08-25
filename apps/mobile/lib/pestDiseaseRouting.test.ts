import { describe, expect, it } from 'vitest';
import {
  normalizePestDiseaseLocaleParam,
  normalizePestDiseaseRouteParam,
  parsePestDiseaseDeepLink,
  pestDiseasePath,
} from './pestDiseaseRouting';

describe('pest/disease deep-link parser', () => {
  it('parses a stable key and optional locale', () => {
    expect(parsePestDiseaseDeepLink('richfarm://pests-diseases/leaf_spot')).toEqual({ key: 'leaf_spot' });
    expect(parsePestDiseaseDeepLink('richfarm://pests-diseases/APHIDS?locale=VI')).toEqual({ key: 'aphids', locale: 'vi' });
  });

  it('rejects invalid schemes, keys, and locale queries', () => {
    expect(parsePestDiseaseDeepLink('https://pests-diseases/aphids')).toBeNull();
    expect(parsePestDiseaseDeepLink('richfarm://pests-diseases/../aphids')).toBeNull();
    expect(parsePestDiseaseDeepLink('richfarm://pests-diseases/leaf%20spot')).toBeNull();
    expect(parsePestDiseaseDeepLink('richfarm://pests-diseases/aphids?locale=english')).toBeNull();
  });

  it('normalizes route params and builds an in-app path', () => {
    expect(normalizePestDiseaseRouteParam(['APHIDS'])).toBe('aphids');
    expect(normalizePestDiseaseRouteParam('bad key')).toBeNull();
    expect(normalizePestDiseaseLocaleParam(['VI'])).toBe('vi');
    expect(normalizePestDiseaseLocaleParam('english')).toBeNull();
    expect(pestDiseasePath('leaf_spot', 'vi')).toBe('/pests-diseases/leaf_spot?locale=vi');
  });
});
