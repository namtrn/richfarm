import { YStack, Text, Button } from 'tamagui';
import { useCallback } from 'react';
import { Linking } from 'react-native';

export function OfflineScreen() {
  const handleOpenDocs = useCallback(() => {
    Linking.openURL('https://docs.convex.dev');
  }, []);

  return (
    <YStack flex={1} justifyContent="center" alignItems="center" padding="$4" space="$4">
      <Text fontSize="$7" fontWeight="700">
        Offline Mode
      </Text>
      <Text fontSize="$4" color="$gray11" textAlign="center">
        Convex is not configured. Set `EXPO_PUBLIC_CONVEX_URL` in your environment.
      </Text>
      <Button theme="accent" onPress={handleOpenDocs}>
        Open Convex Docs
      </Button>
    </YStack>
  );
}
