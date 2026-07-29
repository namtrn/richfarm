import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
  },
}));

import {
  activateScopedPreferences,
  configurePreferenceWriter,
  publishPreferenceSource,
  scopedPreferencesStore,
  updateScopedPreferences,
} from './scopedPreferencesStore';

describe('scoped preferences', () => {
  beforeEach(async () => {
    storage.clear();
    configurePreferenceWriter(null, null);
    await activateScopedPreferences(null, 'test-initial');
  });

  it('updates mode immediately and keeps Account A values out of Account B', async () => {
    await activateScopedPreferences('account-a', 'token-a');
    publishPreferenceSource({
      scope: 'account-a',
      scopeToken: 'token-a',
      settings: { appMode: 'gardener', theme: 'dark', showWeatherCard: false },
      isLoading: false,
    });
    let finishWrite!: () => void;
    const write = new Promise<void>((resolve) => { finishWrite = resolve; });
    configurePreferenceWriter('account-a', async () => write);
    const publishedModes: Array<string | undefined> = [];
    const unsubscribe = scopedPreferencesStore.subscribe((state) => {
      publishedModes.push(state.values.appMode);
    });

    const pending = updateScopedPreferences({ appMode: 'farmer' });
    expect(scopedPreferencesStore.getState().values.appMode).toBe('farmer');
    expect(publishedModes.at(-1)).toBe('farmer');
    finishWrite();
    await pending;
    unsubscribe();

    await activateScopedPreferences('account-b', 'token-b');
    expect(scopedPreferencesStore.getState().values).toMatchObject({
      theme: 'system',
      showWeatherCard: true,
    });
    expect(scopedPreferencesStore.getState().values.appMode).toBeUndefined();
    expect(publishPreferenceSource({
      scope: 'account-a',
      scopeToken: 'token-a',
      settings: { theme: 'dark' },
      isLoading: false,
    })).toBe(false);
  });

  it('hydrates each scope from its own durable key', async () => {
    storage.set(
      'rf_scoped_preferences_v1_account-a',
      JSON.stringify({ version: 1, scope: 'account-a', values: { unitSystem: 'imperial' } })
    );
    storage.set(
      'rf_scoped_preferences_v1_account-b',
      JSON.stringify({ version: 1, scope: 'account-b', values: { unitSystem: 'metric' } })
    );

    await activateScopedPreferences('account-a', 'token-a');
    expect(scopedPreferencesStore.getState().values.unitSystem).toBe('imperial');
    await activateScopedPreferences('account-b', 'token-b');
    expect(scopedPreferencesStore.getState().values.unitSystem).toBe('metric');
  });

  it('persists the complete preference group across a local restart', async () => {
    await activateScopedPreferences('guest-a', 'token-a');
    configurePreferenceWriter('guest-a', async () => 'queued-offline');

    await updateScopedPreferences({
      appMode: 'farmer',
      unitSystem: 'imperial',
      temperatureUnit: 'F',
      theme: 'dark',
      showWeatherCard: false,
    });
    await activateScopedPreferences(null, 'restart');
    await activateScopedPreferences('guest-a', 'token-after-restart');

    expect(scopedPreferencesStore.getState().values).toEqual({
      appMode: 'farmer',
      unitSystem: 'imperial',
      temperatureUnit: 'F',
      theme: 'dark',
      showWeatherCard: false,
    });
  });

  it('isolates Account A, guest and Account B preferences', async () => {
    await activateScopedPreferences('account-a', 'token-a');
    publishPreferenceSource({
      scope: 'account-a',
      scopeToken: 'token-a',
      settings: { appMode: 'farmer', theme: 'dark', unitSystem: 'imperial' },
      isLoading: false,
    });

    await activateScopedPreferences('guest-a', 'token-guest');
    expect(scopedPreferencesStore.getState().values).toEqual({
      temperatureUnit: 'C',
      theme: 'system',
      showWeatherCard: true,
    });
    publishPreferenceSource({
      scope: 'guest-a',
      scopeToken: 'token-guest',
      settings: { appMode: 'gardener', showWeatherCard: false },
      isLoading: false,
    });

    await activateScopedPreferences('account-b', 'token-b');
    expect(scopedPreferencesStore.getState().values.appMode).toBeUndefined();
    expect(scopedPreferencesStore.getState().values.theme).toBe('system');
    expect(publishPreferenceSource({
      scope: 'guest-a',
      scopeToken: 'token-guest',
      settings: { theme: 'dark' },
      isLoading: false,
    })).toBe(false);
  });
});
