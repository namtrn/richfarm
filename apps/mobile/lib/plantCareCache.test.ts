import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
  },
}));

import { loadCachedCareContent, saveCareContent } from './plantCareCache';

describe('versioned Markdown plant care cache', () => {
  beforeEach(() => storage.clear());

  it('round-trips Markdown bytes identically for online and offline reads', async () => {
    const markdown = "  ## Chăm sóc\n\nGiữ **ẩm đều**.\n";
    await saveCareContent('plant-1', 'vi', 4, markdown);

    await expect(loadCachedCareContent('plant-1', 'vi')).resolves.toMatchObject({
      plantId: 'plant-1',
      locale: 'vi',
      contentVersion: 4,
      careContent: markdown,
    });
  });

  it('evicts malformed v2 JSON and legacy object-shaped v1 entries', async () => {
    storage.set('plant_care_v2_plant-1_vi', '{malformed');
    await expect(loadCachedCareContent('plant-1', 'vi')).resolves.toBeNull();
    expect(storage.has('plant_care_v2_plant-1_vi')).toBe(false);

    storage.set('plant_care_plant-1_vi', JSON.stringify({
      plantId: 'plant-1',
      locale: 'vi',
      contentVersion: 1,
      care: { watering: { intro: 'legacy object' } },
      cachedAt: 1,
    }));
    await expect(loadCachedCareContent('plant-1', 'vi')).resolves.toBeNull();
    expect(storage.has('plant_care_plant-1_vi')).toBe(false);
  });

  it('evicts v2 entries with an object-shaped careContent field', async () => {
    storage.set('plant_care_v2_plant-2_en', JSON.stringify({
      plantId: 'plant-2',
      locale: 'en',
      contentVersion: 2,
      careContent: { watering: { intro: 'legacy object' } },
      cachedAt: 1,
    }));
    await expect(loadCachedCareContent('plant-2', 'en')).resolves.toBeNull();
    expect(storage.has('plant_care_v2_plant-2_en')).toBe(false);
  });
});
