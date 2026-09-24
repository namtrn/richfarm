import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ONBOARDING_VERSION,
  normalizeOnboardingRole,
  type OnboardingRole,
  type OnboardingData,
  type OnboardingWeights,
} from '../../../packages/shared/src/onboardingProfile';

export type { OnboardingData };

const STORAGE_KEY = 'onboarding_profile_v1';
const DRAFT_STORAGE_KEY = 'onboarding_draft_v1';
const CURRENT_VERSION = ONBOARDING_VERSION;

export type OnboardingDraft = {
  role: OnboardingRole | null;
  goals: string[];
  scaleEnvironment: string[];
  stepIndex: number;
};

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

export async function loadOnboardingDraft(): Promise<OnboardingDraft | null> {
  const raw = await AsyncStorage.getItem(DRAFT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    return {
      role: parsed.role == null ? null : normalizeOnboardingRole(parsed.role),
      goals: normalizeArray(parsed.goals),
      scaleEnvironment: normalizeArray(parsed.scaleEnvironment),
      stepIndex:
        typeof parsed.stepIndex === 'number' && Number.isFinite(parsed.stepIndex)
          ? Math.max(0, Math.floor(parsed.stepIndex))
          : 0,
    };
  } catch {
    return null;
  }
}

export async function saveOnboardingDraft(draft: OnboardingDraft) {
  const normalized: OnboardingDraft = {
    role: draft.role == null ? null : normalizeOnboardingRole(draft.role),
    goals: normalizeArray(draft.goals),
    scaleEnvironment: normalizeArray(draft.scaleEnvironment),
    stepIndex: Math.max(0, Math.floor(draft.stepIndex)),
  };

  await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(normalized));
}

export async function clearOnboardingDraft() {
  await AsyncStorage.removeItem(DRAFT_STORAGE_KEY);
}

export async function clearOnboardingData() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
