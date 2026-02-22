import AsyncStorage from '@react-native-async-storage/async-storage';

export type PlantActivityType = 'watering' | 'fertilizing' | 'pruning' | 'custom';

export type PlantPhotoEntry = {
  id: string;
  uri: string;
  note?: string;
  date: number;
  source?: 'camera' | 'gallery';
};

export type PlantActivityEntry = {
  id: string;
  type: PlantActivityType;
  note?: string;
  date: number;
};

export type PlantHarvestEntry = {
  id: string;
  quantity?: string;
  unit?: string;
  note?: string;
  date: number;
};

export type PlantLocalData = {
  photos: PlantPhotoEntry[];
  activities: PlantActivityEntry[];
  harvests: PlantHarvestEntry[];
};

const STORAGE_PREFIX = 'plant_local_data:';
const EMPTY_DATA: PlantLocalData = {
  photos: [],
  activities: [],
  harvests: [],
};

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function createLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadPlantLocalData(plantId: string): Promise<PlantLocalData> {
  const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${plantId}`);
  if (!raw) {
    return { ...EMPTY_DATA };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PlantLocalData>;
    return {
      photos: normalizeArray<PlantPhotoEntry>(parsed.photos),
      activities: normalizeArray<PlantActivityEntry>(parsed.activities),
      harvests: normalizeArray<PlantHarvestEntry>(parsed.harvests),
    };
  } catch {
    return { ...EMPTY_DATA };
  }
}

export async function savePlantLocalData(
  plantId: string,
  data: PlantLocalData
): Promise<void> {
  const payload: PlantLocalData = {
    photos: normalizeArray<PlantPhotoEntry>(data.photos),
    activities: normalizeArray<PlantActivityEntry>(data.activities),
    harvests: normalizeArray<PlantHarvestEntry>(data.harvests),
  };
  await AsyncStorage.setItem(
    `${STORAGE_PREFIX}${plantId}`,
    JSON.stringify(payload)
  );
}
