import { useAuth } from '../lib/auth';

export function useAppReady() {
    const { user, deviceId, isReady, isLoading, error } = useAuth();

    return {
        isReady,
        isAuthReady: isReady,
        currentUser: user ?? null,
        deviceId,
        isLoading,
        error,
    };
}
