import { View, Text, TouchableOpacity } from 'react-native';
import { useCallback } from 'react';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../lib/theme';

export function OfflineScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const handleOpenDocs = useCallback(() => {
    Linking.openURL('https://docs.convex.dev');
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, gap: 16, backgroundColor: theme.background }}>
      <Text style={{ fontSize: 30, fontWeight: '700', color: theme.text }}>{t('offline.title')}</Text>
      <Text style={{ fontSize: 16, color: theme.textSecondary, textAlign: 'center' }}>
        {t('offline.description')}
      </Text>
      <TouchableOpacity
        style={{ backgroundColor: theme.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
        onPress={handleOpenDocs}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>{t('offline.open_docs')}</Text>
      </TouchableOpacity>
    </View>
  );
}
