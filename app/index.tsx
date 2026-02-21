import { View, Text, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Leaf, ArrowRight, Globe, Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}
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
            backgroundColor: '#fff',
            borderRadius: 24,
            paddingVertical: 8,
            width: 260,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 8 },
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#9ca3af', textAlign: 'center', paddingVertical: 12, letterSpacing: 0.5 }}>
            LANGUAGE
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
                  backgroundColor: isActive ? '#f0fdf4' : 'transparent',
                  gap: 12,
                }}
              >
                <Text style={{ fontSize: 22 }}>{lang.flag}</Text>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: isActive ? '700' : '400', color: isActive ? '#15803d' : '#374151' }}>
                  {lang.label}
                </Text>
                {isActive && <Check size={18} color="#22c55e" />}
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
  const { i18n } = useTranslation();
  const [showPicker, setShowPicker] = useState(false);

  const lang = i18n.language;
  const currentLang = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
  const features = FEATURES[lang] ?? FEATURES.en;

  const handleSelectLang = (code: string) => {
    i18n.changeLanguage(code);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>

      {/* Language badge — top right */}
      <TouchableOpacity
        onPress={() => setShowPicker(true)}
        testID="e2e-onboarding-language-button"
        style={{
          position: 'absolute',
          top: 56,
          right: 20,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: '#f9fafb',
          borderWidth: 1,
          borderColor: '#e5e7eb',
          borderRadius: 20,
          paddingHorizontal: 12,
          paddingVertical: 7,
        }}
      >
        <Text style={{ fontSize: 16 }}>{currentLang.flag}</Text>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>{currentLang.label}</Text>
        <Globe size={13} color="#9ca3af" />
      </TouchableOpacity>

      {/* Logo */}
      <View style={{ alignItems: 'center', gap: 16, marginBottom: 40 }}>
        <View style={{ width: 110, height: 110, backgroundColor: '#22c55e', borderRadius: 55, justifyContent: 'center', alignItems: 'center', shadowColor: '#22c55e', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } }}>
          <Leaf size={56} color="white" />
        </View>
        <Text style={{ fontSize: 40, fontWeight: '800', color: '#14532d', letterSpacing: -1 }}>Richfarm</Text>
        <Text style={{ fontSize: 16, color: '#6b7280', textAlign: 'center', lineHeight: 24 }}>
          {SUBTITLE[lang] ?? SUBTITLE.en}
        </Text>
      </View>

      {/* Features */}
      <View style={{ gap: 10, width: '100%', maxWidth: 320, marginBottom: 40 }}>
        {features.map((f, i) => (
          <View
            key={i}
            style={{
              backgroundColor: '#f9fafb',
              borderWidth: 1,
              borderColor: '#f3f4f6',
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            <Text style={{ fontSize: 14, color: '#374151', fontWeight: '500' }}>{f}</Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      <TouchableOpacity
        onPress={() => router.replace('/(tabs)/growing')}
        testID="e2e-onboarding-start-button"
        style={{
          backgroundColor: '#22c55e',
          borderRadius: 18,
          paddingVertical: 16,
          width: '100%',
          maxWidth: 320,
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 8,
          shadowColor: '#22c55e',
          shadowOpacity: 0.3,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>
          {CTA[lang] ?? CTA.en}
        </Text>
        <ArrowRight size={20} color="white" />
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
