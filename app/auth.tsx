import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { ChevronLeft, Eye, EyeOff, UserRound } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authClient, APP_SCHEME } from '../lib/auth-client';
import { useTheme } from '../lib/theme';
import { useAuth } from '../lib/auth';

/**
 * Feature flags — flip to true once the backend is configured.
 * Google OAuth: requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET on the server.
 * Reset password: requires emailAndPassword.sendResetPassword in Better Auth config.
 */
const GOOGLE_OAUTH_ENABLED = false;
const RESET_PASSWORD_ENABLED = false;

export default function AuthScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = typeof params.returnTo === 'string' ? params.returnTo : undefined;
  const { updateProfile } = useAuth();

  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp' | 'forgot'>('signIn');
  const [showPassword, setShowPassword] = useState(false);

  const trimmedAuthName = authName.trim();
  const trimmedAuthEmail = authEmail.trim();
  const authPasswordOk = authPassword.length >= 8;
  const authEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedAuthEmail);

  useEffect(() => {
    if (authMode === 'forgot') {
      setShowPassword(false);
    }
  }, [authMode]);

  const handleSignUp = async () => {
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const result = await authClient.signUp.email({
        email: trimmedAuthEmail,
        password: authPassword,
        name: trimmedAuthName || undefined,
      });
      if (result.error) {
        setAuthMessage(result.error.message ?? t('profile.auth_sign_up_failed'));
        return;
      }
      if (trimmedAuthName) {
        await updateProfile({ name: trimmedAuthName });
      }
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
        email: trimmedAuthEmail,
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
        email: trimmedAuthEmail,
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 16 }}
    >
      <View style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity
            onPress={() => (returnTo ? router.replace(returnTo) : router.back())}
            style={{ paddingVertical: 8, paddingHorizontal: 8, marginLeft: -8 }}
          >
            <ChevronLeft size={22} color={theme.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text }}>{t('profile.auth_account')}</Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 16, gap: 14, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
              <UserRound size={18} color={theme.textSecondary} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('profile.auth_sign_in_or_create')}</Text>
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

          {authMode === 'signUp' && (
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {t('profile.name_label')}
              </Text>
              <TextInput
                value={authName}
                onChangeText={setAuthName}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder={t('profile.name_placeholder')}
                placeholderTextColor={theme.textMuted}
                style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
              />
            </View>
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
      </View>
    </ScrollView>
  );
}
