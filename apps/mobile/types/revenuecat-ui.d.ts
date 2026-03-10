declare module 'react-native-purchases-ui' {
  import type { Offering } from 'react-native-purchases';

  export enum PAYWALL_RESULT {
    PURCHASED = 'PURCHASED',
    RESTORED = 'RESTORED',
    CANCELLED = 'CANCELLED',
    NOT_PRESENTED = 'NOT_PRESENTED',
    ERROR = 'ERROR',
  }

  export type PresentPaywallParams = {
    offering?: Offering;
  };

  export type PresentPaywallIfNeededParams = {
    requiredEntitlementIdentifier: string;
    offering?: Offering;
  };

  const RevenueCatUI: {
    presentPaywall: (params?: PresentPaywallParams) => Promise<PAYWALL_RESULT>;
    presentPaywallIfNeeded: (params: PresentPaywallIfNeededParams) => Promise<PAYWALL_RESULT>;
  };

  export default RevenueCatUI;
}
