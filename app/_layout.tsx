import { ConvexReactClient } from 'convex/react';
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StyleSheet, useColorScheme } from 'react-native';
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
import { useUserSettings } from '../hooks/useUserSettings';
import { useNotifications } from '../hooks/useNotifications';
import { authClient } from '../lib/auth-client';

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

function AuthGuard() {
  const { isReady, currentUser } = useAppReady();
  const router = useRouter();
  const segments = useSegments();
  useSyncTriggers();
  useNotifications();

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

import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../lib/theme';

function AppShell({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const systemScheme = useColorScheme();
  const { settings } = useUserSettings();
  const isDark = (settings?.theme === 'system' || !settings?.theme) ? systemScheme === 'dark' : settings?.theme === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
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
      <ConvexBetterAuthProvider client={convex} authClient={authClient}>
        <AppShell>
          <AuthGuard />
        </AppShell>
      </ConvexBetterAuthProvider>
    </I18nextProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
});
