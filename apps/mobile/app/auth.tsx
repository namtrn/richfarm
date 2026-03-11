import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { ChevronLeft, Eye, EyeOff, UserRound } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { APP_SCHEME, getAuthClient } from '../lib/auth-client';
import { useTheme } from '../lib/theme';

/**
 * Feature flags — flip to true once the backend is configured.
 * Google OAuth: requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET on the server.
 * Reset password: requires emailAndPassword.sendResetPassword in Better Auth config.
 */
const GOOGLE_OAUTH_ENABLED = false;
const RESET_PASSWORD_ENABLED = true;

/** Map common server error messages/codes → friendly i18n key */
function mapAuthError(raw: string | undefined, fallbackKey: string): string {
  if (!raw) return fallbackKey;
  const lower = raw.toLowerCase();
  if (lower.includes('already exists') || lower.includes('already registered') || lower.includes('email taken'))
    return 'profile.auth_err_user_exists';
  if (lower.includes('invalid credentials') || lower.includes('invalid email or password') || lower.includes('wrong password') || lower.includes('incorrect'))
    return 'profile.auth_err_invalid_credentials';
  if (lower.includes('rate limit') || lower.includes('too many'))
    return 'profile.auth_err_too_many_requests';
  if (lower.includes('verify') && lower.includes('email'))
    return 'profile.auth_err_verify_email';
  if (lower.includes('invalid token') || lower.includes('token is invalid') || lower.includes('token expired'))
    return 'profile.auth_reset_link_invalid';
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('econnrefused'))
    return 'profile.auth_err_network';
  return fallbackKey;
}

