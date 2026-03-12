import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { getAuthClient } from '../lib/auth-client';
import { useTheme } from '../lib/theme';

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const token = firstParam(params.token);
  const error = firstParam(params.error);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(error ? t('profile.auth_reset_link_invalid') : null);
  const [messageIsError, setMessageIsError] = useState(Boolean(error));
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const passwordOk = password.length >= 8;
  const passwordsMatch = confirm === password;

  const setError = (msg: string) => {
    setMessage(msg);
    setMessageIsError(true);
  };

  const setSuccess = (msg: string) => {
    setMessage(msg);
    setMessageIsError(false);
  };

  const handleSubmit = async () => {
    if (!token) {
      setError(t('profile.auth_reset_link_invalid'));
      return;
    }
    if (!passwordOk) {
      setError(t('profile.auth_password_too_short'));
      return;
    }
    if (!passwordsMatch) {
      setError(t('profile.auth_password_mismatch'));
      return;
    }
    setLoading(true);
    try {
      const authClient = await getAuthClient();
      type ResetPasswordFn = (opts: { token: string; newPassword: string }) => Promise<{ error?: { message?: string } }>;
      const resetPassword = (authClient as unknown as { resetPassword?: ResetPasswordFn }).resetPassword;
      if (!resetPassword) {
        setError(t('profile.auth_reset_unavailable'));
        return;
      }
      const result = await resetPassword({
        token,
        newPassword: password,
      });
      if (result?.error) {
        setError(result.error.message ?? t('profile.auth_reset_complete_failed'));
        return;
      }
      setSuccess(t('profile.auth_password_reset_complete'));
    } catch {
      setError(t('profile.auth_err_network'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: theme.text }}>{t('profile.auth_reset_password_title')}</Text>
          <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('profile.auth_reset_password_desc')}</Text>
        </View>

        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, fontWeight: '500', color: theme.textSecondary }}>{t('profile.auth_new_password')}</Text>
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={{ paddingVertical: 2 }}>
              {showPassword ? <EyeOff size={16} color={theme.textSecondary} /> : <Eye size={16} color={theme.textSecondary} />}
            </TouchableOpacity>
          </View>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            textContentType="newPassword"
            autoComplete="password-new"
            placeholder={t('profile.auth_password_placeholder')}
            placeholderTextColor={theme.textMuted}
            style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: password.length > 0 && !passwordOk ? theme.warning : theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
          />
        </View>

        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, fontWeight: '500', color: theme.textSecondary }}>{t('profile.auth_confirm_password')}</Text>
            <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} style={{ paddingVertical: 2 }}>
              {showConfirm ? <EyeOff size={16} color={theme.textSecondary} /> : <Eye size={16} color={theme.textSecondary} />}
            </TouchableOpacity>
          </View>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry={!showConfirm}
            textContentType="newPassword"
            autoComplete="password-new"
            placeholder={t('profile.auth_confirm_password')}
            placeholderTextColor={theme.textMuted}
            style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: confirm.length > 0 && !passwordsMatch ? theme.warning : theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
          />
        </View>

        {message ? (
          <Text style={{ color: messageIsError ? theme.warning : theme.success, fontSize: 13 }}>
            {message}
          </Text>
        ) : null}

        <TouchableOpacity
          disabled={loading || !token || !passwordOk || !passwordsMatch}
          onPress={handleSubmit}
          style={{ backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: loading || !token || !passwordOk || !passwordsMatch ? 0.5 : 1 }}
        >
          <Text style={{ color: theme.card, fontWeight: '600', fontSize: 14 }}>
            {loading ? t('profile.auth_resetting_password') : t('profile.auth_set_new_password')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace('/auth')} style={{ alignItems: 'center', paddingVertical: 6 }}>
          <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '500' }}>{t('profile.auth_back_to_sign_in')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
