import { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { UserRound, Globe, Clock, Save, Ruler, ChevronDown, ChevronUp, Check, Sun, Moon, Monitor, Crown, Eye, EyeOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../../lib/auth';
import { loadSyncQueue } from '../../lib/sync/queue';
import { useSyncExecutor } from '../../lib/sync/useSyncExecutor';
import { useUserSettings } from '../../hooks/useUserSettings';
import { useSubscription } from '../../hooks/useSubscription';
import { usePaywall } from '../../hooks/usePaywall';
import { resolveUnitSystem, UnitSystem } from '../../lib/units';
import { getLocales } from 'expo-localization';
import { authClient, APP_SCHEME } from '../../lib/auth-client';
import { useTheme } from '../../lib/theme';
import { getCachedUnitSystemPreference, hydrateUnitSystemPreference, setUnitSystemPreference } from '../../lib/unitPreference';

/**
 * Feature flags — flip to true once the backend is configured.
 * Google OAuth: requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET on the server.
 * Reset password: requires emailAndPassword.sendResetPassword in Better Auth config.
 */
const GOOGLE_OAUTH_ENABLED = false;
const RESET_PASSWORD_ENABLED = false;
const CLOUD_BACKUP_PROVIDER = process.env.EXPO_PUBLIC_CLOUD_BACKUP_PROVIDER;

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
  const theme = useTheme();
  const { user, updateProfile, isLoading, deviceId } = useAuth();
  const { execute: executeSyncNow } = useSyncExecutor();
  const { settings, updateSettings, isLoading: isSettingsLoading } = useUserSettings();
  const { isPremium, isConfigured: isSubConfigured, isLoading: isSubLoading, restorePurchases } = useSubscription();
  const { presentPaywall, isPresenting } = usePaywall();
  const deleteAccountMutation = useMutation((api as any).users.deleteAccount);

  const currentLang = (i18n.language ?? 'en').split('-')[0].toLowerCase();
  const [name, setName] = useState(user?.name ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? '');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(
    resolveUnitSystem(getCachedUnitSystemPreference() ?? settings?.unitSystem ?? undefined, currentLang, getLocales()[0]?.regionCode ?? undefined)
  );
  const [themePreference, setThemePreference] = useState<string>(settings?.theme ?? 'system');
  const [saving, setSaving] = useState(false);
  const [backupCount, setBackupCount] = useState(0);
  const [backingUp, setBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const isCloudBackupLinked = !!CLOUD_BACKUP_PROVIDER;
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authPanelOpen, setAuthPanelOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp' | 'forgot'>('signIn');
  const [showPassword, setShowPassword] = useState(false);
  const [paywallMessage, setPaywallMessage] = useState<string | null>(null);

  const email = user?.email ?? '—';
  const isAnonymous = user?.isAnonymous ?? false;
  const trimmedAuthEmail = authEmail.trim();
  const authPasswordOk = authPassword.length >= 8;
  const authEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedAuthEmail);

  const selectedLangLabel = useMemo(
    () => LANGUAGES.find((l) => l.code === currentLang)?.label ?? currentLang,
    [currentLang]
  );

  useEffect(() => {
    setName(user?.name ?? '');
    setTimezone(user?.timezone ?? '');
  }, [user?.name, user?.timezone]);

  const refreshBackupCount = useCallback(async () => {
    const queue = await loadSyncQueue();
    setBackupCount(queue.filter((item) => item.type === 'photo').length);
  }, []);

  useEffect(() => {
    refreshBackupCount();
  }, [refreshBackupCount]);

  useEffect(() => {
    setUnitSystem(resolveUnitSystem(getCachedUnitSystemPreference() ?? settings?.unitSystem ?? undefined, currentLang, getLocales()[0]?.regionCode ?? undefined));
    setThemePreference(settings?.theme ?? 'system');
  }, [settings?.unitSystem, settings?.theme, currentLang]);

  useEffect(() => {
    void hydrateUnitSystemPreference().then((cached) => {
      if (!cached) return;
      setUnitSystem(resolveUnitSystem(cached, currentLang, getLocales()[0]?.regionCode ?? undefined));
    });
  }, [currentLang]);

  useEffect(() => {
    if (authMode === 'forgot') {
      setShowPassword(false);
    }
  }, [authMode]);

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
      await setUnitSystemPreference(unitSystem);
      await updateSettings({ unitSystem, theme: themePreference });
    } finally {
      setSaving(false);
    }
  };

  const handleBackupNow = async () => {
    if (!isCloudBackupLinked) {
      setBackupMessage(t('profile.backup_link_required'));
      return;
    }
    setBackingUp(true);
    setBackupMessage(null);
    try {
      const result = await executeSyncNow({ types: ['photo'] });
      if (result.queuedCount === 0 && result.syncedCount === 0) {
        setBackupMessage(t('profile.backup_empty'));
      } else if (result.ok) {
        setBackupMessage(t('profile.backup_success'));
      } else {
        setBackupMessage(
          t('profile.backup_not_ready', { count: result.queuedCount })
        );
      }
      await refreshBackupCount();
    } finally {
      setBackingUp(false);
    }
  };

  const handleLinkCloudBackup = () => {
    setBackupMessage(t('profile.backup_link_required'));
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
        setAuthMessage(result.error.message ?? t('profile.auth_sign_up_failed'));
        return;
      }
      await updateProfile({ name: name.trim() || undefined });
      setAuthMessage(t('profile.auth_account_created'));
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
        setAuthMessage(result.error.message ?? t('profile.auth_sign_in_failed'));
        return;
      }
      setAuthMessage(t('profile.auth_signed_in'));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!GOOGLE_OAUTH_ENABLED) {
      setAuthMessage(t('profile.auth_google_not_configured'));
      return;
    }
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const result = await (authClient.signIn as any).social({
        provider: 'google',
        callbackURL: `${APP_SCHEME}://`,
      });
      if (result?.error) {
        setAuthMessage(result.error.message ?? t('profile.auth_google_failed'));
        return;
      }
      setAuthMessage(t('profile.auth_google_started'));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!RESET_PASSWORD_ENABLED) {
      setAuthMessage(t('profile.auth_reset_not_configured'));
      return;
    }
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      // Better Auth generates this method dynamically when sendResetPassword is configured.
      // Use a narrow type assertion since emailAndPassword isn't yet enabled server-side.
      type RequestResetFn = (opts: { email: string; redirectTo: string }) => Promise<{ error?: { message?: string } }>;
      const requestReset = (authClient as unknown as { requestPasswordReset: RequestResetFn }).requestPasswordReset;
      if (!requestReset) {
        setAuthMessage(t('profile.auth_reset_unavailable'));
        return;
      }
      const result = await requestReset({
        email: authEmail.trim(),
        redirectTo: `${APP_SCHEME}://`,
      });
      if (result?.error) {
        setAuthMessage(result.error.message ?? t('profile.auth_forgot_failed'));
        return;
      }
      setAuthMessage(t('profile.auth_reset_sent'));
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
        setAuthMessage(result.error.message ?? t('profile.auth_sign_out_failed'));
        return;
      }
      setAuthMessage(t('profile.auth_signed_out'));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('profile.delete_account_title'),
      t('profile.delete_account_desc'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setAuthLoading(true);
            setAuthMessage(null);
            try {
              await deleteAccountMutation({ deviceId });
              await authClient.signOut();
              setAuthMessage(t('profile.account_deleted'));
            } catch (error) {
              const message =
                error instanceof Error ? error.message : t('profile.delete_account_failed');
              setAuthMessage(message);
            } finally {
              setAuthLoading(false);
            }
          },
        },
      ]
    );
  };

  const handlePaywall = async () => {
    setPaywallMessage(null);
    const result = await presentPaywall();
    if (result.status === 'purchased' || result.status === 'restored') {
      setPaywallMessage(t('profile.sub_active'));
      return;
    }
    if (result.status === 'cancelled') {
      setPaywallMessage(t('profile.sub_cancelled'));
      return;
    }
    if (result.status === 'not_presented') {
      setPaywallMessage(t('profile.sub_paywall_unavailable'));
      return;
    }
    if (result.status === 'error') {
      setPaywallMessage(result.errorMessage ?? t('profile.sub_paywall_error'));
    }
  };

  const handleRestorePurchases = async () => {
    setPaywallMessage(null);
    try {
      await restorePurchases();
      setPaywallMessage(t('profile.sub_restored'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('profile.sub_restore_failed');
      setPaywallMessage(message);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 16 }}
    >
      <View style={{ gap: 16 }}>
        <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 16, gap: 14, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
              <UserRound size={18} color={theme.textSecondary} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('profile.user_section')}</Text>
          </View>

          <View style={{ gap: 10 }}>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>
                {t('profile.name_label')}
              </Text>
              <Text style={{ fontSize: 15, color: theme.text }}>{name || '—'}</Text>
            </View>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>
                {t('profile.email_label')}
              </Text>
              <Text style={{ fontSize: 14, color: theme.textMuted }}>{email}</Text>
            </View>
          </View>

          {isAnonymous ? (
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 13, color: theme.textSecondary, fontStyle: 'italic' }}>{t('profile.auth_create_to_sync')}</Text>
              {!authPanelOpen ? (
                <TouchableOpacity
                  onPress={() => {
                    setAuthPanelOpen(true);
                    setAuthMode('signIn');
                    setAuthMessage(null);
                    setShowPassword(false);
                  }}
                  style={{ backgroundColor: theme.text, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
                >
                  <Text style={{ color: theme.card, fontWeight: '700', fontSize: 14 }}>{t('profile.auth_sign_in_or_create')}</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ gap: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>
                      {t('profile.auth_account')}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setAuthPanelOpen(false);
                        setAuthMode('signIn');
                        setShowPassword(false);
                      }}
                      style={{ backgroundColor: theme.accent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}
                    >
                      <Text style={{ fontWeight: '700', color: theme.textSecondary, fontSize: 12 }}>{t('profile.auth_close')}</Text>
                    </TouchableOpacity>
                  </View>
                  {authMode !== 'forgot' ? (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => setAuthMode('signIn')}
                        style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: authMode === 'signIn' ? theme.primary : theme.border, backgroundColor: authMode === 'signIn' ? theme.primary : theme.background }}
                      >
                        <Text style={{ fontWeight: '700', color: authMode === 'signIn' ? '#fff' : theme.textSecondary, fontSize: 13 }}>
                          {t('profile.auth_sign_in')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setAuthMode('signUp')}
                        style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: authMode === 'signUp' ? theme.primary : theme.border, backgroundColor: authMode === 'signUp' ? theme.primary : theme.background }}
                      >
                        <Text style={{ fontWeight: '700', color: authMode === 'signUp' ? '#fff' : theme.textSecondary, fontSize: 13 }}>
                          {t('profile.auth_sign_up')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setAuthMode('signIn')}
                      style={{ backgroundColor: theme.background, borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: theme.border }}
                    >
                      <Text style={{ fontWeight: '700', color: theme.textSecondary, fontSize: 13 }}>{t('profile.auth_back_to_sign_in')}</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={handleGoogleSignIn}
                    disabled={authLoading || !GOOGLE_OAUTH_ENABLED}
                    style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: authLoading || !GOOGLE_OAUTH_ENABLED ? 0.5 : 1 }}
                  >
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{GOOGLE_OAUTH_ENABLED ? t('profile.auth_continue_google') : t('profile.auth_google_coming_soon')}</Text>
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
                    <Text style={{ fontSize: 12, color: theme.textMuted, fontWeight: '600' }}>{t('profile.email_label')}</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
                  </View>

                  <View style={{ gap: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                      {t('profile.email_label')}
                    </Text>
                    <TextInput
                      value={authEmail}
                      onChangeText={setAuthEmail}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      autoComplete="email"
                      placeholder={t('profile.auth_email_placeholder')}
                      placeholderTextColor={theme.textMuted}
                      style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: !authEmailOk && trimmedAuthEmail.length > 0 ? theme.warning : theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                    />
                  </View>

                  {authMode !== 'forgot' && (
                    <View style={{ gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                          {t('profile.auth_password_placeholder')}
                        </Text>
                        <TouchableOpacity
                          onPress={() => setShowPassword((v) => !v)}
                          style={{ paddingVertical: 2 }}
                        >
                          {showPassword ? <EyeOff size={14} color={theme.textSecondary} /> : <Eye size={14} color={theme.textSecondary} />}
                        </TouchableOpacity>
                      </View>
                      <TextInput
                        value={authPassword}
                        onChangeText={setAuthPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry={!showPassword}
                        textContentType={authMode === 'signUp' ? 'newPassword' : 'password'}
                        autoComplete={authMode === 'signUp' ? 'password-new' : 'password'}
                        placeholder={t('profile.auth_password_placeholder')}
                        placeholderTextColor={theme.textMuted}
                        style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: authPassword.length > 0 && !authPasswordOk ? theme.warning : theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                      />
                    </View>
                  )}

                  {authMessage && (
                    <View style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
                      <Text style={{ fontSize: 12, color: theme.textSecondary }}>{authMessage}</Text>
                    </View>
                  )}

                  {authMode === 'forgot' ? (
                    <TouchableOpacity
                      onPress={handleForgotPassword}
                      disabled={authLoading || !authEmailOk}
                      style={{ backgroundColor: theme.text, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: authLoading || !authEmailOk ? 0.5 : 1 }}
                    >
                      <Text style={{ color: theme.card, fontWeight: '700', fontSize: 14 }}>{t('profile.auth_send_reset_link')}</Text>
                    </TouchableOpacity>
                  ) : authMode === 'signUp' ? (
                    <TouchableOpacity
                      onPress={handleSignUp}
                      disabled={authLoading || !authEmailOk || !authPasswordOk}
                      style={{ backgroundColor: theme.success, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: authLoading || !authEmailOk || !authPasswordOk ? 0.5 : 1 }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('profile.auth_create_account')}</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={handleSignIn}
                      disabled={authLoading || !authEmailOk || !authPasswordOk}
                      style={{ backgroundColor: theme.text, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: authLoading || !authEmailOk || !authPasswordOk ? 0.5 : 1 }}
                    >
                      <Text style={{ color: theme.card, fontWeight: '700', fontSize: 14 }}>{t('profile.auth_sign_in')}</Text>
                    </TouchableOpacity>
                  )}
                  {authMode !== 'forgot' && (
                    <TouchableOpacity
                      onPress={() => setAuthMode('forgot')}
                      disabled={authLoading}
                      style={{ paddingVertical: 4, alignItems: 'center' }}
                    >
                      <Text style={{ fontSize: 13, color: theme.textSecondary, fontWeight: '600' }}>{t('profile.auth_forgot_password')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          ) : (
            <View>
              {authMessage && <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 12 }}>{authMessage}</Text>}
              <TouchableOpacity
                onPress={handleSignOut}
                disabled={authLoading}
                style={{ backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: authLoading ? 0.5 : 1 }}
              >
                <Text style={{ color: theme.textSecondary, fontWeight: '700', fontSize: 14 }}>{t('profile.auth_sign_out')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteAccount}
                disabled={authLoading}
                style={{ marginTop: 10, backgroundColor: '#fee2e2', borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: authLoading ? 0.5 : 1 }}
              >
                <Text style={{ color: '#991b1b', fontWeight: '700', fontSize: 14 }}>{t('profile.auth_delete_account')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Crown size={18} color={theme.textSecondary} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('profile.subscription_title')}</Text>
          </View>

          <Text style={{ fontSize: 13, color: theme.textSecondary }}>
            {!isSubConfigured ? t('profile.sub_not_configured') : isSubLoading ? t('profile.sub_checking') : isPremium ? t('profile.sub_premium_active') : t('profile.sub_free_plan')}
          </Text>

          <TouchableOpacity
            onPress={handlePaywall}
            disabled={!isSubConfigured || isPresenting || isSubLoading}
            style={{ backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: !isSubConfigured || isPresenting || isSubLoading ? 0.5 : 1 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{isPremium ? t('profile.sub_manage') : t('profile.sub_upgrade')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleRestorePurchases}
            disabled={!isSubConfigured || isPresenting || isSubLoading}
            style={{ backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: !isSubConfigured || isPresenting || isSubLoading ? 0.5 : 1 }}
          >
            <Text style={{ color: theme.textSecondary, fontWeight: '700', fontSize: 14 }}>{t('profile.sub_restore')}</Text>
          </TouchableOpacity>

          {paywallMessage && <Text style={{ fontSize: 12, color: theme.textSecondary }}>{paywallMessage}</Text>}
        </View>

        <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 16, gap: 14, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Globe size={18} color={theme.textSecondary} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('profile.language_label')}</Text>
          </View>
          <View>
            <TouchableOpacity
              onPress={() => setLanguageMenuOpen((v) => !v)}
              style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: theme.text }}>{selectedLangLabel}</Text>
              {languageMenuOpen ? <ChevronUp size={18} color={theme.textSecondary} /> : <ChevronDown size={18} color={theme.textSecondary} />}
            </TouchableOpacity>
            {languageMenuOpen && (
              <View style={{ marginTop: 8, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 14, overflow: 'hidden' }}>
                {LANGUAGES.map((lang, index) => {
                  const active = lang.code === currentLang;
                  return (
                    <TouchableOpacity
                      key={lang.code}
                      onPress={async () => {
                        setLanguageMenuOpen(false);
                        await handleLanguageChange(lang.code);
                      }}
                      style={{ paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: index === LANGUAGES.length - 1 ? 0 : 1, borderColor: theme.accent }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: active ? theme.success : theme.text }}>
                        {lang.label}
                      </Text>
                      {active && <Check size={16} color={theme.success} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 16, gap: 14, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={18} color={theme.textSecondary} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('profile.timezone_label')}</Text>
          </View>
          <TextInput
            value={timezone}
            onChangeText={setTimezone}
            placeholder={t('profile.timezone_placeholder')}
            placeholderTextColor={theme.textMuted}
            style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
          />
        </View>

        <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 16, gap: 14, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Ruler size={18} color={theme.textSecondary} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('profile.units_label')}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['metric', 'imperial'] as UnitSystem[]).map((unit) => {
              const active = unit === unitSystem;
              return (
                <TouchableOpacity
                  key={unit}
                  onPress={() => {
                    setUnitSystem(unit);
                    void setUnitSystemPreference(unit);
                  }}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? theme.primary : theme.accent, borderWidth: 1, borderColor: active ? theme.primary : theme.border }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : theme.textSecondary }}>
                    {unit === 'metric' ? t('profile.unit_metric') : t('profile.unit_imperial')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 16, gap: 14, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Sun size={18} color={theme.textSecondary} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('profile.theme_label')}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { id: 'light', label: t('profile.theme_light'), icon: Sun },
              { id: 'dark', label: t('profile.theme_dark'), icon: Moon },
              { id: 'system', label: t('profile.theme_system'), icon: Monitor },
            ].map((item) => {
              const active = item.id === themePreference;
              const Icon = item.icon;
              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => setThemePreference(item.id)}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 16, backgroundColor: active ? theme.primary : theme.accent, borderWidth: 1, borderColor: active ? theme.primary : theme.border, alignItems: 'center', gap: 6 }}
                >
                  <Icon size={18} color={active ? '#fff' : theme.textSecondary} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : theme.textSecondary }}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 16, gap: 14, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('profile.backup_title')}</Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary }}>
            {isCloudBackupLinked ? t('profile.backup_subtitle') : t('profile.backup_subtitle_unlinked')}
          </Text>
          {!isCloudBackupLinked && (
            <Text style={{ fontSize: 12, color: theme.textMuted, lineHeight: 18 }}>
              {t('profile.backup_storage_note')}
            </Text>
          )}
          <Text style={{ fontSize: 13, color: theme.textSecondary }}>{t('profile.backup_queue_count', { count: backupCount })}</Text>
          {backupMessage && (
            <Text style={{ fontSize: 13, color: theme.success, fontWeight: '500' }}>{backupMessage}</Text>
          )}
          <TouchableOpacity
            onPress={isCloudBackupLinked ? handleBackupNow : handleLinkCloudBackup}
            disabled={backingUp}
            testID="e2e-profile-backup-now"
            style={{ backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: backingUp ? 0.5 : 1 }}
          >
            <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>
              {isCloudBackupLinked ? t('profile.backup_button') : t('profile.backup_link_button')}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || isLoading || isSettingsLoading}
          testID="e2e-profile-save-settings"
          style={{ backgroundColor: theme.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: saving || isLoading || isSettingsLoading ? 0.5 : 1, marginTop: 8 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Save size={20} color="white" />
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 }}>{t('profile.save_settings')}</Text>
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
