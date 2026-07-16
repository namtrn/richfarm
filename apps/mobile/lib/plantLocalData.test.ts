import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
  },
}));

import { loadPlantLocalData, savePlantLocalData } from './plantLocalData';

describe('scoped plant local data', () => {
  beforeEach(() => storage.clear());

  it('never exposes Account A photos or activities to guest or Account B', async () => {
    await savePlantLocalData('account:v1:install:a', 'plant-1', {
      photos: [{ id: 'photo-a', uri: 'file://a.jpg', date: 1 }],
      activities: [{ id: 'activity-a', type: 'watering', date: 1 }],
      harvests: [],
    });
    expect((await loadPlantLocalData('account:v1:install:a', 'plant-1')).photos).toHaveLength(1);
    expect((await loadPlantLocalData('guest:v1:install:guest', 'plant-1')).photos).toEqual([]);
    expect((await loadPlantLocalData('account:v1:install:b', 'plant-1')).activities).toEqual([]);
  });
});

