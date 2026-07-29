import { deriveAppModeFromOnboarding, normalizeAppMode } from '../lib/appMode';
import { useMobileRuntime } from '../lib/state/mobileRuntimeStore';
import {
  getDefaultScopedPreferences,
  updateScopedPreferences,
  useScopedPreferences,
  type UserSettingsSnapshot,
} from '../lib/state/scopedPreferencesStore';

export function useUserSettings() {
  const activeScope = useMobileRuntime((state) => state.activeScope);
  const storeScope = useScopedPreferences((state) => state.scope);
  const storedSettings = useScopedPreferences((state) => state.settings);
  const values = useScopedPreferences((state) => state.values);
  const sourceLoading = useScopedPreferences((state) => state.sourceLoading);
  const hydration = useScopedPreferences((state) => state.hydration);
  const visibleValues = activeScope === storeScope ? values : getDefaultScopedPreferences();
  const settings: UserSettingsSnapshot | undefined = activeScope === storeScope
    ? { ...(storedSettings ?? {}), ...visibleValues }
    : undefined;

  return {
    settings,
    updateSettings: updateScopedPreferences,
    appMode: normalizeAppMode(settings?.appMode)
      ?? deriveAppModeFromOnboarding(settings?.onboarding),
    isLoading: !activeScope
      || activeScope !== storeScope
      || hydration === 'loading'
      || sourceLoading,
  };
}
