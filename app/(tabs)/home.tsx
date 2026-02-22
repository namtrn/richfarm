import { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Bell, Droplets, Scissors, Sprout, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useReminders } from '../../hooks/useReminders';

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
  const { todayReminders, isLoading } = useReminders();

  const sortedToday = useMemo(() => {
    return [...todayReminders].sort((a, b) => a.nextRunAt - b.nextRunAt);
  }, [todayReminders]);

  const upcoming = sortedToday.slice(0, 6);
  const overdueCount = sortedToday.filter((r) => r.nextRunAt < Date.now()).length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f9fafb' }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={{ gap: 6 }}>
        <Text testID="e2e-home-title" style={{ fontSize: 30, fontWeight: '800', color: '#111827' }}>
          {t('home.title', { defaultValue: 'Home' })}
        </Text>
        <Text style={{ fontSize: 13, color: '#6b7280' }}>
          {t('home.subtitle', { defaultValue: 'Today’s tasks at a glance.' })}
        </Text>
      </View>

      <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#f3f4f6' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>
              {t('home.section_today', { defaultValue: 'Today' })}
            </Text>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>
              {t('home.section_today_desc', { defaultValue: 'Watering, harvest, and care reminders.' })}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/reminder')}>
            <Text style={{ fontSize: 12, color: '#16a34a', fontWeight: '700' }}>
              {t('home.view_all', { defaultValue: 'View all' })}
            </Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#16a34a" />
          </View>
        ) : upcoming.length === 0 ? (
          <View style={{ paddingVertical: 20, alignItems: 'center', gap: 8 }}>
            <Bell size={28} stroke="#d1d5db" />
            <Text style={{ fontSize: 13, color: '#9ca3af' }}>
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
                    borderBottomColor: '#f3f4f6',
                  }}
                >
                  <View style={{ width: 36, height: 36, backgroundColor: '#ecfdf3', borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={18} stroke="#16a34a" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }} numberOfLines={1}>
                      {reminder.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#6b7280' }}>
                      {formatTime(reminder.nextRunAt, i18n.language)}
                      {reminder.description ? ` • ${reminder.description}` : ''}
                    </Text>
                  </View>
                  <ChevronRight size={16} stroke="#d1d5db" />
                </View>
              );
            })}
            {sortedToday.length > upcoming.length && (
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
                {t('home.more_count', { defaultValue: '+{{count}} more tasks today', count: sortedToday.length - upcoming.length })}
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#f3f4f6' }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 6 }}>
          {t('home.quick_stats', { defaultValue: 'Quick stats' })}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: '#f0fdf4', borderRadius: 14, padding: 12 }}>
            <Text style={{ fontSize: 12, color: '#166534', marginBottom: 4 }}>
              {t('home.stat_today', { defaultValue: 'Due today' })}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#14532d' }}>{sortedToday.length}</Text>
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
