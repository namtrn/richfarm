import { describe, expect, it } from 'vitest';
import { getPlantCatalogName, getPlantInstanceName } from './plantNames';

describe('plant naming semantics', () => {
  const tomato = {
    displayName: 'Tomato', scientificName: 'Solanum lycopersicum',
    i18n: { vi: { commonName: 'Cà chua' }, en: { commonName: 'Tomato' } },
  };

  it('distinguishes instances of the same species by trimmed nickname', () => {
    expect(getPlantInstanceName({ ...tomato, nickname: '  Ban công  ' }, { locale: 'vi-VN', fallback: 'Cây' })).toBe('Ban công');
    expect(getPlantInstanceName({ ...tomato, nickname: 'Sân sau' }, { locale: 'vi', fallback: 'Cây' })).toBe('Sân sau');
  });

  it('falls back through localized common, scientific, then translated fallback', () => {
    expect(getPlantInstanceName({ ...tomato, nickname: ' ' }, { locale: 'vi_VN', fallback: 'Cây' })).toBe('Cà chua');
    expect(getPlantCatalogName({ scientificName: 'Ocimum basilicum' }, { locale: 'en-US', fallback: 'Plant' })).toBe('Ocimum basilicum');
    expect(getPlantCatalogName({}, { locale: 'en', fallback: 'Unnamed plant' })).toBe('Unnamed plant');
  });

  it('keeps catalog naming independent from nickname', () => {
    expect(getPlantCatalogName({ ...tomato, nickname: 'My tomato' }, { locale: 'en', fallback: 'Plant' })).toBe('Tomato');
  });
});
