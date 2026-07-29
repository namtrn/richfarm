import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/core/i18n';
import { ThemeProvider, useTheme } from '@/core/theme';

function Navigation() {
  const { colors, isDark } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Physics Discovery' }} />
        <Stack.Screen name="lesson/[lessonId]" options={{ title: 'Interactive lesson' }} />
        <Stack.Screen name="lab/[topicId]" options={{ title: 'Open lab' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <Navigation />
      </ThemeProvider>
    </I18nextProvider>
  );
}
