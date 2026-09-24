import Purchases, { type CustomerInfo } from 'react-native-purchases';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  getRevenueCatApiKey,
  getRevenueCatApiKeyValidationError,
  getRevenueCatAppUserId,
  isRevenueCatSupportedPlatform,
  REVENUECAT_ENTITLEMENT_ID,
} from '../lib/revenuecat';
import { useAppReady } from './useAppReady';
import { useAuth } from '../lib/auth';

type SubscriptionContextValue = {
  isConfigured: boolean;
  isLoading: boolean;
  isPremium: boolean;
  customerInfo: CustomerInfo | null;
  /** Re-fetches customer info; resolves to whether the premium entitlement is active. */
  refresh: () => Promise<boolean>;
  /** Restores store purchases for the current app user; resolves to whether premium is now active. */
  restorePurchases: () => Promise<boolean>;
};

function hasPremiumEntitlement(info: CustomerInfo | null | undefined) {
  return Boolean(info?.entitlements.active[REVENUECAT_ENTITLEMENT_ID]);
}

type PurchasesWithListeners = typeof Purchases & {
  removeCustomerInfoUpdateListener?: (listener: (info: CustomerInfo) => void) => void;
};

const purchases = Purchases as PurchasesWithListeners;

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { currentUser, isReady } = useAppReady();
  const { isAuthenticated } = useAuth();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const configuredRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);
  const identitySyncRef = useRef<Promise<void>>(Promise.resolve());
  const identityGenerationRef = useRef(0);

  const appUserId = useMemo(
    () =>
      getRevenueCatAppUserId({
        revenueCatAppUserId: currentUser?.revenueCatAppUserId,
      }),
    [currentUser?.revenueCatAppUserId]
  );

  const refresh = useCallback(async () => {
    if (!configuredRef.current) return;
    setIsLoading(true);
    try {
      const info = await purchases.getCustomerInfo();
      setCustomerInfo(info);
    } catch {
      // Keep app functional if RevenueCat request fails (e.g. bad key/network).
    } finally {
      setIsLoading(false);
    }
  }, []);

  const restorePurchases = useCallback(async () => {
    if (!configuredRef.current) {
      throw new Error('RevenueCat is not configured.');
    }
    setIsLoading(true);
    try {
      const info = await purchases.restorePurchases();
      setCustomerInfo(info);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isReady) return;
    if (!isRevenueCatSupportedPlatform()) {
      setIsLoading(false);
      return;
    }

    const apiKey = getRevenueCatApiKey();
    const apiKeyValidationError = getRevenueCatApiKeyValidationError(apiKey);
    if (apiKeyValidationError) {
      if (__DEV__) {
        console.warn(
          `RevenueCat API key is invalid: ${apiKeyValidationError} Set EXPO_PUBLIC_REVENUECAT_IOS_API_KEY(_TEST) / EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY(_TEST) to valid SDK public keys.`
        );
      }
      setIsLoading(false);
      return;
    }

    const nextUserId = appUserId ?? null;
    const generation = identityGenerationRef.current + 1;
    identityGenerationRef.current = generation;
    let cancelled = false;

    if (nextUserId === prevUserId) return;

    if (!nextUserId) {
      // Only act on a real sign-out, not while the user doc is still loading.
      if (!isReady || isAuthenticated) return;
      // Drop the previous account's identity so its entitlements don't stay on this device.
      lastUserIdRef.current = null;
      purchases
        .logOut()
        .then(setCustomerInfo)
        .catch(() => {
          // No-op: RevenueCat throws if the current user is already anonymous.
        });
      return;
    }

        purchases.configure({
          apiKey: (apiKey ?? '').trim(),
          ...(nextUserId ? { appUserID: nextUserId } : {}),
        });
        configuredRef.current = true;
        lastUserIdRef.current = nextUserId;
      })
      .catch(() => {
        // No-op: keep local state, app continues in anonymous mode.
      });
  }, [appUserId, currentUser?.revenueCatAppUserId, isAuthenticated, isReady]);

  const refresh = useCallback(async () => {
    if (!configuredRef.current) return false;
    setIsLoading(true);
    try {
      const info = await purchases.getCustomerInfo();
      setCustomerInfo(info);
      return hasPremiumEntitlement(info);
    } catch {
      // Keep app functional if RevenueCat request fails (e.g. bad key/network).
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const restorePurchases = useCallback(async () => {
    if (!configuredRef.current) return false;
    setIsLoading(true);
    try {
      const info = await purchases.restorePurchases();
      setCustomerInfo(info);
      return hasPremiumEntitlement(info);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) return;

    const listener = (info: CustomerInfo) => {
      setCustomerInfo(info);
    };

    purchases.addCustomerInfoUpdateListener(listener);

    return () => {
      purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [isConfigured, refresh]);

  const isPremium = hasPremiumEntitlement(customerInfo);

  const value = useMemo(
    () => ({
      isConfigured,
      isLoading,
      isPremium,
      customerInfo,
      refresh,
      restorePurchases,
    }),
    [customerInfo, isConfigured, isLoading, isPremium, refresh, restorePurchases]
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
}
