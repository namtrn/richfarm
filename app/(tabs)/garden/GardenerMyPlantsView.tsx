import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Clock3, CloudUpload, Leaf, Plus, Search, Sprout } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { usePlants } from '../../../hooks/usePlants';
import { useReminders } from '../../../hooks/useReminders';
import { useSyncStatus } from '../../../hooks/useSyncStatus';
import { useTheme } from '../../../lib/theme';
import { PlantImageSmall } from '../../../components/ui/PlantImage';

type PlantGroupKey = 'planning' | 'growing' | 'archived';

function normalizeText(value?: string) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getPlantGroup(status?: string): PlantGroupKey {
  if (status === 'growing') return 'growing';
  if (status === 'archived' || status === 'harvested') return 'archived';
  return 'planning';
}

function GardenerOverviewCard({
  totalPlants,
  growingCount,
  dueTodayCount,
  queuedSyncCount,
  archivedCount,
}: {
  totalPlants: number;
  growingCount: number;
  dueTodayCount: number;
  queuedSyncCount: number;
  archivedCount: number;
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  const metrics = [
    {
      key: 'total',
      icon: Leaf,
      label: t('garden.metric_total_plants'),
      value: totalPlants,
      tone: theme.primary,
      background: theme.accent,
    },
    {
      key: 'growing',
      icon: Sprout,
      label: t('garden.metric_growing'),
      value: growingCount,
      tone: theme.success,
      background: theme.successBg,
    },
    {
      key: 'due',
      icon: Clock3,
      label: t('garden.metric_due_today'),
      value: dueTodayCount,
      tone: theme.warning,
      background: theme.warningBg,
    },
    {
      key: 'sync',
      icon: CloudUpload,
      label: t('garden.metric_pending_sync'),
      value: queuedSyncCount,
      tone: theme.textSecondary,
      background: theme.card,
    },
  ];

  return (
    <View style={{ backgroundColor: theme.card, borderRadius: 20, borderWidth: 1, borderColor: theme.border, padding: 16, gap: 14 }}>
      <View style={{ gap: 3 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text }}>{t('garden.my_plants_overview_title')}</Text>
        <Text style={{ fontSize: 12, color: theme.textSecondary }}>{t('garden.my_plants_overview_subtitle')}</Text>
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
                borderRadius: 16,
                paddingHorizontal: 12,
                paddingVertical: 12,
                gap: 10,
                borderWidth: metric.key === 'sync' ? 1 : 0,
                borderColor: metric.key === 'sync' ? theme.border : 'transparent',
              }}
            >
              <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} color={metric.tone} />
              </View>
              <View>
                <Text style={{ fontSize: 21, fontWeight: '800', color: theme.text }}>{metric.value}</Text>
                <Text style={{ fontSize: 12, color: theme.textSecondary }}>{metric.label}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <Text style={{ fontSize: 12, color: theme.textSecondary }}>
        {t('garden.focus_planning', { count: Math.max(totalPlants - growingCount - archivedCount, 0) })}
        {' • '}
        {t('garden.metric_archived', { count: archivedCount })}
      </Text>
    </View>
  );
}

export function GardenerMyPlantsView() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { plants, isLoading } = usePlants();
  const { todayReminders } = useReminders();
  const { queuedCount } = useSyncStatus();
  const [search, setSearch] = useState('');

  const filteredPlants = useMemo(() => {
    const query = normalizeText(search);
    if (!query) return plants;
    return plants.filter((plant) => {
      const name = normalizeText(plant.displayName ?? plant.scientificName);
      return name.includes(query);
    });
  }, [plants, search]);

  const grouped = useMemo(() => {
    const groups: Record<PlantGroupKey, any[]> = {
      planning: [],
      growing: [],
      archived: [],
    };
    for (const plant of filteredPlants) {
      groups[getPlantGroup(plant.status)].push(plant);
    }
    return groups;
  }, [filteredPlants]);

  const hasPlants = filteredPlants.length > 0;
  const growingCount = grouped.growing.length;
  const archivedCount = grouped.archived.length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 16 }}>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>
            {t('tabs.my_plants')}
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/library?mode=select&from=gardener')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.primary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}
          >
            <Plus size={14} stroke="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('garden.my_plants_add')}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: theme.border }}>
          <Search size={16} color={theme.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('garden.my_plants_search')}
            placeholderTextColor={theme.textMuted}
            style={{ flex: 1, fontSize: 14, color: theme.text }}
          />
        </View>
      </View>

      <GardenerOverviewCard
        totalPlants={plants.length}
        growingCount={growingCount}
        dueTodayCount={todayReminders.length}
        queuedSyncCount={queuedCount}
        archivedCount={archivedCount}
      />

      {isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : !hasPlants ? (
        <View style={{ paddingVertical: 50, alignItems: 'center', gap: 10, backgroundColor: theme.card, borderRadius: 20, borderWidth: 1, borderColor: theme.border }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('garden.my_plants_empty_title')}</Text>
          <Text style={{ fontSize: 13, color: theme.textMuted, textAlign: 'center', paddingHorizontal: 24 }}>{t('garden.my_plants_empty_desc')}</Text>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/library?mode=select&from=gardener')}
            style={{ backgroundColor: theme.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, marginTop: 6 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{t('garden.my_plants_add')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          {(['planning', 'growing', 'archived'] as PlantGroupKey[]).map((key) => {
            const items = grouped[key];
            if (!items.length) return null;
            const title =
              key === 'planning'
                ? t('planning.status_planning')
                : key === 'growing'
                  ? t('growing.title')
                  : t('growing.archive_title');
            return (
              <View key={key} style={{ gap: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: theme.textSecondary, letterSpacing: 1, textTransform: 'uppercase' }}>
                  {title}
                </Text>
                <View style={{ gap: 10 }}>
                  {items.map((plant) => (
                    <TouchableOpacity
                      key={plant._id}
                      onPress={() => router.push({ pathname: '/(tabs)/plant/[userPlantId]', params: { userPlantId: String(plant._id), from: 'garden' } })}
                      style={{
                        backgroundColor: theme.card,
                        borderRadius: 16,
                        padding: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <PlantImageSmall uri={plant.photoUrl} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }} numberOfLines={1}>
                          {plant.displayName ?? plant.scientificName ?? t('growing.unnamed')}
                        </Text>
                        <Text style={{ fontSize: 12, color: theme.textMuted }} numberOfLines={1}>
                          {plant.scientificName ?? ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

export default GardenerMyPlantsView;
