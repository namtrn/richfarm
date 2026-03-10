import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../packages/convex/_generated/api';
import { useDeviceId } from './deviceId';
import { useQueryCache } from './queryCache';

export function useAuth() {
    const { deviceId, isLoading: isDeviceLoading } = useDeviceId();
    const rawUser = useQuery(api.users.getCurrentUser, { deviceId });

    // Cache: read local first so returning users see their profile instantly,
    // without waiting for Convex. Convex result overwrites once it arrives.
    const cacheKey = deviceId ? `rf_current_user_v1_${deviceId}` : null;
    const { cached: cachedUser, remoteResolved } = useQueryCache(cacheKey, rawUser);

    // If Convex has answered → use it. Otherwise fall back to local cache.
    // Fresh install: both are null/undefined → user = null (no auth needed to boot).
    const user = remoteResolved ? rawUser : (cachedUser ?? null);

    const getOrCreateUserMutation = useMutation(api.users.getOrCreateUser);
    const getOrCreateDeviceUserMutation = useMutation(api.users.getOrCreateDeviceUser);
    const updateProfileMutation = useMutation(api.users.updateProfile);

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
        user,
        isLoading: isDeviceLoading,
        isAuthenticated: !!user && user.isAnonymous !== true,
        initUser,
        updateProfile,
        deviceId,
    };
}
