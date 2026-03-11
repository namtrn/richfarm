import Purchases, { CustomerInfo } from 'react-native-purchases';
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

type SubscriptionContextValue = {
  isConfigured: boolean;
  isLoading: boolean;
  isPremium: boolean;
  customerInfo: CustomerInfo | null;
  refresh: () => Promise<void>;
  restorePurchases: () => Promise<void>;
};

type PurchasesWithListeners = typeof Purchases & {
  removeCustomerInfoUpdateListener?: (listener: (info: CustomerInfo) => void) => void;
};

const purchases = Purchases as PurchasesWithListeners;

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { currentUser, isReady } = useAppReady();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const configuredRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  const appUserId = useMemo(
    () =>
      getRevenueCatAppUserId({
        revenueCatAppUserId: currentUser?.revenueCatAppUserId,
      }),
    [currentUser?.revenueCatAppUserId]
  );

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
    const validatedApiKey = (apiKey ?? '').trim();

    if (configuredRef.current) return;

    if (__DEV__) {
      purchases.setLogLevel(purchases.LOG_LEVEL.DEBUG);
    }

    purchases.configure({
      apiKey: validatedApiKey,
    });

    configuredRef.current = true;
    lastUserIdRef.current = null;
    setIsConfigured(true);
  }, [appUserId, isReady]);

  useEffect(() => {
    if (!configuredRef.current) return;

    const nextUserId = appUserId ?? null;
    const prevUserId = lastUserIdRef.current;

    if (!nextUserId || nextUserId === prevUserId) return;

    if (__DEV__) {
      console.log('[RevenueCat] logIn candidate', {
        nextUserId,
        rawRevenueCatAppUserId: currentUser?.revenueCatAppUserId,
      });
    }

    purchases
      .logIn(nextUserId)
      .then(() => {
        lastUserIdRef.current = nextUserId;
      })
      .catch(() => {
        // No-op: keep local state, app continues in anonymous mode.
      });
  }, [appUserId, currentUser?.revenueCatAppUserId]);

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
    if (!configuredRef.current) return;
    setIsLoading(true);
    try {
      const info = await purchases.restorePurchases();
      setCustomerInfo(info);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) return;

    void refresh();

    const listener = (info: CustomerInfo) => {
      setCustomerInfo(info);
    };

    purchases.addCustomerInfoUpdateListener(listener);

    return () => {
      purchases.removeCustomerInfoUpdateListener?.(listener);
    };
  }, [isConfigured, refresh]);

  const isPremium = Boolean(customerInfo?.entitlements.active[REVENUECAT_ENTITLEMENT_ID]);

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
