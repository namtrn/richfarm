import { deriveAppModeFromOnboarding, type AppMode } from './onboardingProfile';

export type { AppMode };
export { deriveAppModeFromOnboarding };

export function normalizeAppMode(value?: string): AppMode | undefined {
  if (value === undefined) return undefined;
  if (value === 'farmer' || value === 'gardener') return value;
  return undefined;
}
