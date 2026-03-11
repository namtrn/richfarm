import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ConvexProviderWithAuth } from 'convex/react';
import { authClient } from './auth-client';
import { createConvexClient } from './convex';

function useBetterAuthForConvex() {
  const { data: session, isPending } = authClient.useSession();
  const sessionId = session?.session?.id ?? null;
  const [cachedToken, setCachedToken] = useState<string | null>(null);
  const [tokenSessionId, setTokenSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!session && !isPending && cachedToken) {
      setCachedToken(null);
      setTokenSessionId(null);
    }
  }, [cachedToken, isPending, session]);

  useEffect(() => {
    if (tokenSessionId === sessionId) return;
    setCachedToken(null);
    setTokenSessionId(sessionId);
  }, [sessionId, tokenSessionId]);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken = false }: { forceRefreshToken?: boolean } = {}) => {
      if (cachedToken && !forceRefreshToken && tokenSessionId === sessionId) {
        return cachedToken;
      }

      try {
        const { data } = await authClient.convex.token();
        const token = data?.token ?? null;
        setCachedToken(token);
        setTokenSessionId(sessionId);
        return token;
      } catch {
        setCachedToken(null);
        setTokenSessionId(sessionId);
        return null;
      }
    },
    [cachedToken, sessionId, tokenSessionId]
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
  const { data: session } = authClient.useSession();
  const sessionId = session?.session?.id ?? 'anonymous';
  const convex = useMemo(() => createConvexClient(), [sessionId]);

  return (
    <ConvexProviderWithAuth key={sessionId} client={convex} useAuth={useBetterAuthForConvex}>
      {children}
    </ConvexProviderWithAuth>
  );
}
