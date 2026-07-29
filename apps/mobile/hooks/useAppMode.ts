import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizeAppMode, deriveAppModeFromOnboarding, type AppMode } from '../lib/appMode';
import { loadOnboardingData, type OnboardingData } from '../lib/onboardingLocalData';
import { updateScopedPreferences } from '../lib/state/scopedPreferencesStore';
import {
  useScopedPreferenceValue,
  useScopedPreferencesLoading,
  useScopedSettingsField,
} from './useScopedPreference';

export function useAppMode() {
  const storedAppMode = useScopedPreferenceValue('appMode');
  const onboarding = useScopedSettingsField('onboarding');
  const isLoading = useScopedPreferencesLoading();
  const [localOnboarding, setLocalOnboarding] = useState<OnboardingData | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (onboarding || storedAppMode) return;
    loadOnboardingData().then((data) => {
      if (!isMounted) return;
      setLocalOnboarding(data);
    });
    return () => {
      isMounted = false;
    };
  }, [onboarding, storedAppMode]);

  const normalized =
    normalizeAppMode(storedAppMode) ??
    (onboarding ? deriveAppModeFromOnboarding(onboarding) : undefined) ??
    (localOnboarding ? deriveAppModeFromOnboarding(localOnboarding) : undefined) ??
    undefined;

  const isFarmer = normalized === 'farmer';
  const isGardener = normalized === 'gardener';

  const switchMode = useCallback(
    async (mode: AppMode) => {
      await updateScopedPreferences({ appMode: mode });
    },
    []
  );

  return useMemo(
    () => ({
      appMode: normalized,
      isFarmer,
      isGardener,
      switchMode,
      isLoading,
    }),
    [normalized, isFarmer, isGardener, switchMode, isLoading]
  );
}
