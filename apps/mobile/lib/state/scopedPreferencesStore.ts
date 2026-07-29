import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { AppMode } from '../appMode';
import type { UnitSystem } from '../units';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ScopedPreferenceValues = {
  appMode?: AppMode;
  unitSystem?: UnitSystem;
  temperatureUnit: 'C' | 'F';
  theme: ThemePreference;
  showWeatherCard: boolean;
};

export type PreferencePatch = Partial<ScopedPreferenceValues> & {
  defaultView?: string;
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  shareAnonymousData?: boolean;
};

export type UserSettingsSnapshot = Record<string, any>;
type PreferenceWriter = (patch: PreferencePatch) => Promise<unknown>;

export type ScopedPreferencesState = {
  scope: string | null;
  scopeToken: string;
  hydration: 'idle' | 'loading' | 'ready';
  values: ScopedPreferenceValues;
  settings: UserSettingsSnapshot | undefined;
  sourceLoading: boolean;
  savingCount: number;
};

const DEFAULT_VALUES: ScopedPreferenceValues = {
  temperatureUnit: 'C',
  theme: 'system',
  showWeatherCard: true,
};

let writerScope: string | null = null;
let writer: PreferenceWriter | null = null;
let persistenceChain: Promise<void> = Promise.resolve();

function storageKey(scope: string) {
  return `rf_scoped_preferences_v1_${encodeURIComponent(scope)}`;
}

function normalizeValues(input?: Record<string, unknown> | null): Partial<ScopedPreferenceValues> {
  if (!input) return {};
  return {
    ...(input.appMode === 'farmer' || input.appMode === 'gardener'
      ? { appMode: input.appMode }
      : {}),
    ...(input.unitSystem === 'metric' || input.unitSystem === 'imperial'
      ? { unitSystem: input.unitSystem }
      : {}),
    ...(input.temperatureUnit === 'F' || input.temperatureUnit === 'C'
      ? { temperatureUnit: input.temperatureUnit }
      : {}),
    ...(input.theme === 'light' || input.theme === 'dark' || input.theme === 'system'
      ? { theme: input.theme }
      : {}),
    ...(typeof input.showWeatherCard === 'boolean'
      ? { showWeatherCard: input.showWeatherCard }
      : {}),
  };
}

function persist(scope: string, values: ScopedPreferenceValues) {
  const run = () => AsyncStorage.setItem(storageKey(scope), JSON.stringify({
    version: 1,
    scope,
    values,
  }));
  persistenceChain = persistenceChain.then(run, run);
  return persistenceChain;
}

export function createScopedPreferencesStore() {
  return createStore<ScopedPreferencesState>()(() => ({
    scope: null,
    scopeToken: 'uninitialized',
    hydration: 'idle',
    values: DEFAULT_VALUES,
    settings: undefined,
    sourceLoading: true,
    savingCount: 0,
  }));
}

export const scopedPreferencesStore = createScopedPreferencesStore();

export async function activateScopedPreferences(scope: string | null, scopeToken: string) {
  scopedPreferencesStore.setState({
    scope,
    scopeToken,
    hydration: scope ? 'loading' : 'idle',
    values: DEFAULT_VALUES,
    settings: undefined,
    sourceLoading: Boolean(scope),
    savingCount: 0,
  });
  if (!scope) return;
  try {
    const raw = await AsyncStorage.getItem(storageKey(scope));
    const parsed = raw ? JSON.parse(raw) as {
      version?: number;
      scope?: string;
      values?: Record<string, unknown>;
    } : null;
    const current = scopedPreferencesStore.getState();
    if (current.scope !== scope || current.scopeToken !== scopeToken) return;
    const cached = parsed?.version === 1 && parsed.scope === scope
      ? normalizeValues(parsed.values)
      : {};
    scopedPreferencesStore.setState({
      values: current.settings === undefined
        ? { ...DEFAULT_VALUES, ...cached }
        : current.values,
      hydration: 'ready',
    });
  } catch {
    const current = scopedPreferencesStore.getState();
    if (current.scope === scope && current.scopeToken === scopeToken) {
      scopedPreferencesStore.setState({ hydration: 'ready' });
    }
  }
}

export function publishPreferenceSource(input: {
  scope: string;
  scopeToken: string;
  settings: UserSettingsSnapshot | undefined;
  isLoading: boolean;
}) {
  const current = scopedPreferencesStore.getState();
  if (current.scope !== input.scope || current.scopeToken !== input.scopeToken) return false;
  if (input.settings === undefined) {
    scopedPreferencesStore.setState({ sourceLoading: input.isLoading });
    return true;
  }
  const values = {
    ...current.values,
    ...normalizeValues(input.settings),
  };
  scopedPreferencesStore.setState({
    values,
    settings: input.settings,
    sourceLoading: input.isLoading,
    hydration: 'ready',
  });
  void persist(input.scope, values);
  return true;
}

export function configurePreferenceWriter(scope: string | null, nextWriter: PreferenceWriter | null) {
  writerScope = scope;
  writer = nextWriter;
}

export async function updateScopedPreferences(patch: PreferencePatch) {
  const current = scopedPreferencesStore.getState();
  const scope = current.scope;
  if (!scope || writerScope !== scope || !writer) {
    throw new Error('preference_scope_unavailable');
  }
  const previousValues = current.values;
  const previousSettings = current.settings;
  const values = { ...previousValues, ...normalizeValues(patch) };
  scopedPreferencesStore.setState({
    values,
    settings: previousSettings ? { ...previousSettings, ...patch } : { ...patch },
    savingCount: current.savingCount + 1,
  });
  try {
    await persist(scope, values);
    return await writer(patch);
  } catch (error) {
    const latest = scopedPreferencesStore.getState();
    if (latest.scope === scope) {
      scopedPreferencesStore.setState({
        values: previousValues,
        settings: previousSettings,
      });
      void persist(scope, previousValues);
    }
    throw error;
  } finally {
    const latest = scopedPreferencesStore.getState();
    if (latest.scope === scope) {
      scopedPreferencesStore.setState({ savingCount: Math.max(0, latest.savingCount - 1) });
    }
  }
}

export function useScopedPreferences<T>(selector: (state: ScopedPreferencesState) => T) {
  return useStore(scopedPreferencesStore, selector);
}

export function getDefaultScopedPreferences() {
  return DEFAULT_VALUES;
}
