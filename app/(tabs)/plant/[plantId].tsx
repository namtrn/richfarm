import { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, Trash2, Sprout, Leaf, CalendarDays, Heart } from 'lucide-react-native';
import { usePlants } from '../../../hooks/usePlants';
import { useBeds } from '../../../hooks/useBeds';
import { useAuth } from '../../../lib/auth';
import { Id } from '../../../convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import * as ImagePicker from 'expo-image-picker';
import { usePlantSync } from '../../../hooks/usePlantSync';
import { useFavorites } from '../../../hooks/useFavorites';
import {
  createLocalId,
  loadPlantLocalData,
  savePlantLocalData,
  PlantLocalData,
  PlantActivityType,
  PlantPhotoEntry,
} from '../../../lib/plantLocalData';
import { PlantPhotosSection } from '../../../components/plant/PlantPhotosSection';
import { PlantActivitySection } from '../../../components/plant/PlantActivitySection';
import { PlantHarvestSection } from '../../../components/plant/PlantHarvestSection';
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

import { useTheme } from '../../../lib/theme';

export default function PlantDetailScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { plantId } = useLocalSearchParams<{ plantId: string }>();
  const resolvedPlantId = Array.isArray(plantId) ? plantId[0] : plantId;
  const unitSystem = useUnitSystem();

  const { plants, updatePlant, updateStatus, deletePlant } = usePlants();
  const { beds } = useBeds();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { queuePhoto, queueActivity, queueHarvest } = usePlantSync();
  const { favorites, toggleFavorite } = useFavorites();
  const canEdit = !isAuthLoading && isAuthenticated;
  const navigateBackOrGrowing = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/growing');
  };

  const plant = useMemo(
    () => plants.find((p: any) => p._id === resolvedPlantId),
    [plants, resolvedPlantId]
  );

  const favoriteIds = useMemo(
    () => new Set(favorites.map((fav: any) => String(fav.plantMasterId))),
    [favorites]
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

  // Local data state
  const [localData, setLocalData] = useState<PlantLocalData>({
    photos: [],
    activities: [],
    harvests: [],
  });
  const [localLoading, setLocalLoading] = useState(true);
  const [localSaving, setLocalSaving] = useState(false);

  // Separate error states per section
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [harvestError, setHarvestError] = useState<string | null>(null);

  // Modal states
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [harvestModalOpen, setHarvestModalOpen] = useState(false);

  // Activity form state
  const [activityType, setActivityType] = useState<PlantActivityType>('watering');
  const [activityNote, setActivityNote] = useState('');
  const [activityDate, setActivityDate] = useState(formatDateInput(Date.now()));

  // Harvest form state
  const [harvestQuantity, setHarvestQuantity] = useState('');
  const [harvestUnit, setHarvestUnit] = useState('');
  const [harvestNote, setHarvestNote] = useState('');
  const [harvestDate, setHarvestDate] = useState(formatDateInput(Date.now()));

  useEffect(() => {
    if (!plant) return;
    setNickname(plant.nickname ?? '');
    setNotes(plant.notes ?? '');
    setExpectedDate(formatDateInput(plant.expectedHarvestDate));
    setBedId(plant.bedId ?? undefined);
  }, [plant]);

  useEffect(() => {
    if (!resolvedPlantId) return;
    let active = true;
    setLocalLoading(true);
    loadPlantLocalData(resolvedPlantId)
      .then((data) => {
        if (!active) return;
        setLocalData(data);
      })
      .catch(() => {
        if (!active) return;
        setPhotoError(t('plant.local_load_error'));
        setActivityError(t('plant.local_load_error'));
        setHarvestError(t('plant.local_load_error'));
      })
      .finally(() => {
        if (!active) return;
        setLocalLoading(false);
      });
    return () => {
      active = false;
    };
  }, [resolvedPlantId, t]);


  if (!plant) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.textSecondary }}>{t('plant.not_found')}</Text>
        <TouchableOpacity onPress={navigateBackOrGrowing} style={{ marginTop: 12 }}>
          <Text style={{ color: theme.primary, fontWeight: '600' }}>{t('plant.go_back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentBed = beds.find((b: any) => b._id === bedId);

  // --- Persist helpers (race condition fixed) ---
  const persistLocalData = async (
    updater: (prev: PlantLocalData) => PlantLocalData,
    errorSetter: (msg: string | null) => void,
  ): Promise<boolean> => {
    if (!resolvedPlantId) return false;
    setLocalSaving(true);
    // Compute next data from current state synchronously
    let nextData: PlantLocalData | null = null;
    setLocalData((prev) => {
      nextData = updater(prev);
      return nextData;
    });
    // React batches setLocalData synchronously within the same call frame,
    // so nextData is assigned at this point; but to be extra safe:
    if (!nextData) {
      setLocalSaving(false);
      return false;
    }
    try {
      await savePlantLocalData(resolvedPlantId, nextData);
      errorSetter(null);
      setLocalSaving(false);
      return true;
    } catch {
      errorSetter(t('plant.local_save_error'));
      setLocalSaving(false);
      return false;
    }
  };

  // --- Handlers ---
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
      navigateBackOrGrowing();
    } finally {
      setSaving(false);
    }
  };

  // Photo handlers
  const handleAddPhotoFrom = async (source: 'camera' | 'library') => {
    if (!canEdit) return;
    try {
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') return;
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true });

      if (result.canceled || !result.assets?.[0]?.uri) return;
      const newPhoto: PlantPhotoEntry = {
        id: createLocalId(),
        uri: result.assets[0].uri,
        date: Date.now(),
        source: source === 'camera' ? 'camera' : 'gallery',
      };
      const saved = await persistLocalData(
        (prev) => ({ ...prev, photos: [newPhoto, ...prev.photos] }),
        setPhotoError,
      );
      if (saved && resolvedPlantId) {
        await queuePhoto(resolvedPlantId, newPhoto);
      }
    } finally {
      setPhotoModalOpen(false);
    }
  };

  const handleRemovePhoto = async (photoId: string) => {
    await persistLocalData(
      (prev) => ({ ...prev, photos: prev.photos.filter((p) => p.id !== photoId) }),
      setPhotoError,
    );
  };

  // Activity handlers
  const handleSaveActivity = async () => {
    if (!canEdit) return;
    const date = parseDateInput(activityDate) ?? Date.now();
    const note = activityNote.trim() || undefined;
    const newEntry = { id: createLocalId(), type: activityType, note, date };
    const saved = await persistLocalData(
      (prev) => ({ ...prev, activities: [newEntry, ...prev.activities] }),
      setActivityError,
    );
    if (saved && resolvedPlantId) {
      await queueActivity(resolvedPlantId, newEntry);
    }
    setActivityNote('');
    setActivityType('watering');
    setActivityDate(formatDateInput(Date.now()));
    setActivityModalOpen(false);
  };

  const handleRemoveActivity = async (entryId: string) => {
    await persistLocalData(
      (prev) => ({ ...prev, activities: prev.activities.filter((e) => e.id !== entryId) }),
      setActivityError,
    );
  };

  // Harvest handlers
  const handleSaveHarvest = async () => {
    if (!canEdit) return;
    const date = parseDateInput(harvestDate) ?? Date.now();
    const newEntry = {
      id: createLocalId(),
      quantity: harvestQuantity.trim() || undefined,
      unit: harvestUnit.trim() || undefined,
      note: harvestNote.trim() || undefined,
      date,
    };
    const saved = await persistLocalData(
      (prev) => ({ ...prev, harvests: [newEntry, ...prev.harvests] }),
      setHarvestError,
    );
    if (saved && resolvedPlantId) {
      await queueHarvest(resolvedPlantId, newEntry);
    }
    setHarvestQuantity('');
    setHarvestUnit('');
    setHarvestNote('');
    setHarvestDate(formatDateInput(Date.now()));
    setHarvestModalOpen(false);
  };

  const handleRemoveHarvest = async (entryId: string) => {
    await persistLocalData(
      (prev) => ({ ...prev, harvests: prev.harvests.filter((e) => e.id !== entryId) }),
      setHarvestError,
    );
  };

  const plantMasterId = plant?.plantMasterId;
  const canFavorite = !!plantMasterId;
  const isFavorite = plantMasterId ? favoriteIds.has(String(plantMasterId)) : false;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={navigateBackOrGrowing}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent, borderRadius: 12, marginRight: 12, borderWidth: 1, borderColor: theme.border }}
        >
          <ArrowLeft size={20} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>{plant.nickname ?? t('plant.unnamed')}</Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary, fontWeight: '500' }}>{t(`plant.status_${plant.status}`, { defaultValue: plant.status })}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={() => {
              if (!plantMasterId) return;
              void toggleFavorite(plantMasterId).catch(() => undefined);
            }}
            disabled={!plantMasterId}
            style={{
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.card,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.border,
              opacity: plantMasterId ? 1 : 0.5,
              shadowColor: '#1a1a18',
              shadowOpacity: 0.04,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
            }}
          >
            <Heart size={20} stroke={isFavorite ? '#ef4444' : theme.textSecondary} fill={isFavorite ? '#ef4444' : 'none'} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!canEdit || saving}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary, borderRadius: 12, opacity: (!canEdit || saving) ? 0.6 : 1 }}
          >
            <Check size={20} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      {!canEdit && (
        <View style={{ marginHorizontal: 16, backgroundColor: theme.warningBg, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: theme.warning, marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: theme.warning, fontWeight: '500' }}>{t('plant.auth_warning')}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }}>
        {masterPlant && (
          <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
            <View style={{ gap: 4, marginBottom: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>{t('plant.master_title')}</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text }}>{masterPlant.displayName ?? masterPlant.scientificName}</Text>
              <Text style={{ fontSize: 13, color: theme.textSecondary, fontStyle: 'italic' }}>{masterPlant.scientificName}</Text>
            </View>

            {!!masterPlant.description && (
              <Text style={{ fontSize: 14, color: theme.textSecondary, lineHeight: 20, marginBottom: 16 }}>{masterPlant.description}</Text>
            )}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {masterPlant.lightRequirements && (
                <View style={{ backgroundColor: theme.accent, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: theme.border }}>
                  <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: '600' }}>{t('plant.light_label')}: {lightLabel}</Text>
                </View>
              )}
              {masterPlant.wateringFrequencyDays && (
                <View style={{ backgroundColor: theme.accent, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: theme.border }}>
                  <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: '600' }}>{t('plant.watering_label')}: {masterPlant.wateringFrequencyDays}d</Text>
                </View>
              )}
              {masterPlant.typicalDaysToHarvest && (
                <View style={{ backgroundColor: theme.accent, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: theme.border }}>
                  <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: '600' }}>{t('plant.harvest_label')}: {masterPlant.typicalDaysToHarvest}d</Text>
                </View>
              )}
              {masterPlant.spacingCm && (
                <View style={{ backgroundColor: theme.accent, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: theme.border }}>
                  <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: '600' }}>{t('library.detail_spacing')}: {formatLengthCm(masterPlant.spacingCm, unitSystem)}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {!masterPlant && (
          <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{t('plant.master_title')}</Text>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 16 }}>{t('plant.no_master')}</Text>
            <TouchableOpacity
              onPress={() => router.push(`/(tabs)/library?mode=attach&from=plant&plantId=${plant._id}`)}
              style={{ backgroundColor: theme.primary, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{t('plant.link_library')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: theme.border, gap: 16, shadowColor: '#1a1a18', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('plant.nickname_label')}</Text>
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder={t('plant.nickname_placeholder')}
              placeholderTextColor={theme.textMuted}
              style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
            />
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('plant.notes_label')}</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t('plant.notes_placeholder')}
              placeholderTextColor={theme.textMuted}
              multiline
              style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text, minHeight: 100, textAlignVertical: 'top' }}
            />
          </View>

          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <CalendarDays size={14} color={theme.textSecondary} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('plant.expected_harvest_label')}</Text>
            </View>
            <TextInput
              value={expectedDate}
              onChangeText={setExpectedDate}
              placeholder={t('plant.expected_harvest_placeholder')}
              placeholderTextColor={theme.textMuted}
              style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
            />
          </View>
        </View>

        <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: theme.border, gap: 12, shadowColor: '#1a1a18', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('plant.bed_label')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <TouchableOpacity
              onPress={() => setBedId(undefined)}
              style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: !bedId ? theme.primary : theme.accent, borderWidth: 1, borderColor: !bedId ? theme.primary : theme.border }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: !bedId ? '#fff' : theme.textSecondary }}>{t('plant.no_bed')}</Text>
            </TouchableOpacity>
            {beds.map((b: any) => {
              const active = b._id === bedId;
              return (
                <TouchableOpacity
                  key={b._id}
                  onPress={() => setBedId(b._id)}
                  style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: active ? theme.primary : theme.accent, borderWidth: 1, borderColor: active ? theme.primary : theme.border }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : theme.textSecondary }}>{b.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {currentBed && (
            <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4, fontWeight: '500' }}>{t('plant.current_bed', { name: currentBed.name })}</Text>
          )}
        </View>

        <View style={{ gap: 12 }}>
          {plant.status === 'planting' && (
            <TouchableOpacity
              disabled={!canEdit || saving}
              onPress={() => handleStatus('growing')}
              style={{ backgroundColor: theme.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', shadowColor: theme.primary, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.2 }}>{t('plant.start_growing')}</Text>
            </TouchableOpacity>
          )}
          {plant.status === 'growing' && (
            <TouchableOpacity
              disabled={!canEdit || saving}
              onPress={() => handleStatus('harvested')}
              style={{ backgroundColor: theme.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', shadowColor: theme.primary, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.2 }}>{t('plant.mark_harvested')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            disabled={!canEdit || saving}
            onPress={handleDelete}
            style={{ backgroundColor: theme.warningBg, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: theme.warning }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Trash2 size={18} color={theme.warning} />
              <Text style={{ color: theme.warning, fontWeight: '800', fontSize: 15 }}>{t('plant.delete')}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: theme.border, gap: 16, shadowColor: '#1a1a18', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('plant.plan_summary')}</Text>
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.successBg, alignItems: 'center', justifyContent: 'center' }}>
                <Sprout size={16} color={theme.success} />
              </View>
              <Text style={{ fontSize: 14, color: theme.text, fontWeight: '600' }}>{t('plant.status_label', { status: t(`plant.status_${plant.status}`, { defaultValue: plant.status }) })}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Leaf size={16} color={theme.primary} />
              </View>
              <Text style={{ fontSize: 14, color: theme.text, fontWeight: '600' }}>{t('plant.bed_summary', { name: currentBed?.name ?? t('plant.no_bed') })}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                <CalendarDays size={16} color={theme.textSecondary} />
              </View>
              <Text style={{ fontSize: 14, color: theme.text, fontWeight: '600' }}>
                {t('plant.expected_harvest_summary', { date: expectedDate || '—' })}
              </Text>
            </View>
          </View>
        </View>

        {/* Extracted sub-components */}
        <PlantPhotosSection
          localData={localData}
          localLoading={localLoading}
          error={photoError}
          canEdit={canEdit}
          localSaving={localSaving}
          onAddPhoto={() => setPhotoModalOpen(true)}
          onRemovePhoto={handleRemovePhoto}
          formatDate={formatDateInput}
        />

        <PlantActivitySection
          localData={localData}
          localLoading={localLoading}
          error={activityError}
          canEdit={canEdit}
          localSaving={localSaving}
          modalOpen={activityModalOpen}
          activityType={activityType}
          activityNote={activityNote}
          activityDate={activityDate}
          onOpenModal={() => setActivityModalOpen(true)}
          onCloseModal={() => setActivityModalOpen(false)}
          onChangeType={setActivityType}
          onChangeNote={setActivityNote}
          onChangeDate={setActivityDate}
          onSave={handleSaveActivity}
          onRemove={handleRemoveActivity}
          formatDate={formatDateInput}
        />

        <PlantHarvestSection
          localData={localData}
          localLoading={localLoading}
          error={harvestError}
          canEdit={canEdit}
          localSaving={localSaving}
          modalOpen={harvestModalOpen}
          harvestQuantity={harvestQuantity}
          harvestUnit={harvestUnit}
          harvestNote={harvestNote}
          harvestDate={harvestDate}
          onOpenModal={() => setHarvestModalOpen(true)}
          onCloseModal={() => setHarvestModalOpen(false)}
          onChangeQuantity={setHarvestQuantity}
          onChangeUnit={setHarvestUnit}
          onChangeNote={setHarvestNote}
          onChangeDate={setHarvestDate}
          onSave={handleSaveHarvest}
          onRemove={handleRemoveHarvest}
          formatDate={formatDateInput}
        />
      </ScrollView>

      {/* Photo source modal */}
      <Modal
        visible={photoModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPhotoModalOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
          onPress={() => setPhotoModalOpen(false)}
        />
        <View style={{ backgroundColor: theme.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 16 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: 'center', marginBottom: 4 }} />
          <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text, marginBottom: 4, letterSpacing: -0.5 }}>{t('plant.photos_source_title')}</Text>

          <View style={{ gap: 12 }}>
            <TouchableOpacity
              style={{ backgroundColor: theme.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: theme.border }}
              onPress={() => handleAddPhotoFrom('camera')}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{t('plant.photos_source_camera')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ backgroundColor: theme.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: theme.border }}
              onPress={() => handleAddPhotoFrom('library')}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{t('plant.photos_source_library')}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={{ borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 8 }}
            onPress={() => setPhotoModalOpen(false)}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textSecondary }}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}
