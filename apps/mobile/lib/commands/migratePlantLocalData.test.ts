import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
  },
}));
vi.mock('../photo/managedPlantPhotos', () => ({
  stageManagedPlantPhoto: vi.fn(async ({ photoUuid }) => `file:///private/${photoUuid}.jpg`),
}));

import { migratePlantLocalData } from './migratePlantLocalData';
import { loadOutbox } from '../sync/queue';

describe('legacy plant-local migration', () => {
  beforeEach(() => storage.clear());

  it('migrates every child once using stable operations', async () => {
    const scope = 'guest:v1:install:data';
    storage.set(`plant_local_data:${encodeURIComponent(scope)}:legacy-plant`, JSON.stringify({
      activities: [{ id: 'activity-a', type: 'watering', date: 10 }],
      harvests: [{ id: 'harvest-a', quantity: '2', unit: 'kg', date: 20 }],
      photos: [{ id: 'photo-a', uri: 'content://photo-a', date: 30, source: 'gallery' }],
    }));
    const first = await migratePlantLocalData({ scope, legacyPlantId: 'legacy-plant', plantUuid: 'plant-a' });
    const firstIds = (await loadOutbox(scope)).operations.map((operation) => operation.id);
    const second = await migratePlantLocalData({ scope, legacyPlantId: 'legacy-plant', plantUuid: 'plant-a' });
    expect(first).toEqual({ status: 'migrated', count: 3 });
    expect(second.status).toBe('already_migrated');
    expect((await loadOutbox(scope)).operations.map((operation) => operation.id)).toEqual(firstIds);
  });

  it('preserves malformed content and does not mark it migrated', async () => {
    const scope = 'guest:v1:install:data';
    storage.set(`plant_local_data:${encodeURIComponent(scope)}:legacy-plant`, '{bad json');
    const result = await migratePlantLocalData({ scope, legacyPlantId: 'legacy-plant', plantUuid: 'plant-a' });
    expect(result.status).toBe('needs_attention');
    expect(storage.get(`plant_local_recovery:v1:${encodeURIComponent(scope)}:legacy-plant`)).toBe('{bad json');
    expect(storage.has(`plant_local_migration:v1:${encodeURIComponent(scope)}:legacy-plant`)).toBe(false);
  });
});
