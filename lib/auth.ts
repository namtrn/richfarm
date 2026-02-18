import { useEffect, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useDeviceId } from './deviceId';

export function useAuth() {
    const { deviceId, isLoading: isDeviceLoading } = useDeviceId();
    const currentUser = useQuery(api.users.getCurrentUser, { deviceId });
    const getOrCreateUserMutation = useMutation(api.users.getOrCreateUser);
    const getOrCreateDeviceUserMutation = useMutation(api.users.getOrCreateDeviceUser);
    const updateProfileMutation = useMutation(api.users.updateProfile);
    const createAttemptedRef = useRef(false);

    useEffect(() => {
        if (!deviceId || currentUser === undefined || currentUser || createAttemptedRef.current) return;
        createAttemptedRef.current = true;

        (async () => {
            try {
                await getOrCreateUserMutation({});
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
    }, [deviceId, currentUser, getOrCreateUserMutation, getOrCreateDeviceUserMutation]);

    const initUser = async () => {
        try {
            return await getOrCreateUserMutation({});
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
