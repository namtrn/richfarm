import { View, Text, TouchableOpacity } from 'react-native';
import { useCallback } from 'react';
import { Linking } from 'react-native';

export function OfflineScreen() {
  const handleOpenDocs = useCallback(() => {
    Linking.openURL('https://docs.convex.dev');
  }, []);

  return (
    <View className="flex-1 justify-center items-center px-6 gap-y-4 bg-white dark:bg-gray-950">
      <Text className="text-3xl font-bold text-gray-900 dark:text-white">Offline Mode</Text>
      <Text className="text-base text-gray-500 text-center">
        Convex is not configured. Set `EXPO_PUBLIC_CONVEX_URL` in your environment.
      </Text>
      <TouchableOpacity
        className="bg-green-500 rounded-xl px-6 py-3"
        onPress={handleOpenDocs}
      >
        <Text className="text-white font-semibold">Open Convex Docs</Text>
      </TouchableOpacity>
    </View>
  );
}
