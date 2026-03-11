import { authClient } from './auth-client';
import { useDeviceId } from './deviceId';

export function useSessionScopedCacheKey(prefix: string, suffix = '') {
  const { deviceId } = useDeviceId();
  const { data: session } = authClient.useSession();
  const sessionUserId =
    typeof session?.user?.id === 'string' && session.user.id.trim()
      ? session.user.id.trim()
      : null;

  if (!deviceId || !sessionUserId) return null;
  return `${prefix}_${deviceId}_${sessionUserId}${suffix}`;
}

export function useHasAuthSession() {
  const { data: session } = authClient.useSession();
  return session !== null;
}
