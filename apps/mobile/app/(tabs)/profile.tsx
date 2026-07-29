import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Pressable, Alert, Linking, AppState, Image, Dimensions } from 'react-native';
import { UserRound, Globe, Clock, Save, Ruler, ChevronDown, ChevronUp, Check, Sun, Moon, Monitor, Crown, CloudSun, Lock, Bell, Mail, Bug, FileText, Shield, Eye, EyeOff, Sprout, Cloud } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'convex/react';
import { api } from '../../../../packages/convex/convex/_generated/api';
import { useAuth } from '../../lib/auth';
import { clearSyncNamespace, loadSyncQueue } from '../../lib/sync/queue';
import { useSyncExecutor } from '../../lib/sync/useSyncExecutor';
import { useUserSettings } from '../../hooks/useUserSettings';
import { useSubscription } from '../../hooks/useSubscription';
import { usePaywall } from '../../hooks/usePaywall';
import { resolveUnitSystem, UnitSystem } from '../../lib/units';
import { getLocales } from 'expo-localization';
import { getAuthClient } from '../../lib/auth-client';
import { clearCachedCurrentUser } from '../../lib/authCache';
import { useTheme } from '../../lib/theme';
import { useThemeContext } from '../../lib/ThemeContext';
import type { ThemePreference } from '../../lib/ThemeContext';
import { usePathname, useRouter } from 'expo-router';
import { useAppMode } from '../../hooks/useAppMode';
import { useWeatherCardPreference } from '../../hooks/useWeatherCardPreference';
import { type AppMode } from '../../lib/appMode';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { TimezoneModal } from '../../components/ui/TimezoneModal';
import { useReminders } from '../../hooks/useReminders';
import { useLocalSearchParams } from 'expo-router';
import { useLocalSyncIdentity } from '../../lib/sync/identity';

