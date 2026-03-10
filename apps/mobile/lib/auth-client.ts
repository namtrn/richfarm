const baseURL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;

/** App deep-link scheme — keep in sync with app.json "scheme" field */
export const APP_SCHEME = 'my-garden';

if (!baseURL) {
  throw new Error('EXPO_PUBLIC_CONVEX_SITE_URL is not set');
}

let authClientPromise: Promise<any> | null = null;

export async function getAuthClient(): Promise<any> {
  if (!authClientPromise) {
    authClientPromise = (async () => {
      const [{ createAuthClient }, { expoClient }, { convexClient }, SecureStore] = await Promise.all([
        import('better-auth/react'),
        import('@better-auth/expo/client'),
        import('@convex-dev/better-auth/client/plugins'),
        import('expo-secure-store'),
      ]);

      return createAuthClient({
        baseURL,
        plugins: [
          convexClient(),
          expoClient({
            scheme: APP_SCHEME,
            storagePrefix: 'my-garden',
            storage: SecureStore,
          }),
        ],
      });
    })();
  }

  return authClientPromise;
}
