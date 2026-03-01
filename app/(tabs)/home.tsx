import { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import { Bell, Droplets, Scissors, Sprout, ChevronRight, ScanSearch } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useReminders } from '../../hooks/useReminders';
import { WeatherCard } from '../../components/ui/WeatherCard';
import { useWeatherCard } from '../../hooks/useWeatherCard';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';

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
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { todayReminders, isLoading } = useReminders();
  const { model: weatherModel } = useWeatherCard();

  const displayName = user?.name || t('home.welcome_default');
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? '')
    .join('');

  const sortedToday = useMemo(() => {
    return [...todayReminders].sort((a, b) => a.nextRunAt - b.nextRunAt);
  }, [todayReminders]);

  const upcoming = sortedToday.slice(0, 6);
  const overdueCount = sortedToday.filter((r) => r.nextRunAt < Date.now()).length;
  const handleOpenAiScanner = () => {
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      Alert.alert(
        t('profile.auth_sign_in'),
        t('planning.auth_warning'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('profile.auth_sign_in'), onPress: () => router.push('/(tabs)/profile') },
        ]
      );
      return;
    }
    router.push('/(tabs)/garden?tab=planning&scanner=1');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      {/* Welcome header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 }}>
        {/* Avatar with yellow ring */}
        <View style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: '#fbbf24', padding: 2 }}>
          {user?.image ? (
            <Image
              source={{ uri: user.image }}
              style={{ width: '100%', height: '100%', borderRadius: 28 }}
            />
          ) : (
            <View style={{ flex: 1, borderRadius: 28, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: theme.primary }}>{initials}</Text>
            </View>
          )}
        </View>
        {/* Text block */}
        <View style={{ gap: 2, flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            {t('home.welcome_back')}
          </Text>
          <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>
            {displayName}
          </Text>
        </View>
        <View style={{ alignItems: 'center', gap: 3 }}>
          <TouchableOpacity
            onPress={handleOpenAiScanner}
            accessibilityLabel={t('planning.option_camera_title')}
            testID="e2e-home-ai-scanner"
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: theme.card,
              borderWidth: 1,
              borderColor: theme.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ScanSearch size={20} color={theme.primary} />
          </TouchableOpacity>
          <Text style={{ fontSize: 10, fontWeight: '700', color: theme.textSecondary }}>{t('planning.ai_scan_short')}</Text>
        </View>
      </View>

      <WeatherCard model={weatherModel} />

      <View style={{ backgroundColor: theme.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>
              {t('home.section_today')}
            </Text>
            <Text style={{ fontSize: 12, color: theme.textSecondary }}>
              {t('home.section_today_desc')}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/reminder')}>
            <Text style={{ fontSize: 12, color: theme.primary, fontWeight: '700' }}>
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
                <View
                  key={reminder._id}
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
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }} numberOfLines={1}>
                      {reminder.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                      {formatTime(reminder.nextRunAt, i18n.language)}
                      {reminder.description ? ` • ${reminder.description}` : ''}
                    </Text>
                  </View>
                  <ChevronRight size={16} stroke={theme.textMuted} />
                </View>
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

      <View style={{ backgroundColor: theme.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 6 }}>
          {t('home.quick_stats')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: theme.successBg, borderRadius: 14, padding: 12 }}>
            <Text style={{ fontSize: 12, color: theme.success, marginBottom: 4 }}>
              {t('home.stat_today')}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: theme.primary }}>{sortedToday.length}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: theme.warningBg, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: theme.warning }}>
            <Text style={{ fontSize: 12, color: theme.warning, marginBottom: 4 }}>
              {t('home.stat_overdue')}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: theme.warning }}>{overdueCount}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
