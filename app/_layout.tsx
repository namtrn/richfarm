import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';
import { getLocales } from 'expo-localization';
import i18n from '../lib/i18n';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { OfflineScreen } from '../components/ui/OfflineScreen';
import { useAppReady } from '../hooks/useAppReady';
import { useSyncTriggers } from '../hooks/useSyncTriggers';

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

function AuthGuard() {
  const { isReady, currentUser } = useAppReady();
  const router = useRouter();
  const segments = useSegments();
  useSyncTriggers();

  useEffect(() => {
    if (!isReady) return;
    // Auth redirect logic can go here
  }, [isReady, currentUser, segments, router]);

  useEffect(() => {
    if (!isReady) return;
    const deviceLocale = getLocales()[0]?.languageCode ?? 'en';
    const preferred = currentUser?.locale ?? deviceLocale;
    if (preferred && i18n.language !== preferred) {
      i18n.changeLanguage(preferred);
    }
  }, [isReady, currentUser?.locale]);

  if (!isReady) {
    return <LoadingScreen />;
  }

  return <Slot />;
}

function AppShell({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  if (!convex) {
    return (
      <I18nextProvider i18n={i18n}>
        <AppShell>
          <OfflineScreen />
        </AppShell>
      </I18nextProvider>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <ConvexProvider client={convex}>
        <AppShell>
          <AuthGuard />
        </AppShell>
      </ConvexProvider>
    </I18nextProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
});
