import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUserSettings } from './useUserSettings';
import { normalizeAppMode, deriveAppModeFromOnboarding, type AppMode } from '../lib/appMode';
import { loadOnboardingData, type OnboardingData } from '../lib/onboardingLocalData';

export function useAppMode() {
  const { settings, updateSettings, appMode, isLoading } = useUserSettings();
  const [localOnboarding, setLocalOnboarding] = useState<OnboardingData | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (settings?.onboarding || settings?.appMode) return;
    loadOnboardingData().then((data) => {
      if (!isMounted) return;
      setLocalOnboarding(data);
    });
    return () => {
      isMounted = false;
    };
  }, [settings?.onboarding, settings?.appMode]);

  const normalized =
    normalizeAppMode(settings?.appMode) ??
    (settings?.onboarding ? deriveAppModeFromOnboarding(settings.onboarding) : undefined) ??
    (localOnboarding ? deriveAppModeFromOnboarding(localOnboarding) : undefined) ??
    appMode;

  const isFarmer = normalized === 'farmer';
  const isGardener = normalized === 'gardener';

  const switchMode = useCallback(
    async (mode: AppMode) => {
      await updateSettings({ appMode: mode });
    },
    [updateSettings]
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
