export type AppMode = 'farmer' | 'gardener';

export function requireAppMode(value?: string): AppMode | undefined {
  if (value === undefined) return undefined;
  if (value === 'farmer' || value === 'gardener') return value;
  throw new Error('Invalid appMode');
}

export function deriveAppModeFromOnboarding(onboarding: {
  goals?: string[];
  scaleEnvironment?: string[];
  experience?: string;
} | undefined): AppMode {
  if (!onboarding) return 'farmer';

  const farmGoals = ['food', 'business', 'offgrid'];
  const hasFarmGoal = (onboarding.goals ?? []).some((g) => farmGoals.includes(g));
  const isExperienced = ['intermediate', 'experienced'].includes(onboarding.experience ?? '');
  const isLargeScale = (onboarding.scaleEnvironment ?? []).some((s) =>
    ['mini_farm', 'large_farm', 'greenhouse'].includes(s)
  );

  if (hasFarmGoal || isLargeScale || isExperienced) return 'farmer';
  return 'gardener';
}

export function resolveAppMode(settings?: { appMode?: string; onboarding?: any }): AppMode {
  if (settings?.appMode === 'farmer' || settings?.appMode === 'gardener') {
    return settings.appMode;
  }
  return deriveAppModeFromOnboarding(settings?.onboarding);
}
