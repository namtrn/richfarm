import { authClient } from './auth-client';
import { useLocalSyncIdentity } from './sync/identity';

export function useSessionScopedCacheKey(prefix: string, suffix = '') {
  const { identity } = useLocalSyncIdentity();
  if (!identity) return null;
  return `${prefix}_${encodeURIComponent(identity.scopeKey)}${suffix}`;
}

export function useHasAuthSession() {
  const { data: session } = authClient.useSession();
  return !!session && (session.user as { isAnonymous?: boolean }).isAnonymous !== true;
}
