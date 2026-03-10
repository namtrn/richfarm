import { deriveAppModeFromOnboarding, type AppMode } from '../../shared/src/onboardingProfile';

export type { AppMode };
export { deriveAppModeFromOnboarding };

export function requireAppMode(value?: string): AppMode | undefined {
  if (value === undefined) return undefined;
  if (value === 'farmer' || value === 'gardener') return value;
  throw new Error('Invalid appMode');
}

export function resolveAppMode(settings?: { appMode?: string; onboarding?: any }): AppMode {
  if (settings?.appMode === 'farmer' || settings?.appMode === 'gardener') {
    return settings.appMode;
  }
  return deriveAppModeFromOnboarding(settings?.onboarding);
}
