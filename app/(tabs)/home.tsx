import { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Bell, Droplets, Scissors, Sprout, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useReminders } from '../../hooks/useReminders';
import { WeatherCard } from '../../components/ui/WeatherCard';
import { useWeatherCard } from '../../hooks/useWeatherCard';
import { useAuth } from '../../lib/auth';

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
  const router = useRouter();
  const { user } = useAuth();
  const { todayReminders, isLoading } = useReminders();
  const { model: weatherModel } = useWeatherCard();

  const displayName = user?.name || t('home.welcome_default', { defaultValue: 'Gardener' });
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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#faf8f4' }} contentContainerStyle={{ padding: 16, gap: 16 }}>
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
            <View style={{ flex: 1, borderRadius: 28, backgroundColor: '#e8f5ec', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#166534' }}>{initials}</Text>
            </View>
          )}
        </View>
        {/* Text block */}
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#78716c', letterSpacing: 1.5, textTransform: 'uppercase' }}>
            {t('home.welcome_back', { defaultValue: 'Welcome back' })}
          </Text>
          <Text style={{ fontSize: 26, fontWeight: '800', color: '#1c1917', letterSpacing: -0.5 }}>
            {displayName}
          </Text>
        </View>
      </View>

      <WeatherCard model={weatherModel} />

      <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#e7e0d6', shadowColor: '#1a1a18', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#1c1917' }}>
              {t('home.section_today', { defaultValue: 'Today' })}
            </Text>
            <Text style={{ fontSize: 12, color: '#78716c' }}>
              {t('home.section_today_desc', { defaultValue: 'Watering, harvest, and care reminders.' })}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/reminder')}>
            <Text style={{ fontSize: 12, color: '#1a4731', fontWeight: '700' }}>
              {t('home.view_all', { defaultValue: 'View all' })}
            </Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#166534" />
          </View>
        ) : upcoming.length === 0 ? (
          <View style={{ paddingVertical: 20, alignItems: 'center', gap: 8 }}>
            <Bell size={28} stroke="#c4bdb3" />
            <Text style={{ fontSize: 13, color: '#a8a29e' }}>
              {t('home.empty', { defaultValue: 'No tasks due today.' })}
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
                    borderBottomColor: '#ede7dc',
                  }}
                >
                  <View style={{ width: 36, height: 36, backgroundColor: '#e8f5ec', borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={18} stroke="#166534" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#1c1917' }} numberOfLines={1}>
                      {reminder.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#78716c' }}>
                      {formatTime(reminder.nextRunAt, i18n.language)}
                      {reminder.description ? ` • ${reminder.description}` : ''}
                    </Text>
                  </View>
                  <ChevronRight size={16} stroke="#c4bdb3" />
                </View>
              );
            })}
            {sortedToday.length > upcoming.length && (
              <Text style={{ fontSize: 12, color: '#78716c', marginTop: 6 }}>
                {t('home.more_count', { defaultValue: '+{{count}} more tasks today', count: sortedToday.length - upcoming.length })}
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#e7e0d6', shadowColor: '#1a1a18', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#1c1917', marginBottom: 6 }}>
          {t('home.quick_stats', { defaultValue: 'Quick stats' })}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: '#e8f5ec', borderRadius: 14, padding: 12 }}>
            <Text style={{ fontSize: 12, color: '#166534', marginBottom: 4 }}>
              {t('home.stat_today', { defaultValue: 'Due today' })}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#1a4731' }}>{sortedToday.length}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#fff7ed', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#fed7aa' }}>
            <Text style={{ fontSize: 12, color: '#9a3412', marginBottom: 4 }}>
              {t('home.stat_overdue', { defaultValue: 'Overdue' })}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#9a3412' }}>{overdueCount}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