export default function AuthScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = typeof params.returnTo === 'string' ? params.returnTo : undefined;

  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirm, setAuthConfirm] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authMessageIsError, setAuthMessageIsError] = useState(false);
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp' | 'forgot'>('signIn');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [verificationResent, setVerificationResent] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const navigateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedAuthName = authName.trim();
  const trimmedAuthEmail = authEmail.trim();
  const fallbackAuthName = trimmedAuthEmail.split('@')[0]?.trim() || 'User';
  const authPasswordOk = authPassword.length >= 8;
  const authEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedAuthEmail);
  const passwordsMatch = authMode !== 'signUp' || authConfirm === authPassword;
  const confirmTouched = authConfirm.length > 0;

  const setError = (msg: string) => { setAuthMessage(msg); setAuthMessageIsError(true); };
  const setSuccess = (msg: string) => { setAuthMessage(msg); setAuthMessageIsError(false); };

  useEffect(() => {
    if (authMode === 'forgot') {
      setShowPassword(false);
    }
    setAuthMessage(null);
    setAuthMessageIsError(false);
    setResetSent(false);
    setVerificationResent(false);
  }, [authMode]);

  useEffect(() => {
    if (pendingVerificationEmail && trimmedAuthEmail && trimmedAuthEmail !== pendingVerificationEmail) {
      setPendingVerificationEmail(null);
    }
  }, [pendingVerificationEmail, trimmedAuthEmail]);

  useEffect(() => {
    return () => {
      if (navigateTimeoutRef.current) {
        clearTimeout(navigateTimeoutRef.current);
      }
    };
  }, []);

  const navigateBack = () => {
    if (navigateTimeoutRef.current) {
      clearTimeout(navigateTimeoutRef.current);
      navigateTimeoutRef.current = null;
    }
    if (returnTo) {
      router.replace(returnTo as any);
    } else {
      router.back();
    }
  };

  const handleSignUp = async () => {
    if (!passwordsMatch) {
      setError(t('profile.auth_password_mismatch'));
      return;
    }
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const authClient = await getAuthClient();
      const result = await authClient.signUp.email({
        email: trimmedAuthEmail,
        password: authPassword,
        name: trimmedAuthName || fallbackAuthName,
        callbackURL: `${APP_SCHEME}://verify-email`,
      });
      if (result.error) {
        const errKey = mapAuthError(result.error.message, 'profile.auth_sign_up_failed');
        setError(t(errKey));
        return;
      }
      setAuthPassword('');
      setAuthConfirm('');
      setPendingVerificationEmail(trimmedAuthEmail);
      setAuthMode('signIn');
      setSuccess(t('profile.auth_verify_email_sent'));
    } catch {
      setError(t('profile.auth_err_network'));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignIn = async () => {
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const authClient = await getAuthClient();
      const result = await authClient.signIn.email({
        email: trimmedAuthEmail,
        password: authPassword,
      });
      if (result.error) {
        const errKey = mapAuthError(result.error.message, 'profile.auth_sign_in_failed');
        if (errKey === 'profile.auth_err_verify_email') {
          setPendingVerificationEmail(trimmedAuthEmail);
        }
        setError(t(errKey));
        return;
      }
      setPendingVerificationEmail(null);
      setSuccess(t('profile.auth_signed_in'));
      navigateTimeoutRef.current = setTimeout(() => {
        navigateBack();
      }, 900);
    } catch {
      setError(t('profile.auth_err_network'));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!GOOGLE_OAUTH_ENABLED) {
      setError(t('profile.auth_google_not_configured'));
      return;
    }
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const authClient = await getAuthClient();
      const result = await (authClient.signIn as any).social({
        provider: 'google',
        callbackURL: `${APP_SCHEME}://`,
      });
      if (result?.error) {
        setError(result.error.message ?? t('profile.auth_google_failed'));
        return;
      }
      setSuccess(t('profile.auth_google_started'));
    } catch {
      setError(t('profile.auth_err_network'));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!RESET_PASSWORD_ENABLED) {
      setError(t('profile.auth_reset_not_configured'));
      return;
    }
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const authClient = await getAuthClient();
      type RequestResetFn = (opts: { email: string; redirectTo: string }) => Promise<{ error?: { message?: string } }>;
      const requestReset = (authClient as unknown as { requestPasswordReset: RequestResetFn }).requestPasswordReset;
      if (!requestReset) {
        setError(t('profile.auth_reset_unavailable'));
        return;
      }
      const result = await requestReset({
        email: trimmedAuthEmail,
        redirectTo: `${APP_SCHEME}://reset-password`,
      });
      if (result?.error) {
        const errKey = mapAuthError(result.error.message, 'profile.auth_forgot_failed');
        setError(t(errKey));
        return;
      }
      setResetSent(true);
      setSuccess(t('profile.auth_reset_sent'));
    } catch {
      setError(t('profile.auth_err_network'));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!authEmailOk) {
      setError(t('profile.auth_enter_email_first'));
      return;
    }
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const authClient = await getAuthClient();
      type SendVerificationFn = (opts: { email: string; callbackURL: string }) => Promise<{ error?: { message?: string } }>;
      const sendVerificationEmail = (authClient as unknown as { sendVerificationEmail?: SendVerificationFn }).sendVerificationEmail;
      if (!sendVerificationEmail) {
        setError(t('profile.auth_verify_email_resend_unavailable'));
        return;
      }
      const result = await sendVerificationEmail({
        email: trimmedAuthEmail,
        callbackURL: `${APP_SCHEME}://verify-email`,
      });
      if (result?.error) {
        const errKey = mapAuthError(result.error.message, 'profile.auth_verify_email_resend_failed');
        setError(t(errKey));
        return;
      }
      setVerificationResent(true);
      setPendingVerificationEmail(trimmedAuthEmail);
      setSuccess(t('profile.auth_verify_email_resent'));
    } catch {
      setError(t('profile.auth_err_network'));
    } finally {
      setAuthLoading(false);
    }
  };

  const buttonLabel = () => {
    if (authLoading) {
      if (authMode === 'signIn') return t('profile.auth_signing_in');
      if (authMode === 'signUp') return t('profile.auth_signing_up');
      return t('profile.auth_sending_reset');
    }
    if (authMode === 'forgot') return t('profile.auth_send_reset_link');
    if (authMode === 'signUp') return t('profile.auth_create_account');
    return t('profile.auth_sign_in');
  };

  const buttonDisabled =
    authLoading ||
    (authMode === 'forgot' ? !authEmailOk || resetSent : !authEmailOk || !authPasswordOk) ||
    (authMode === 'signUp' && confirmTouched && !passwordsMatch);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TouchableOpacity
              onPress={() => (returnTo ? router.replace(returnTo as any) : router.back())}
              style={{ paddingVertical: 8, paddingHorizontal: 8, marginLeft: -8 }}
            >
              <ChevronLeft size={22} color={theme.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: '500', color: theme.text }}>{t('profile.auth_account')}</Text>
            <View style={{ width: 32 }} />
          </View>

          <View style={{ gap: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                <UserRound size={18} color={theme.textSecondary} />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '500', color: theme.text }}>
                {authMode === 'forgot' ? t('profile.auth_send_reset_link') : t('profile.auth_sign_in_or_create')}
              </Text>
            </View>

            {/* Mode toggle */}
            {authMode !== 'forgot' ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setAuthMode('signIn')}
                  style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: authMode === 'signIn' ? theme.primary : theme.border, backgroundColor: authMode === 'signIn' ? theme.primary : theme.background }}
                >
                  <Text style={{ fontWeight: '500', color: authMode === 'signIn' ? '#fff' : theme.textSecondary, fontSize: 13 }}>
                    {t('profile.auth_sign_in')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setAuthMode('signUp')}
                  style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: authMode === 'signUp' ? theme.primary : theme.border, backgroundColor: authMode === 'signUp' ? theme.primary : theme.background }}
                >
                  <Text style={{ fontWeight: '500', color: authMode === 'signUp' ? '#fff' : theme.textSecondary, fontSize: 13 }}>
                    {t('profile.auth_sign_up')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setAuthMode('signIn')}
                style={{ backgroundColor: theme.background, borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: theme.border }}
              >
                <Text style={{ fontWeight: '500', color: theme.textSecondary, fontSize: 13 }}>{t('profile.auth_back_to_sign_in')}</Text>
              </TouchableOpacity>
            )}

            {/* Name field (sign up only) */}
            {authMode === 'signUp' && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '500', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  {t('profile.name_label')}
                </Text>
                <TextInput
                  value={authName}
                  onChangeText={setAuthName}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                  placeholder={t('profile.name_placeholder')}
                  placeholderTextColor={theme.textMuted}
                  style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                />
              </View>
            )}

            {/* Google button */}
            <TouchableOpacity
              onPress={handleGoogleSignIn}
              disabled={authLoading || !GOOGLE_OAUTH_ENABLED}
              style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: authLoading || !GOOGLE_OAUTH_ENABLED ? 0.5 : 1 }}
            >
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>
                {GOOGLE_OAUTH_ENABLED ? t('profile.auth_continue_google') : t('profile.auth_google_coming_soon')}
              </Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
              <Text style={{ fontSize: 12, color: theme.textMuted, fontWeight: '400' }}>{t('profile.email_label')}</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
            </View>

            {/* Email */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 }}>
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
                returnKeyType="next"
                placeholder={t('profile.auth_email_placeholder')}
                placeholderTextColor={theme.textMuted}
                style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: !authEmailOk && trimmedAuthEmail.length > 0 ? theme.warning : theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
              />
            </View>

            {/* Password (not for forgot) */}
            {authMode !== 'forgot' && (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    {t('profile.auth_password_placeholder')}
                  </Text>
                  <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={{ paddingVertical: 2 }}>
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
                  returnKeyType={authMode === 'signUp' ? 'next' : 'done'}
                  placeholder={t('profile.auth_password_placeholder')}
                  placeholderTextColor={theme.textMuted}
                  style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: authPassword.length > 0 && !authPasswordOk ? theme.warning : theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                />
              </View>
            )}

            {/* Confirm Password (sign up only) */}
            {authMode === 'signUp' && (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    {t('profile.auth_confirm_password')}
                  </Text>
                  <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} style={{ paddingVertical: 2 }}>
                    {showConfirm ? <EyeOff size={14} color={theme.textSecondary} /> : <Eye size={14} color={theme.textSecondary} />}
                  </TouchableOpacity>
                </View>
                <TextInput
                  value={authConfirm}
                  onChangeText={setAuthConfirm}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showConfirm}
                  textContentType="newPassword"
                  autoComplete="password-new"
                  returnKeyType="done"
                  placeholder={t('profile.auth_confirm_password')}
                  placeholderTextColor={theme.textMuted}
                  style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: confirmTouched && !passwordsMatch ? theme.warning : theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                />
                {confirmTouched && !passwordsMatch && (
                  <Text style={{ fontSize: 12, color: theme.warning }}>{t('profile.auth_password_mismatch')}</Text>
                )}
              </View>
            )}

            {/* Feedback message */}
            {authMessage && (
              <View style={{ backgroundColor: authMessageIsError ? (theme.warningBg ?? '#fff7ed') : theme.background, borderWidth: 1, borderColor: authMessageIsError ? theme.warning : theme.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
                <Text style={{ fontSize: 12, color: authMessageIsError ? theme.warning : theme.textSecondary }}>{authMessage}</Text>
              </View>
            )}

            {/* Reset sent hint */}
            {resetSent && !authMessageIsError && (
              <Text style={{ fontSize: 12, color: theme.textMuted, lineHeight: 18 }}>
                {t('profile.auth_reset_success_hint')}
              </Text>
            )}

            {authMode === 'signIn' && pendingVerificationEmail && (
              <View style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
                <Text style={{ fontSize: 12, color: theme.textSecondary }}>{t('profile.auth_verify_email_sent')}</Text>
                <Text style={{ fontSize: 12, color: theme.text, fontWeight: '500', marginTop: 4 }}>{pendingVerificationEmail}</Text>
              </View>
            )}

            {authMode === 'signIn' && (
              <TouchableOpacity
                onPress={handleResendVerification}
                disabled={authLoading || !authEmailOk || verificationResent}
                style={{ paddingVertical: 4, alignItems: 'center', opacity: authLoading || !authEmailOk || verificationResent ? 0.5 : 1 }}
              >
                <Text style={{ fontSize: 13, color: theme.primary, fontWeight: '500' }}>
                  {verificationResent ? t('profile.auth_verify_email_resent') : t('profile.auth_resend_verification')}
                </Text>
              </TouchableOpacity>
            )}

            {/* Primary action button */}
            <TouchableOpacity
              onPress={authMode === 'forgot' ? handleForgotPassword : authMode === 'signUp' ? handleSignUp : handleSignIn}
              disabled={buttonDisabled}
              style={{
                backgroundColor: authMode === 'signUp' ? theme.success : theme.text,
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: 'center',
                opacity: buttonDisabled ? 0.5 : 1,
              }}
            >
              <Text style={{ color: theme.card, fontWeight: '500', fontSize: 14 }}>{buttonLabel()}</Text>
            </TouchableOpacity>

            {/* Forgot password link */}
            {authMode !== 'forgot' && (
              <TouchableOpacity
                onPress={() => setAuthMode('forgot')}
                disabled={authLoading}
                style={{ paddingVertical: 4, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, color: theme.textSecondary, fontWeight: '500' }}>{t('profile.auth_forgot_password')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
