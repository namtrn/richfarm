import { useMobileRuntime } from '../lib/state/mobileRuntimeStore';
import {
  getDefaultScopedPreferences,
  useScopedPreferences,
  type ScopedPreferenceValues,
  type UserSettingsSnapshot,
} from '../lib/state/scopedPreferencesStore';

export function useScopedPreferenceValue<K extends keyof ScopedPreferenceValues>(key: K) {
  const activeScope = useMobileRuntime((state) => state.activeScope);
  const storeScope = useScopedPreferences((state) => state.scope);
  const value = useScopedPreferences((state) => state.values[key]);
  return activeScope === storeScope ? value : getDefaultScopedPreferences()[key];
}

export function useScopedSettingsField<K extends keyof UserSettingsSnapshot>(key: K) {
  const activeScope = useMobileRuntime((state) => state.activeScope);
  const storeScope = useScopedPreferences((state) => state.scope);
  const value = useScopedPreferences((state) => state.settings?.[key]);
  return activeScope === storeScope ? value : undefined;
}

export function useScopedPreferencesLoading() {
  const activeScope = useMobileRuntime((state) => state.activeScope);
  const storeScope = useScopedPreferences((state) => state.scope);
  const hydration = useScopedPreferences((state) => state.hydration);
  const sourceLoading = useScopedPreferences((state) => state.sourceLoading);
  return !activeScope
    || activeScope !== storeScope
    || hydration === 'loading'
    || sourceLoading;
}
