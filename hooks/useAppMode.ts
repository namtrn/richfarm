import { useCallback, useMemo } from 'react';
import { useUserSettings } from './useUserSettings';
import { normalizeAppMode, type AppMode } from '../lib/appMode';

export function useAppMode() {
  const { settings, updateSettings, appMode, isLoading } = useUserSettings();
  const normalized = normalizeAppMode(settings?.appMode) ?? appMode;

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
