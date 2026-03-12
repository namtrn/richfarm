import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Bell, Droplets, Scissors, Sprout, ChevronRight, Settings } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../../../packages/convex/convex/_generated/api';
import { GardenOverviewSummary } from '../../components/garden/GardenOverviewSummary';
import { useReminders } from '../../hooks/useReminders';
import { useBeds } from '../../hooks/useBeds';
import { usePlants } from '../../hooks/usePlants';
import { useUserSettings } from '../../hooks/useUserSettings';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { APP_SCHEME, getAuthClient } from '../../lib/auth-client';
import { useWeatherCard } from '../../hooks/useWeatherCard';
import { useWeatherCardPreference } from '../../hooks/useWeatherCardPreference';
import { useAppMode } from '../../hooks/useAppMode';
import { getOnboardingFocusItems } from '../../lib/personalization';
import { WeatherCard } from '../../components/ui/WeatherCard';

const REMINDER_ICONS: Record<string, any> = {
  watering: Droplets,
  pruning: Scissors,
  fertilizing: Sprout,
  harvest: Sprout,
  custom: Bell,
  default: Bell,
};

function formatTime(value?: number, locale?: string) {
  if (!value) return '--:--';
  return new Date(value).toLocaleTimeString(locale ?? 'en', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ verifyEmail?: string; email?: string }>();
  const { user, deviceId, session, isAuthenticated } = useAuth();
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState<string>('');
  const [resendBusy, setResendBusy] = useState(false);
  const [resendCooldownActive, setResendCooldownActive] = useState(false);
  const { todayReminders, isLoading } = useReminders();
  const { beds } = useBeds();
  const { plants } = usePlants();
  const { model: weatherModel } = useWeatherCard();
  const { settings } = useUserSettings();
  const { appMode } = useAppMode();
  const {
    showWeatherCard,
    setWeatherCardVisible,
    isHydrated: isWeatherCardReady,
    isSaving: isSavingWeatherPreference,
  } = useWeatherCardPreference();
  const gardens = useQuery(api.gardens.getGardens, deviceId ? { deviceId } : 'skip') ?? [];

  const displayName = user?.name || t('home.welcome_default');
  const hasVerifyEmailParam = params.verifyEmail === '1';
  const hasSessionVerifiedFlag = typeof (session?.user as any)?.emailVerified === 'boolean';
  const needsVerifyEmailBySession = hasSessionVerifiedFlag && isAuthenticated && (session?.user as any)?.emailVerified === false;
  const shouldShowVerifyEmailWarning = isAuthenticated && (hasVerifyEmailParam || needsVerifyEmailBySession);
  const verifyEmailDisplay =
    pendingVerifyEmail ||
    (typeof params.email === 'string' && params.email.length > 0 ? params.email : '') ||
    (user?.email ?? '');

  useEffect(() => {
    let mounted = true;
    const loadPendingVerifyEmail = async () => {
      const email = await AsyncStorage.getItem('rf_pending_verify_email');
      if (!mounted) return;
      setPendingVerifyEmail(email ?? '');
    };
    void loadPendingVerifyEmail();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasSessionVerifiedFlag) return;
    if ((session?.user as any)?.emailVerified !== true) return;
    void AsyncStorage.removeItem('rf_pending_verify_email');
    setPendingVerifyEmail('');
  }, [hasSessionVerifiedFlag, session?.user]);

  useEffect(() => {
    let mounted = true;
    const checkResendCooldown = async () => {
      if (!verifyEmailDisplay) {
        if (mounted) setResendCooldownActive(false);
        return;
      }
      const key = `rf_verify_resend_last_at_${verifyEmailDisplay.toLowerCase()}`;
      const raw = await AsyncStorage.getItem(key);
      const lastAt = raw ? Number(raw) : 0;
      const cooldownMs = 24 * 60 * 60 * 1000;
      const active = Number.isFinite(lastAt) && lastAt > 0 && Date.now() - lastAt < cooldownMs;
      if (mounted) setResendCooldownActive(active);
    };
    void checkResendCooldown();
    return () => {
      mounted = false;
    };
  }, [verifyEmailDisplay]);
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? '')
    .join('');

  const sortedToday = useMemo(() => {
    return [...todayReminders].sort((a, b) => a.nextRunAt - b.nextRunAt);
  }, [todayReminders]);
  const focusItems = useMemo(() => getOnboardingFocusItems(settings?.onboarding), [settings?.onboarding]);
  const plantMap = useMemo(() => new Map((plants ?? []).map((p: any) => [String(p._id), p])), [plants]);

  const getPlantName = (reminder: any) => {
    if (!reminder?.userPlantId) return '';
    const linkedPlant = plantMap.get(String(reminder.userPlantId));
    return linkedPlant?.displayName ?? linkedPlant?.scientificName ?? '';
  };

  const getDisplayTitle = (reminder: any) => {
    const title = reminder?.title ?? '';
    const plantName = getPlantName(reminder);
    if (/^watering:\s*/i.test(title) && plantName) {
      return `${t('reminder.auto_title_watering')}: ${plantName}`;
    }
    if (/^planted:\s*/i.test(title)) {
      const name = plantName || title.replace(/^planted:\s*/i, '');
      return t('reminder.seed_title_planted', { name });
    }
    if (/^harvest:\s*/i.test(title)) {
      const name = plantName || title.replace(/^harvest:\s*/i, '');
      return t('reminder.seed_title_harvest', { name });
    }
    return title;
  };

  const upcoming = sortedToday.slice(0, 6);
  const overdueCount = sortedToday.filter((r) => r.nextRunAt < Date.now()).length;
  const growingPlants = useMemo(
    () => plants.filter((plant: any) => plant.status !== 'planning' && plant.status !== 'planting' && plant.status !== 'harvested' && plant.status !== 'archived'),
    [plants]
  );
  const unassignedPlants = useMemo(
    () => plants.filter((plant: any) => !plant.bedId && plant.status !== 'archived' && plant.status !== 'harvested'),
    [plants]
  );
  const planningPlants = useMemo(
    () => plants.filter((plant: any) => plant.status === 'planning' || plant.status === 'planting'),
    [plants]
  );
  const harvestWindowCount = useMemo(() => {
    const now = Date.now();
    const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;
    return plants.filter((plant: any) => {
      if (!plant.expectedHarvestDate) return false;
      if (plant.status === 'archived' || plant.status === 'harvested') return false;
      return plant.expectedHarvestDate >= now && plant.expectedHarvestDate <= sevenDaysFromNow;
    }).length;
  }, [plants]);

  const handleOpenReminder = (reminder: any) => {
    if (reminder?.userPlantId) {
      router.push({
        pathname: '/(tabs)/plant/[userPlantId]',
        params: {
          userPlantId: String(reminder.userPlantId),
          from: 'reminder',
        },
      });
      return;
    }
    router.push('/(tabs)/reminder');
  };

  const handleHideWeatherCard = async () => {
    try {
      await setWeatherCardVisible(false);
      Alert.alert(
        t('weather_card.hidden_title'),
        t('weather_card.hidden_message')
      );
    } catch {}
  };

  const handleResendVerifyEmailFromHome = async () => {
    if (!verifyEmailDisplay || resendBusy || resendCooldownActive) return;
    setResendBusy(true);
    try {
      const authClient = await getAuthClient();
      type SendVerificationFn = (opts: { email: string; callbackURL: string }) => Promise<{ error?: { message?: string } }>;
      const sendVerificationEmail = (authClient as unknown as { sendVerificationEmail?: SendVerificationFn }).sendVerificationEmail;
      if (!sendVerificationEmail) {
        Alert.alert(t('profile.auth_verify_email_resend_failed'));
        return;
      }
      const result = await sendVerificationEmail({
        email: verifyEmailDisplay,
        callbackURL: `${APP_SCHEME}://verify-email`,
      });
      if (result?.error) {
        Alert.alert(result.error.message ?? t('profile.auth_verify_email_resend_failed'));
        return;
      }
      const key = `rf_verify_resend_last_at_${verifyEmailDisplay.toLowerCase()}`;
      await AsyncStorage.setItem(key, String(Date.now()));
      setResendCooldownActive(true);
      Alert.alert(t('profile.auth_verify_email_resent'));
    } catch {
      Alert.alert(t('profile.auth_err_network'));
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      {/* Welcome header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 }}>
        {/* Avatar with yellow ring */}
        <View style={{ width: 64, height: 64, borderRadius: 32, position: 'relative' }}>
          {user?.image ? (
            <Image
              source={{ uri: user.image }}
              style={{ width: '100%', height: '100%', borderRadius: 32 }}
            />
          ) : (
            <View style={{ flex: 1, borderRadius: 32, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '500', color: theme.primary }}>{initials}</Text>
            </View>
          )}
          {/* Settings icon overlay */}
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/profile')}
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              backgroundColor: theme.background,
              borderRadius: 10,
              padding: 4,
            }}
          >
            <Settings size={17} color={theme.primary} />
          </TouchableOpacity>
        </View>
        {/* Text block */}
        <View style={{ gap: 2, flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: '500', color: theme.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {t('home.welcome_back')}
          </Text>
          <Text testID="e2e-home-title" style={{ fontSize: 26, fontWeight: '500', color: theme.text, letterSpacing: -0.5 }}>
            {displayName}
          </Text>
        </View>
      </View>

      {shouldShowVerifyEmailWarning ? (
        <View style={{ paddingHorizontal: 2 }}>
          <Text style={{ fontSize: 12, color: theme.warning }}>
            {verifyEmailDisplay
              ? t('home.verify_email_warning_with_email', { email: verifyEmailDisplay })
              : t('home.verify_email_warning')}
            {!resendCooldownActive && (
              <Text
                onPress={resendBusy ? undefined : handleResendVerifyEmailFromHome}
                style={{ color: theme.primary, fontWeight: '500', opacity: resendBusy ? 0.5 : 1 }}
              >
                {' '}
                {resendBusy ? t('profile.auth_sending_reset') : t('profile.auth_resend_verification')}
              </Text>
            )}
          </Text>
        </View>
      ) : null}

      {isWeatherCardReady && showWeatherCard ? (
        <WeatherCard
          model={weatherModel}
          onHide={handleHideWeatherCard}
          isHiding={isSavingWeatherPreference}
        />
      ) : null}

      {focusItems.length > 0 ? (
        <View style={{ paddingHorizontal: 2, gap: 10 }}>
          <View>
            <Text style={{ fontSize: 16, fontWeight: '500', color: theme.text }}>
              {t('home.focus_title')}
            </Text>
            <Text style={{ fontSize: 12, color: theme.textSecondary }}>
              {t('home.focus_desc')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {focusItems.map((item) => (
              <View
                key={`${item.kind}:${item.id}`}
                style={{
                  backgroundColor: item.kind === 'goal' ? theme.successBg : theme.accent,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderWidth: 1,
                  borderColor: item.kind === 'goal' ? theme.primary : theme.border,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '500', color: theme.text }}>
                  {t(item.labelKey)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 2 }}>
        <GardenOverviewSummary
          gardensCount={gardens.length}
          bedsCount={beds.length}
          growingCount={growingPlants.length}
          dueTodayCount={sortedToday.length}
          harvestWindowCount={harvestWindowCount}
          unassignedCount={unassignedPlants.length}
          planningCount={planningPlants.length}
          appMode={appMode}
        />
      </View>

      <View style={{ paddingHorizontal: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: 16, fontWeight: '500', color: theme.text }}>
              {t('home.section_today')}
            </Text>
            <Text style={{ fontSize: 12, color: theme.textSecondary }}>
              {t('home.section_today_desc')}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/reminder')}>
            <Text style={{ fontSize: 12, color: theme.primary, fontWeight: '500' }}>
              {t('home.view_all')}
            </Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        ) : upcoming.length === 0 ? (
          <View style={{ paddingVertical: 20, alignItems: 'center', gap: 8 }}>
            <Bell size={28} stroke={theme.textMuted} />
            <Text style={{ fontSize: 13, color: theme.textMuted }}>
              {t('home.empty')}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10, marginTop: 12 }}>
            {upcoming.map((reminder) => {
              const Icon = REMINDER_ICONS[reminder.type] ?? REMINDER_ICONS.default;
              return (
                <TouchableOpacity
                  key={reminder._id}
                  onPress={() => handleOpenReminder(reminder)}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                  }}
                >
                  <View style={{ width: 36, height: 36, backgroundColor: theme.accent, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={18} stroke={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: theme.text }} numberOfLines={1}>
                      {getDisplayTitle(reminder)}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                      {formatTime(reminder.nextRunAt, i18n.language)}
                      {reminder.description ? ` • ${reminder.description}` : ''}
                    </Text>
                  </View>
                  <ChevronRight size={16} stroke={theme.textMuted} />
                </TouchableOpacity>
              );
            })}
            {sortedToday.length > upcoming.length && (
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 6 }}>
                {t('home.more_count', { count: sortedToday.length - upcoming.length })}
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: 2 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: theme.text, marginBottom: 6 }}>
          {t('home.quick_stats')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: theme.successBg, borderRadius: 14, padding: 12 }}>
            <Text style={{ fontSize: 12, color: theme.success, marginBottom: 4 }}>
              {t('home.stat_today')}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '500', color: theme.primary }}>{sortedToday.length}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: theme.warningBg, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: theme.warning }}>
            <Text style={{ fontSize: 12, color: theme.warning, marginBottom: 4 }}>
              {t('home.stat_overdue')}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '500', color: theme.warning }}>{overdueCount}</Text>
          </View>
        </View>
      </View>

    </ScrollView>
  );
}
