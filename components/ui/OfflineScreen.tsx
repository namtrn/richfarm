import { View, Text, TouchableOpacity } from 'react-native';
import { useCallback } from 'react';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';

export function OfflineScreen() {
  const { t } = useTranslation();
  const handleOpenDocs = useCallback(() => {
    Linking.openURL('https://docs.convex.dev');
  }, []);

  return (
    <View className="flex-1 justify-center items-center px-6 gap-y-4 bg-white dark:bg-gray-950">
      <Text className="text-3xl font-bold text-gray-900 dark:text-white">{t('offline.title')}</Text>
      <Text className="text-base text-gray-500 text-center">
        {t('offline.description')}
      </Text>
      <TouchableOpacity
        className="bg-green-500 rounded-xl px-6 py-3"
        onPress={handleOpenDocs}
      >
        <Text className="text-white font-semibold">{t('offline.open_docs')}</Text>
      </TouchableOpacity>
    </View>
  );
}
