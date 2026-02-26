import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Sprout, Leaf, Fence } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { usePlants } from '../../hooks/usePlants';
import { useAuth } from '../../lib/auth';
import { useTranslation } from 'react-i18next';
import { useBeds } from '../../hooks/useBeds';
import { useDeviceId } from '../../lib/deviceId';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

import { useTheme } from '../../lib/theme';

export default function GrowingScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { plants, isLoading, updateStatus } = usePlants();
  const { beds } = useBeds();
  const { deviceId } = useDeviceId();
  const gardens = useQuery(api.gardens.getGardens, deviceId ? { deviceId } : 'skip');
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const canEdit = !isAuthLoading && isAuthenticated;

  const activePlants = plants.filter(
    (p) => p.status === 'growing' || p.status === 'planting'
  );
  const bedMap = new Map(beds.map((bed: any) => [String(bed._id), bed]));
  const gardenMap = new Map((gardens ?? []).map((garden: any) => [String(garden._id), garden]));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 24 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: 28, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>{t('growing.title')}</Text>
            <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4, fontWeight: '500' }}>
              {activePlants.length > 0
                ? t('growing.active_count', { count: activePlants.length })
                : t('growing.subtitle')}
            </Text>
          </View>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: theme.border }}
            onPress={() => router.push('/(tabs)/garden')}
            testID="e2e-growing-open-gardens"
          >
            <Fence size={18} color={theme.primary} strokeWidth={2.5} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.primary }}>{t('growing.my_gardens')}</Text>
          </TouchableOpacity>
        </View>

        {/* Auth warning */}
        {!isAuthLoading && !isAuthenticated && (
          <View style={{ backgroundColor: theme.warningBg, borderLeftWidth: 4, borderLeftColor: theme.warning, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 }}>
            <Text style={{ color: theme.warning, fontSize: 14, fontWeight: '600' }}>
              {t('growing.auth_warning')}
            </Text>
          </View>
        )}

        {/* Content */}
        {isLoading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : activePlants.length === 0 ? (
          <View style={{ paddingVertical: 80, alignItems: 'center', gap: 16, backgroundColor: theme.card, borderRadius: 24, borderWidth: 1, borderColor: theme.border, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 15 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: theme.accent, justifyContent: 'center', alignItems: 'center' }}>
              <Leaf size={40} color={theme.primary} strokeWidth={1.5} />
            </View>
            <View style={{ alignItems: 'center', paddingHorizontal: 40 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text }}>{t('growing.no_plants')}</Text>
              <Text style={{ fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20, fontWeight: '500' }}>
                {t('growing.no_plants_desc')}
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {activePlants.map((plant) => {
              const bed = plant.bedId ? bedMap.get(String(plant.bedId)) : undefined;
              const garden = bed?.gardenId ? gardenMap.get(String(bed.gardenId)) : undefined;
              const pos = plant.positionInBed;
              const hasPosition = typeof pos?.x === 'number' && typeof pos?.y === 'number';
              const positionLabel = hasPosition
                ? ` • Cell ${(pos?.x ?? 0) + 1},${(pos?.y ?? 0) + 1}`
                : '';
              const locationLabel = bed
                ? `${garden?.name ?? t('growing.unknown_garden')} > ${bed.name}${positionLabel}`
                : t('growing.no_location');

              return (
              <TouchableOpacity
                key={plant._id}
                style={{ backgroundColor: theme.card, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, flexDirection: 'row', alignItems: 'center', gap: 16 }}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/plant/[plantId]',
                    params: { plantId: String(plant._id), from: 'growing' },
                  })
                }
                activeOpacity={0.8}
              >
                <View style={{ width: 56, height: 56, backgroundColor: theme.accent, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: theme.border }}>
                  <Sprout size={28} color={theme.primary} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: theme.text }}>
                    {plant.nickname ?? t('growing.unnamed')}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }} numberOfLines={2}>
                    {locationLabel}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: plant.status === 'growing' ? theme.successBg : theme.warningBg, borderWidth: 1, borderColor: plant.status === 'growing' ? theme.success : theme.warning }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: plant.status === 'growing' ? theme.success : theme.warning, textTransform: 'uppercase', letterSpacing: 0.5 }}>{plant.status}</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={{ backgroundColor: theme.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, opacity: !canEdit ? 0.6 : 1 }}
                  disabled={!canEdit}
                  onPress={() => updateStatus(plant._id, 'harvested')}
                  testID="e2e-growing-harvest-button"
                >
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{t('growing.harvest')}</Text>
                </TouchableOpacity>
              </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
