import { Platform } from 'react-native';

export const REVENUECAT_ENTITLEMENT_ID = 'premium';

type RevenueCatEnv = 'test' | 'production';

export function getRevenueCatEnvironment(): RevenueCatEnv {
  const env = process.env.EXPO_PUBLIC_REVENUECAT_ENV;
  if (env === 'test' || env === 'production') return env;
  return __DEV__ ? 'test' : 'production';
}

export function isRevenueCatSupportedPlatform() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export function getRevenueCatApiKey() {
  const env = getRevenueCatEnvironment();
  const isTest = env === 'test';

  if (Platform.OS === 'ios') {
    if (isTest) {
      return (
        process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY_TEST ??
        process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ??
        null
      );
    }
    return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? null;
  }

  if (Platform.OS === 'android') {
    if (isTest) {
      return (
        process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY_TEST ??
        process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ??
        null
      );
    }
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? null;
  }

  return null;
}

export function getRevenueCatAppUserId(args: {
  tokenIdentifier?: string | null;
  deviceId?: string | null;
}) {
  if (args.tokenIdentifier) return args.tokenIdentifier;
  if (args.deviceId) return `device:${args.deviceId}`;
  return null;
}
