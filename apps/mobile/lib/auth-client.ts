import * as SecureStore from 'expo-secure-store';
import { expoClient } from '@better-auth/expo/client';
import { convexClient } from '@convex-dev/better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { anonymousClient } from 'better-auth/client/plugins';

const baseURL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;

/** App deep-link scheme — keep in sync with app.json "scheme" field */
export const APP_SCHEME = 'my-garden';

if (!baseURL) {
  throw new Error('EXPO_PUBLIC_CONVEX_SITE_URL is not set');
}

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    anonymousClient(),
    convexClient(),
    expoClient({
      scheme: APP_SCHEME,
      storagePrefix: 'my-garden',
      storage: SecureStore,
    }),
  ],
});

export async function getAuthClient(): Promise<typeof authClient> {
  return authClient;
}
