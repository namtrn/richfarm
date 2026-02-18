import { useAuth } from '../lib/auth';

export function useAppReady() {
    const fontsLoaded = true; // Tamagui handles fonts
    const { user, isLoading } = useAuth();

    // App is ready when device id + auth query has resolved
    const isAuthReady = !isLoading;
    const isReady = fontsLoaded && isAuthReady;

    return {
        isReady,
        isAuthReady,
        currentUser: user ?? null,
    };
}
