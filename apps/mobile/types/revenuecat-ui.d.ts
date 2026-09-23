declare module 'react-native-purchases-ui' {
  import type { PurchasesOffering } from 'react-native-purchases';

  export enum PAYWALL_RESULT {
    PURCHASED = 'PURCHASED',
    RESTORED = 'RESTORED',
    CANCELLED = 'CANCELLED',
    NOT_PRESENTED = 'NOT_PRESENTED',
    ERROR = 'ERROR',
  }

  export type PresentPaywallParams = {
    offering?: PurchasesOffering;
  };

  export type PresentPaywallIfNeededParams = {
    requiredEntitlementIdentifier: string;
    offering?: PurchasesOffering;
  };

  const RevenueCatUI: {
    presentPaywall: (params?: PresentPaywallParams) => Promise<PAYWALL_RESULT>;
    presentPaywallIfNeeded: (params: PresentPaywallIfNeededParams) => Promise<PAYWALL_RESULT>;
    presentCustomerCenter: () => Promise<void>;
  };

  export default RevenueCatUI;
}
