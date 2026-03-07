import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ONBOARDING_VERSION,
  normalizeOnboardingRole,
  type OnboardingData,
  type OnboardingWeights,
} from './onboardingProfile';

export type { OnboardingData };

const STORAGE_KEY = 'onboarding_profile_v1';
const CURRENT_VERSION = ONBOARDING_VERSION;

function normalizeArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') as string[] : [];
}

function normalizeWeights(value: unknown): OnboardingWeights {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value).reduce<OnboardingWeights>((acc, [key, rawValue]) => {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      acc[key] = rawValue;
    }
    return acc;
  }, {});
}

export async function loadOnboardingData(): Promise<OnboardingData | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingData>;
    if (!parsed.completedAt) return null;

    return {
      role: normalizeOnboardingRole(parsed.role),
      goals: normalizeArray(parsed.goals),
      scaleEnvironment: normalizeArray(parsed.scaleEnvironment),
      crops: normalizeArray(parsed.crops),
      experience: typeof parsed.experience === 'string' ? parsed.experience : '',
      needs: normalizeArray(parsed.needs),
      purposeWeights: normalizeWeights(parsed.purposeWeights),
      environmentWeights: normalizeWeights(parsed.environmentWeights),
      completedAt: typeof parsed.completedAt === 'number' ? parsed.completedAt : Date.now(),
      version: typeof parsed.version === 'number' ? parsed.version : CURRENT_VERSION,
    };
  } catch {
    return null;
  }
}

export async function saveOnboardingData(payload: Omit<OnboardingData, 'version'> & { version?: number }) {
  const normalized: OnboardingData = {
    role: normalizeOnboardingRole(payload.role),
    goals: normalizeArray(payload.goals),
    scaleEnvironment: normalizeArray(payload.scaleEnvironment),
    crops: normalizeArray(payload.crops),
    experience: payload.experience ?? '',
    needs: normalizeArray(payload.needs),
    purposeWeights: normalizeWeights(payload.purposeWeights),
    environmentWeights: normalizeWeights(payload.environmentWeights),
    completedAt: payload.completedAt,
    version: payload.version ?? CURRENT_VERSION,
  };

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function clearOnboardingData() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
