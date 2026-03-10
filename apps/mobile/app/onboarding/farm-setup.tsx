import { startTransition, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Pressable, Modal } from 'react-native';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Building2,
  FlaskConical,
  Gift,
  Fence,
  Globe,
  Heart,
  Home,
  Leaf,
  Package,
  Search,
  Sprout,
  Trees,
  Crown,
  Users,
  Warehouse,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../../packages/convex/_generated/api';
import { useAuth } from '../../lib/auth';
import { saveOnboardingData } from '../../lib/onboardingLocalData';
import { useTheme } from '../../lib/theme';
import {
  buildOnboardingData,
  deriveAppModeFromOnboarding,
  type OnboardingRole,
} from '../../../../packages/shared/src/onboardingProfile';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
];

type StepKey = 'role' | 'goals' | 'scaleEnvironment';

type Option = {
  id: string;
  labelKey: string;
  descriptionKey?: string;
  icon: any;
};

const ROLE_OPTIONS: Option[] = [
  { id: 'gardener', labelKey: 'onboarding.role_gardener', descriptionKey: 'onboarding.role_gardener_desc', icon: Leaf },
  { id: 'farmer', labelKey: 'onboarding.role_farmer', descriptionKey: 'onboarding.role_farmer_desc', icon: Sprout },
  { id: 'homesteader', labelKey: 'onboarding.role_homesteader', descriptionKey: 'onboarding.role_homesteader_desc', icon: Fence },
  { id: 'learner', labelKey: 'onboarding.role_learner', descriptionKey: 'onboarding.role_learner_desc', icon: BookOpen },
];

const PURPOSE_OPTIONS: Record<string, Option> = {
  food: { id: 'food', labelKey: 'onboarding.goals_food', icon: Leaf },
  ornamental: { id: 'ornamental', labelKey: 'onboarding.goals_ornamental', icon: Trees },
  medicinal: { id: 'medicinal', labelKey: 'onboarding.goals_medicinal', icon: Heart },
  business: { id: 'business', labelKey: 'onboarding.goals_business', icon: Crown },
  offgrid: { id: 'offgrid', labelKey: 'onboarding.goals_offgrid', icon: Fence },
  learning: { id: 'learning', labelKey: 'onboarding.goals_learning', icon: Search },
  relaxing: { id: 'relaxing', labelKey: 'onboarding.goals_relaxing', icon: Home },
  gifting: { id: 'gifting', labelKey: 'onboarding.goals_gifting', icon: Gift },
  nursery: { id: 'nursery', labelKey: 'onboarding.goals_nursery', icon: Sprout },
  preservation: { id: 'preservation', labelKey: 'onboarding.goals_preservation', icon: Package },
  family_supply: { id: 'family_supply', labelKey: 'onboarding.goals_family_supply', icon: Users },
  school_project: { id: 'school_project', labelKey: 'onboarding.goals_school_project', icon: BookOpen },
  experiment: { id: 'experiment', labelKey: 'onboarding.goals_experimentation', icon: FlaskConical },
};

const ENVIRONMENT_OPTIONS: Record<string, Option> = {
  indoor: { id: 'indoor', labelKey: 'onboarding.environment_indoor', icon: Home },
  balcony: { id: 'balcony', labelKey: 'onboarding.environment_balcony', icon: Home },
  backyard: { id: 'backyard', labelKey: 'onboarding.environment_backyard', icon: Trees },
  greenhouse: { id: 'greenhouse', labelKey: 'onboarding.environment_greenhouse', icon: Fence },
  field: { id: 'field', labelKey: 'onboarding.environment_field', icon: Sprout },
  homestead_land: { id: 'homestead_land', labelKey: 'onboarding.environment_homestead_land', icon: Fence },
  windowsill: { id: 'windowsill', labelKey: 'onboarding.environment_windowsill', icon: Home },
  rooftop: { id: 'rooftop', labelKey: 'onboarding.environment_rooftop', icon: Building2 },
  community_garden: { id: 'community_garden', labelKey: 'onboarding.environment_community_garden', icon: Users },
  nursery_zone: { id: 'nursery_zone', labelKey: 'onboarding.environment_nursery_zone', icon: Warehouse },
  orchard: { id: 'orchard', labelKey: 'onboarding.environment_orchard', icon: Trees },
  market_garden: { id: 'market_garden', labelKey: 'onboarding.environment_market_garden', icon: Leaf },
  kitchen_garden: { id: 'kitchen_garden', labelKey: 'onboarding.environment_kitchen_garden', icon: Leaf },
  mixed_livestock: { id: 'mixed_livestock', labelKey: 'onboarding.environment_mixed_livestock', icon: Fence },
  classroom: { id: 'classroom', labelKey: 'onboarding.environment_classroom', icon: BookOpen },
  shared_plot: { id: 'shared_plot', labelKey: 'onboarding.environment_shared_plot', icon: Users },
  lab_bench: { id: 'lab_bench', labelKey: 'onboarding.environment_lab_bench', icon: FlaskConical },
};