const CLOUD_BACKUP_PROVIDER = process.env.EXPO_PUBLIC_CLOUD_BACKUP_PROVIDER;

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
];

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { themePreference, setThemePreference: setGlobalTheme } = useThemeContext();
  const { user, session, isAuthenticated, deviceId, updateProfile, isLoading } = useAuth();
  const { identity: syncIdentity } = useLocalSyncIdentity();
  const { execute: executeSyncNow } = useSyncExecutor();
  const { settings, updateSettings, isLoading: isSettingsLoading } = useUserSettings();
  const { appMode, switchMode, isLoading: isAppModeLoading } = useAppMode();
  const { isPremium, isConfigured: isSubConfigured, isLoading: isSubLoading, restorePurchases } = useSubscription();
  const { presentPaywall, isPresenting } = usePaywall();
  const deleteAccountMutation = useMutation((api as any).users.deleteAccount);
  const router = useRouter();
  const pathname = usePathname();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const gardenCheckY = useRef(0);
  const preferencesY = useRef(0);
  const preferencesContentY = useRef(0);
  const { reminders, createReminder } = useReminders();
  const [gardenCheckSaving, setGardenCheckSaving] = useState(false);
  const hasGardenCheckReminder = useMemo(
    () => reminders.some((reminder: any) => reminder.type === 'garden_check' && reminder.enabled),
    [reminders]
  );

  const currentLang = (i18n.language ?? 'en').split('-')[0].toLowerCase();
  const [name, setName] = useState(user?.name ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? '');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(
    resolveUnitSystem(settings?.unitSystem ?? undefined, currentLang, getLocales()[0]?.regionCode ?? undefined)
  );
  const [temperatureUnit, setTemperatureUnit] = useState<'C' | 'F'>(settings?.temperatureUnit === 'F' ? 'F' : 'C');
  const [localThemePref, setLocalThemePref] = useState<ThemePreference>(settings?.theme ?? 'system');
  const [saving, setSaving] = useState(false);
  const sessionUser = session?.user as { name?: string; email?: string; image?: string } | undefined;
  const isAnonymous = !isAuthenticated;
  const displayName = isAnonymous
    ? t('profile.anonymous')
    : (user?.name || sessionUser?.name || t('home.welcome_default'));
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? '')
    .join('');
  const [backupCount, setBackupCount] = useState(0);
  const [backingUp, setBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const isCloudBackupLinked = !!CLOUD_BACKUP_PROVIDER;
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [paywallMessage, setPaywallMessage] = useState<string | null>(null);
  const [switchingMode, setSwitchingMode] = useState(false);
  const { showWeatherCard, setWeatherCardVisible, isSaving: isUpdatingWeatherCard } = useWeatherCardPreference();
  const [timezoneModalOpen, setTimezoneModalOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [gardenCheckMenuOpen, setGardenCheckMenuOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState(0);
  const settingsPagerRef = useRef<ScrollView>(null);
  const settingsPageWidth = Dimensions.get('window').width;

  const closePreferenceMenus = useCallback(() => {
    setLanguageMenuOpen(false);
    setThemeMenuOpen(false);
    setGardenCheckMenuOpen(false);
  }, []);

  // Change password
  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [changePwMessage, setChangePwMessage] = useState<string | null>(null);

  // Notification permission
  const [notifStatus, setNotifStatus] = useState<'enabled' | 'provisional' | 'denied' | 'undetermined'>('undetermined');

  const email = user?.email ?? sessionUser?.email ?? '—';
  const appVersion = Constants.expoConfig?.version ?? Constants.manifest?.version ?? '—';
  const selectedLang = useMemo(
    () => LANGUAGES.find((l) => l.code === currentLang) ?? LANGUAGES[0],
    [currentLang]
  );

  useEffect(() => {
    setName(user?.name ?? '');
    setTimezone(user?.timezone ?? '');
  }, [user?.name, user?.timezone]);

  useEffect(() => {
    if (section !== 'garden-check') return;
    const timer = setTimeout(() => scrollRef.current?.scrollTo({ y: gardenCheckY.current, animated: true }), 100);
    return () => clearTimeout(timer);
  }, [section]);

  const handleCreateGardenCheck = async (intervalDays: number) => {
    if (gardenCheckSaving || hasGardenCheckReminder) return;
    setGardenCheckSaving(true);
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(8, 0, 0, 0);
      await createReminder({
        type: 'garden_check',
        title: t('reminder.garden_check_title'),
        description: t('reminder.garden_check_desc'),
        nextRunAt: tomorrow.getTime(),
        rrule: `FREQ=DAILY;INTERVAL=${intervalDays}`,
      });
    } finally {
      setGardenCheckSaving(false);
    }
  };

  const refreshBackupCount = useCallback(async () => {
    const queue = await loadSyncQueue();
    setBackupCount(queue.filter((item) => item.type === 'photo').length);
  }, []);

  useEffect(() => {
    refreshBackupCount();
  }, [refreshBackupCount]);

  const refreshNotificationStatus = useCallback(async () => {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.granted) {
      setNotifStatus('enabled');
      return;
    }
    if (perm.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
      setNotifStatus('provisional');
      return;
    }
    if (perm.status === Notifications.PermissionStatus.DENIED) {
      setNotifStatus('denied');
      return;
    }
    setNotifStatus('undetermined');
  }, []);

  useEffect(() => {
    void refreshNotificationStatus();
  }, [refreshNotificationStatus]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshNotificationStatus();
      }
    });
    return () => subscription.remove();
  }, [refreshNotificationStatus]);

  useEffect(() => {
    setUnitSystem(resolveUnitSystem(settings?.unitSystem ?? undefined, currentLang, getLocales()[0]?.regionCode ?? undefined));
    // Note: themePreference local state is only used for the unit/save flow;
    // the live theme is controlled by ThemeContext (already synced there).
    setLocalThemePref(
      settings?.theme === 'light' || settings?.theme === 'dark' ? settings.theme : 'system'
    );
    setTemperatureUnit(settings?.temperatureUnit === 'F' ? 'F' : 'C');
  }, [settings?.unitSystem, settings?.temperatureUnit, settings?.theme, currentLang]);

  const handleLanguageChange = async (code: string) => {
    if (code === currentLang) return;
    i18n.changeLanguage(code);
    await updateProfile({ locale: code });
  };

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('profile.avatar_permission_title', 'Photo access needed'), t('profile.avatar_permission_desc', 'Allow photo access to choose a profile picture.'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    const uri = result.canceled ? undefined : result.assets?.[0]?.uri;
    if (uri) await updateProfile({ avatarUrl: uri });
  };

  const goToSettingsPage = (page: number) => {
    closePreferenceMenus();
    setSettingsPage(page);
    settingsPagerRef.current?.scrollTo({ x: page * settingsPageWidth, animated: true });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        name: name.trim() || undefined,
        locale: currentLang,
        timezone: timezone.trim() || undefined,
      });
      await updateSettings({ unitSystem, temperatureUnit, theme: localThemePref });
    } finally {
      setSaving(false);
    }
  };

  const handleWeatherCardVisibility = async (nextValue: boolean) => {
    if (nextValue === showWeatherCard) return;
    try {
      await setWeatherCardVisible(nextValue);
    } catch { }
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

  const handleSignOut = async () => {
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const authClient = await getAuthClient();
      const result = await authClient.signOut();
      if (result.error) {
        setAuthMessage(result.error.message ?? t('profile.auth_sign_out_failed'));
        return;
      }
      await clearCachedCurrentUser(deviceId);
      router.replace({ pathname: '/auth', params: { returnTo: '/' } });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPw.length < 8) return;
    setChangePwLoading(true);
    setChangePwMessage(null);
    try {
      const authClient = await getAuthClient();
      const result = await (authClient as any).changePassword({
        currentPassword: currentPw,
        newPassword: newPw,
      });
      if (result?.error) {
        setChangePwMessage(result.error.message ?? t('profile.change_password_failed'));
        return;
      }
      setChangePwMessage(t('profile.change_password_success'));
      setCurrentPw('');
      setNewPw('');
      setShowChangePw(false);
    } catch (error) {
      setChangePwMessage(error instanceof Error ? error.message : t('profile.change_password_failed'));
    } finally {
      setChangePwLoading(false);
    }
  };

  const handleEnableNotifications = async () => {
    await Notifications.requestPermissionsAsync();
    await refreshNotificationStatus();
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
              const authClient = await getAuthClient();
              await deleteAccountMutation({});
              if (syncIdentity?.kind === 'account') {
                await clearSyncNamespace(syncIdentity.scopeKey);
              }
              await authClient.signOut();
              await clearCachedCurrentUser(deviceId, { includeOnboarding: true });
              router.replace({ pathname: '/auth', params: { returnTo: '/' } });
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

  const handleSwitchMode = (nextMode: AppMode) => {
    if (nextMode === appMode) return;
    const modeLabel = nextMode === 'gardener' ? t('profile.mode_gardener') : t('profile.mode_farmer');
    Alert.alert(
      t('profile.switch_mode_title', { mode: modeLabel }),
      t('profile.switch_mode_desc'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: async () => {
            setSwitchingMode(true);
            try {
              await switchMode(nextMode);
            } finally {
              setSwitchingMode(false);
            }
          },
        },
      ]
    );
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
      ref={scrollRef}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 16 }}
    >
      <View style={{ gap: 14 }}>
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text }}>{t('profile.settings_title', 'Settings')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {[t('profile.settings_profile', 'Profile'), t('profile.settings_appearance', 'Appearance'), t('profile.settings_garden', 'Garden & App'), t('profile.settings_more', 'More')].map((label, index) => (
              <TouchableOpacity key={label} onPress={() => goToSettingsPage(index)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: settingsPage === index ? theme.primary : theme.accent }}>
                <Text style={{ color: settingsPage === index ? '#fff' : theme.textSecondary, fontWeight: '700', fontSize: 13 }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            {[0, 1, 2, 3].map((page) => <View key={page} style={{ width: page === settingsPage ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: page === settingsPage ? theme.primary : theme.border }} />)}
          </View>
        </View>
        <ScrollView
          ref={settingsPagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          onMomentumScrollEnd={(event) => {
            closePreferenceMenus();
            setSettingsPage(Math.round(event.nativeEvent.contentOffset.x / settingsPageWidth));
          }}
          style={{ marginHorizontal: -16 }}
        >
          <View style={{ width: settingsPageWidth, paddingHorizontal: 16, gap: 16 }}>
        <View style={{ paddingHorizontal: 2, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={handlePickAvatar} accessibilityLabel={t('profile.change_avatar', 'Change avatar')} style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.accent, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              {(user?.image || user?.avatarUrl || sessionUser?.image) ? (
                <Image source={{ uri: user?.image || user?.avatarUrl || sessionUser?.image }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <Text style={{ fontSize: 20, fontWeight: '500', color: theme.primary }}>{initials}</Text>
              )}
            </TouchableOpacity>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text }}>
                {isAnonymous ? t('profile.not_signed_in') : (user?.name || sessionUser?.name || t('profile.user_section'))}
              </Text>
              {!isAnonymous && (
                <Text testID="e2e-profile-signed-in-email" style={{ fontSize: 13, color: theme.textSecondary }}>{email}</Text>
              )}
              {isAnonymous && (
                <Text style={{ fontSize: 13, color: theme.textSecondary }}>{t('profile.auth_create_to_sync')}</Text>
              )}
            </View>
          </View>
          {isAnonymous ? (
            <View style={{ gap: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  setAuthMessage(null);
                  router.push({ pathname: '/auth', params: { returnTo: pathname } });
                }}
                testID="e2e-profile-auth-cta"
                style={{ backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('profile.auth_sign_in_or_create')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {authMessage && <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 12 }}>{authMessage}</Text>}
              <TouchableOpacity
                onPress={handleSignOut}
                disabled={authLoading}
                testID="e2e-profile-sign-out"
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

        <View style={{ paddingHorizontal: 2, gap: 14 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('profile.subscription_title')}</Text>
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

          </View>
          <View style={{ width: settingsPageWidth, paddingHorizontal: 16, gap: 16 }}>

        {/* ── Preferences ─────────────────────────────────── */}
        <View
          onLayout={(event) => { preferencesY.current = event.nativeEvent.layout.y; }}
          style={{ paddingHorizontal: 2, gap: 10, position: 'relative' }}
        >
          {(languageMenuOpen || themeMenuOpen || gardenCheckMenuOpen) && (
            <Pressable
              accessibilityLabel={t('common.close', 'Close')}
              onPress={closePreferenceMenus}
              style={{ position: 'absolute', top: 0, left: -16, right: -16, bottom: 0, zIndex: 5 }}
            />
          )}
          <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text }}>{t('profile.preferences_title')}</Text>
          <View
            onLayout={(event) => { preferencesContentY.current = event.nativeEvent.layout.y; }}
            style={{ gap: 16, paddingVertical: 4 }}
          >

            {/* Language */}
            <View style={{ zIndex: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Globe size={20} color={theme.primary} />
                  <Text style={{ fontSize: 16, color: theme.text }}>{t('profile.language_label')}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const shouldOpen = !languageMenuOpen;
                    closePreferenceMenus();
                    setLanguageMenuOpen(shouldOpen);
                  }}
                  testID="e2e-profile-language-selector"
                  style={{ backgroundColor: theme.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: theme.border }}
                >
                  <Text style={{ fontSize: 16 }}>{selectedLang.flag}</Text>
                  <Text style={{ fontSize: 14, color: theme.text }}>{selectedLang.label}</Text>
                  <Check size={14} color={theme.success} />
                </TouchableOpacity>
              </View>
              {languageMenuOpen && (
                <View style={{ position: 'absolute', top: 40, right: 0, width: 180, backgroundColor: theme.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.border, zIndex: 1000, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 }}>
                  {LANGUAGES.map((lang, index) => {
                    const active = lang.code === currentLang;
                    return (
                      <TouchableOpacity
                        key={lang.code}
                        onPress={async () => {
                          setLanguageMenuOpen(false);
                          await handleLanguageChange(lang.code);
                        }}
                        style={{ paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: index === LANGUAGES.length - 1 ? 0 : 1, borderColor: theme.accent }}
                      >
                        <Text style={{ fontSize: 18 }}>{lang.flag}</Text>
                        <Text style={{ flex: 1, fontSize: 14, fontWeight: active ? '700' : '400', color: active ? theme.success : theme.text }}>
                          {lang.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
            {/* Timezone */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Clock size={20} color={theme.primary} />
                <Text style={{ fontSize: 16, color: theme.text }}>{t('profile.timezone_label')}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setTimezoneModalOpen(true)}
                testID="e2e-profile-timezone-selector"
                style={{
                  backgroundColor: theme.card,
                  borderRadius: 20,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderWidth: 1,
                  borderColor: theme.border,
                  minWidth: 140,
                  alignItems: 'flex-end',
                }}
              >
                <Text style={{ fontSize: 14, color: timezone ? theme.text : theme.textMuted }}>
                  {timezone ? timezone.replace(/_/g, ' ') : t('profile.timezone_placeholder')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Units */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Sprout size={20} color={theme.primary} />
                <Text style={{ fontSize: 16, color: theme.text }}>{t('profile.units_label')}</Text>
              </View>
              <View style={{ flexDirection: 'row', backgroundColor: theme.accent, borderRadius: 20, padding: 2, gap: 4 }}>
                {(['metric', 'imperial'] as UnitSystem[]).map((unit) => {
                  const active = unit === unitSystem;
                  return (
                    <TouchableOpacity
                      key={unit}
                      testID={`e2e-profile-unit-${unit}`}
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        setUnitSystem(unit);
                        void updateSettings({ unitSystem: unit });
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 4,
                        borderRadius: 18,
                        backgroundColor: active ? theme.primary : 'transparent',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: active ? '600' : '400', color: active ? 'white' : theme.textSecondary }}>
                        {unit === 'metric' ? t('profile.unit_metric') : t('profile.unit_imperial')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Temperature unit */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <CloudSun size={20} color={theme.primary} />
                <Text style={{ fontSize: 16, color: theme.text }}>{t('profile.temperature_unit_label')}</Text>
              </View>
              <View style={{ flexDirection: 'row', backgroundColor: theme.accent, borderRadius: 20, padding: 2, gap: 4 }}>
                {(['C', 'F'] as const).map((unit) => {
                  const active = unit === temperatureUnit;
                  return (
                    <TouchableOpacity
                      key={unit}
                      onPress={() => setTemperatureUnit(unit)}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 4,
                        borderRadius: 18,
                        backgroundColor: active ? theme.primary : 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: active ? '600' : '400', color: active ? 'white' : theme.textSecondary }}>
                        °{unit}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Weather Card */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Cloud size={20} color={theme.primary} />
                <Text style={{ fontSize: 16, color: theme.text }}>{t('profile.weather_card_title')}</Text>
              </View>
              <View style={{ flexDirection: 'row', backgroundColor: theme.accent, borderRadius: 20, padding: 2, gap: 4 }}>
                {[
                  { value: true, label: t('profile.weather_card_show') },
                  { value: false, label: t('profile.weather_card_hide') },
                ].map((item) => {
                  const active = item.value === showWeatherCard;
                  return (
                    <TouchableOpacity
                      key={item.label}
                      testID={`e2e-profile-weather-${item.value ? 'show' : 'hide'}`}
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        void handleWeatherCardVisibility(item.value);
                      }}
                      disabled={isSettingsLoading || isUpdatingWeatherCard}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 4,
                        borderRadius: 18,
                        backgroundColor: active ? theme.primary : 'transparent',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        opacity: isSettingsLoading || isUpdatingWeatherCard ? 0.6 : 1,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: active ? '600' : '400', color: active ? 'white' : theme.textSecondary }}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Notifications */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Bell size={20} color={theme.primary} />
                <Text style={{ fontSize: 16, color: theme.text }}>{t('profile.notifications_title')}</Text>
              </View>
              <View style={{ flexDirection: 'row', backgroundColor: theme.accent, borderRadius: 20, padding: 2, gap: 4 }}>
                {[
                  { value: true, label: 'On' },
                  { value: false, label: 'Off' },
                ].map((item) => {
                  const isActuallyEnabled = notifStatus === 'enabled' || notifStatus === 'provisional';
                  const active = item.value === isActuallyEnabled;
                  return (
                    <TouchableOpacity
                      key={item.label}
                      onPress={() => {
                        if (item.value) {
                          if (notifStatus === 'denied') {
                            Linking.openSettings();
                          } else {
                            handleEnableNotifications();
                          }
                        } else {
                          // Note: You can't programmatically "disable" permissions on iOS easily,
                          // but we could just show an alert or hide it.
                          // For now, let's just make it do nothing or open settings.
                          if (isActuallyEnabled) {
                            Linking.openSettings();
                          }
                        }
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 4,
                        borderRadius: 18,
                        backgroundColor: active ? theme.primary : 'transparent',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: active ? '600' : '400', color: active ? 'white' : theme.textSecondary }}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Garden check */}
            <View
              onLayout={(event) => {
                gardenCheckY.current = preferencesY.current + preferencesContentY.current + event.nativeEvent.layout.y;
              }}
              style={{ gap: 8, paddingTop: 4, zIndex: 20 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Sprout size={20} color={theme.primary} />
                  <Text style={{ fontSize: 16, color: theme.text }}>{t('reminder.garden_check_title')}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const shouldOpen = !gardenCheckMenuOpen;
                    closePreferenceMenus();
                    setGardenCheckMenuOpen(shouldOpen);
                  }}
                  disabled={hasGardenCheckReminder}
                  style={{ backgroundColor: theme.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: theme.border, opacity: hasGardenCheckReminder ? 0.8 : 1 }}
                >
                  <Text style={{ fontSize: 14, color: hasGardenCheckReminder ? theme.success : theme.textSecondary }}>
                    {hasGardenCheckReminder ? t('reminder.ritual_active') : t('reminder.ritual_not_set', 'Not set')}
                  </Text>
                  {!hasGardenCheckReminder && (gardenCheckMenuOpen ? <ChevronUp size={14} color={theme.textSecondary} /> : <ChevronDown size={14} color={theme.textSecondary} />)}
                </TouchableOpacity>
              </View>
              {gardenCheckMenuOpen && !hasGardenCheckReminder && (
                <View style={{ position: 'absolute', top: 38, right: 0, width: 180, backgroundColor: theme.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.border, zIndex: 1000, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 }}>
                  {[{ days: 1, label: t('reminder.ritual_daily') }, { days: 7, label: t('reminder.ritual_weekly') }].map((option, index, items) => (
                    <TouchableOpacity
                      key={option.days}
                      disabled={gardenCheckSaving}
                      onPress={() => { setGardenCheckMenuOpen(false); void handleCreateGardenCheck(option.days); }}
                      style={{ paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: index === items.length - 1 ? 0 : 1, borderColor: theme.accent, opacity: gardenCheckSaving ? 0.6 : 1 }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Theme (Appearance) */}
            <View style={{ zIndex: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {themePreference === 'light' ? <Sun size={20} color={theme.primary} /> : themePreference === 'dark' ? <Moon size={20} color={theme.primary} /> : <Monitor size={20} color={theme.primary} />}
                  <Text style={{ fontSize: 16, color: theme.text }}>{t('profile.theme_title', 'Theme')}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const shouldOpen = !themeMenuOpen;
                    closePreferenceMenus();
                    setThemeMenuOpen(shouldOpen);
                  }}
                  accessibilityLabel={t('profile.theme_title', 'Theme')}
                  style={{ backgroundColor: theme.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: theme.border }}
                >
                  {themePreference === 'light' ? <Sun size={16} color={theme.primary} /> : themePreference === 'dark' ? <Moon size={16} color={theme.primary} /> : <Monitor size={16} color={theme.primary} />}
                  <Text style={{ fontSize: 14, color: theme.text }}>
                    {themePreference === 'light' ? t('profile.theme_light') : themePreference === 'dark' ? t('profile.theme_dark') : t('profile.theme_system')}
                  </Text>
                  {themeMenuOpen ? <ChevronUp size={14} color={theme.textSecondary} /> : <ChevronDown size={14} color={theme.textSecondary} />}
                </TouchableOpacity>
              </View>
              {themeMenuOpen && (
                <View style={{ position: 'absolute', top: 38, right: 0, width: 180, backgroundColor: theme.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.border, zIndex: 1000, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 }}>
                  {[
                    { id: 'light', label: t('profile.theme_light'), icon: Sun },
                    { id: 'dark', label: t('profile.theme_dark'), icon: Moon },
                    { id: 'system', label: t('profile.theme_system'), icon: Monitor },
                  ].map((item, index, items) => {
                    const active = item.id === themePreference;
                    const Icon = item.icon;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        testID={`e2e-profile-theme-${item.id}`}
                        accessibilityState={{ selected: active }}
                        onPress={() => {
                          setLocalThemePref(item.id as ThemePreference);
                          setGlobalTheme(item.id as 'light' | 'dark' | 'system');
                          setThemeMenuOpen(false);
                        }}
                        style={{ paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: index === items.length - 1 ? 0 : 1, borderColor: theme.accent }}
                      >
                        <Icon size={18} color={active ? theme.primary : theme.textSecondary} />
                        <Text style={{ flex: 1, fontSize: 14, fontWeight: active ? '700' : '400', color: active ? theme.primary : theme.text }}>{item.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        </View>

          </View>
          <View style={{ width: settingsPageWidth, paddingHorizontal: 16, gap: 16 }}>




        <View style={{ paddingHorizontal: 2, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('profile.app_mode')}</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4 }}>
                {appMode === 'gardener' ? t('profile.mode_gardener_desc') : t('profile.mode_farmer_desc')}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['gardener', 'farmer'] as AppMode[]).map((mode) => {
              const active = mode === appMode;
              return (
                <TouchableOpacity
                  key={mode}
                  onPress={() => handleSwitchMode(mode)}
                  testID={`e2e-profile-mode-${mode}`}
                  accessibilityState={{ selected: active }}
                  disabled={switchingMode || isAppModeLoading}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 16,
                    backgroundColor: active ? theme.primary : theme.accent,
                    borderWidth: 1,
                    borderColor: active ? theme.primary : theme.border,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : theme.textSecondary }}>
                    {mode === 'gardener' ? t('profile.mode_gardener') : t('profile.mode_farmer')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

          </View>
          <View style={{ width: settingsPageWidth, paddingHorizontal: 16, gap: 16 }}>

        <View style={{ paddingHorizontal: 2, gap: 14 }}>
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
            <Text style={{ color: theme.background, fontWeight: '700', fontSize: 14 }}>
              {isCloudBackupLinked ? t('profile.backup_button') : t('profile.backup_link_button')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Change Password ─────────────────────────────── */}
        {!isAnonymous && (
          <View style={{ paddingHorizontal: 2, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: theme.text }}>{t('profile.change_password_title')}</Text>
              <TouchableOpacity onPress={() => { setShowChangePw((v) => !v); setChangePwMessage(null); }}>
                {showChangePw ? <ChevronUp size={18} color={theme.textSecondary} /> : <ChevronDown size={18} color={theme.textSecondary} />}
              </TouchableOpacity>
            </View>
            {showChangePw && (
              <View style={{ gap: 10 }}>
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>{t('profile.change_password_current')}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14 }}>
                    <TextInput
                      testID="e2e-profile-current-password"
                      value={currentPw}
                      onChangeText={setCurrentPw}
                      secureTextEntry={!showCurrentPw}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="••••••••"
                      placeholderTextColor={theme.textMuted}
                      style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                    />
                    <TouchableOpacity onPress={() => setShowCurrentPw((v) => !v)} style={{ paddingHorizontal: 12 }}>
                      {showCurrentPw ? <EyeOff size={16} color={theme.textSecondary} /> : <Eye size={16} color={theme.textSecondary} />}
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>{t('profile.change_password_new')}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.background, borderWidth: 1, borderColor: newPw.length > 0 && newPw.length < 8 ? theme.warning ?? '#f59e0b' : theme.border, borderRadius: 14 }}>
                    <TextInput
                      testID="e2e-profile-new-password"
                      value={newPw}
                      onChangeText={setNewPw}
                      secureTextEntry={!showNewPw}
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="newPassword"
                      placeholder="••••••••"
                      placeholderTextColor={theme.textMuted}
                      style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                    />
                    <TouchableOpacity onPress={() => setShowNewPw((v) => !v)} style={{ paddingHorizontal: 12 }}>
                      {showNewPw ? <EyeOff size={16} color={theme.textSecondary} /> : <Eye size={16} color={theme.textSecondary} />}
                    </TouchableOpacity>
                  </View>
                </View>
                {changePwMessage && <Text style={{ fontSize: 12, color: theme.textSecondary }}>{changePwMessage}</Text>}
                <TouchableOpacity
                  onPress={handleChangePassword}
                  disabled={changePwLoading || currentPw.length === 0 || newPw.length < 8}
                  style={{ backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: changePwLoading || currentPw.length === 0 || newPw.length < 8 ? 0.5 : 1 }}
                >
                  <Text style={{ color: theme.background, fontWeight: '700', fontSize: 14 }}>{t('profile.change_password_save')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}


        {/* ── Support ──────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 2, gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('profile.support_title')}</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('mailto:support@richfarm.app')}
            style={{ backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
          >
            <Mail size={16} color={theme.textSecondary} />
            <Text style={{ color: theme.textSecondary, fontWeight: '700', fontSize: 14 }}>{t('profile.support_contact')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://github.com/namtrn/richfarm/issues')}
            style={{ backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
          >
            <Bug size={16} color={theme.textSecondary} />
            <Text style={{ color: theme.textSecondary, fontWeight: '700', fontSize: 14 }}>{t('profile.support_report_bug')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Legal + App Version ───────────────────────────── */}
        <View style={{ paddingHorizontal: 2, gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('profile.legal_title')}</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://richfarm.app/privacy')}
            style={{ backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
          >
            <Shield size={16} color={theme.textSecondary} />
            <Text style={{ color: theme.textSecondary, fontWeight: '700', fontSize: 14 }}>{t('profile.legal_privacy')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://richfarm.app/terms')}
            style={{ backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
          >
            <FileText size={16} color={theme.textSecondary} />
            <Text style={{ color: theme.textSecondary, fontWeight: '700', fontSize: 14 }}>{t('profile.legal_terms')}</Text>
          </TouchableOpacity>
          <Text style={{ textAlign: 'center', fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
            {t('profile.app_version', { version: appVersion })}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || isLoading || isSettingsLoading}
          testID="e2e-profile-save-settings"
          style={{ backgroundColor: theme.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: saving || isLoading || isSettingsLoading ? 0.5 : 1, marginTop: 8 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Save size={20} color={theme.background} />
            <Text style={{ color: theme.background, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 }}>{t('profile.save_settings')}</Text>
          </View>
        </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
      <TimezoneModal
        visible={timezoneModalOpen}
        onClose={() => setTimezoneModalOpen(false)}
        selectedTimezone={timezone}
        onSelect={async (tz) => {
          setTimezone(tz);
          await updateProfile({ timezone: tz });
        }}
      />
    </ScrollView>
  );
}
