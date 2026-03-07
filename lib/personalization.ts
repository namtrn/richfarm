type WeightMap = Record<string, number>;

type OnboardingLike =
  | {
      role?: string;
      goals?: string[];
      scaleEnvironment?: string[];
      purposeWeights?: WeightMap;
      environmentWeights?: WeightMap;
    }
  | undefined;

type FocusItem = {
  id: string;
  labelKey: string;
  kind: 'goal' | 'environment';
};

const GOAL_LABEL_KEYS: Record<string, string> = {
  food: 'onboarding.goals_food',
  ornamental: 'onboarding.goals_ornamental',
  medicinal: 'onboarding.goals_medicinal',
  business: 'onboarding.goals_business',
  offgrid: 'onboarding.goals_offgrid',
  learning: 'onboarding.goals_learning',
  relaxing: 'onboarding.goals_relaxing',
  gifting: 'onboarding.goals_gifting',
  nursery: 'onboarding.goals_nursery',
  preservation: 'onboarding.goals_preservation',
  family_supply: 'onboarding.goals_family_supply',
  school_project: 'onboarding.goals_school_project',
  experiment: 'onboarding.goals_experimentation',
};

const ENVIRONMENT_LABEL_KEYS: Record<string, string> = {
  indoor: 'onboarding.environment_indoor',
  balcony: 'onboarding.environment_balcony',
  backyard: 'onboarding.environment_backyard',
  greenhouse: 'onboarding.environment_greenhouse',
  field: 'onboarding.environment_field',
  homestead_land: 'onboarding.environment_homestead_land',
  windowsill: 'onboarding.environment_windowsill',
  rooftop: 'onboarding.environment_rooftop',
  community_garden: 'onboarding.environment_community_garden',
  nursery_zone: 'onboarding.environment_nursery_zone',
  orchard: 'onboarding.environment_orchard',
  market_garden: 'onboarding.environment_market_garden',
  kitchen_garden: 'onboarding.environment_kitchen_garden',
  mixed_livestock: 'onboarding.environment_mixed_livestock',
  classroom: 'onboarding.environment_classroom',
  shared_plot: 'onboarding.environment_shared_plot',
  lab_bench: 'onboarding.environment_lab_bench',
};

const GROUP_SIGNAL_WEIGHTS: Record<string, WeightMap> = {
  edible: { vegetables: 3, leafy_greens: 2, roots: 2, fruits: 2, legumes: 1, nightshades: 1 },
  seasonal: { vegetables: 2, leafy_greens: 1, roots: 1 },
  planner: { vegetables: 1, roots: 1, fruits: 1 },
  ornamental: { flowers: 4, indoor: 1 },
  decor: { flowers: 3, indoor: 2 },
  inspiration: { flowers: 2, indoor: 1 },
  herbs: { herbs: 4 },
  medicinal: { herbs: 3, indoor: 1 },
  wellness: { herbs: 2, flowers: 1 },
  business: { vegetables: 2, nightshades: 2, fruits: 1 },
  productivity: { vegetables: 2, leafy_greens: 1, nightshades: 1 },
  records: { vegetables: 1, fruits: 1, roots: 1 },
  resilience: { roots: 2, fruits: 2, legumes: 2, herbs: 1 },
  selfSufficiency: { roots: 2, vegetables: 2, fruits: 1, legumes: 1 },
  pantry: { roots: 3, fruits: 2, herbs: 1 },
  learning: { herbs: 2, leafy_greens: 2, indoor: 1 },
  beginner: { herbs: 2, indoor: 2, leafy_greens: 1 },
  discovery: { herbs: 1, indoor: 1, flowers: 1 },
  calm: { flowers: 2, indoor: 2, herbs: 1 },
  gifting: { flowers: 3, herbs: 1 },
  community: { flowers: 1, herbs: 1, vegetables: 1, leafy_greens: 1 },
  propagation: { herbs: 2, flowers: 2, vegetables: 1 },
  family: { vegetables: 2, roots: 2, fruits: 1, herbs: 1 },
  experimentation: { herbs: 1, leafy_greens: 1, indoor: 1 },
  indoor: { indoor: 4, herbs: 1, flowers: 1 },
  compact: { indoor: 3, herbs: 1, flowers: 1 },
  containers: { indoor: 2, herbs: 2, flowers: 1 },
  backyard: { vegetables: 2, roots: 2, herbs: 1 },
  raisedBeds: { vegetables: 2, leafy_greens: 2, herbs: 1 },
  greenhouse: { vegetables: 2, herbs: 1, flowers: 1 },
  controlledClimate: { indoor: 2, herbs: 1, flowers: 1 },
  field: { vegetables: 2, roots: 2, legumes: 2, nightshades: 1 },
  scale: { vegetables: 2, fruits: 1, roots: 1, legumes: 1 },
  irrigation: { vegetables: 1, fruits: 1, roots: 1 },
  homestead: { fruits: 2, roots: 2, herbs: 1 },
  mixedUse: { fruits: 1, roots: 1, herbs: 1, vegetables: 1 },
  windowsill: { indoor: 4, herbs: 2 },
  rooftop: { flowers: 2, vegetables: 1, herbs: 1 },
  sunExposure: { vegetables: 2, flowers: 1, fruits: 1 },
  classroom: { herbs: 2, indoor: 2, leafy_greens: 1 },
  orchard: { fruits: 4 },
  perennial: { fruits: 2, flowers: 1 },
  longTerm: { fruits: 2 },
  marketGarden: { vegetables: 3, leafy_greens: 2, roots: 1, nightshades: 1 },
  kitchenGarden: { herbs: 3, vegetables: 2, leafy_greens: 1 },
};

