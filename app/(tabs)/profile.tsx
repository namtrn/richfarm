import { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { UserRound, Globe, Clock, Save, Ruler, ChevronDown, ChevronUp, Check, Sun, Moon, Monitor, Crown } from 'lucide-react-native';
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

/**
 * Feature flags — flip to true once the backend is configured.
 * Google OAuth: requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET on the server.
 * Reset password: requires emailAndPassword.sendResetPassword in Better Auth config.
 */
const GOOGLE_OAUTH_ENABLED = false;
const RESET_PASSWORD_ENABLED = false;

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

  const currentLang = i18n.language;
  const [name, setName] = useState(user?.name ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? '');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(
    resolveUnitSystem(settings?.unitSystem ?? undefined, currentLang, getLocales()[0]?.regionCode ?? undefined)
  );
  const [themePreference, setThemePreference] = useState<string>(settings?.theme ?? 'system');
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
  const [paywallMessage, setPaywallMessage] = useState<string | null>(null);

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
    setThemePreference(settings?.theme ?? 'system');
  }, [settings?.unitSystem, settings?.theme, currentLang]);

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
      await updateSettings({ unitSystem, theme: themePreference });
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
    if (!GOOGLE_OAUTH_ENABLED) {
      setAuthMessage('Google sign-in is not configured yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server.');
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
        setAuthMessage(result.error.message ?? 'Google sign in failed');
        return;
      }
      setAuthMessage('Google sign in started.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!RESET_PASSWORD_ENABLED) {
      setAuthMessage('⚠ Password reset is not configured yet. Email sending must be set up on the server first.');
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
        setAuthMessage('Password reset is not available in current auth client config.');
        return;
      }
      const result = await requestReset({
        email: authEmail.trim(),
        redirectTo: `${APP_SCHEME}://`,
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

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This will permanently remove your account and app data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setAuthLoading(true);
            setAuthMessage(null);
            try {
              await deleteAccountMutation({ deviceId });
              await authClient.signOut();
              setAuthMessage('Account deleted.');
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'Delete account failed';
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
      setPaywallMessage('Subscription active.');
      return;
    }
    if (result.status === 'cancelled') {
      setPaywallMessage('Purchase cancelled.');
      return;
    }
    if (result.status === 'not_presented') {
      setPaywallMessage('Paywall not available.');
      return;
    }
    if (result.status === 'error') {
      setPaywallMessage(result.errorMessage ?? 'Paywall error.');
    }
  };

  const handleRestorePurchases = async () => {
    setPaywallMessage(null);
    try {
      await restorePurchases();
      setPaywallMessage('Purchases restored.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Restore failed.';
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
              <Text style={{ fontSize: 13, color: theme.textSecondary, fontStyle: 'italic' }}>Create account to sync across devices</Text>
              {!authPanelOpen ? (
                <TouchableOpacity
                  onPress={() => {
                    setAuthPanelOpen(true);
                    setAuthMode('signIn');
                    setAuthMessage(null);
                  }}
                  style={{ backgroundColor: theme.text, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
                >
                  <Text style={{ color: theme.card, fontWeight: '700', fontSize: 14 }}>Sign In or Create Account</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ gap: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>
                      Account
                    </Text>
                    <TouchableOpacity
                      onPress={() => setAuthPanelOpen(false)}
                      style={{ backgroundColor: theme.accent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}
                    >
                      <Text style={{ fontWeight: '700', color: theme.textSecondary, fontSize: 12 }}>Close</Text>
                    </TouchableOpacity>
                  </View>
                  {authMode !== 'forgot' ? (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => setAuthMode('signIn')}
                        style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: authMode === 'signIn' ? theme.primary : theme.accent }}
                      >
                        <Text style={{ fontWeight: '700', color: authMode === 'signIn' ? '#fff' : theme.textSecondary, fontSize: 13 }}>
                          Sign In
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setAuthMode('signUp')}
                        style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: authMode === 'signUp' ? theme.primary : theme.accent }}
                      >
                        <Text style={{ fontWeight: '700', color: authMode === 'signUp' ? '#fff' : theme.textSecondary, fontSize: 13 }}>
                          Sign Up
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setAuthMode('signIn')}
                      style={{ backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}
                    >
                      <Text style={{ fontWeight: '700', color: theme.textSecondary, fontSize: 13 }}>Back to Sign In</Text>
                    </TouchableOpacity>
                  )}
                  <TextInput
                    value={authEmail}
                    onChangeText={setAuthEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="Email"
                    placeholderTextColor={theme.textMuted}
                    style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                  />
                  {authMode !== 'forgot' && (
                    <TextInput
                      value={authPassword}
                      onChangeText={setAuthPassword}
                      autoCapitalize="none"
                      secureTextEntry
                      placeholder="Password (min 8 chars)"
                      placeholderTextColor={theme.textMuted}
                      style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                    />
                  )}
                  {authMessage && <Text style={{ fontSize: 12, color: theme.textSecondary }}>{authMessage}</Text>}
                  <TouchableOpacity
                    onPress={handleGoogleSignIn}
                    disabled={authLoading || !GOOGLE_OAUTH_ENABLED}
                    style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: authLoading || !GOOGLE_OAUTH_ENABLED ? 0.5 : 1 }}
                  >
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{GOOGLE_OAUTH_ENABLED ? 'Continue with Google' : 'Google — coming soon'}</Text>
                  </TouchableOpacity>
                  {authMode === 'forgot' ? (
                    <TouchableOpacity
                      onPress={handleForgotPassword}
                      disabled={authLoading || !authEmail.trim()}
                      style={{ backgroundColor: theme.text, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: authLoading || !authEmail.trim() ? 0.5 : 1 }}
                    >
                      <Text style={{ color: theme.card, fontWeight: '700', fontSize: 14 }}>Send Reset Link</Text>
                    </TouchableOpacity>
                  ) : authMode === 'signUp' ? (
                    <TouchableOpacity
                      onPress={handleSignUp}
                      disabled={authLoading || !authEmail.trim() || authPassword.length < 8}
                      style={{ backgroundColor: theme.success, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: authLoading || !authEmail.trim() || authPassword.length < 8 ? 0.5 : 1 }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Create Account</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={handleSignIn}
                      disabled={authLoading || !authEmail.trim() || authPassword.length < 8}
                      style={{ backgroundColor: theme.text, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: authLoading || !authEmail.trim() || authPassword.length < 8 ? 0.5 : 1 }}
                    >
                      <Text style={{ color: theme.card, fontWeight: '700', fontSize: 14 }}>Sign In</Text>
                    </TouchableOpacity>
                  )}
                  {authMode !== 'forgot' && (
                    <TouchableOpacity
                      onPress={() => setAuthMode('forgot')}
                      disabled={authLoading}
                      style={{ paddingVertical: 4, alignItems: 'center' }}
                    >
                      <Text style={{ fontSize: 13, color: theme.textSecondary, fontWeight: '600' }}>Forgot password?</Text>
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
                <Text style={{ color: theme.textSecondary, fontWeight: '700', fontSize: 14 }}>Sign Out</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteAccount}
                disabled={authLoading}
                style={{ marginTop: 10, backgroundColor: '#fee2e2', borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: authLoading ? 0.5 : 1 }}
              >
                <Text style={{ color: '#991b1b', fontWeight: '700', fontSize: 14 }}>Delete Account</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Crown size={18} color={theme.textSecondary} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>Subscription</Text>
          </View>

          <Text style={{ fontSize: 13, color: theme.textSecondary }}>
            {!isSubConfigured ? 'RevenueCat not configured.' : isSubLoading ? 'Checking status...' : isPremium ? 'Premium active.' : 'Free plan.'}
          </Text>

          <TouchableOpacity
            onPress={handlePaywall}
            disabled={!isSubConfigured || isPresenting || isSubLoading}
            style={{ backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: !isSubConfigured || isPresenting || isSubLoading ? 0.5 : 1 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{isPremium ? 'Manage subscription' : 'Upgrade to Premium'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleRestorePurchases}
            disabled={!isSubConfigured || isPresenting || isSubLoading}
            style={{ backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: !isSubConfigured || isPresenting || isSubLoading ? 0.5 : 1 }}
          >
            <Text style={{ color: theme.textSecondary, fontWeight: '700', fontSize: 14 }}>Restore Purchases</Text>
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
                  onPress={() => setUnitSystem(unit)}
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
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('profile.sync_title')}</Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary }}>{t('profile.sync_subtitle')}</Text>
          {syncMessage && (
            <Text style={{ fontSize: 13, color: theme.success, fontWeight: '500' }}>{syncMessage}</Text>
          )}
          <TouchableOpacity
            onPress={handleSyncNow}
            disabled={syncing}
            testID="e2e-profile-sync-now"
            style={{ backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: syncing ? 0.5 : 1 }}
          >
            <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>{t('profile.sync_button')}</Text>
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
