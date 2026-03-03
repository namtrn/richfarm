import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useDeviceId } from '../lib/deviceId';
import { useNetworkStatus } from './useNetworkStatus';
import { useQueryCache } from '../lib/queryCache';

export function useUserSettings() {
    const { deviceId, isLoading: isDeviceLoading } = useDeviceId();
    const rawSettings = useQuery(api.userSettings.getUserSettings, deviceId ? { deviceId } : 'skip');
    const { isKnown, isOffline } = useNetworkStatus();
    const shouldBypassRemote = isKnown && isOffline;

    const cacheKey = deviceId ? `rf_user_settings_v1_${deviceId}` : null;
    const { cached, cacheLoaded, remoteResolved } = useQueryCache(cacheKey, rawSettings);

    // When rawSettings has resolved (even to null), use it directly.
    const settings = remoteResolved
        ? rawSettings
        : cached !== undefined
            ? cached
            : shouldBypassRemote
                ? null
                : undefined;

    const upsert = useMutation(api.userSettings.upsertUserSettings);

    const updateSettings = async (args: { unitSystem?: string; theme?: string }) => {
        return await upsert({ ...args, deviceId });
    };

    return {
        settings,
        updateSettings,
        isLoading: isDeviceLoading || (settings === undefined && !cacheLoaded),
    };
}
