import { Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../lib/theme';

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function VerifyEmailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const error = firstParam(params.error);

  const isError = Boolean(error);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, padding: 16, justifyContent: 'center', gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: theme.text }}>
          {isError ? t('profile.auth_verify_email_failed_title') : t('profile.auth_verify_email_success_title')}
        </Text>
        <Text style={{ fontSize: 14, color: theme.textSecondary }}>
          {isError ? t('profile.auth_verify_email_failed_desc') : t('profile.auth_verify_email_success_desc')}
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => router.replace('/auth')}
        style={{ backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
      >
        <Text style={{ color: theme.card, fontWeight: '600', fontSize: 14 }}>{t('profile.auth_back_to_sign_in')}</Text>
      </TouchableOpacity>
    </View>
  );
}
