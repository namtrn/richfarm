import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../packages/convex/convex/_generated/api';
import { useDeviceId } from '../lib/deviceId';
import { useNetworkStatus } from './useNetworkStatus';
import { useQueryCache } from '../lib/queryCache';
import { deriveAppModeFromOnboarding, normalizeAppMode, type AppMode } from '../lib/appMode';
import { useHasAuthSession, useSessionScopedCacheKey } from '../lib/sessionCache';
import { authClient } from '../lib/auth-client';
import {
    enqueuePreferencePatch,
    rebasePreferencePatch,
    removePreferencePatch,
} from '../lib/sync/preferencesQueue';

export function useUserSettings() {
    const { deviceId, isLoading: isDeviceLoading } = useDeviceId();
    const rawSettings = useQuery(api.userSettings.getUserSettings, deviceId ? { deviceId } : 'skip');
    const { isKnown, isOffline } = useNetworkStatus();
    const shouldBypassRemote = isKnown && isOffline;
    const hasSession = useHasAuthSession();
    const { data: session } = authClient.useSession();
    const scope = deviceId ? `${deviceId}:${session?.user?.id ?? 'guest'}` : undefined;

    const cacheKey = useSessionScopedCacheKey('rf_user_settings_v2');
    const { cached, cacheLoaded, remoteResolved } = useQueryCache(cacheKey, rawSettings);

    // When rawSettings has resolved (even to null), use it directly.
    const settings = remoteResolved
        ? rawSettings
        : cached !== undefined
            ? cached
            : shouldBypassRemote
                ? null
                : undefined;

    const applyPatch = useMutation(api.userSettings.applyPreferencesPatch);
    const ensureSyncSession = useMutation(api.syncV2.ensureSession);

    const updateSettings = async (args: { unitSystem?: string; theme?: string; appMode?: AppMode; showWeatherCard?: boolean }) => {
        if (!scope) throw new Error('preference_scope_unavailable');
        const operationId = `preferences:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
        const serverSession = settings?.userId ? null : await ensureSyncSession({ deviceId });
        const serverUserId = settings?.userId ?? serverSession?.userId;
        const generation = settings?.generation ?? (serverUserId ? `preferences:${serverUserId}` : undefined);
        const operation = {
            operationId,
            baseRevision: settings?.revision ?? 0,
            generation,
            patch: args,
            createdAt: Date.now(),
            attempts: 0,
        };
        await enqueuePreferencePatch(scope, operation);
        if (!generation) return operationId;
        try {
            let result = await applyPatch({ deviceId, operationId, baseRevision: operation.baseRevision, generation, patch: args });
            if (result.status === 'revision_conflict') {
                await rebasePreferencePatch(scope, operationId, result.revision, generation);
                result = await applyPatch({ deviceId, operationId, baseRevision: result.revision, generation, patch: args });
            }
            if (result.status === 'applied' || result.status === 'already_applied') {
                await removePreferencePatch(scope, operationId);
            }
            return result;
        } catch {
            return operationId;
        }
    };

    return {
        settings,
        updateSettings,
        appMode: normalizeAppMode(settings?.appMode) ?? deriveAppModeFromOnboarding(settings?.onboarding),
        isLoading: isDeviceLoading || (settings === undefined && !cacheLoaded),
    };
}
