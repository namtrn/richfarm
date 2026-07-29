import { useLocalSyncIdentity } from './sync/identity';
import { useMobileRuntime } from './state/mobileRuntimeStore';

export function useSessionScopedCacheKey(prefix: string, suffix = '') {
  const { identity } = useLocalSyncIdentity();
  if (!identity) return null;
  return `${prefix}_${encodeURIComponent(identity.scopeKey)}${suffix}`;
}

export function useHasAuthSession() {
  return useMobileRuntime((state) => state.authStatus === 'account');
}
