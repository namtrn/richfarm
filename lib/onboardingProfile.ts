export type AppMode = 'farmer' | 'gardener';

export type OnboardingRole = 'gardener' | 'farmer' | 'homesteader' | 'learner';

export type OnboardingWeights = Record<string, number>;

export type OnboardingData = {
  role: OnboardingRole;
  goals: string[];
  scaleEnvironment: string[];
  crops: string[];
  experience: string;
  needs: string[];
  purposeWeights: OnboardingWeights;
  environmentWeights: OnboardingWeights;
  completedAt: number;
  version: number;
};

export const ONBOARDING_VERSION = 2;

const PURPOSE_WEIGHT_MAP: Record<string, OnboardingWeights> = {
  food: { edible: 3, seasonal: 2, planner: 1 },
  ornamental: { ornamental: 3, decor: 2, inspiration: 1 },
  medicinal: { herbs: 3, medicinal: 3, wellness: 1 },
  business: { business: 3, productivity: 2, records: 2 },
  offgrid: { resilience: 3, selfSufficiency: 3, pantry: 1 },
  learning: { learning: 3, beginner: 2, discovery: 2 },
  relaxing: { calm: 3, decor: 1, wellness: 2 },
  gifting: { gifting: 3, ornamental: 1, community: 2 },
  nursery: { propagation: 3, business: 2, productivity: 1 },
  preservation: { pantry: 3, resilience: 2, records: 1 },
  family_supply: { family: 3, edible: 2, planner: 1 },
  school_project: { learning: 3, discovery: 2, beginner: 1 },
  experiment: { discovery: 3, experimentation: 3, learning: 1 },
};

const ENVIRONMENT_WEIGHT_MAP: Record<string, OnboardingWeights> = {
  indoor: { indoor: 3, compact: 2, containers: 2 },
  balcony: { balcony: 3, compact: 2, containers: 2 },
  backyard: { backyard: 3, raisedBeds: 2, seasonal: 1 },
  greenhouse: { greenhouse: 3, propagation: 2, controlledClimate: 2 },
  field: { field: 3, scale: 3, irrigation: 1 },
  homestead_land: { homestead: 3, resilience: 2, mixedUse: 2 },
  windowsill: { indoor: 3, compact: 3, beginner: 1 },
  rooftop: { rooftop: 3, compact: 1, sunExposure: 2 },
  community_garden: { community: 3, raisedBeds: 2, seasonal: 1 },
  nursery_zone: { propagation: 3, controlledClimate: 2, productivity: 1 },
  orchard: { orchard: 3, perennial: 2, longTerm: 2 },
  market_garden: { marketGarden: 3, productivity: 3, planner: 1 },
  kitchen_garden: { kitchenGarden: 3, edible: 2, family: 1 },
  mixed_livestock: { homestead: 2, mixedUse: 3, resilience: 2 },
  classroom: { classroom: 3, beginner: 2, controlledClimate: 1 },
  shared_plot: { community: 2, compact: 2, beginner: 2 },
  lab_bench: { experimentation: 3, controlledClimate: 2, discovery: 2 },
};

const PURPOSE_TO_CROPS: Record<string, string[]> = {
  food: ['leafy', 'fruiting', 'root'],
  ornamental: ['flowers', 'perennial'],
  medicinal: ['herbs'],
  business: ['fast_cycle', 'fruiting'],
  offgrid: ['perennial', 'fruit_trees', 'root'],
  learning: ['leafy', 'herbs'],
  relaxing: ['flowers', 'herbs'],
  gifting: ['flowers', 'herbs'],
  nursery: ['fast_cycle', 'herbs', 'flowers'],
  preservation: ['root', 'fruit_trees', 'perennial'],
  family_supply: ['leafy', 'root', 'fruiting'],
  school_project: ['leafy', 'herbs'],
  experiment: ['fast_cycle', 'leafy', 'herbs'],
};