function applyWeightMap(target: WeightMap, source: WeightMap, multiplier = 1) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value * multiplier;
  }
}

function buildGroupScores(onboarding: OnboardingLike): WeightMap {
  const scores: WeightMap = {};
  if (!onboarding) return scores;

  for (const [signal, weight] of Object.entries(onboarding.purposeWeights ?? {})) {
    const mapped = GROUP_SIGNAL_WEIGHTS[signal];
    if (mapped) applyWeightMap(scores, mapped, weight);
  }

  for (const [signal, weight] of Object.entries(onboarding.environmentWeights ?? {})) {
    const mapped = GROUP_SIGNAL_WEIGHTS[signal];
    if (mapped) applyWeightMap(scores, mapped, weight);
  }

  if (onboarding.role === 'gardener' || onboarding.role === 'learner') {
    applyWeightMap(scores, { indoor: 1, herbs: 1, flowers: 1 });
  }
  if (onboarding.role === 'farmer') {
    applyWeightMap(scores, { vegetables: 2, roots: 1, fruits: 1, nightshades: 1 });
  }
  if (onboarding.role === 'homesteader') {
    applyWeightMap(scores, { fruits: 2, herbs: 1, roots: 2, vegetables: 1 });
  }

  return scores;
}

export function getOnboardingFocusItems(onboarding: OnboardingLike, limit = 4): FocusItem[] {
  if (!onboarding) return [];

  const goalItems = (onboarding.goals ?? [])
    .map((id) => (GOAL_LABEL_KEYS[id] ? { id, labelKey: GOAL_LABEL_KEYS[id], kind: 'goal' as const } : null))
    .filter(Boolean) as FocusItem[];

  const environmentItems = (onboarding.scaleEnvironment ?? [])
    .map((id) =>
      ENVIRONMENT_LABEL_KEYS[id] ? { id, labelKey: ENVIRONMENT_LABEL_KEYS[id], kind: 'environment' as const } : null
    )
    .filter(Boolean) as FocusItem[];

  return [...goalItems, ...environmentItems].slice(0, limit);
}

export function getGroupPersonalizationScore(groupKey: string, onboarding: OnboardingLike) {
  const scores = buildGroupScores(onboarding);
  return scores[groupKey] ?? 0;
}

export function compareGroupsForOnboarding(a: { key: string }, b: { key: string }, onboarding: OnboardingLike) {
  const scoreDiff = getGroupPersonalizationScore(b.key, onboarding) - getGroupPersonalizationScore(a.key, onboarding);
  if (scoreDiff !== 0) return scoreDiff;
  return String(a.key).localeCompare(String(b.key));
}

export function scorePlantForOnboarding(plant: any, onboarding: OnboardingLike) {
  const groupScore = getGroupPersonalizationScore(String(plant?.group ?? ''), onboarding);
  const purposeScore = (plant?.purposes ?? []).reduce((acc: number, purpose: string) => {
    return acc + ((onboarding?.purposeWeights ?? {})[purpose] ?? 0) * 3;
  }, 0);

  const indoorBonus =
    (onboarding?.environmentWeights?.indoor ?? 0) > 0 && String(plant?.group ?? '') === 'indoor' ? 4 : 0;

  return groupScore + purposeScore + indoorBonus;
}
