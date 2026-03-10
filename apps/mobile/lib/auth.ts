import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../packages/convex/_generated/api';
import { useDeviceId } from './deviceId';
import { useQueryCache } from './queryCache';
import { authClient } from './auth-client';

export function useAuth() {
    const { deviceId, isLoading: isDeviceLoading } = useDeviceId();
    const { data: session, isPending: isSessionLoading } = authClient.useSession();
    const rawUser = useQuery(api.users.getCurrentUser, session ? {} : 'skip');

    // Cache: read local first so returning users see their profile instantly,
    // without waiting for Convex. Convex result overwrites once it arrives.
    const cacheKey = deviceId ? `rf_current_user_v1_${deviceId}` : null;
    const { cached: cachedUser, remoteResolved } = useQueryCache(cacheKey, rawUser);

    // If Convex has answered → use it. Otherwise fall back to local cache.
    // Fresh install: both are null/undefined → user = null (no auth needed to boot).
    const user = remoteResolved ? rawUser : (cachedUser ?? null);

    const getOrCreateUserMutation = useMutation(api.users.getOrCreateUser);
    const updateProfileMutation = useMutation(api.users.updateProfile);
    const [bootError, setBootError] = useState<string | null>(null);
    const [isBootstrapping, setIsBootstrapping] = useState(false);
    const initializedKeyRef = useRef<string | null>(null);

    const initUser = async () => {
        if (isSessionLoading) {
            return null;
        }

        if (!session) {
            const result = await authClient.signIn.anonymous();
            if (result.error) {
                throw new Error(result.error.message ?? 'Anonymous sign-in failed');
            }
            return null;
        }

        const initKey = `${session.session.id}:${deviceId ?? 'no-device-id'}`;
        if (initializedKeyRef.current === initKey) {
            return user?._id ?? null;
        }

        initializedKeyRef.current = initKey;
        return await getOrCreateUserMutation({ deviceId });
    };

    useEffect(() => {
        let cancelled = false;

        const bootstrap = async () => {
            if (isSessionLoading) {
                return;
            }

            setIsBootstrapping(true);

            try {
                await initUser();
                if (!cancelled) {
                    setBootError(null);
                }
            } catch (error) {
                initializedKeyRef.current = null;
                if (!cancelled) {
                    const message = error instanceof Error ? error.message : 'Authentication failed';
                    setBootError(message);
                }
            } finally {
                if (!cancelled) {
                    setIsBootstrapping(false);
                }
            }
        };

        void bootstrap();

        return () => {
            cancelled = true;
        };
    }, [deviceId, getOrCreateUserMutation, isSessionLoading, session?.session.id]);

    const updateProfile = async (args: {
        name?: string;
        locale?: string;
        timezone?: string;
    }) => {
        return await updateProfileMutation({ ...args, deviceId });
    };

    const isReady = !!deviceId && !!session && !isSessionLoading && !isBootstrapping && rawUser !== undefined;

    return {
        user,
        isLoading: isDeviceLoading || isSessionLoading || isBootstrapping,
        isReady,
        session,
        isAuthenticated: !!user && user.isAnonymous !== true,
        initUser,
        updateProfile,
        deviceId,
        error: bootError,
    };
}
