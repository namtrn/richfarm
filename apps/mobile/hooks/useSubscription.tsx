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

type SubscriptionContextValue = {
  isConfigured: boolean;
  isLoading: boolean;
  isPremium: boolean;
  customerInfo: CustomerInfo | null;
  refresh: () => Promise<void>;
  restorePurchases: () => Promise<void>;
};

const purchases = Purchases;

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { currentUser, isReady } = useAppReady();
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

    const syncIdentity = async () => {
      if (!configuredRef.current) {
        if (__DEV__) {
          void purchases.setLogLevel(purchases.LOG_LEVEL.DEBUG);
        }

        purchases.configure({
          apiKey: (apiKey ?? '').trim(),
          ...(nextUserId ? { appUserID: nextUserId } : {}),
        });
        configuredRef.current = true;
        lastUserIdRef.current = nextUserId;
        setIsConfigured(true);
      } else if (nextUserId !== lastUserIdRef.current) {
        setCustomerInfo(null);
        if (nextUserId) {
          if (__DEV__) {
            console.log('[RevenueCat] logIn', { nextUserId });
          }
          const result = await purchases.logIn(nextUserId);
          lastUserIdRef.current = nextUserId;
          if (!cancelled && generation === identityGenerationRef.current) {
            setCustomerInfo(result.customerInfo);
          }
        } else {
          await purchases.logOut();
          lastUserIdRef.current = null;
        }
      }

      const info = await purchases.getCustomerInfo();
      if (!cancelled && generation === identityGenerationRef.current) {
        setCustomerInfo(info);
      }
    };

    setIsLoading(true);
    identitySyncRef.current = identitySyncRef.current
      .catch(() => undefined)
      .then(syncIdentity)
      .catch((error) => {
        if (__DEV__) {
          console.warn('[RevenueCat] identity sync failed', error);
        }
      })
      .finally(() => {
        if (!cancelled && generation === identityGenerationRef.current) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [appUserId, currentUser?.revenueCatAppUserId, isReady]);

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
