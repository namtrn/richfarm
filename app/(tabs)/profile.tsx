import { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { UserRound, Globe, Clock, Save, Ruler, ChevronDown, ChevronUp, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';
import { loadSyncQueue } from '../../lib/sync/queue';
import { useSyncExecutor } from '../../lib/sync/useSyncExecutor';
import { useUserSettings } from '../../hooks/useUserSettings';
import { resolveUnitSystem, UnitSystem } from '../../lib/units';
import { getLocales } from 'expo-localization';
import { authClient } from '../../lib/auth-client';

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
  const { execute: executeSyncNow } = useSyncExecutor();
  const { settings, updateSettings, isLoading: isSettingsLoading } = useUserSettings();

  const currentLang = i18n.language;
  const [name, setName] = useState(user?.name ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? '');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(
    resolveUnitSystem(settings?.unitSystem ?? undefined, currentLang, getLocales()[0]?.regionCode ?? undefined)
  );
  const [saving, setSaving] = useState(false);
  const [syncCount, setSyncCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authPanelOpen, setAuthPanelOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp' | 'forgot'>('signIn');

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

  const refreshSyncCount = useCallback(async () => {
    const queue = await loadSyncQueue();
    setSyncCount(queue.length);
  }, []);

  useEffect(() => {
    refreshSyncCount();
  }, [refreshSyncCount]);

  useEffect(() => {
    setUnitSystem(resolveUnitSystem(settings?.unitSystem ?? undefined, currentLang, getLocales()[0]?.regionCode ?? undefined));
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

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await executeSyncNow();
      if (result.queuedCount === 0 && result.syncedCount === 0) {
        setSyncMessage(t('profile.sync_empty'));
      } else if (result.ok) {
        setSyncMessage(t('profile.sync_success'));
      } else {
        setSyncMessage(
          t('profile.sync_not_ready', { count: result.queuedCount })
        );
      }
      await refreshSyncCount();
    } finally {
      setSyncing(false);
    }
  };

  const handleSignUp = async () => {
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const result = await authClient.signUp.email({
        email: authEmail.trim(),
        password: authPassword,
        name: name.trim() || undefined,
      });
      if (result.error) {
        setAuthMessage(result.error.message ?? 'Sign up failed');
        return;
      }
      await updateProfile({ name: name.trim() || undefined });
      setAuthMessage('Account created and signed in.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignIn = async () => {
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const result = await authClient.signIn.email({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (result.error) {
        setAuthMessage(result.error.message ?? 'Sign in failed');
        return;
      }
      setAuthMessage('Signed in successfully.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const client = authClient as any;
      if (!client?.signIn?.social) {
        setAuthMessage('Google sign in is not available in current auth client config.');
        return;
      }
      const result = await client.signIn.social({
        provider: 'google',
        callbackURL: 'my-garden://',
      });
      if (result?.error) {
        setAuthMessage(result.error.message ?? 'Google sign in failed');
        return;
      }
      setAuthMessage('Google sign in started.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const client = authClient as any;
      const fn = client?.forgetPassword ?? client?.requestPasswordReset;
      if (!fn) {
        setAuthMessage('Forgot password is not available in current auth client config.');
        return;
      }
      const result = await fn({
        email: authEmail.trim(),
        redirectTo: 'my-garden://',
      });
      if (result?.error) {
        setAuthMessage(result.error.message ?? 'Forgot password request failed');
        return;
      }
      setAuthMessage('Password reset email sent (if email exists).');
      setAuthMode('signIn');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setAuthMessage(result.error.message ?? 'Sign out failed');
        return;
      }
      setAuthMessage('Signed out.');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-gray-50 dark:bg-gray-900" contentContainerStyle={{ padding: 16, paddingTop: 56, gap: 16, paddingBottom: 40 }}>
      <View>
        <Text className="text-2xl font-extrabold text-gray-900 dark:text-white">{t('profile.title')}</Text>
        <Text className="text-xs text-gray-400">{isAnonymous ? t('profile.anonymous') : t('profile.signed_in')}</Text>
      </View>

      <View className="gap-y-4">
        <View className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 gap-y-3">
          <View className="flex-row items-center gap-x-2">
            <UserRound size={16} color="#6b7280" />
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('profile.user_section')}</Text>
          </View>
          <Text className="text-xs text-gray-400">{t('profile.email_label')}: {email}</Text>
          <Text className="text-xs text-gray-500 font-semibold">{t('profile.name_label')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('profile.name_placeholder')}
            placeholderTextColor="#9ca3af"
            className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white"
          />
          {isAnonymous ? (
            <View className="gap-y-2 pt-2">
              <Text className="text-xs text-gray-500">Create account to sync across devices</Text>
              {!authPanelOpen ? (
                <TouchableOpacity
                  onPress={() => {
                    setAuthPanelOpen(true);
                    setAuthMode('signIn');
                    setAuthMessage(null);
                  }}
                  className="bg-gray-900 rounded-xl py-3 items-center"
                >
                  <Text className="text-white font-semibold">Open auth</Text>
                </TouchableOpacity>
              ) : (
                <View className="gap-y-2">
                  <View className="flex-row gap-x-2">
                    <TouchableOpacity
                      onPress={() => {
                        if (authMode === 'forgot') setAuthMode('signIn');
                        else setAuthPanelOpen(false);
                      }}
                      className="flex-1 bg-gray-200 rounded-xl py-2 items-center"
                    >
                      <Text className="text-gray-700 font-semibold">Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setAuthPanelOpen(false)}
                      className="flex-1 bg-gray-200 rounded-xl py-2 items-center"
                    >
                      <Text className="text-gray-700 font-semibold">Close</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    value={authEmail}
                    onChangeText={setAuthEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="Email"
                    placeholderTextColor="#9ca3af"
                    className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white"
                  />
                  {authMode !== 'forgot' && (
                    <TextInput
                      value={authPassword}
                      onChangeText={setAuthPassword}
                      autoCapitalize="none"
                      secureTextEntry
                      placeholder="Password (min 8 chars)"
                      placeholderTextColor="#9ca3af"
                      className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white"
                    />
                  )}
                  {authMessage && <Text className="text-xs text-gray-500">{authMessage}</Text>}
                  <TouchableOpacity
                    onPress={handleGoogleSignIn}
                    disabled={authLoading}
                    className={`bg-white border border-gray-300 rounded-xl py-3 items-center ${authLoading ? 'opacity-50' : ''}`}
                  >
                    <Text className="text-gray-900 font-semibold">Continue with Google</Text>
                  </TouchableOpacity>
                  {authMode === 'forgot' ? (
                    <TouchableOpacity
                      onPress={handleForgotPassword}
                      disabled={authLoading || !authEmail.trim()}
                      className={`bg-gray-900 rounded-xl py-3 items-center ${authLoading || !authEmail.trim() ? 'opacity-50' : ''}`}
                    >
                      <Text className="text-white font-semibold">Send reset link</Text>
                    </TouchableOpacity>
                  ) : (
                    <View className="flex-row gap-x-2">
                      <TouchableOpacity
                        onPress={handleSignUp}
                        disabled={authLoading || !authEmail.trim() || authPassword.length < 8}
                        className={`flex-1 bg-green-600 rounded-xl py-3 items-center ${authLoading || !authEmail.trim() || authPassword.length < 8 ? 'opacity-50' : ''}`}
                      >
                        <Text className="text-white font-semibold">Sign up</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleSignIn}
                        disabled={authLoading || !authEmail.trim() || authPassword.length < 8}
                        className={`flex-1 bg-gray-900 rounded-xl py-3 items-center ${authLoading || !authEmail.trim() || authPassword.length < 8 ? 'opacity-50' : ''}`}
                      >
                        <Text className="text-white font-semibold">Sign in</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {authMode !== 'forgot' && (
                    <TouchableOpacity
                      onPress={() => setAuthMode('forgot')}
                      disabled={authLoading}
                      className="py-2 items-center"
                    >
                      <Text className="text-xs text-gray-500">Forgot password?</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          ) : (
            <View className="pt-2">
              {authMessage && <Text className="text-xs text-gray-500 mb-2">{authMessage}</Text>}
              <TouchableOpacity
                onPress={handleSignOut}
                disabled={authLoading}
                className={`bg-gray-200 rounded-xl py-3 items-center ${authLoading ? 'opacity-50' : ''}`}
              >
                <Text className="text-gray-800 font-semibold">Sign out</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 gap-y-3">
          <View className="flex-row items-center gap-x-2">
            <Globe size={16} color="#6b7280" />
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('profile.language_label')}</Text>
          </View>
          <Text className="text-xs text-gray-400">{t('profile.current_language', { label: selectedLangLabel })}</Text>
          <View>
            <TouchableOpacity
              onPress={() => setLanguageMenuOpen((v) => !v)}
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 flex-row items-center justify-between"
            >
              <Text className="text-sm text-gray-900 dark:text-white font-medium">{selectedLangLabel}</Text>
              {languageMenuOpen ? <ChevronUp size={16} color="#6b7280" /> : <ChevronDown size={16} color="#6b7280" />}
            </TouchableOpacity>
            {languageMenuOpen && (
              <View className="mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                {LANGUAGES.map((lang, index) => {
                  const active = lang.code === currentLang;
                  return (
                    <TouchableOpacity
                      key={lang.code}
                      onPress={async () => {
                        setLanguageMenuOpen(false);
                        await handleLanguageChange(lang.code);
                      }}
                      className="px-4 py-3 flex-row items-center justify-between border-gray-100 dark:border-gray-700"
                      style={{ borderBottomWidth: index === LANGUAGES.length - 1 ? 0 : 1 }}
                    >
                      <Text className={`text-sm ${active ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-700 dark:text-gray-200'}`}>
                        {lang.label}
                      </Text>
                      {active && <Check size={14} color="#16a34a" />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
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

        <View className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 gap-y-3">
          <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('profile.sync_title')}</Text>
          <Text className="text-xs text-gray-400">{t('profile.sync_subtitle')}</Text>
          <Text className="text-xs text-gray-500">
            {t('profile.sync_queue_count', { count: syncCount })}
          </Text>
          {syncMessage && (
            <Text className="text-xs text-gray-500">{syncMessage}</Text>
          )}
          <TouchableOpacity
            onPress={handleSyncNow}
            disabled={syncing}
            testID="e2e-profile-sync-now"
            className={`bg-green-500 rounded-xl py-3 items-center ${syncing ? 'opacity-50' : ''}`}
          >
            <Text className="text-white font-semibold">{t('profile.sync_button')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || isLoading || isSettingsLoading}
          testID="e2e-profile-save-settings"
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
