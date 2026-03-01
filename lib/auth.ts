import { useEffect, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useDeviceId } from './deviceId';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useQueryCache } from './queryCache';

export function useAuth() {
    const { deviceId, isLoading: isDeviceLoading } = useDeviceId();
    const rawCurrentUser = useQuery(api.users.getCurrentUser, { deviceId });
    const { isKnown, isOffline } = useNetworkStatus();
    const shouldBypassRemote = isKnown && isOffline;

    const cacheKey = deviceId ? `rf_current_user_v1_${deviceId}` : null;
    const { cached: cachedUser } = useQueryCache(cacheKey, rawCurrentUser);

    const currentUser =
        rawCurrentUser ?? cachedUser ?? (shouldBypassRemote ? null : undefined);
    const getOrCreateUserMutation = useMutation(api.users.getOrCreateUser);
    const getOrCreateDeviceUserMutation = useMutation(api.users.getOrCreateDeviceUser);
    const updateProfileMutation = useMutation(api.users.updateProfile);
    const createAttemptedRef = useRef(false);

    useEffect(() => {
        if (shouldBypassRemote) return;
        if (!deviceId || currentUser === undefined || currentUser || createAttemptedRef.current) return;
        createAttemptedRef.current = true;

        (async () => {
            try {
                await getOrCreateUserMutation({ deviceId });
            } catch (error) {
                const message =
                    error instanceof Error ? error.message.toLowerCase() : '';
                if (message.includes('not authenticated')) {
                    await getOrCreateDeviceUserMutation({ deviceId });
                } else {
                    createAttemptedRef.current = false;
                }
            }
        })();
    }, [deviceId, currentUser, getOrCreateUserMutation, getOrCreateDeviceUserMutation, shouldBypassRemote]);

    const initUser = async () => {
        try {
            return await getOrCreateUserMutation({ deviceId });
        } catch (error) {
            const message =
                error instanceof Error ? error.message.toLowerCase() : '';
            if (!deviceId) throw new Error('Device ID not ready');
            if (!message.includes('not authenticated')) {
                throw error;
            }
            return await getOrCreateDeviceUserMutation({ deviceId });
        }
    };

    const updateProfile = async (args: {
        name?: string;
        locale?: string;
        timezone?: string;
    }) => {
        return await updateProfileMutation({ ...args, deviceId });
    };

    return {
        user: currentUser,
        isLoading: currentUser === undefined || isDeviceLoading,
        isAuthenticated: currentUser !== null && currentUser !== undefined,
        initUser,
        updateProfile,
        deviceId,
    };
}
