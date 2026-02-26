import AsyncStorage from '@react-native-async-storage/async-storage';

export type OnboardingData = {
  goals: string[];
  scaleEnvironment: string[];
  crops: string[];
  experience: string;
  needs: string[];
  completedAt: number;
  version: number;
};

const STORAGE_KEY = 'onboarding_profile_v1';
const CURRENT_VERSION = 1;

function normalizeArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') as string[] : [];
}

export async function loadOnboardingData(): Promise<OnboardingData | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingData>;
    if (!parsed.completedAt) return null;

    return {
      goals: normalizeArray(parsed.goals),
      scaleEnvironment: normalizeArray(parsed.scaleEnvironment),
      crops: normalizeArray(parsed.crops),
      experience: typeof parsed.experience === 'string' ? parsed.experience : '',
      needs: normalizeArray(parsed.needs),
      completedAt: typeof parsed.completedAt === 'number' ? parsed.completedAt : Date.now(),
      version: typeof parsed.version === 'number' ? parsed.version : CURRENT_VERSION,
    };
  } catch {
    return null;
  }
}

export async function saveOnboardingData(payload: Omit<OnboardingData, 'version'> & { version?: number }) {
  const normalized: OnboardingData = {
    goals: normalizeArray(payload.goals),
    scaleEnvironment: normalizeArray(payload.scaleEnvironment),
    crops: normalizeArray(payload.crops),
    experience: payload.experience ?? '',
    needs: normalizeArray(payload.needs),
    completedAt: payload.completedAt,
    version: payload.version ?? CURRENT_VERSION,
  };

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function clearOnboardingData() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
