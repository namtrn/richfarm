import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ConvexProviderWithAuth } from 'convex/react';
import { authClient } from './auth-client';
import { convex } from './convex';

function useBetterAuthForConvex() {
  const { data: session, isPending } = authClient.useSession();
  const sessionId = session?.session?.id ?? null;
  const [cachedToken, setCachedToken] = useState<string | null>(null);

  useEffect(() => {
    if (!session && !isPending && cachedToken) {
      setCachedToken(null);
    }
  }, [cachedToken, isPending, session]);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken = false }: { forceRefreshToken?: boolean } = {}) => {
      if (cachedToken && !forceRefreshToken) {
        return cachedToken;
      }

      try {
        const { data } = await authClient.convex.token();
        const token = data?.token ?? null;
        setCachedToken(token);
        return token;
      } catch {
        setCachedToken(null);
        return null;
      }
    },
    [cachedToken, sessionId]
  );

  return useMemo(
    () => ({
      isLoading: isPending,
      isAuthenticated: session !== null,
      fetchAccessToken,
    }),
    [fetchAccessToken, isPending, sessionId]
  );
}

export function BetterAuthConvexProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useBetterAuthForConvex}>
      {children}
    </ConvexProviderWithAuth>
  );
}
