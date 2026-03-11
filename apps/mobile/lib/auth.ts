import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../packages/convex/convex/_generated/api';
import type { Doc } from '../../../packages/convex/convex/_generated/dataModel';
import { sanitizeAnonymousProfile } from '../../../packages/shared/src/authProfile';
import { authClient } from './auth-client';
import { useDeviceId } from './deviceId';
import { useQueryCache } from './queryCache';

type AppUser = Doc<'users'>;
type SanitizedUser = AppUser & {
  isAnonymous: boolean;
  name?: string;
  email?: string;
  image?: string;
};

type AuthContextValue = {
  user: SanitizedUser | null;
  isLoading: boolean;
  isReady: boolean;
  session: ReturnType<typeof authClient.useSession>['data'];
  isAuthenticated: boolean;
  initUser: () => Promise<string | null>;
  updateProfile: (args: {
    name?: string;
    locale?: string;
    timezone?: string;
  }) => Promise<void>;
  deviceId: string | undefined;
  error: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

let anonymousSignInPromise: Promise<void> | null = null;
let lastBootstrappedKey: string | null = null;
let inFlightBootstrapKey: string | null = null;
let inFlightBootstrapPromise: Promise<string | null> | null = null;

async function ensureAnonymousSession() {
  if (!anonymousSignInPromise) {
    anonymousSignInPromise = (async () => {
      const result = await authClient.signIn.anonymous();
      if (result.error) {
        throw new Error(result.error.message ?? 'Anonymous sign-in failed');
      }
    })().finally(() => {
      anonymousSignInPromise = null;
    });
  }

  await anonymousSignInPromise;
}

async function ensureBootstrappedUser(args: {
  initKey: string;
  deviceId: string | undefined;
  getOrCreateUserMutation: ReturnType<typeof useMutation<typeof api.users.getOrCreateUser>>;
}) {
  if (lastBootstrappedKey === args.initKey) {
    return null;
  }

  if (inFlightBootstrapKey === args.initKey && inFlightBootstrapPromise) {
    return await inFlightBootstrapPromise;
  }

  inFlightBootstrapKey = args.initKey;
  inFlightBootstrapPromise = args
    .getOrCreateUserMutation({ deviceId: args.deviceId ?? undefined })
    .then((result) => {
      lastBootstrappedKey = args.initKey;
      return result;
    })
    .finally(() => {
      if (inFlightBootstrapKey === args.initKey) {
        inFlightBootstrapKey = null;
        inFlightBootstrapPromise = null;
      }
    });

  return await inFlightBootstrapPromise;
}

function useProvideAuth(): AuthContextValue {
  const { deviceId, isLoading: isDeviceLoading } = useDeviceId();
  const { data: session, isPending: isSessionLoading } = authClient.useSession();

  const rawUser = useQuery(api.users.getCurrentUser, session ? {} : 'skip');
  const sessionUserId =
    typeof session?.user?.id === 'string' && session.user.id.trim()
      ? session.user.id.trim()
      : null;

  const cacheKey =
    deviceId && sessionUserId ? `rf_current_user_v2_${deviceId}_${sessionUserId}` : null;
  const { cached: cachedUser, remoteResolved } = useQueryCache(cacheKey, rawUser);

  const user = !session ? null : remoteResolved ? rawUser : (cachedUser ?? null);
  const normalizedUser = user ? (sanitizeAnonymousProfile(user) as SanitizedUser) : null;

  const getOrCreateUserMutation = useMutation(api.users.getOrCreateUser);
  const updateProfileMutation = useMutation(api.users.updateProfile);
  const [bootError, setBootError] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const activeInitKeyRef = useRef<string | null>(null);

  const initUser = async () => {
    if (isSessionLoading) {
      return null;
    }

    if (!session) {
      await ensureAnonymousSession();
      return null;
    }

    const initKey = `${session.session.id}:${deviceId ?? 'no-device-id'}`;

    if (lastBootstrappedKey === initKey && remoteResolved && rawUser === null) {
      lastBootstrappedKey = null;
    }

    activeInitKeyRef.current = initKey;
    return await ensureBootstrappedUser({
      initKey,
      deviceId,
      getOrCreateUserMutation,
    });
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (isSessionLoading) {
        return;
      }

      setIsBootstrapping(true);

      try {
        await initUser();
        if (!cancelled) {
          setBootError(null);
        }
      } catch (error) {
        if (activeInitKeyRef.current && lastBootstrappedKey === activeInitKeyRef.current) {
          lastBootstrappedKey = null;
        }
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Authentication failed';
          setBootError(message);
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [deviceId, getOrCreateUserMutation, isSessionLoading, session?.session.id, remoteResolved, rawUser]);

  const updateProfile = async (args: {
    name?: string;
    locale?: string;
    timezone?: string;
  }) => {
    await updateProfileMutation({ ...args, deviceId: deviceId ?? undefined });
  };

  const isReady = !!deviceId && !isSessionLoading && !isBootstrapping;

  return {
    user: normalizedUser,
    isLoading: isDeviceLoading || isSessionLoading || isBootstrapping,
    isReady,
    session,
    isAuthenticated: !!normalizedUser && normalizedUser.isAnonymous !== true,
    initUser,
    updateProfile,
    deviceId,
    error: bootError,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useProvideAuth();
  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