const PURPOSE_TO_NEEDS: Record<string, string[]> = {
  food: ['calendar', 'irrigation'],
  ornamental: ['health'],
  medicinal: ['health', 'records'],
  business: ['sales', 'records', 'calendar'],
  offgrid: ['seeds', 'records', 'irrigation'],
  learning: ['calendar', 'health'],
  relaxing: ['irrigation'],
  gifting: ['calendar', 'health'],
  nursery: ['records', 'calendar', 'irrigation'],
  preservation: ['records', 'seeds', 'calendar'],
  family_supply: ['calendar', 'records', 'irrigation'],
  school_project: ['calendar', 'health'],
  experiment: ['records', 'health'],
};

const ROLE_DEFAULTS: Record<OnboardingRole, { experience: string; needs: string[] }> = {
  gardener: { experience: 'new', needs: ['irrigation', 'calendar'] },
  farmer: { experience: 'intermediate', needs: ['calendar', 'records', 'irrigation'] },
  homesteader: { experience: 'experienced', needs: ['records', 'seeds', 'calendar'] },
  learner: { experience: 'new', needs: ['calendar', 'health'] },
};

function mergeWeights(selectedItems: string[], map: Record<string, OnboardingWeights>): OnboardingWeights {
  return selectedItems.reduce<OnboardingWeights>((acc, item) => {
    const weights = map[item];
    if (!weights) return acc;
    for (const [key, value] of Object.entries(weights)) {
      acc[key] = (acc[key] ?? 0) + value;
    }
    return acc;
  }, {});
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function normalizeOnboardingRole(value: unknown): OnboardingRole {
  if (value === 'gardener' || value === 'farmer' || value === 'homesteader' || value === 'learner') {
    return value;
  }
  return 'gardener';
}

export function buildOnboardingData(args: {
  role: OnboardingRole;
  goals: string[];
  scaleEnvironment: string[];
  completedAt: number;
}): OnboardingData {
  const role = normalizeOnboardingRole(args.role);
  const goals = uniqueStrings(args.goals);
  const scaleEnvironment = uniqueStrings(args.scaleEnvironment);
  const crops = uniqueStrings(goals.flatMap((goal) => PURPOSE_TO_CROPS[goal] ?? []));
  const needs = uniqueStrings([
    ...ROLE_DEFAULTS[role].needs,
    ...goals.flatMap((goal) => PURPOSE_TO_NEEDS[goal] ?? []),
  ]);

  return {
    role,
    goals,
    scaleEnvironment,
    crops,
    experience: ROLE_DEFAULTS[role].experience,
    needs,
    purposeWeights: mergeWeights(goals, PURPOSE_WEIGHT_MAP),
    environmentWeights: mergeWeights(scaleEnvironment, ENVIRONMENT_WEIGHT_MAP),
    completedAt: args.completedAt,
    version: ONBOARDING_VERSION,
  };
}

export function deriveAppModeFromOnboarding(
  onboarding?:
    | {
        role?: string;
        goals?: string[];
        scaleEnvironment?: string[];
        experience?: string;
      }
    | undefined
): AppMode {
  if (!onboarding) return 'farmer';

  if (onboarding.role === 'farmer' || onboarding.role === 'homesteader') return 'farmer';
  if (onboarding.role === 'gardener' || onboarding.role === 'learner') return 'gardener';

  const farmGoals = ['food', 'business', 'offgrid'];
  const hasFarmGoal = (onboarding.goals ?? []).some((goal) => farmGoals.includes(goal));
  const isExperienced = ['intermediate', 'experienced'].includes(onboarding.experience ?? '');
  const isLargeScale = (onboarding.scaleEnvironment ?? []).some((environment) =>
    ['field', 'greenhouse', 'homestead_land'].includes(environment)
  );

  return hasFarmGoal || isLargeScale || isExperienced ? 'farmer' : 'gardener';
}
