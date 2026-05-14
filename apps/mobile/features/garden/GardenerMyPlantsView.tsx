import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Plus, Search } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { usePlants } from '../../hooks/usePlants';
import { useBeds } from '../../hooks/useBeds';
import { useDeviceId } from '../../lib/deviceId';
import { useTheme } from '../../lib/theme';
import { PlantImageSmall } from '../../components/ui/PlantImage';
import { api } from '../../../../packages/convex/convex/_generated/api';

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

function getPlantLabel(plant: any, fallback: string) {
  return plant?.nickname?.trim?.() || plant?.displayName || plant?.scientificName || fallback;
}

export function GardenerMyPlantsView({ hideHeader = false }: { hideHeader?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { deviceId } = useDeviceId();
  const { plants, isLoading } = usePlants();
  const { beds } = useBeds();
  const gardens = useQuery(api.gardens.getGardens, deviceId ? { deviceId } : 'skip') ?? [];
  const [search, setSearch] = useState('');

  const bedById = useMemo(
    () => new Map((beds ?? []).map((bed: any) => [String(bed._id), bed])),
    [beds]
  );
  const gardenById = useMemo(
    () => new Map((gardens ?? []).map((garden: any) => [String(garden._id), garden])),
    [gardens]
  );

  const filteredPlants = useMemo(() => {
    const query = normalizeText(search);
    if (!query) return plants;
    return plants.filter((plant) => {
      const name = normalizeText(getPlantLabel(plant, ''));
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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 16 }}>
      <View style={{ gap: 12 }}>
        {!hideHeader && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 26, fontWeight: '500', color: theme.text, letterSpacing: -0.5 }}>
              {t('tabs.my_plants')}
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/library?mode=select&from=gardener')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <Plus size={14} stroke="#fff" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '500' }}>{t('garden.my_plants_add')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: theme.border }}>
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

      {isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : !hasPlants ? (
        <View style={{ paddingVertical: 50, alignItems: 'center', gap: 10, backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border }}>
          <Text style={{ fontSize: 16, fontWeight: '500', color: theme.text }}>{t('garden.my_plants_empty_title')}</Text>
          <Text style={{ fontSize: 13, color: theme.textMuted, textAlign: 'center', paddingHorizontal: 24 }}>{t('garden.my_plants_empty_desc')}</Text>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/library?mode=select&from=gardener')}
            style={{ backgroundColor: theme.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, marginTop: 6 }}
          >
            <Text style={{ color: '#fff', fontWeight: '500', fontSize: 13 }}>{t('garden.my_plants_add')}</Text>
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
                <Text style={{ fontSize: 12, fontWeight: '500', color: theme.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  {title}
                </Text>
                <View style={{ gap: 10 }}>
                  {items.map((plant) => (
                    (() => {
                      const directGarden = plant?.gardenId ? gardenById.get(String(plant.gardenId)) : undefined;
                      const bed = plant?.bedId ? bedById.get(String(plant.bedId)) : undefined;
                      const garden = directGarden ?? (bed?.gardenId ? gardenById.get(String(bed.gardenId)) : undefined);
                      const gardenName = garden?.name ?? t('growing.unknown_garden', { defaultValue: 'Unknown garden' });
                      return (
                        <TouchableOpacity
                          key={plant._id}
                          onPress={() =>
                            router.push({
                              pathname: '/(tabs)/plant/[userPlantId]',
                              params: {
                                userPlantId: String(plant._id),
                                from: 'garden',
                                ...(garden?._id ? { gardenId: String(garden._id) } : {}),
                              },
                            })
                          }
                          style={{
                            backgroundColor: theme.card,
                            borderRadius: 10,
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
                            <Text style={{ fontSize: 15, fontWeight: '500', color: theme.text }} numberOfLines={1}>
                              {getPlantLabel(plant, t('growing.unnamed'))}
                            </Text>
                            <Text style={{ fontSize: 12, color: theme.textMuted }} numberOfLines={1}>
                              {plant.scientificName ?? ''}
                            </Text>
                            <Text style={{ fontSize: 12, color: theme.textSecondary }} numberOfLines={1}>
                              {t('tabs.garden')}: {gardenName}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })()
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
