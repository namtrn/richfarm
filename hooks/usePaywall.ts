import { useCallback, useState } from 'react';
import Purchases, { type Offering } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { REVENUECAT_ENTITLEMENT_ID } from '../lib/revenuecat';
import { useSubscription } from './useSubscription';

type PaywallStatus = 'purchased' | 'restored' | 'cancelled' | 'not_presented' | 'error';

type PaywallResponse = {
  status: PaywallStatus;
  errorMessage?: string;
};

async function getDefaultOffering() {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch {
    return null;
  }
}

export function usePaywall() {
  const { isConfigured, refresh } = useSubscription();
  const [isPresenting, setIsPresenting] = useState(false);

  const presentPaywall = useCallback(async (opts?: { onlyIfNeeded?: boolean }): Promise<PaywallResponse> => {
    if (!isConfigured) {
      return { status: 'error', errorMessage: 'RevenueCat is not configured.' };
    }

    setIsPresenting(true);
    try {
      const offering = await getDefaultOffering();
      const hasOffering = Boolean(offering);

      let result: PAYWALL_RESULT;

      if (opts?.onlyIfNeeded) {
        const params: { requiredEntitlementIdentifier: string; offering?: Offering } = {
          requiredEntitlementIdentifier: REVENUECAT_ENTITLEMENT_ID,
        };
        if (hasOffering && offering) params.offering = offering;
        result = await RevenueCatUI.presentPaywallIfNeeded(params);
      } else if (hasOffering && offering) {
        result = await RevenueCatUI.presentPaywall({ offering });
      } else {
        result = await RevenueCatUI.presentPaywall();
      }

      switch (result) {
        case PAYWALL_RESULT.PURCHASED:
          await refresh();
          return { status: 'purchased' };
        case PAYWALL_RESULT.RESTORED:
          await refresh();
          return { status: 'restored' };
        case PAYWALL_RESULT.CANCELLED:
          return { status: 'cancelled' };
        case PAYWALL_RESULT.NOT_PRESENTED:
          return { status: 'not_presented' };
        case PAYWALL_RESULT.ERROR:
        default:
          return { status: 'error', errorMessage: 'Failed to present paywall.' };
      }
    } catch (error) {
      return { status: 'error', errorMessage: error instanceof Error ? error.message : 'Unexpected error.' };
    } finally {
      setIsPresenting(false);
    }
  }, [isConfigured, refresh]);

  return {
    presentPaywall,
    isPresenting,
  };
}
