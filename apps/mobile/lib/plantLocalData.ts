import AsyncStorage from '@react-native-async-storage/async-storage';

export type PlantActivityType =
  | 'watering'
  | 'fertilizing'
  | 'pruning'
  | 'pest_spotted'
  | 'treatment'
  | 'photo'
  | 'note'
  | 'transplanted'
  | 'harvest'
  | 'custom';

export type PlantTimelineType =
  | PlantActivityType
  | 'plant_added'
  | 'status_changed'
  | 'location_changed'
  | 'watering_check'
  | 'fertilizing_check';

export type PlantPhotoEntry = {
  id: string;
  uri: string;
  note?: string;
  date: number;
  source?: 'camera' | 'gallery';
};

export type PlantActivityEntry = {
  id: string;
  type: PlantTimelineType;
  note?: string;
  date: number;
  recordedAt?: number;
  source?: 'system' | 'manual' | 'reminder' | 'scanner' | 'import';
  value?: Record<string, unknown>;
};

export type PlantHarvestEntry = {
  id: string;
  serverId?: string;
  localId?: string;
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

function storageKey(scope: string, plantId: string) {
  return `${STORAGE_PREFIX}${encodeURIComponent(scope)}:${encodeURIComponent(plantId)}`;
}

export async function inspectPlantLocalData(scope: string, plantId: string): Promise<
  | { status: 'missing'; data: PlantLocalData }
  | { status: 'valid'; data: PlantLocalData }
  | { status: 'malformed'; raw: string; data: PlantLocalData }
> {
  const raw = await AsyncStorage.getItem(storageKey(scope, plantId));
  if (!raw) return { status: 'missing', data: { ...EMPTY_DATA } };
  try {
    const parsed = JSON.parse(raw) as Partial<PlantLocalData>;
    return {
      status: 'valid',
      data: {
        photos: normalizeArray<PlantPhotoEntry>(parsed.photos),
        activities: normalizeArray<PlantActivityEntry>(parsed.activities),
        harvests: normalizeArray<PlantHarvestEntry>(parsed.harvests),
      },
    };
  } catch {
    return { status: 'malformed', raw, data: { ...EMPTY_DATA } };
  }
}

export async function preservePlantLocalRecovery(scope: string, plantId: string, raw: string) {
  await AsyncStorage.setItem(
    `plant_local_recovery:v1:${encodeURIComponent(scope)}:${encodeURIComponent(plantId)}`,
    raw,
  );
}

export async function loadPlantLocalData(scope: string, plantId: string): Promise<PlantLocalData> {
  return (await inspectPlantLocalData(scope, plantId)).data;
}

export async function savePlantLocalData(
  scope: string,
  plantId: string,
  data: PlantLocalData
): Promise<void> {
  const payload: PlantLocalData = {
    photos: normalizeArray<PlantPhotoEntry>(data.photos),
    activities: normalizeArray<PlantActivityEntry>(data.activities),
    harvests: normalizeArray<PlantHarvestEntry>(data.harvests),
  };
  await AsyncStorage.setItem(
    storageKey(scope, plantId),
    JSON.stringify(payload)
  );
}

export async function clearPlantLocalData(scope: string, plantId: string): Promise<void> {
  await AsyncStorage.removeItem(storageKey(scope, plantId));
}
