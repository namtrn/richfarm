import { describe, expect, it } from 'vitest';

import {
  matchesPlantLibrarySearch,
  shouldRestrictCommonBrowseToBasePlants,
} from './plantLibrarySearch';

const basella = {
  displayName: 'Malabar Spinach',
  scientificName: 'Basella alba',
  group: 'leafy_greens',
  i18nRows: [
    { locale: 'en', commonName: 'Malabar Spinach' },
    { locale: 'vi', commonName: 'Mồng tơi' },
  ],
};

describe('matchesPlantLibrarySearch', () => {
  it.each(['Mồng tơi', 'mong toi', 'Basella alba', 'Malabar Spinach'])(
    'matches %s independently of the active display locale',
    (query) => {
      expect(matchesPlantLibrarySearch(query, basella)).toBe(true);
    },
  );

  it('does not match unrelated localized names', () => {
    expect(matchesPlantLibrarySearch('cà chua', basella)).toBe(false);
  });

  it('keeps common browsing base-only but lets direct search include cultivars', () => {
    expect(shouldRestrictCommonBrowseToBasePlants('')).toBe(true);
    expect(shouldRestrictCommonBrowseToBasePlants('   ')).toBe(true);
    expect(shouldRestrictCommonBrowseToBasePlants('Brandywine')).toBe(false);
  });
});
