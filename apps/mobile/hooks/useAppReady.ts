import { useAuth } from '../lib/auth';

export function useAppReady() {
    const { user, deviceId } = useAuth();

    // App is ready as soon as deviceId is available — no need to wait for
    // Convex to confirm the user record. It gets created in the background.
    const isReady = !!deviceId;

    return {
        isReady,
        isAuthReady: isReady,
        currentUser: user ?? null,
        deviceId,
    };
}