const ROLE_FLOW: Record<
  OnboardingRole,
  {
    purposeIds: string[];
    environmentIds: string[];
    purposeSubtitleKey: string;
    environmentSubtitleKey: string;
  }
> = {
  gardener: {
    purposeIds: ['food', 'ornamental', 'medicinal', 'relaxing', 'gifting', 'learning'],
    environmentIds: ['windowsill', 'indoor', 'balcony', 'backyard', 'rooftop', 'community_garden'],
    purposeSubtitleKey: 'onboarding.purpose_subtitle_gardener',
    environmentSubtitleKey: 'onboarding.environment_subtitle_gardener',
  },
  farmer: {
    purposeIds: ['food', 'business', 'nursery', 'medicinal', 'preservation', 'family_supply'],
    environmentIds: ['field', 'greenhouse', 'nursery_zone', 'market_garden', 'orchard', 'backyard'],
    purposeSubtitleKey: 'onboarding.purpose_subtitle_farmer',
    environmentSubtitleKey: 'onboarding.environment_subtitle_farmer',
  },
  homesteader: {
    purposeIds: ['food', 'offgrid', 'medicinal', 'preservation', 'family_supply', 'learning'],
    environmentIds: ['homestead_land', 'kitchen_garden', 'greenhouse', 'orchard', 'mixed_livestock', 'field'],
    purposeSubtitleKey: 'onboarding.purpose_subtitle_homesteader',
    environmentSubtitleKey: 'onboarding.environment_subtitle_homesteader',
  },
  learner: {
    purposeIds: ['learning', 'school_project', 'experiment', 'food', 'ornamental', 'medicinal'],
    environmentIds: ['classroom', 'windowsill', 'shared_plot', 'lab_bench', 'balcony', 'backyard'],
    purposeSubtitleKey: 'onboarding.purpose_subtitle_learner',
    environmentSubtitleKey: 'onboarding.environment_subtitle_learner',
  },
};

