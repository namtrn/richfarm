import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, useColorScheme } from 'react-native';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';
import { getLocales } from 'expo-localization';
import i18n from '../lib/i18n';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { OfflineScreen } from '../components/ui/OfflineScreen';
import { RichToastHost } from '../components/ui/RichToastHost';
import { SyncToastCoordinator } from '../components/sync/SyncToastCoordinator';
import { useAppReady } from '../hooks/useAppReady';
import { useSyncTriggers } from '../hooks/useSyncTriggers';
import { useNotifications } from '../hooks/useNotifications';
import { SubscriptionProvider } from '../hooks/useSubscription';
import { AuthProvider } from '../lib/auth';
import { GuestClaimCoordinator } from '../components/sync/GuestClaimCoordinator';
import { convex } from '../lib/convex';
import { BetterAuthConvexProvider } from '../lib/convexAuth';
import { palette, useTheme } from '../lib/theme';
import { ThemeProvider, useThemeContext } from '../lib/ThemeContext';
import { quarantineLegacyQueue } from '../lib/sync/queue';
import { MobileRuntimeCoordinator } from '../lib/state/MobileRuntimeCoordinator';
import { SyncScopeCoordinator } from '../lib/state/SyncScopeCoordinator';
import { ScopedPreferencesCoordinator } from '../lib/state/ScopedPreferencesCoordinator';

function AuthGuard() {
  const { isReady, currentUser } = useAppReady();

  useSyncTriggers(isReady);
  useNotifications(isReady);

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

function AppShellWithSettings({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const { isDark } = useThemeContext();

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function AppShellOffline({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const isDark = systemScheme === 'dark';
  const background = isDark ? palette.dark.background : palette.light.background;

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: background }]} edges={['top', 'left', 'right']}>
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  useEffect(() => {
    void quarantineLegacyQueue();
  }, []);

  if (!convex) {
    return (
      <I18nextProvider i18n={i18n}>
        <MobileRuntimeCoordinator>
          <AppShellOffline>
            <OfflineScreen />
          </AppShellOffline>
        </MobileRuntimeCoordinator>
      </I18nextProvider>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <MobileRuntimeCoordinator>
        <BetterAuthConvexProvider>
          <AuthProvider>
            <SyncScopeCoordinator>
              <ScopedPreferencesCoordinator>
                <GuestClaimCoordinator />
                <SubscriptionProvider>
                  <ThemeProvider>
                    <AppShellWithSettings>
                      <AuthGuard />
                      <SyncToastCoordinator />
                      <RichToastHost />
                    </AppShellWithSettings>
                  </ThemeProvider>
                </SubscriptionProvider>
              </ScopedPreferencesCoordinator>
            </SyncScopeCoordinator>
          </AuthProvider>
        </BetterAuthConvexProvider>
      </MobileRuntimeCoordinator>
    </I18nextProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
});
