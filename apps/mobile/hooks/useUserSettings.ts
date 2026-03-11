import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../packages/convex/_generated/api';
import { useDeviceId } from '../lib/deviceId';
import { useNetworkStatus } from './useNetworkStatus';
import { useQueryCache } from '../lib/queryCache';
import { deriveAppModeFromOnboarding, normalizeAppMode, type AppMode } from '../lib/appMode';
import { useHasAuthSession, useSessionScopedCacheKey } from '../lib/sessionCache';

export function useUserSettings() {
    const { deviceId, isLoading: isDeviceLoading } = useDeviceId();
    const rawSettings = useQuery(api.userSettings.getUserSettings, deviceId ? { deviceId } : 'skip');
    const { isKnown, isOffline } = useNetworkStatus();
    const shouldBypassRemote = isKnown && isOffline;
    const hasSession = useHasAuthSession();

    const cacheKey = useSessionScopedCacheKey('rf_user_settings_v2');
    const { cached, cacheLoaded, remoteResolved } = useQueryCache(cacheKey, rawSettings);

    // When rawSettings has resolved (even to null), use it directly.
    const settings = !hasSession
        ? null
        : remoteResolved
        ? rawSettings
        : cached !== undefined
            ? cached
            : shouldBypassRemote
                ? null
                : undefined;

    const upsert = useMutation(api.userSettings.upsertUserSettings);

    const updateSettings = async (args: { unitSystem?: string; theme?: string; appMode?: AppMode; showWeatherCard?: boolean }) => {
        return await upsert({ ...args, deviceId });
    };

    return {
        settings,
        updateSettings,
        appMode: normalizeAppMode(settings?.appMode) ?? deriveAppModeFromOnboarding(settings?.onboarding),
        isLoading: isDeviceLoading || (settings === undefined && !cacheLoaded),
    };
}
