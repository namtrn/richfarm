import { TamaguiProvider } from 'tamagui';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { config } from '../tamagui.config';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useColorScheme, StyleSheet } from 'react-native';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { OfflineScreen } from '../components/ui/OfflineScreen';
import { useAppReady } from '../hooks/useAppReady';

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

function AuthGuard() {
  const { isReady, currentUser } = useAppReady();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!isReady) return;

    const inAuthGroup = segments[0] === '(auth)';

    // If you later add auth screens, you can enforce redirects here.
    // if (!currentUser && !inAuthGroup) {
    //   router.replace('/(auth)/sign-in');
    // } else if (currentUser && inAuthGroup) {
    //   router.replace('/(tabs)');
    // }
  }, [isReady, currentUser, segments, router]);

  if (!isReady) {
    return <LoadingScreen />;
  }

  return <Slot />;
}

function AppShell({ children }: { children: ReactNode }) {
  const colorScheme = useColorScheme();

  return (
    <TamaguiProvider config={config} defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          {children}
        </SafeAreaView>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  if (!convex) {
    // No Convex URL, avoid rendering screens that rely on Convex hooks.
    return (
      <AppShell>
        <OfflineScreen />
      </AppShell>
    );
  }

  return (
    <ConvexProvider client={convex}>
      <AppShell>
        <AuthGuard />
      </AppShell>
    </ConvexProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
});
