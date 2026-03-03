import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { useAuth } from '../lib/auth';
import { api } from '../convex/_generated/api';
import { loadOnboardingData, saveOnboardingData, type OnboardingData } from '../lib/onboardingLocalData';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

export default function StartScreen() {
  const router = useRouter();
  const { user, isLoading, deviceId } = useAuth();
  const { isKnown, isOffline } = useNetworkStatus();
  const shouldBypassRemote = isKnown && isOffline;
  const [localData, setLocalData] = useState<OnboardingData | null>(null);
  const [localLoaded, setLocalLoaded] = useState(false);
  const syncAttemptedRef = useRef(false);

  const rawRemoteSettings = useQuery(api.userSettings.getUserSettings, deviceId ? { deviceId } : 'skip');
  const remoteSettings = shouldBypassRemote && rawRemoteSettings === undefined ? null : rawRemoteSettings;
  const upsertUserSettings = useMutation(api.userSettings.upsertUserSettings);

  useEffect(() => {
    let isMounted = true;
    loadOnboardingData()
      .then((data) => {
        if (!isMounted) return;
        setLocalData(data);
      })
      .finally(() => {
        if (!isMounted) return;
        setLocalLoaded(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const isReady = localLoaded && !isLoading;

  useEffect(() => {
    if (!isReady || shouldBypassRemote || remoteSettings === undefined) return;

    const remoteOnboarding = remoteSettings?.onboarding;
    const localCompletedAt = localData?.completedAt ?? 0;
    const remoteCompletedAt = typeof remoteOnboarding?.completedAt === 'number' ? remoteOnboarding.completedAt : 0;
    const shouldSync =
      !!localData &&
      !!user &&
      !user.isAnonymous &&
      (remoteSettings === null || localCompletedAt > remoteCompletedAt);

    if (!shouldSync || syncAttemptedRef.current) return;
    syncAttemptedRef.current = true;

    (async () => {
      try {
        const saved = await saveOnboardingData(localData);
        await upsertUserSettings({
          deviceId: deviceId ?? undefined,
          onboarding: saved,
        });
      } catch {
        syncAttemptedRef.current = false;
      }
    })();
  }, [isReady, localData, remoteSettings, user, upsertUserSettings, deviceId, shouldBypassRemote]);

  useEffect(() => {
    if (!isReady) return;

    const isOnboarded = Boolean(localData?.completedAt) || Boolean(remoteSettings?.onboarding?.completedAt);
    router.replace(isOnboarded ? '/(tabs)/home' : '/onboarding/farm-setup');
  }, [isReady, localData?.completedAt, remoteSettings?.onboarding?.completedAt, router]);

  return <LoadingScreen />;
}
