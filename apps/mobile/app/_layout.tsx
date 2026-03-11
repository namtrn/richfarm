import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { getLocales } from 'expo-localization';
import i18n from '../lib/i18n';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { OfflineScreen } from '../components/ui/OfflineScreen';
import { SyncStatusBanner } from '../components/ui/SyncStatusBanner';
import { useAppReady } from '../hooks/useAppReady';
import { useSyncTriggers } from '../hooks/useSyncTriggers';
import { useNotifications } from '../hooks/useNotifications';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { SubscriptionProvider } from '../hooks/useSubscription';
import { AuthProvider } from '../lib/auth';
import { convex } from '../lib/convex';
import { BetterAuthConvexProvider } from '../lib/convexAuth';
import { palette, useTheme } from '../lib/theme';
import { ThemeProvider, useThemeContext } from '../lib/ThemeContext';

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

function OfflineBanner() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { isOffline } = useNetworkStatus();

  if (!isOffline) return null;

  return (
    <View
      style={[
        styles.offlineBanner,
        { backgroundColor: theme.warningBg, borderColor: theme.warning },
      ]}
    >
      <Text style={[styles.offlineBannerText, { color: theme.warning }]}>
        {t('offline.banner')}
      </Text>
    </View>
  );
}

export default function RootLayout() {
  if (!convex) {
    return (
      <I18nextProvider i18n={i18n}>
        <AppShellOffline>
          <OfflineScreen />
        </AppShellOffline>
      </I18nextProvider>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <BetterAuthConvexProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <ThemeProvider>
              <AppShellWithSettings>
                <OfflineBanner />
                <SyncStatusBanner compact style={styles.syncBanner} />
                <AuthGuard />
              </AppShellWithSettings>
            </ThemeProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </BetterAuthConvexProvider>
    </I18nextProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  offlineBanner: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  offlineBannerText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  syncBanner: {
    marginHorizontal: 12,
    marginBottom: 4,
  },
});
