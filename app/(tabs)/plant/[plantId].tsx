import { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Modal,
  Pressable,
  ActivityIndicator,
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
import * as ImagePicker from 'expo-image-picker';
import { usePlantSync } from '../../../hooks/usePlantSync';
import { syncQueue } from '../../../lib/sync/adapter';
import {
  createLocalId,
  loadPlantLocalData,
  savePlantLocalData,
  PlantLocalData,
  PlantActivityType,
} from '../../../lib/plantLocalData';

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

function formatDateLabel(value?: number) {
  if (!value) return '';
  return formatDateInput(value);
}

export default function PlantDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { plantId } = useLocalSearchParams<{ plantId: string }>();
  const resolvedPlantId = Array.isArray(plantId) ? plantId[0] : plantId;

  const { plants, updatePlant, updateStatus, deletePlant } = usePlants();
  const { beds } = useBeds();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { queuePhoto, queueActivity, queueHarvest } = usePlantSync();
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

  const [nickname, setNickname] = useState('');
  const [notes, setNotes] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [bedId, setBedId] = useState<Id<'beds'> | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [localData, setLocalData] = useState<PlantLocalData>({
    photos: [],
    activities: [],
    harvests: [],
  });
  const [localLoading, setLocalLoading] = useState(true);
  const [localSaving, setLocalSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [harvestModalOpen, setHarvestModalOpen] = useState(false);
  const [activityType, setActivityType] = useState<PlantActivityType>('watering');
  const [activityNote, setActivityNote] = useState('');
  const [activityDate, setActivityDate] = useState(formatDateInput(Date.now()));
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
    setLocalError(null);
    loadPlantLocalData(resolvedPlantId)
      .then((data) => {
        if (!active) return;
        setLocalData(data);
      })
      .catch(() => {
        if (!active) return;
        setLocalError(t('plant.local_load_error'));
      })
      .finally(() => {
        if (!active) return;
        setLocalLoading(false);
      });
    return () => {
      active = false;
    };
  }, [resolvedPlantId, t]);

  useEffect(() => {
    if (!resolvedPlantId) return;
    syncQueue();
  }, [resolvedPlantId]);

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

  const activityLabels = useMemo(
    () => ({
      watering: t('plant.activity_type_watering'),
      fertilizing: t('plant.activity_type_fertilizing'),
      pruning: t('plant.activity_type_pruning'),
      custom: t('plant.activity_type_custom'),
    }),
    [t]
  );

  const activityOptions: { key: PlantActivityType; label: string }[] = [
    { key: 'watering', label: activityLabels.watering },
    { key: 'fertilizing', label: activityLabels.fertilizing },
    { key: 'pruning', label: activityLabels.pruning },
    { key: 'custom', label: activityLabels.custom },
  ];

  const persistLocalData = async (
    updater: (prev: PlantLocalData) => PlantLocalData
  ): Promise<boolean> => {
    if (!resolvedPlantId) return false;
    setLocalSaving(true);
    let nextData: PlantLocalData | null = null;
    setLocalData((prev) => {
      nextData = updater(prev);
      return nextData;
    });
    let saved = false;
    if (nextData) {
      try {
        await savePlantLocalData(resolvedPlantId, nextData);
        setLocalError(null);
        saved = true;
      } catch {
        setLocalError(t('plant.local_save_error'));
      }
    }
    setLocalSaving(false);
    return saved;
  };

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
          ? await ImagePicker.launchCameraAsync({
              quality: 0.7,
              allowsEditing: true,
            })
          : await ImagePicker.launchImageLibraryAsync({
              quality: 0.7,
              allowsEditing: true,
            });

      if (result.canceled || !result.assets?.[0]?.uri) return;
      const newPhoto = {
        id: createLocalId(),
        uri: result.assets[0].uri,
        date: Date.now(),
      };
      const saved = await persistLocalData((prev) => ({
        ...prev,
        photos: [newPhoto, ...prev.photos],
      }));
      if (saved && resolvedPlantId) {
        await queuePhoto(resolvedPlantId, newPhoto);
      }
    } finally {
      setPhotoModalOpen(false);
    }
  };

  const handleRemovePhoto = async (photoId: string) => {
    await persistLocalData((prev) => ({
      ...prev,
      photos: prev.photos.filter((photo) => photo.id !== photoId),
    }));
  };

  const handleSaveActivity = async () => {
    if (!canEdit) return;
    const date = parseDateInput(activityDate) ?? Date.now();
    const note = activityNote.trim() || undefined;
    const newEntry = {
      id: createLocalId(),
      type: activityType,
      note,
      date,
    };
    const saved = await persistLocalData((prev) => ({
      ...prev,
      activities: [newEntry, ...prev.activities],
    }));
    if (saved && resolvedPlantId) {
      await queueActivity(resolvedPlantId, newEntry);
    }
    setActivityNote('');
    setActivityType('watering');
    setActivityDate(formatDateInput(Date.now()));
    setActivityModalOpen(false);
  };

  const handleRemoveActivity = async (entryId: string) => {
    await persistLocalData((prev) => ({
      ...prev,
      activities: prev.activities.filter((entry) => entry.id !== entryId),
    }));
  };

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
    const saved = await persistLocalData((prev) => ({
      ...prev,
      harvests: [newEntry, ...prev.harvests],
    }));
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
    await persistLocalData((prev) => ({
      ...prev,
      harvests: prev.harvests.filter((entry) => entry.id !== entryId),
    }));
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
                  <Text style={{ fontSize: 11, color: '#6b7280' }}>{t('plant.light_label')}: {masterPlant.lightRequirements}</Text>
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
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.photos_title')}</Text>
              <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{t('plant.local_only')}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setPhotoModalOpen(true)}
              disabled={!canEdit || localSaving}
              style={{ backgroundColor: '#16a34a', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, opacity: (!canEdit || localSaving) ? 0.6 : 1 }}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('plant.photos_add')}</Text>
            </TouchableOpacity>
          </View>
          {localLoading ? (
            <View style={{ paddingVertical: 10, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#16a34a" />
            </View>
          ) : localData.photos.length === 0 ? (
            <Text style={{ fontSize: 12, color: '#9ca3af' }}>{t('plant.photos_empty')}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row' }}>
                {localData.photos.map((photo, index) => (
                  <View key={photo.id} style={{ marginRight: index === localData.photos.length - 1 ? 0 : 12 }}>
                    <Image
                      source={{ uri: photo.uri }}
                      style={{ width: 120, height: 120, borderRadius: 12, backgroundColor: '#f3f4f6' }}
                    />
                    <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
                      {formatDateLabel(photo.date)}
                    </Text>
                    <TouchableOpacity onPress={() => handleRemovePhoto(photo.id)}>
                      <Text style={{ fontSize: 10, color: '#b91c1c', marginTop: 2 }}>{t('plant.photos_remove')}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
          {localError && (
            <Text style={{ fontSize: 11, color: '#b91c1c', marginTop: 8 }}>{localError}</Text>
          )}
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.activity_title')}</Text>
              <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{t('plant.local_only')}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setActivityModalOpen(true)}
              disabled={!canEdit || localSaving}
              style={{ backgroundColor: '#16a34a', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, opacity: (!canEdit || localSaving) ? 0.6 : 1 }}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('plant.activity_add')}</Text>
            </TouchableOpacity>
          </View>
          {localLoading ? (
            <View style={{ paddingVertical: 10, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#16a34a" />
            </View>
          ) : localData.activities.length === 0 ? (
            <Text style={{ fontSize: 12, color: '#9ca3af' }}>{t('plant.activity_empty')}</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {localData.activities.map((entry) => (
                <View key={entry.id} style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                      {activityLabels[entry.type] ?? activityLabels.custom}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#9ca3af' }}>{formatDateLabel(entry.date)}</Text>
                  </View>
                  {!!entry.note && (
                    <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{entry.note}</Text>
                  )}
                  <TouchableOpacity onPress={() => handleRemoveActivity(entry.id)}>
                    <Text style={{ fontSize: 11, color: '#b91c1c', marginTop: 6 }}>{t('common.delete')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          {localError && (
            <Text style={{ fontSize: 11, color: '#b91c1c', marginTop: 8 }}>{localError}</Text>
          )}
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.harvest_title')}</Text>
              <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{t('plant.local_only')}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setHarvestModalOpen(true)}
              disabled={!canEdit || localSaving}
              style={{ backgroundColor: '#16a34a', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, opacity: (!canEdit || localSaving) ? 0.6 : 1 }}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('plant.harvest_add')}</Text>
            </TouchableOpacity>
          </View>
          {localLoading ? (
            <View style={{ paddingVertical: 10, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#16a34a" />
            </View>
          ) : localData.harvests.length === 0 ? (
            <Text style={{ fontSize: 12, color: '#9ca3af' }}>{t('plant.harvest_empty')}</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {localData.harvests.map((entry) => {
                const quantityLine = [entry.quantity, entry.unit].filter(Boolean).join(' ');
                return (
                  <View key={entry.id} style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                        {quantityLine || '--'}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#9ca3af' }}>{formatDateLabel(entry.date)}</Text>
                    </View>
                    {!!entry.note && (
                      <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{entry.note}</Text>
                    )}
                    <TouchableOpacity onPress={() => handleRemoveHarvest(entry.id)}>
                      <Text style={{ fontSize: 11, color: '#b91c1c', marginTop: 6 }}>{t('common.delete')}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
          {localError && (
            <Text style={{ fontSize: 11, color: '#b91c1c', marginTop: 8 }}>{localError}</Text>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={photoModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPhotoModalOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={() => setPhotoModalOpen(false)}
        />
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 12 }}>
          <View style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: '#e5e7eb', alignSelf: 'center' }} />
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>{t('plant.photos_source_title')}</Text>
          <TouchableOpacity
            style={{ backgroundColor: '#f3f4f6', borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
            onPress={() => handleAddPhotoFrom('camera')}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>{t('plant.photos_source_camera')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: '#f3f4f6', borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
            onPress={() => handleAddPhotoFrom('library')}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>{t('plant.photos_source_library')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: '#111827', borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
            onPress={() => setPhotoModalOpen(false)}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal
        visible={activityModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setActivityModalOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={() => setActivityModalOpen(false)}
        />
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 12 }}>
          <View style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: '#e5e7eb', alignSelf: 'center' }} />
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>{t('plant.activity_add')}</Text>

          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.activity_type_label')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {activityOptions.map((option) => {
              const active = option.key === activityType;
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => setActivityType(option.key)}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? '#16a34a' : '#f3f4f6' }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#374151' }}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.activity_date_label')}</Text>
          <TextInput
            value={activityDate}
            onChangeText={setActivityDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9ca3af"
            style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
          />

          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.activity_note_label')}</Text>
          <TextInput
            value={activityNote}
            onChangeText={setActivityNote}
            placeholder={t('plant.activity_note_placeholder')}
            placeholderTextColor="#9ca3af"
            style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
          />

          <TouchableOpacity
            disabled={!canEdit || localSaving}
            onPress={handleSaveActivity}
            style={{ backgroundColor: '#16a34a', borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: (!canEdit || localSaving) ? 0.6 : 1 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>{t('plant.activity_save')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal
        visible={harvestModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setHarvestModalOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={() => setHarvestModalOpen(false)}
        />
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 12 }}>
          <View style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: '#e5e7eb', alignSelf: 'center' }} />
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>{t('plant.harvest_add')}</Text>

          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.harvest_date_label')}</Text>
          <TextInput
            value={harvestDate}
            onChangeText={setHarvestDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9ca3af"
            style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
          />

          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.harvest_quantity_label')}</Text>
          <TextInput
            value={harvestQuantity}
            onChangeText={setHarvestQuantity}
            placeholder={t('plant.harvest_quantity_placeholder')}
            placeholderTextColor="#9ca3af"
            style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
          />

          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.harvest_unit_label')}</Text>
          <TextInput
            value={harvestUnit}
            onChangeText={setHarvestUnit}
            placeholder={t('plant.harvest_unit_placeholder')}
            placeholderTextColor="#9ca3af"
            style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
          />

          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.harvest_note_label')}</Text>
          <TextInput
            value={harvestNote}
            onChangeText={setHarvestNote}
            placeholder={t('plant.harvest_note_placeholder')}
            placeholderTextColor="#9ca3af"
            style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
          />

          <TouchableOpacity
            disabled={!canEdit || localSaving}
            onPress={handleSaveHarvest}
            style={{ backgroundColor: '#16a34a', borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: (!canEdit || localSaving) ? 0.6 : 1 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>{t('plant.harvest_save')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}
