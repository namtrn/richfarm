import { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { UserRound, Globe, Clock, Save, Ruler } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';
import { useUserSettings } from '../../hooks/useUserSettings';
import { resolveUnitSystem, UnitSystem } from '../../lib/units';
import { getLocales } from 'expo-localization';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
  { code: 'zh', label: '中文' },
];

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const { user, updateProfile, isLoading } = useAuth();
  const { settings, updateSettings, isLoading: isSettingsLoading } = useUserSettings();

  const currentLang = i18n.language;
  const [name, setName] = useState(user?.name ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? '');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(
    resolveUnitSystem(settings?.unitSystem, currentLang, getLocales()[0]?.regionCode)
  );
  const [saving, setSaving] = useState(false);

  const email = user?.email ?? '—';
  const isAnonymous = user?.isAnonymous ?? false;

  const selectedLangLabel = useMemo(
    () => LANGUAGES.find((l) => l.code === currentLang)?.label ?? currentLang,
    [currentLang]
  );

  useEffect(() => {
    setName(user?.name ?? '');
    setTimezone(user?.timezone ?? '');
  }, [user?.name, user?.timezone]);

  useEffect(() => {
    setUnitSystem(resolveUnitSystem(settings?.unitSystem, currentLang, getLocales()[0]?.regionCode));
  }, [settings?.unitSystem, currentLang]);

  const handleLanguageChange = async (code: string) => {
    if (code === currentLang) return;
    i18n.changeLanguage(code);
    await updateProfile({ locale: code });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        name: name.trim() || undefined,
        locale: currentLang,
        timezone: timezone.trim() || undefined,
      });
      await updateSettings({ unitSystem });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-gray-50 dark:bg-gray-950">
      <View className="p-4 gap-y-6">
        <View className="flex-row items-center gap-x-3">
          <View className="w-12 h-12 bg-green-100 rounded-full items-center justify-center">
            <UserRound size={22} color="#16a34a" />
          </View>
          <View>
            <Text className="text-2xl font-bold text-gray-900 dark:text-white">{t('profile.title')}</Text>
            <Text className="text-xs text-gray-400">{isAnonymous ? t('profile.anonymous') : t('profile.signed_in')}</Text>
          </View>
        </View>

        <View className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 gap-y-3">
          <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('profile.user_section')}</Text>
          <Text className="text-xs text-gray-400">{t('profile.email_label')}</Text>
          <Text className="text-sm text-gray-700 dark:text-gray-200">{email}</Text>

          <Text className="text-xs text-gray-400 mt-2">{t('profile.name_label')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('profile.name_placeholder')}
            placeholderTextColor="#9ca3af"
            className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white"
          />
        </View>

        <View className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 gap-y-3">
          <View className="flex-row items-center gap-x-2">
            <Globe size={16} color="#6b7280" />
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('profile.language_label')}</Text>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {LANGUAGES.map((lang) => {
              const active = lang.code === currentLang;
              return (
                <TouchableOpacity
                  key={lang.code}
                  onPress={() => handleLanguageChange(lang.code)}
                  className={`px-3 py-2 rounded-full border ${active ? 'bg-green-500 border-green-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
                >
                  <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-700 dark:text-gray-200'}`}>
                    {lang.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text className="text-xs text-gray-400">{t('profile.current_language', { label: selectedLangLabel })}</Text>
        </View>

        <View className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 gap-y-3">
          <View className="flex-row items-center gap-x-2">
            <Clock size={16} color="#6b7280" />
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('profile.timezone_label')}</Text>
          </View>
          <TextInput
            value={timezone}
            onChangeText={setTimezone}
            placeholder={t('profile.timezone_placeholder')}
            placeholderTextColor="#9ca3af"
            className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white"
          />
        </View>

        <View className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 gap-y-3">
          <View className="flex-row items-center gap-x-2">
            <Ruler size={16} color="#6b7280" />
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('profile.units_label')}</Text>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {(['metric', 'imperial'] as UnitSystem[]).map((unit) => {
              const active = unit === unitSystem;
              return (
                <TouchableOpacity
                  key={unit}
                  onPress={() => setUnitSystem(unit)}
                  className={`px-3 py-2 rounded-full border ${active ? 'bg-green-500 border-green-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
                >
                  <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-700 dark:text-gray-200'}`}>
                    {unit === 'metric' ? t('profile.unit_metric') : t('profile.unit_imperial')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text className="text-xs text-gray-400">{t('profile.unit_current', { label: unitSystem === 'metric' ? t('profile.unit_metric') : t('profile.unit_imperial') })}</Text>
        </View>

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || isLoading || isSettingsLoading}
          className={`bg-gray-900 rounded-xl py-4 items-center ${saving || isLoading || isSettingsLoading ? 'opacity-50' : ''}`}
        >
          <View className="flex-row items-center gap-x-2">
            <Save size={16} color="white" />
            <Text className="text-white font-semibold">{t('profile.save_settings')}</Text>
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
