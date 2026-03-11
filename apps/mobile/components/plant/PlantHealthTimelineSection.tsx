import { useMemo } from 'react';
import { Image, Text, View } from 'react-native';
import { Camera, Droplets, FlaskConical, Scissors, Sparkles, PackageCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { PlantLocalData } from '../../lib/plantLocalData';
import { useTheme } from '../../lib/theme';

type Props = {
  localData: PlantLocalData;
  localLoading: boolean;
  formatDate: (value?: number) => string;
};

type TimelineEntry = {
  id: string;
  type: 'photo' | 'activity' | 'harvest';
  date: number;
  title: string;
  subtitle?: string;
  imageUri?: string;
};

export function PlantHealthTimelineSection({ localData, localLoading, formatDate }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();

  const entries = useMemo<TimelineEntry[]>(() => {
    const photoEntries = localData.photos.map((photo) => ({
      id: `photo:${photo.id}`,
      type: 'photo' as const,
      date: photo.date,
      title: t('plant.timeline_photo', { defaultValue: 'Photo added' }),
      subtitle: photo.note,
      imageUri: photo.uri,
    }));
    const activityLabels = {
      watering: t('plant.activity_type_watering'),
      fertilizing: t('plant.activity_type_fertilizing'),
      pruning: t('plant.activity_type_pruning'),
      custom: t('plant.activity_type_custom'),
    } as const;
    const activityEntries = localData.activities.map((activity) => ({
      id: `activity:${activity.id}`,
      type: 'activity' as const,
      date: activity.date,
      title: activityLabels[activity.type] ?? t('plant.activity_title', { defaultValue: 'Activity' }),
      subtitle: activity.note,
    }));
    const harvestEntries = localData.harvests.map((harvest) => ({
      id: `harvest:${harvest.id}`,
      type: 'harvest' as const,
      date: harvest.date,
      title: t('plant.timeline_harvest', { defaultValue: 'Harvest recorded' }),
      subtitle: [harvest.quantity, harvest.unit, harvest.note].filter(Boolean).join(' • '),
    }));
    return [...photoEntries, ...activityEntries, ...harvestEntries].sort((a, b) => b.date - a.date);
  }, [localData.activities, localData.harvests, localData.photos, t]);

  const getIcon = (entry: TimelineEntry) => {
    if (entry.type === 'photo') return <Camera size={18} color={theme.primary} />;
    if (entry.type === 'harvest') return <PackageCheck size={18} color={theme.success} />;
    if (/watering/i.test(entry.title)) return <Droplets size={18} color={theme.primary} />;
    if (/fertil/i.test(entry.title)) return <FlaskConical size={18} color={theme.warning} />;
    if (/prun/i.test(entry.title)) return <Scissors size={18} color={theme.textSecondary} />;
    return <Sparkles size={18} color={theme.textSecondary} />;
  };

  return (
    <View style={{ backgroundColor: theme.card, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 12, fontWeight: '500', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {t('plant.timeline_title', { defaultValue: 'Plant timeline' })}
        </Text>
        <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2, fontWeight: '500' }}>
          {t('plant.timeline_subtitle', { defaultValue: 'Latest photos, care activities, and harvest updates in one view' })}
        </Text>
      </View>

      {localLoading ? (
        <Text style={{ fontSize: 13, color: theme.textMuted }}>
          {t('common.loading', { defaultValue: 'Loading…' })}
        </Text>
      ) : entries.length === 0 ? (
        <Text style={{ fontSize: 13, color: theme.textMuted, fontStyle: 'italic' }}>
          {t('plant.timeline_empty', { defaultValue: 'No timeline events yet.' })}
        </Text>
      ) : (
        <View style={{ gap: 14 }}>
          {entries.slice(0, 8).map((entry, index) => (
            <View key={entry.id} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ alignItems: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border }}>
                  {getIcon(entry)}
                </View>
                {index < Math.min(entries.length, 8) - 1 && (
                  <View style={{ width: 2, flex: 1, backgroundColor: theme.border, marginTop: 8 }} />
                )}
              </View>
              <View style={{ flex: 1, paddingBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: theme.text }}>
                    {entry.title}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textMuted }}>
                    {formatDate(entry.date)}
                  </Text>
                </View>
                {!!entry.subtitle && (
                  <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4, lineHeight: 18 }}>
                    {entry.subtitle}
                  </Text>
                )}
                {!!entry.imageUri && (
                  <Image
                    source={{ uri: entry.imageUri }}
                    style={{ width: '100%', height: 120, borderRadius: 10, marginTop: 10, backgroundColor: theme.accent }}
                    resizeMode="cover"
                  />
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
