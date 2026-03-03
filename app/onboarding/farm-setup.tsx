import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Pressable, Modal } from 'react-native';
import {
  ArrowLeft,
  Home,
  Trees,
  Sprout,
  Fence,
  Droplets,
  Bug,
  Calendar,
  BookOpen,
  Crown,
  Clock,
  Check,
  Globe,
  Leaf,
  Heart,
  Ruler,
  Search,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useMutation } from 'convex/react';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { api } from '../../convex/_generated/api';
import { saveOnboardingData } from '../../lib/onboardingLocalData';
import { deriveAppModeFromOnboarding } from '../../lib/appMode';
import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
];

const STEP_DATA = [
  {
    key: 'goals',
    titleKey: 'onboarding.goals_title',
    subtitleKey: 'onboarding.pick_all',
    options: [
      { id: 'food', labelKey: 'onboarding.goals_food', icon: Leaf },
      { id: 'ornamental', labelKey: 'onboarding.goals_ornamental', icon: Leaf },
      { id: 'medicinal', labelKey: 'onboarding.goals_medicinal', icon: Heart },
      { id: 'business', labelKey: 'onboarding.goals_business', icon: Ruler },
      { id: 'offgrid', labelKey: 'onboarding.goals_offgrid', icon: Fence },
      { id: 'experiment', labelKey: 'onboarding.goals_experiment', icon: Search },
    ],
  },
  {
    key: 'scaleEnvironment',
    titleKey: 'onboarding.scale_title',
    subtitleKey: 'onboarding.pick_all',
    options: [
      { id: 'indoor', labelKey: 'onboarding.scale_indoor', icon: Home },
      { id: 'outdoor', labelKey: 'onboarding.scale_outdoor', icon: Trees },
      { id: 'inground', labelKey: 'onboarding.scale_inground', icon: Sprout },
      { id: 'greenhouse', labelKey: 'onboarding.scale_greenhouse', icon: Fence },
      { id: 'mini_farm', labelKey: 'onboarding.scale_mini_farm', icon: Leaf },
      { id: 'large_farm', labelKey: 'onboarding.scale_large_farm', icon: Leaf },
    ],
  },
  {
    key: 'crops',
    titleKey: 'onboarding.crops_title',
    subtitleKey: 'onboarding.pick_all',
    options: [
      { id: 'leafy', labelKey: 'onboarding.crops_leafy', icon: Leaf },
      { id: 'fruiting', labelKey: 'onboarding.crops_fruiting', icon: Sprout },
      { id: 'root', labelKey: 'onboarding.crops_root', icon: Leaf },
      { id: 'fruit_trees', labelKey: 'onboarding.crops_fruit_trees', icon: Trees },
      { id: 'herbs', labelKey: 'onboarding.crops_herbs', icon: Leaf },
      { id: 'perennial', labelKey: 'onboarding.crops_perennial', icon: Sprout },
      { id: 'fast_cycle', labelKey: 'onboarding.crops_fast_cycle', icon: Clock },
    ],
  },
  {
    key: 'experience',
    titleKey: 'onboarding.experience_title',
    subtitleKey: 'onboarding.experience_subtitle',
    single: true,
    options: [
      {
        id: 'new',
        labelKey: 'onboarding.experience_new',
        descriptionKey: 'onboarding.experience_new_desc',
      },
      {
        id: 'intermediate',
        labelKey: 'onboarding.experience_intermediate',
        descriptionKey: 'onboarding.experience_intermediate_desc',
      },
      {
        id: 'experienced',
        labelKey: 'onboarding.experience_experienced',
        descriptionKey: 'onboarding.experience_experienced_desc',
      },
    ],
  },
  {
    key: 'needs',
    titleKey: 'onboarding.needs_title',
    subtitleKey: 'onboarding.pick_all',
    options: [
      { id: 'health', labelKey: 'onboarding.needs_health', icon: Bug },
      { id: 'irrigation', labelKey: 'onboarding.needs_irrigation', icon: Droplets },
      { id: 'calendar', labelKey: 'onboarding.needs_calendar', icon: Calendar },
      { id: 'records', labelKey: 'onboarding.needs_records', icon: BookOpen },
      { id: 'sales', labelKey: 'onboarding.needs_sales', icon: Crown },
      { id: 'seeds', labelKey: 'onboarding.needs_seeds', icon: Sprout },
    ],
  },
];

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
          <Text style={{ fontSize: 13, fontWeight: '800', color: theme.textMuted, textAlign: 'center', paddingVertical: 12, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            {t('profile.language_label')}
          </Text>
          {LANGUAGES.map((lang) => {
            const isActive = lang.code === current;
            return (
              <TouchableOpacity
                key={lang.code}
                onPress={() => { onSelect(lang.code); onClose(); }}
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
                <Text style={{ flex: 1, fontSize: 16, fontWeight: isActive ? '700' : '500', color: isActive ? theme.primary : theme.text }}>
                  {lang.label}
                </Text>
                {isActive && <Check size={18} color={theme.primary} />}
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
  const [answers, setAnswers] = useState<Record<string, string[]>>({
    goals: [],
    scaleEnvironment: [],
    crops: [],
    experience: [],
    needs: [],
  });

  const step = STEP_DATA[stepIndex] as any;
  const selections = answers[step.key] ?? [];

  const canContinue = useMemo(() => selections.length > 0, [selections.length]);

  const toggleOption = (id: string) => {
    setAnswers((prev) => {
      const current = prev[step.key] ?? [];
      if (step.single) {
        return { ...prev, [step.key]: [id] };
      }
      const isActive = current.includes(id);
      const next = isActive ? current.filter((item) => item !== id) : [...current, id];
      return { ...prev, [step.key]: next };
    });
  };

  const persistOnboarding = async () => {
    const payload = {
      goals: answers.goals,
      scaleEnvironment: answers.scaleEnvironment,
      crops: answers.crops,
      experience: answers.experience[0] ?? 'unknown',
      needs: answers.needs,
      completedAt: Date.now(),
    };

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
    if (stepIndex < STEP_DATA.length - 1) {
      setStepIndex(stepIndex + 1);
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
    setStepIndex(stepIndex - 1);
  };

  const renderMultiOptions = () => (
    <View style={{ gap: 12 }}>
      {step.options.map((option: any) => {
        const isActive = selections.includes(option.id);
        const Icon = option.icon;
        return (
          <Pressable
            key={option.id}
            onPress={() => toggleOption(option.id)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderRadius: 18,
              backgroundColor: isActive ? theme.successBg : theme.accent,
              borderWidth: 1,
              borderColor: isActive ? theme.primary : theme.border,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.accent,
                }}
              >
                <Icon size={18} color={theme.primary} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text, flex: 1 }}>{t(option.labelKey)}</Text>
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
  );

  const renderExperienceOptions = () => (
    <View style={{ gap: 12 }}>
      {step.options.map((option: any) => {
        const isActive = selections.includes(option.id);
        return (
          <Pressable
            key={option.id}
            onPress={() => toggleOption(option.id)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              gap: 14,
              padding: 14,
              borderRadius: 18,
              backgroundColor: isActive ? '#dbe5cc' : '#e4ead9',
              borderWidth: 1,
              borderColor: isActive ? '#b5c7a1' : '#d4dcc6',
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 14,
                backgroundColor: isActive ? theme.successBg : theme.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sprout size={30} color={theme.primary} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>{t(option.labelKey)}</Text>
              <Text style={{ fontSize: 13, color: theme.textSecondary }}>{option.descriptionKey ? t(option.descriptionKey) : ''}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ paddingTop: 56, paddingHorizontal: 18, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
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
          <Text style={{ fontSize: 14 }}>{LANGUAGES.find((lang) => lang.code === currentLocale)?.flag ?? '🌐'}</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>{LANGUAGES.find((lang) => lang.code === currentLocale)?.label ?? t('profile.language_label')}</Text>
          <Globe size={14} color={theme.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 140, gap: 18 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: theme.text }}>{t(step.titleKey)}</Text>
          <Text style={{ fontSize: 15, color: theme.textSecondary }}>{t(step.subtitleKey)}</Text>
        </View>

        {step.key === 'experience' ? renderExperienceOptions() : renderMultiOptions()}
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 24, paddingHorizontal: 22, flexDirection: 'row', gap: 12 }}>
        <TouchableOpacity
          onPress={handleSkip}
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
          style={{
            flex: 1,
            paddingVertical: 16,
            borderRadius: 22,
            alignItems: 'center',
            backgroundColor: canContinue ? theme.primary : theme.accent,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: canContinue ? '#ffffff' : theme.textMuted }}>{t('onboarding.next')}</Text>
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
