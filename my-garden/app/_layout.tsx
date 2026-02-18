import { TamaguiProvider } from 'tamagui';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { config } from '../tamagui.config';
import { Slot } from 'expo-router';
import { useColorScheme } from 'react-native';

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

const convex = convexUrl 
  ? new ConvexReactClient(convexUrl)
  : null;

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const content = (
    <TamaguiProvider config={config} defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}>
      <Slot />
    </TamaguiProvider>
  );

  if (!convex) {
    return content;
  }

  return (
    <ConvexProvider client={convex}>
      {content}
    </ConvexProvider>
  );
}
