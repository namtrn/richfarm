import { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, Trash2, Sprout, Leaf, CalendarDays } from 'lucide-react-native';
import { usePlants } from '../../../hooks/usePlants';
import { useBeds } from '../../../hooks/useBeds';
import { useAuth } from '../../../lib/auth';
import { Id } from '../../../convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useUnitSystem } from '../../../hooks/useUnitSystem';
import { formatLengthCm, formatPlantsPerArea, formatSeedsPerArea, formatWaterPerArea, formatYieldPerArea } from '../../../lib/units';

function formatDateInput(value?: number) {
  if (!value) return '';
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateInput(value: string) {
  const parts = value.split('-').map((v) => Number(v));
  if (parts.length !== 3) return undefined;
  const [y, m, d] = parts;
  if (!y || !m || !d) return undefined;
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.getTime();
}

export default function PlantDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { plantId } = useLocalSearchParams<{ plantId: string }>();
  const resolvedPlantId = Array.isArray(plantId) ? plantId[0] : plantId;
  const unitSystem = useUnitSystem();

  const { plants, updatePlant, updateStatus, deletePlant } = usePlants();
  const { beds } = useBeds();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const canEdit = !isAuthLoading && isAuthenticated;

  const plant = useMemo(
    () => plants.find((p: any) => p._id === resolvedPlantId),
    [plants, resolvedPlantId]
  );

  const locale = i18n.language?.split('-')[0] ?? i18n.language;
  const masterPlant = useQuery(
    api.plantImages.getPlantById,
    plant?.plantMasterId
      ? { plantId: plant.plantMasterId, locale }
      : 'skip'
  );
  const lightLabel = masterPlant?.lightRequirements
    ? t(`library.light_${masterPlant.lightRequirements}`, { defaultValue: masterPlant.lightRequirements })
    : undefined;

  const [nickname, setNickname] = useState('');
  const [notes, setNotes] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [bedId, setBedId] = useState<Id<'beds'> | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!plant) return;
    setNickname(plant.nickname ?? '');
    setNotes(plant.notes ?? '');
    setExpectedDate(formatDateInput(plant.expectedHarvestDate));
    setBedId(plant.bedId ?? undefined);
  }, [plant]);

  if (!plant) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f9fafb', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#6b7280' }}>{t('plant.not_found')}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: '#16a34a', fontWeight: '600' }}>{t('plant.go_back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentBed = beds.find((b) => b._id === bedId);

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await updatePlant(plant._id, {
        nickname: nickname.trim() || undefined,
        notes: notes.trim() || undefined,
        bedId,
        expectedHarvestDate: expectedDate ? parseDateInput(expectedDate) : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (status: string) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await updateStatus(plant._id, status);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await deletePlant(plant._id);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
          <ArrowLeft size={20} color="#374151" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#111827' }}>{plant.nickname ?? t('plant.unnamed')}</Text>
          <Text style={{ fontSize: 12, color: '#9ca3af' }}>{plant.status}</Text>
        </View>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!canEdit || saving}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827', borderRadius: 10, opacity: (!canEdit || saving) ? 0.6 : 1 }}
        >
          <Check size={18} color="white" />
        </TouchableOpacity>
      </View>

      {!canEdit && (
        <View style={{ marginHorizontal: 16, backgroundColor: '#fef9c3', borderRadius: 12, padding: 10 }}>
          <Text style={{ fontSize: 12, color: '#854d0e' }}>{t('plant.auth_warning')}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        {masterPlant && (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('plant.master_title')}</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>{masterPlant.displayName ?? masterPlant.scientificName}</Text>
            <Text style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>{masterPlant.scientificName}</Text>
            {!!masterPlant.description && (
              <Text style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>{masterPlant.description}</Text>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {masterPlant.lightRequirements && (
                <View style={{ backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: '#6b7280' }}>{t('plant.light_label')}: {lightLabel}</Text>
                </View>
              )}
              {masterPlant.wateringFrequencyDays && (
                <View style={{ backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: '#6b7280' }}>{t('plant.watering_label')}: {masterPlant.wateringFrequencyDays}d</Text>
                </View>
              )}
              {masterPlant.typicalDaysToHarvest && (
                <View style={{ backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: '#6b7280' }}>{t('plant.harvest_label')}: {masterPlant.typicalDaysToHarvest}d</Text>
                </View>
              )}
              {masterPlant.spacingCm && (
                <View style={{ backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: '#6b7280' }}>{t('library.detail_spacing')}: {formatLengthCm(masterPlant.spacingCm, unitSystem)}</Text>
                </View>
              )}
              {masterPlant.maxPlantsPerM2 && (
                <View style={{ backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: '#6b7280' }}>{t('library.detail_max_plants')}: {formatPlantsPerArea(masterPlant.maxPlantsPerM2, unitSystem)}</Text>
                </View>
              )}
              {masterPlant.seedRatePerM2 && (
                <View style={{ backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: '#6b7280' }}>{t('library.detail_seed_rate')}: {formatSeedsPerArea(masterPlant.seedRatePerM2, unitSystem)}</Text>
                </View>
              )}
              {masterPlant.waterLitersPerM2 && (
                <View style={{ backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: '#6b7280' }}>{t('library.detail_water_per_area')}: {formatWaterPerArea(masterPlant.waterLitersPerM2, unitSystem)}</Text>
                </View>
              )}
              {masterPlant.yieldKgPerM2 && (
                <View style={{ backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: '#6b7280' }}>{t('library.detail_yield_per_area')}: {formatYieldPerArea(masterPlant.yieldKgPerM2, unitSystem)}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {!masterPlant && (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('plant.master_title')}</Text>
            <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>{t('plant.no_master')}</Text>
            <TouchableOpacity
              onPress={() => router.push(`/(tabs)/library?mode=attach&from=plant&plantId=${plant._id}`)}
              style={{ backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>{t('plant.link_library')}</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('plant.nickname_label')}</Text>
          <TextInput
            value={nickname}
            onChangeText={setNickname}
            placeholder={t('plant.nickname_placeholder')}
            placeholderTextColor="#9ca3af"
            style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827' }}
          />
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('plant.notes_label')}</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={t('plant.notes_placeholder')}
            placeholderTextColor="#9ca3af"
            multiline
            style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', minHeight: 90 }}
          />
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <CalendarDays size={14} color="#6b7280" />
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.expected_harvest_label')}</Text>
          </View>
          <TextInput
            value={expectedDate}
            onChangeText={setExpectedDate}
            placeholder={t('plant.expected_harvest_placeholder')}
            placeholderTextColor="#9ca3af"
            style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
          />
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 8 }}>{t('plant.bed_label')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <TouchableOpacity
              onPress={() => setBedId(undefined)}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: bedId ? '#fff' : '#22c55e', borderWidth: 1, borderColor: bedId ? '#e5e7eb' : '#22c55e' }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: bedId ? '#374151' : '#fff' }}>{t('plant.no_bed')}</Text>
            </TouchableOpacity>
            {beds.map((b) => {
              const active = b._id === bedId;
              return (
                <TouchableOpacity
                  key={b._id}
                  onPress={() => setBedId(b._id)}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? '#22c55e' : '#fff', borderWidth: 1, borderColor: active ? '#22c55e' : '#e5e7eb' }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#374151' }}>{b.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {currentBed && (
            <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>{t('plant.current_bed', { name: currentBed.name })}</Text>
          )}
        </View>

        <View style={{ gap: 10 }}>
          {plant.status === 'planting' && (
            <TouchableOpacity
              disabled={!canEdit || saving}
              onPress={() => handleStatus('growing')}
              style={{ backgroundColor: '#16a34a', borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: (!canEdit || saving) ? 0.6 : 1 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>{t('plant.start_growing')}</Text>
            </TouchableOpacity>
          )}
          {plant.status === 'growing' && (
            <TouchableOpacity
              disabled={!canEdit || saving}
              onPress={() => handleStatus('harvested')}
              style={{ backgroundColor: '#22c55e', borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: (!canEdit || saving) ? 0.6 : 1 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>{t('plant.mark_harvested')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            disabled={!canEdit || saving}
            onPress={handleDelete}
            style={{ backgroundColor: '#fee2e2', borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: (!canEdit || saving) ? 0.6 : 1 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Trash2 size={16} color="#b91c1c" />
              <Text style={{ color: '#b91c1c', fontWeight: '700' }}>{t('plant.delete')}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('plant.plan_summary')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Sprout size={16} color="#16a34a" />
            <Text style={{ fontSize: 13, color: '#374151' }}>{t('plant.status_label', { status: plant.status })}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Leaf size={16} color="#22c55e" />
            <Text style={{ fontSize: 13, color: '#374151' }}>{t('plant.bed_summary', { name: currentBed?.name ?? t('plant.no_bed') })}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <CalendarDays size={16} color="#6b7280" />
            <Text style={{ fontSize: 13, color: '#374151' }}>
              {t('plant.expected_harvest_summary', { date: expectedDate || '—' })}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
