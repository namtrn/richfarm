import { useCallback } from 'react';
import { useScopedPreferences } from '../lib/state/scopedPreferencesStore';
import { updateScopedPreferences } from '../lib/state/scopedPreferencesStore';
import { useScopedPreferenceValue, useScopedPreferencesLoading } from './useScopedPreference';

export function useWeatherCardPreference() {
  const showWeatherCard = useScopedPreferenceValue('showWeatherCard');
  const isLoading = useScopedPreferencesLoading();
  const savingCount = useScopedPreferences((state) => state.savingCount);
  const setWeatherCardVisible = useCallback(async (showWeatherCard: boolean) => {
    await updateScopedPreferences({ showWeatherCard });
  }, []);

  return {
    showWeatherCard,
    setWeatherCardVisible,
    isHydrated: !isLoading,
    isSaving: savingCount > 0,
  };
}
