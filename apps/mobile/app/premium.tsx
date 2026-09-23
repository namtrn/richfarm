import { useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { useAuth } from '../lib/auth';
import { usePaywall } from '../hooks/usePaywall';
import { useSubscription } from '../hooks/useSubscription';

/**
 * Account-aware paywall entry point.
 *
 * Purchases are intentionally not started for anonymous RevenueCat users.
 * The user must have a Better Auth session first so the purchase is associated
 * with the same identified App User ID used by Convex and the webhook.
 */
export default function PremiumScreen() {
  const router = useRouter();
  const { afterClose } = useLocalSearchParams<{ afterClose?: string }>();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { isLoading: isSubscriptionLoading } = useSubscription();
  const { presentPaywall } = usePaywall();
  const startedRef = useRef(false);

  useEffect(() => {
    if (isAuthLoading || isSubscriptionLoading || startedRef.current) return;

    if (!isAuthenticated) {
      startedRef.current = true;
      router.replace({
        pathname: '/auth',
        params: { returnTo: afterClose === 'home' ? '/premium?afterClose=home' : '/premium' },
      });
      return;
    }

    startedRef.current = true;
    void presentPaywall().finally(() => {
      if (afterClose === 'home') {
        router.replace('/(tabs)/home');
      } else {
        router.back();
      }
    });
  }, [afterClose, isAuthLoading, isAuthenticated, isSubscriptionLoading, presentPaywall, router]);

  return <LoadingScreen />;
}
