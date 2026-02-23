import { View, Text, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Leaf, ArrowRight, Globe, Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../lib/theme';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
];

const FEATURES: Record<string, string[]> = {
  en: ['🌱 Track your plants', '💧 Watering reminders', '📅 Smart planting calendar'],
  vi: ['🌱 Theo dõi cây trồng', '💧 Nhắc nhở tưới cây', '📅 Lịch trồng cây thông minh'],
  es: ['🌱 Rastrea tus plantas', '💧 Recordatorios de riego', '📅 Calendario inteligente'],
  pt: ['🌱 Rastreie suas plantas', '💧 Lembretes de rega', '📅 Calendário inteligente'],
  fr: ['🌱 Suivez vos plantes', '💧 Rappels d\'arrosage', '📅 Calendrier intelligent'],
  zh: ['🌱 追踪您的植物', '💧 浇水提醒', '📅 智能种植日历'],
};

const CTA: Record<string, string> = {
  en: 'Get Started', vi: 'Bắt đầu', es: 'Comenzar',
  pt: 'Começar', fr: 'Commencer', zh: '开始',
};

const SUBTITLE: Record<string, string> = {
  en: 'Manage your garden\nthe smart way',
  vi: 'Chăm sóc vườn cây của bạn\nmột cách thông minh',
  es: 'Gestiona tu jardín\nde forma inteligente',
  pt: 'Gerencie seu jardim\nde forma inteligente',
  fr: 'Gérez votre jardin\nde façon intelligente',
  zh: '智能管理\n您的花园',
};

// ─── Language Picker Modal ────────────────────────────────────────────────────
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
            Language
          </Text>
          {LANGUAGES.map((lang) => {
            const isActive = lang.code === current;
            return (
              <TouchableOpacity
                key={lang.code}
                onPress={() => { onSelect(lang.code); onClose(); }}
                testID={`e2e-onboarding-language-${lang.code}`}
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

// ─── Welcome Screen ───────────────────────────────────────────────────────────
export default function WelcomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { i18n } = useTranslation();
  const [showPicker, setShowPicker] = useState(false);

  const lang = i18n.language;
  const currentLang = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
  const features = FEATURES[lang] ?? FEATURES.en;

  const handleSelectLang = (code: string) => {
    i18n.changeLanguage(code);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>

      {/* Language badge — top right */}
      <TouchableOpacity
        onPress={() => setShowPicker(true)}
        testID="e2e-onboarding-language-button"
        style={{
          position: 'absolute',
          top: 64,
          right: 20,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: theme.card,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 20,
          paddingHorizontal: 14,
          paddingVertical: 8,
          shadowColor: '#000',
          shadowOpacity: 0.05,
          shadowRadius: 10,
        }}
      >
        <Text style={{ fontSize: 16 }}>{currentLang.flag}</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{currentLang.label}</Text>
        <Globe size={14} color={theme.textMuted} />
      </TouchableOpacity>

      {/* Logo */}
      <View style={{ alignItems: 'center', gap: 20, marginBottom: 48 }}>
        <View style={{
          width: 120,
          height: 120,
          backgroundColor: theme.primary,
          borderRadius: 40,
          justifyContent: 'center',
          alignItems: 'center',
          shadowColor: theme.primary,
          shadowOpacity: 0.35,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 }
        }}>
          <Leaf size={64} color="white" />
        </View>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 48, fontWeight: '900', color: theme.text, letterSpacing: -1.5 }}>Richfarm</Text>
          <Text style={{ fontSize: 17, color: theme.textSecondary, textAlign: 'center', lineHeight: 26, fontWeight: '500' }}>
            {SUBTITLE[lang] ?? SUBTITLE.en}
          </Text>
        </View>
      </View>

      {/* Features */}
      <View style={{ gap: 12, width: '100%', maxWidth: 340, marginBottom: 48 }}>
        {features.map((f, i) => (
          <View
            key={i}
            style={{
              backgroundColor: theme.card,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 20,
              paddingHorizontal: 20,
              paddingVertical: 16,
              shadowColor: '#000',
              shadowOpacity: 0.03,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 }
            }}
          >
            <Text style={{ fontSize: 15, color: theme.text, fontWeight: '700', letterSpacing: -0.2 }}>{f}</Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      <TouchableOpacity
        onPress={() => router.replace('/(tabs)/home')}
        testID="e2e-onboarding-start-button"
        style={{
          backgroundColor: theme.primary,
          borderRadius: 20,
          paddingVertical: 18,
          width: '100%',
          maxWidth: 340,
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 10,
          shadowColor: theme.primary,
          shadowOpacity: 0.3,
          shadowRadius: 15,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18, letterSpacing: 0.3 }}>
          {CTA[lang] ?? CTA.en}
        </Text>
        <ArrowRight size={22} color="white" strokeWidth={2.5} />
      </TouchableOpacity>

      <LanguagePicker
        visible={showPicker}
        current={lang}
        onSelect={handleSelectLang}
        onClose={() => setShowPicker(false)}
      />
    </View>
  );
}