function LanguagePicker({
  visible,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}
        onPress={onClose}
      />
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            backgroundColor: theme.card,
            borderRadius: 24,
            paddingVertical: 12,
            width: 280,
            borderWidth: 1,
            borderColor: theme.border,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 8 },
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '800',
              color: theme.textMuted,
              textAlign: 'center',
              paddingVertical: 12,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}
          >
            {t('profile.language_label')}
          </Text>
          {LANGUAGES.map((lang) => {
            const isActive = lang.code === current;
            return (
              <TouchableOpacity
                key={lang.code}
                onPress={() => {
                  onSelect(lang.code);
                  onClose();
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                  backgroundColor: isActive ? theme.accent : 'transparent',
                  gap: 12,
                }}
              >
                <Text style={{ fontSize: 22 }}>{lang.flag}</Text>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 16,
                    fontWeight: isActive ? '700' : '500',
                    color: isActive ? theme.primary : theme.text,
                  }}
                >
                  {lang.label}
                </Text>
                {isActive ? <Check size={18} color={theme.primary} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

export default function FarmSetupScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const currentLocale = (i18n.language ?? 'en').split('-')[0].toLowerCase();
  const { user, deviceId } = useAuth();
  const upsertUserSettings = useMutation(api.userSettings.upsertUserSettings);
  const [stepIndex, setStepIndex] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [answers, setAnswers] = useState<{
    role: OnboardingRole | null;
    goals: string[];
    scaleEnvironment: string[];
  }>({
    role: null,
    goals: [],
    scaleEnvironment: [],
  });

  const activeRole = answers.role ?? 'gardener';
  const flow = ROLE_FLOW[activeRole];
  const steps = useMemo(
    () => [
      {
        key: 'role' as StepKey,
        titleKey: 'onboarding.role_title',
        subtitleKey: 'onboarding.role_subtitle',
        single: true,
        options: ROLE_OPTIONS,
      },
      {
        key: 'goals' as StepKey,
        titleKey: 'onboarding.purpose_title',
        subtitleKey: flow.purposeSubtitleKey,
        single: false,
        options: flow.purposeIds.map((id) => PURPOSE_OPTIONS[id]),
      },
      {
        key: 'scaleEnvironment' as StepKey,
        titleKey: 'onboarding.environment_title',
        subtitleKey: flow.environmentSubtitleKey,
        single: false,
        options: flow.environmentIds.map((id) => ENVIRONMENT_OPTIONS[id]),
      },
    ],
    [flow]
  );

  const step = steps[stepIndex];
  const selections =
    step.key === 'role'
      ? answers.role
        ? [answers.role]
        : []
      : answers[step.key];
  const canContinue = selections.length > 0;

  const toggleOption = (id: string) => {
    startTransition(() => {
      setAnswers((prev) => {
        if (step.key === 'role') {
          const nextRole = id as OnboardingRole;
          const nextFlow = ROLE_FLOW[nextRole];
          return {
            role: nextRole,
            goals: prev.goals.filter((goal) => nextFlow.purposeIds.includes(goal)),
            scaleEnvironment: prev.scaleEnvironment.filter((environment) =>
              nextFlow.environmentIds.includes(environment)
            ),
          };
        }

        const current = prev[step.key];
        const isActive = current.includes(id);
        const nextValues = isActive ? current.filter((item) => item !== id) : [...current, id];
        return { ...prev, [step.key]: nextValues };
      });
    });
  };

  const persistOnboarding = async () => {
    const payload = buildOnboardingData({
      role: answers.role ?? 'gardener',
      goals: answers.goals,
      scaleEnvironment: answers.scaleEnvironment,
      completedAt: Date.now(),
    });

    const saved = await saveOnboardingData(payload);

    if (user && !user.isAnonymous) {
      await upsertUserSettings({
        deviceId: deviceId ?? undefined,
        onboarding: saved,
        appMode: deriveAppModeFromOnboarding(saved),
      });
    }
  };

  const handleNext = async () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex((current) => current + 1);
      return;
    }

    await persistOnboarding();
    router.replace('/(tabs)/home');
  };

  const handleSkip = async () => {
    await persistOnboarding();
    router.replace('/(tabs)/home');
  };

  const handleBack = () => {
    if (stepIndex === 0) {
      router.back();
      return;
    }
    setStepIndex((current) => current - 1);
  };

  const progress = ((stepIndex + 1) / steps.length) * 100;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View
        style={{
          paddingTop: 56,
          paddingHorizontal: 18,
          paddingBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {stepIndex > 0 ? (
          <TouchableOpacity
            onPress={handleBack}
            style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }}
          >
            <ArrowLeft size={22} color={theme.text} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 42, height: 42 }} />
        )}
        <TouchableOpacity
          onPress={() => setShowPicker(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: theme.accent,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <Text style={{ fontSize: 14 }}>
            {LANGUAGES.find((lang) => lang.code === currentLocale)?.flag ?? '🌐'}
          </Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>
            {LANGUAGES.find((lang) => lang.code === currentLocale)?.label ?? t('profile.language_label')}
          </Text>
          <Globe size={14} color={theme.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 140, gap: 18 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 12 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '800',
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: theme.textMuted,
            }}
          >
            {t('onboarding.progress', { current: stepIndex + 1, total: steps.length })}
          </Text>
          <View style={{ height: 8, borderRadius: 999, backgroundColor: theme.accent, overflow: 'hidden' }}>
            <View style={{ width: `${progress}%`, height: '100%', backgroundColor: theme.primary }} />
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: theme.text }}>{t(step.titleKey)}</Text>
          <Text style={{ fontSize: 15, color: theme.textSecondary }}>{t(step.subtitleKey)}</Text>
        </View>

        <View style={{ gap: 12 }}>
          {step.options.map((option) => {
            const isActive = selections.includes(option.id);
            const Icon = option.icon;

            return (
              <Pressable
                key={option.id}
                onPress={() => toggleOption(option.id)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  gap: 14,
                  padding: 16,
                  borderRadius: 20,
                  backgroundColor: isActive ? theme.successBg : theme.card,
                  borderWidth: 1,
                  borderColor: isActive ? theme.primary : theme.border,
                  opacity: pressed ? 0.92 : 1,
                  alignItems: 'center',
                })}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: theme.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={22} color={theme.primary} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>{t(option.labelKey)}</Text>
                  {option.descriptionKey ? (
                    <Text style={{ fontSize: 13, color: theme.textSecondary }}>{t(option.descriptionKey)}</Text>
                  ) : null}
                </View>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: isActive ? theme.primary : theme.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isActive ? theme.primary : 'transparent',
                  }}
                >
                  {isActive ? <Check size={14} color="#fff" /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 24,
          paddingHorizontal: 22,
          flexDirection: 'row',
          gap: 12,
        }}
      >
        <TouchableOpacity
          onPress={handleSkip}
          testID="e2e-onboarding-skip-button"
          style={{
            flex: 1,
            paddingVertical: 16,
            borderRadius: 22,
            backgroundColor: theme.accent,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('onboarding.skip')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleNext}
          disabled={!canContinue}
          testID="e2e-onboarding-next-button"
          style={{
            flex: 1,
            paddingVertical: 16,
            borderRadius: 22,
            alignItems: 'center',
            backgroundColor: canContinue ? theme.primary : theme.accent,
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: '700',
              color: canContinue ? '#ffffff' : theme.textMuted,
            }}
          >
            {stepIndex === steps.length - 1 ? t('onboarding.finish') : t('onboarding.next')}
          </Text>
        </TouchableOpacity>
      </View>
      <LanguagePicker
        visible={showPicker}
        current={currentLocale}
        onSelect={(code) => i18n.changeLanguage(code)}
        onClose={() => setShowPicker(false)}
      />
    </View>
  );
}
