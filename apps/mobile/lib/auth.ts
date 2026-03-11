import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../packages/convex/_generated/api';
import { useDeviceId } from './deviceId';
import { useQueryCache } from './queryCache';
import { authClient } from './auth-client';
import { sanitizeAnonymousProfile } from '../../../packages/shared/src/authProfile';

export function useAuth() {
    const { deviceId, isLoading: isDeviceLoading } = useDeviceId();
    const { data: session, isPending: isSessionLoading } = authClient.useSession();
    const rawUser = useQuery(api.users.getCurrentUser, session ? {} : 'skip');
    const sessionUserId =
        typeof session?.user?.id === 'string' && session.user.id.trim()
            ? session.user.id.trim()
            : null;

    // Cache: read local first so returning users see their profile instantly,
    // without waiting for Convex. Convex result overwrites once it arrives.
    const cacheKey =
        deviceId && sessionUserId ? `rf_current_user_v2_${deviceId}_${sessionUserId}` : null;
    const { cached: cachedUser, remoteResolved } = useQueryCache(cacheKey, rawUser);

    // If Convex has answered → use it. Otherwise fall back to local cache.
    // Fresh install: both are null/undefined → user = null (no auth needed to boot).
    const user = !session ? null : remoteResolved ? rawUser : (cachedUser ?? null);
    const normalizedUser = user ? sanitizeAnonymousProfile(user) : null;

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
            return normalizedUser?._id ?? null;
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

    // Startup must not block on a remote user record. Fresh installs can enter
    // onboarding while Better Auth / Convex finish resolving in the background.
    const isReady = !!deviceId && !isSessionLoading && !isBootstrapping;

    return {
        user: normalizedUser,
        isLoading: isDeviceLoading || isSessionLoading || isBootstrapping,
        isReady,
        session,
        isAuthenticated: !!normalizedUser && normalizedUser.isAnonymous !== true,
        initUser,
        updateProfile,
        deviceId,
        error: bootError,
    };
}
