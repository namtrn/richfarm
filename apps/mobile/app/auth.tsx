import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { ChevronLeft, Eye, EyeOff, UserRound } from '../lib/icons';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { APP_SCHEME, getAuthClient } from '../lib/auth-client';
import { useTheme } from '../lib/theme';
import { markServerCreatedAccount } from '../lib/sync/accountClaimIntent';
import { toast } from '../lib/toast';

/**
 * Feature flags for sign-in options that may not be available in every build.
 */
const GOOGLE_OAUTH_ENABLED = false;
const E2E_AUTH_ENABLED = process.env.EXPO_PUBLIC_E2E_AUTH_MODE === 'mock';
const RESET_PASSWORD_ENABLED = true;

/** Map common sign-in errors → a friendly i18n key. */
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
  const params = useLocalSearchParams<{ returnTo?: string; e2e?: string }>();
  const returnTo = typeof params.returnTo === 'string' ? params.returnTo : undefined;
  const e2eAuthEnabled = E2E_AUTH_ENABLED || params.e2e === '1';

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

  const trimmedAuthName = authName.trim();
  const trimmedAuthEmail = authEmail.trim();
  const fallbackAuthName = trimmedAuthEmail.split('@')[0]?.trim() || 'User';
  const authPasswordOk = authPassword.length >= 8;
  const authEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedAuthEmail);
  const passwordsMatch = authMode !== 'signUp' || authConfirm === authPassword;
  const confirmTouched = authConfirm.length > 0;
  const passwordValidForMode = authMode === 'signUp' ? authPasswordOk : authPassword.length > 0;
  const showVerificationState = authMode === 'signIn' && pendingVerificationEmail !== null;

  const setError = (msg: string) => { setAuthMessage(msg); setAuthMessageIsError(true); };
  const setSuccess = (msg: string) => {
    setAuthMessage(null);
    setAuthMessageIsError(false);
    toast.success(msg, { testID: 'e2e-toast-auth-success' });
  };

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

  const navigateAfterSignIn = () => {
    if (returnTo) {
      router.replace(returnTo as any);
    } else {
      router.replace('/(tabs)/home');
    }
  };

  const handleSignUp = async () => {
    if (!passwordsMatch) {
      setError(t('profile.auth_password_mismatch'));
      return;
    }
    if (e2eAuthEnabled) {
      setAuthPassword('');
      setAuthConfirm('');
      setPendingVerificationEmail(trimmedAuthEmail);
      setAuthMode('signIn');
      setSuccess(t('profile.auth_verify_email_sent'));
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
        callbackURL: `${APP_SCHEME}:///verify-email`,
      });
      if (result.error) {
        const errKey = mapAuthError(result.error.message, 'profile.auth_sign_up_failed');
        setError(t(errKey));
        return;
      }
      const createdUserId = (result.data as { user?: { id?: string } } | null)?.user?.id;
      if (createdUserId) await markServerCreatedAccount(createdUserId);
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
    if (e2eAuthEnabled) {
      setPendingVerificationEmail(null);
      setAuthPassword('');
      setShowPassword(false);
      setSuccess(t('profile.auth_signed_in'));
      navigateAfterSignIn();
      return;
    }
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const authClient = await getAuthClient();
      const result = await authClient.signIn.email({
        email: trimmedAuthEmail,
        password: authPassword,
        callbackURL: `${APP_SCHEME}:///verify-email`,
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
      setAuthPassword('');
      setShowPassword(false);
      setSuccess(t('profile.auth_signed_in'));
      navigateAfterSignIn();
    } catch {
      setError(t('profile.auth_err_network'));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (e2eAuthEnabled) {
      setSuccess(t('profile.auth_google_started'));
      return;
    }
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
        redirectTo: `${APP_SCHEME}:///reset-password`,
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
        callbackURL: `${APP_SCHEME}:///verify-email`,
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
    (authMode === 'forgot' ? !authEmailOk || resetSent : !authEmailOk || !passwordValidForMode) ||
    (authMode === 'signUp' && (!confirmTouched || !passwordsMatch));

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
        <View style={{ gap: 24 }}>
          <TouchableOpacity
            onPress={() => (returnTo ? router.replace(returnTo as any) : router.back())}
            accessibilityLabel={t('profile.auth_back_to_sign_in')}
            style={{ width: 40, height: 40, marginLeft: -8, alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft size={22} color={theme.text} />
          </TouchableOpacity>

          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                <UserRound size={20} color={theme.primary} />
              </View>
              <Text
                testID={authMode === 'signIn' ? 'e2e-auth-mode-signin' : undefined}
                style={{ flex: 1, fontSize: 28, lineHeight: 34, fontWeight: '700', color: theme.text }}
              >
                {showVerificationState
                  ? t('profile.auth_check_email', 'Check your email')
                  : authMode === 'signUp'
                    ? t('profile.auth_create_account')
                    : authMode === 'forgot'
                      ? t('profile.auth_reset_password_title')
                      : t('profile.auth_sign_in')}
              </Text>
            </View>
            <Text style={{ fontSize: 14, lineHeight: 20, color: theme.textSecondary }}>
              {showVerificationState
                ? t('profile.auth_verify_email_sent')
                : authMode === 'signUp'
                  ? t('profile.auth_sign_up_subtitle', 'Create an account to sync and protect your garden data.')
                  : authMode === 'forgot'
                    ? t('profile.auth_reset_password_desc')
                    : t('profile.auth_sign_in_subtitle', 'Sign in to continue to your garden.')}
            </Text>
          </View>

          {showVerificationState ? (
            <View style={{ gap: 16 }}>
              <View style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 14, padding: 16, gap: 6 }}>
                <Text style={{ fontSize: 12, color: theme.textSecondary }}>{t('profile.email_label')}</Text>
                <Text style={{ fontSize: 15, color: theme.text, fontWeight: '600' }}>{pendingVerificationEmail}</Text>
                {authMessageIsError && authMessage && (
                  <Text testID="e2e-auth-message-error" style={{ fontSize: 12, lineHeight: 18, color: theme.warning, marginTop: 4 }}>
                    {authMessage}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={handleResendVerification}
                disabled={authLoading || verificationResent}
                style={{ backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center', opacity: authLoading || verificationResent ? 0.5 : 1 }}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                  {verificationResent ? t('profile.auth_verify_email_resent') : t('profile.auth_resend_verification')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="e2e-auth-back-to-signin"
                onPress={() => {
                  setPendingVerificationEmail(null);
                  setAuthMessage(null);
                  setAuthMessageIsError(false);
                }}
                style={{ paddingVertical: 8, alignItems: 'center' }}
              >
                <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 14 }}>{t('profile.auth_back_to_sign_in')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 16 }}>
              {(GOOGLE_OAUTH_ENABLED || e2eAuthEnabled) && authMode !== 'forgot' && (
                <>
                  <TouchableOpacity
                    onPress={handleGoogleSignIn}
                    disabled={authLoading}
                    testID="e2e-auth-google-button"
                    style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingVertical: 13, alignItems: 'center', opacity: authLoading ? 0.5 : 1 }}
                  >
                    <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14 }}>{t('profile.auth_continue_google')}</Text>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
                    <Text style={{ fontSize: 12, color: theme.textMuted }}>{t('profile.auth_or_email', 'or continue with email')}</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
                  </View>
                </>
              )}

              {authMode === 'signUp' && (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary }}>
                    {t('profile.name_label')} <Text style={{ color: theme.textMuted, fontWeight: '400' }}>{t('profile.auth_optional', '(optional)')}</Text>
                  </Text>
                  <TextInput
                    value={authName}
                    onChangeText={setAuthName}
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="next"
                    placeholder={t('profile.name_placeholder')}
                    placeholderTextColor={theme.textMuted}
                    testID="e2e-auth-name-input"
                    style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: theme.text }}
                  />
                </View>
              )}

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary }}>{t('profile.email_label')}</Text>
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
                  testID="e2e-auth-email-input"
                  style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: !authEmailOk && trimmedAuthEmail.length > 0 ? theme.warning : theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: theme.text }}
                />
              </View>

              {authMode !== 'forgot' && (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary }}>
                    {authMode === 'signUp' ? t('profile.auth_password_placeholder') : t('profile.auth_password', 'Password')}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderWidth: 1, borderColor: authMode === 'signUp' && authPassword.length > 0 && !authPasswordOk ? theme.warning : theme.border, borderRadius: 14 }}>
                    <TextInput
                      value={authPassword}
                      onChangeText={setAuthPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry={!showPassword}
                      textContentType={e2eAuthEnabled ? 'oneTimeCode' : authMode === 'signUp' ? 'newPassword' : 'password'}
                      autoComplete={e2eAuthEnabled ? 'off' : authMode === 'signUp' ? 'password-new' : 'password'}
                      returnKeyType={authMode === 'signUp' ? 'next' : 'done'}
                      placeholder={authMode === 'signUp' ? t('profile.auth_password_placeholder') : t('profile.auth_password', 'Password')}
                      placeholderTextColor={theme.textMuted}
                      testID="e2e-auth-password-input"
                      style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: theme.text }}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword((v) => !v)}
                      accessibilityLabel={showPassword ? t('profile.auth_hide_password', 'Hide password') : t('profile.auth_show_password', 'Show password')}
                      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                    >
                      {showPassword ? <EyeOff size={17} color={theme.textSecondary} /> : <Eye size={17} color={theme.textSecondary} />}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {authMode === 'signUp' && (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary }}>{t('profile.auth_confirm_password')}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderWidth: 1, borderColor: confirmTouched && !passwordsMatch ? theme.warning : theme.border, borderRadius: 14 }}>
                    <TextInput
                      value={authConfirm}
                      onChangeText={setAuthConfirm}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry={!showConfirm}
                      textContentType={e2eAuthEnabled ? 'oneTimeCode' : 'newPassword'}
                      autoComplete={e2eAuthEnabled ? 'off' : 'password-new'}
                      returnKeyType="done"
                      placeholder={t('profile.auth_confirm_password')}
                      placeholderTextColor={theme.textMuted}
                      testID="e2e-auth-confirm-input"
                      style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: theme.text }}
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirm((v) => !v)}
                      accessibilityLabel={showConfirm ? t('profile.auth_hide_password', 'Hide password') : t('profile.auth_show_password', 'Show password')}
                      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                    >
                      {showConfirm ? <EyeOff size={17} color={theme.textSecondary} /> : <Eye size={17} color={theme.textSecondary} />}
                    </TouchableOpacity>
                  </View>
                  {confirmTouched && !passwordsMatch && (
                    <Text style={{ fontSize: 12, color: theme.warning }}>{t('profile.auth_password_mismatch')}</Text>
                  )}
                </View>
              )}

              {authMessage && authMessageIsError && (
                <View
                  testID={`e2e-auth-message-${authMessageIsError ? 'error' : 'success'}`}
                  style={{ backgroundColor: authMessageIsError ? (theme.warningBg ?? '#fff7ed') : theme.card, borderWidth: 1, borderColor: authMessageIsError ? theme.warning : theme.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
                >
                  <Text style={{ fontSize: 12, lineHeight: 18, color: authMessageIsError ? theme.warning : theme.textSecondary }}>{authMessage}</Text>
                </View>
              )}

              {resetSent && !authMessageIsError && (
                <Text style={{ fontSize: 12, color: theme.textMuted, lineHeight: 18 }}>{t('profile.auth_reset_success_hint')}</Text>
              )}

              {authMode === 'signIn' && (
                <TouchableOpacity onPress={() => setAuthMode('forgot')} disabled={authLoading} style={{ alignSelf: 'flex-end', paddingVertical: 2 }}>
                  <Text style={{ fontSize: 13, color: theme.primary, fontWeight: '600' }}>{t('profile.auth_forgot_password')}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={authMode === 'forgot' ? handleForgotPassword : authMode === 'signUp' ? handleSignUp : handleSignIn}
                disabled={buttonDisabled}
                testID="e2e-auth-primary-button"
                style={{ backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: buttonDisabled ? 0.5 : 1 }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{buttonLabel()}</Text>
              </TouchableOpacity>

              {authMode === 'forgot' ? (
                <TouchableOpacity onPress={() => setAuthMode('signIn')} testID="e2e-auth-back-to-signin" style={{ paddingVertical: 8, alignItems: 'center' }}>
                  <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 14 }}>{t('profile.auth_back_to_sign_in')}</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, paddingVertical: 6 }}>
                  <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
                    {authMode === 'signUp'
                      ? t('profile.auth_already_account', 'Already have an account?')
                      : t('profile.auth_new_here', 'New to RichFarm?')}
                  </Text>
                  <TouchableOpacity
                    testID={authMode === 'signUp' ? 'e2e-auth-mode-signin' : 'e2e-auth-mode-signup'}
                    onPress={() => setAuthMode(authMode === 'signUp' ? 'signIn' : 'signUp')}
                    style={{ paddingVertical: 4 }}
                  >
                    <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 14 }}>
                      {authMode === 'signUp' ? t('profile.auth_sign_in') : t('profile.auth_sign_up')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
