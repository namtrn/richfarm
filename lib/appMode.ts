export type AppMode = 'farmer' | 'gardener';

export function normalizeAppMode(value?: string): AppMode | undefined {
  if (value === undefined) return undefined;
  if (value === 'farmer' || value === 'gardener') return value;
  return undefined;
}

export function deriveAppModeFromOnboarding(onboarding?: {
  goals?: string[];
  scaleEnvironment?: string[];
  experience?: string;
}): AppMode {
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
