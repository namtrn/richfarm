import { useCallback } from 'react';
import { Alert } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

/**
 * Soft sign-in prompt: explains why an account is needed and lets the user
 * either continue to sign in (returning here afterwards) or dismiss it.
 */
export function useAuthPrompt() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();

  return useCallback((message: string) => {
    Alert.alert(t('profile.auth_sign_in'), message, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.auth_sign_in'),
        onPress: () => router.push({ pathname: '/auth', params: { returnTo: pathname } }),
      },
    ]);
  }, [pathname, router, t]);
}
