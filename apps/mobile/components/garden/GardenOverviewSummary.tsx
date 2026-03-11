import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fence, Leaf, Sprout, Calendar } from 'lucide-react-native';
import { useTheme } from '../../lib/theme';

export function GardenOverviewSummary({
  gardensCount,
  bedsCount,
  growingCount,
  dueTodayCount,
  harvestWindowCount,
  unassignedCount,
  planningCount,
  appMode = 'farmer',
}: {
  gardensCount: number;
  bedsCount: number;
  growingCount: number;
  dueTodayCount: number;
  harvestWindowCount: number;
  unassignedCount: number;
  planningCount: number;
  appMode?: 'gardener' | 'farmer';
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  const metrics = [
    { key: 'gardens', label: t('garden.metric_gardens'), value: gardensCount, icon: Fence, tone: theme.primary, background: theme.accent },
    { key: 'beds', label: t('garden.metric_beds'), value: bedsCount, icon: Leaf, tone: theme.success, background: theme.successBg },
    { key: 'growing', label: t('garden.metric_growing'), value: growingCount, icon: Sprout, tone: theme.primary, background: theme.accent },
    { key: 'dueToday', label: t('garden.metric_due_today'), value: dueTodayCount, icon: Calendar, tone: theme.warning, background: theme.warningBg },
  ].filter((metric) => {
    if (appMode === 'gardener') {
      return metric.key === 'growing' || metric.key === 'dueToday';
    }
    return true;
  });

  const focusItems = [
    { key: 'harvest', count: harvestWindowCount, label: t('garden.focus_harvest', { count: harvestWindowCount }), color: theme.success, background: theme.successBg },
    { key: 'unassigned', count: unassignedCount, label: t('garden.focus_unassigned', { count: unassignedCount }), color: theme.warning, background: theme.warningBg },
    { key: 'planning', count: planningCount, label: t('garden.focus_planning', { count: planningCount }), color: theme.textSecondary, background: theme.accent },
  ].filter((item) => item.count > 0);

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 3 }}>
        <Text style={{ fontSize: 18, fontWeight: '500', color: theme.text }}>{t('garden.overview_title')}</Text>
        <Text style={{ fontSize: 12, color: theme.textSecondary }}>{t('garden.overview_subtitle')}</Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <View
              key={metric.key}
              style={{
                width: '47%',
                minWidth: 140,
                backgroundColor: metric.background,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                gap: 10,
              }}
            >
              <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} stroke={metric.tone} />
              </View>
              <View>
                <Text style={{ fontSize: 21, fontWeight: '500', color: theme.text }}>{metric.value}</Text>
                <Text style={{ fontSize: 12, color: theme.textSecondary }}>{metric.label}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: '500', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {t('garden.focus_title')}
        </Text>
        {focusItems.length === 0 ? (
          <Text style={{ fontSize: 13, color: theme.textSecondary }}>{t('garden.focus_clear')}</Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {focusItems.map((item) => (
              <View
                key={item.key}
                style={{
                  backgroundColor: item.background,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '500', color: item.color }}>{item.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
