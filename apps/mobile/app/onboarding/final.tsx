import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle } from 'lucide-react-native';
import { useTheme } from '../../lib/theme';
import { loadOnboardingData } from '../../lib/onboardingLocalData';
import { normalizeOnboardingRole, type OnboardingRole } from '../../../../packages/shared/src/onboardingProfile';

const ROLE_LABEL_KEYS: Record<OnboardingRole, string> = {
  gardener: 'onboarding.role_gardener',
  farmer: 'onboarding.role_farmer',
  homesteader: 'onboarding.role_homesteader',
  learner: 'onboarding.role_learner',
};

export default function OnboardingFinalScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ role?: string }>();
  const [role, setRole] = useState<OnboardingRole>('gardener');

  useEffect(() => {
    if (params.role) {
      setRole(normalizeOnboardingRole(params.role));
      return;
    }
    let isMounted = true;
    loadOnboardingData().then((data) => {
      if (!isMounted || !data?.role) return;
      setRole(data.role);
    });
    return () => {
      isMounted = false;
    };
  }, [params.role]);

  const roleLabel = useMemo(() => t(ROLE_LABEL_KEYS[role]), [role, t]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingHorizontal: 22, paddingTop: 72, paddingBottom: 40 }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 18 }}>
        <View
          style={{
            alignSelf: 'center',
            width: 92,
            height: 92,
            borderRadius: 46,
            backgroundColor: theme.successBg,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.success ?? theme.primary,
          }}
        >
          <CheckCircle size={44} color={theme.success ?? theme.primary} />
        </View>
        <View style={{ gap: 10 }}>
          <Text style={{ textAlign: 'center', fontSize: 28, fontWeight: '800', color: theme.text }}>
            {t('onboarding.final_title')}
          </Text>
          <Text style={{ textAlign: 'center', fontSize: 15, color: theme.textSecondary }}>
            {t('onboarding.final_subtitle')}
          </Text>
        </View>
        <View
          style={{
            backgroundColor: theme.card,
            borderRadius: 16,
            padding: 16,
            gap: 10,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>
            {t('onboarding.final_role_line', { role: roleLabel })}
          </Text>
          <Text style={{ fontSize: 14, color: theme.textSecondary }}>
            {t('onboarding.final_switch_hint')}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={() => router.replace('/(tabs)/home')}
        style={{
          paddingVertical: 16,
          borderRadius: 14,
          alignItems: 'center',
          backgroundColor: theme.primary,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.background }}>
          {t('onboarding.final_cta')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
