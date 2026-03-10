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

export function getRevenueCatApiKeyValidationError(apiKey: string | null): string | null {
  if (!apiKey) return 'Missing API key.';

  const key = apiKey.trim();
  if (!key) return 'API key is empty.';
  const env = getRevenueCatEnvironment();

  // RevenueCat Test Store keys use "test_" prefix and should be used only in test env.
  if (key.startsWith('test_')) {
    if (env === 'test') return null;
    return 'Test Store key ("test_*") can only be used when EXPO_PUBLIC_REVENUECAT_ENV=test.';
  }

  // RevenueCat SDK public keys are platform-specific:
  // iOS keys typically start with "appl_", Android with "goog_".
  if (Platform.OS === 'ios' && !key.startsWith('appl_')) {
    return 'iOS requires a RevenueCat public SDK key that starts with "appl_".';
  }

  if (Platform.OS === 'android' && !key.startsWith('goog_')) {
    return 'Android requires a RevenueCat public SDK key that starts with "goog_".';
  }

  return null;
}

export function getRevenueCatAppUserId(args: {
  tokenIdentifier?: string | null;
}) {
  if (args.tokenIdentifier) return args.tokenIdentifier;
  return null;
}
