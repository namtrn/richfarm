import { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  Image,
  Animated,
  useWindowDimensions,
  Alert,
  PanResponder,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, Trash2, Sprout, Leaf, CalendarDays, Heart, GitBranch } from '../../../lib/icons';
import { usePlants, type PlantStatus } from '../../../hooks/usePlants';
import { useBeds } from '../../../hooks/useBeds';
import { useGardens } from '../../../hooks/useGardens';
import { useAuth } from '../../../lib/auth';
import { Id } from '../../../../../packages/convex/convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '../../../../../packages/convex/convex/_generated/api';
import * as ImagePicker from 'expo-image-picker';
import { usePlantSync } from '../../../hooks/usePlantSync';
import { useFavorites } from '../../../hooks/useFavorites';
import {
  loadPlantLocalData,
  savePlantLocalData,
  PlantLocalData,
  PlantActivityType,
} from '../../../lib/plantLocalData';
import { PlantPhotosSection } from '../../../components/plant/PlantPhotosSection';
import { PlantActivitySection } from '../../../components/plant/PlantActivitySection';
import { PlantHarvestSection } from '../../../components/plant/PlantHarvestSection';
import { PlantHealthTimelineSection } from '../../../components/plant/PlantHealthTimelineSection';
import { SyncStatusBanner } from '../../../components/ui/SyncStatusBanner';
import { useUnitSystem } from '../../../hooks/useUnitSystem';
import { formatLengthCm, formatPlantsPerArea, formatSeedsPerArea, formatWaterPerArea, formatYieldPerArea } from '../../../lib/units';
import { useAppMode } from '../../../hooks/useAppMode';
import { useDeviceId } from '../../../lib/deviceId';
import { useSyncProjection } from '../../../hooks/useSyncProjection';
import { usePlantContentCommands } from '../../../hooks/usePlantContentCommands';
import { migratePlantLocalData } from '../../../lib/commands/migratePlantLocalData';

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
  const { appMode } = useAppMode();
  const params = useLocalSearchParams<{
    userPlantId: string | string[];
    from?: string | string[];
    bedId?: string | string[];
    gardenId?: string | string[];
  }>();
  const firstParam = (value?: string | string[]) =>
    Array.isArray(value) ? value[0] : value;
  const resolvedPlantId = firstParam(params.userPlantId);
  const rawFromParam = firstParam(params.from);
  const fromParam =
    appMode === 'gardener' && ['planning', 'growing', 'explorer'].includes(rawFromParam ?? '')
      ? 'garden'
      : rawFromParam;
  const fromBedId = firstParam(params.bedId);
  const fromGardenId = firstParam(params.gardenId);
  const unitSystem = useUnitSystem();
  const { deviceId } = useDeviceId();
  const { width: screenWidth } = useWindowDimensions();

  const { plants, updatePlant, updateStatus, deletePlant } = usePlants();
  const { beds } = useBeds();
  const { gardens } = useGardens();
  const plant = useMemo(
    () => plants.find((p: any) => String(p._id) === String(resolvedPlantId) || p.entityUuid === resolvedPlantId),
    [plants, resolvedPlantId]
  );
  const { projection, entities, identity: syncIdentity } = useSyncProjection();
  const carePlans = (entities('carePlan') ?? []) as any[];
  const projectedActivities = entities('activity') as any[] | undefined;
  const projectedHarvests = entities('harvest') as any[] | undefined;
  const projectedPhotos = entities('photo') as any[] | undefined;
  const authoritativePlantId = plant?._pending ? undefined : plant?._id;
  const remoteActivities = useQuery(
    api.logs.getLogsForPlant,
    authoritativePlantId
      ? { userPlantId: authoritativePlantId as Id<'userPlants'>, deviceId, limit: 100 }
      : 'skip'
  );
  const remoteHarvests = useQuery(
    api.harvestRecords.getHarvests,
    authoritativePlantId
      ? { userPlantId: authoritativePlantId as Id<'userPlants'>, deviceId }
      : 'skip'
  );
  const belongsToPlant = (entry: any) =>
    String(entry.userPlantId) === String(plant?._id)
    || entry.plantUuid === plant?.entityUuid;
  const backendActivities = projection?.complete ? projectedActivities?.filter(belongsToPlant) : remoteActivities;
  const backendHarvests = projection?.complete ? projectedHarvests?.filter(belongsToPlant) : remoteHarvests;
  const backendPhotos = projection?.complete ? projectedPhotos?.filter(belongsToPlant) : undefined;
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { removePendingActivity, removePendingHarvest, removePendingPhoto } = usePlantSync();
  const contentCommands = usePlantContentCommands();
  const { favorites, toggleFavorite } = useFavorites();
  const canEdit = !isAuthLoading && (isAuthenticated || !!deviceId);
  const navigateBackOrGrowing = () => {
    if (fromParam === 'bed') {
      if (fromBedId) {
        router.replace(`/(tabs)/bed/${fromBedId}`);
      } else if (fromGardenId) {
        router.replace(`/(tabs)/garden/${fromGardenId}`);
      } else {
        router.replace('/(tabs)/garden');
      }
      return;
    }
    if (fromParam === 'garden') {
      if (fromGardenId) {
        router.replace(`/(tabs)/garden/${fromGardenId}`);
      } else {
        router.replace('/(tabs)/garden');
      }
      return;
    }
    if (fromParam === 'planning') {
      router.replace('/(tabs)/garden?tab=planning');
      return;
    }
    if (fromParam === 'growing') {
      router.replace('/(tabs)/garden?tab=growing');
      return;
    }
    if (fromParam === 'explorer') {
      router.replace('/(tabs)/explorer');
      return;
    }
    if (fromParam === 'library') {
      router.replace('/(tabs)/library');
      return;
    }
    if (fromParam === 'reminder') {
      router.replace('/(tabs)/reminder');
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/garden?tab=growing');
  };

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
    ? t(`library.light_${masterPlant.lightRequirements}`)
    : undefined;
  const latinName = masterPlant?.scientificName;
  const statusLabel = plant ? t(`plant.status_${plant.status}`) : '';
  const isPlanning = plant?.status === 'planning' || plant?.status === 'planting';
  const isGrowing = plant?.status === 'growing';
  const activeCarePlan = carePlans
    .filter((plan) => String(plan.userPlantId) === String(resolvedPlantId))
    .sort((a, b) => (b.planVersion ?? 0) - (a.planVersion ?? 0))[0];

  const [notes, setNotes] = useState('');
  const [nickname, setNickname] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [gardenId, setGardenId] = useState<Id<'gardens'> | undefined>(undefined);
  const [bedId, setBedId] = useState<Id<'beds'> | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  // Local data state
  const [localData, setLocalData] = useState<PlantLocalData>({
    photos: [],
    activities: [],
    harvests: [],
  });
  const mergedPhotos = useMemo(() => {
    if (!backendPhotos) return localData.photos;
    const syncedLocalIds = new Set(
      backendPhotos.flatMap((entry: any) => [entry.localId, entry.entityUuid]).filter(Boolean)
    );
    const pending = localData.photos.filter((entry) => !syncedLocalIds.has(entry.id));
    const server = backendPhotos.map((entry: any) => ({
      id: String(entry._id),
      localId: entry.localId ?? entry.entityUuid,
      uri: entry.photoUrl,
      date: entry.takenAt ?? entry.uploadedAt,
      source: entry.source === 'gallery' ? 'gallery' as const : 'camera' as const,
    }));
    return [...pending, ...server].sort((a, b) => b.date - a.date);
  }, [backendPhotos, localData.photos]);
  const mergedHarvests = useMemo(() => {
    if (!backendHarvests) return localData.harvests;
    const syncedLocalIds = new Set(
      backendHarvests.flatMap((entry: any) => [entry.localId, entry.entityUuid]).filter(Boolean)
    );
    const pending = localData.harvests.filter((entry) => !syncedLocalIds.has(entry.id));
    const server = backendHarvests.map((entry: any) => ({
      id: String(entry._id),
      serverId: String(entry._id),
      localId: entry.localId,
      quantity: entry.quantity === undefined ? undefined : String(entry.quantity),
      unit: entry.unit,
      note: entry.notes,
      date: entry.harvestDate,
    }));
    return [...pending, ...server].sort((a, b) => b.date - a.date);
  }, [backendHarvests, localData.harvests]);
  const timelineData = useMemo<PlantLocalData>(() => {
    if (!backendActivities) return { ...localData, photos: mergedPhotos, harvests: mergedHarvests };
    const syncedLocalIds = new Set(
      backendActivities.flatMap((entry: any) => [entry.localId, entry.entityUuid]).filter(Boolean)
    );
    const serverEntries = backendActivities
      .filter((entry: any) => !entry.harvestRecordId)
      .map((entry: any) => ({
        id: String(entry._id),
        type: entry.type,
        note: entry.note,
        date: entry.occurredAt ?? entry.recordedAt,
        recordedAt: entry.recordedAt,
        source: entry.source === 'auto' ? 'system' : entry.source,
        value: entry.value,
      }));
    const pendingLocal = localData.activities.filter(
      (entry) => !syncedLocalIds.has(entry.id)
    );
    return {
      ...localData,
      photos: mergedPhotos,
      harvests: mergedHarvests,
      activities: [...pendingLocal, ...serverEntries].sort((a, b) => b.date - a.date),
    };
  }, [backendActivities, localData, mergedHarvests, mergedPhotos]);
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
  const scrollY = useRef(new Animated.Value(0)).current;
  const photoModalPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const closePhotoModal = () => {
    photoModalPan.setValue({ x: 0, y: 0 });
    setPhotoModalOpen(false);
  };

  const photoModalPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          photoModalPan.setValue({ x: 0, y: gestureState.dy });
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 120 || gestureState.vy > 0.5) {
          closePhotoModal();
        } else {
          Animated.spring(photoModalPan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (!plant) return;
    setNotes(plant.notes ?? '');
    setNickname(plant.nickname ?? '');
    setExpectedDate(formatDateInput(plant.expectedHarvestDate));
    if ((plant as any).gardenId) {
      setGardenId((plant as any).gardenId ?? undefined);
    } else if (plant.bedId) {
      const linkedBed = beds.find((b: any) => b._id === plant.bedId);
      setGardenId(linkedBed?.gardenId ?? undefined);
    } else {
      setGardenId(undefined);
    }
    setBedId(plant.bedId ?? undefined);
  }, [plant, beds]);

  useEffect(() => {
    if (!photoModalOpen) {
      photoModalPan.setValue({ x: 0, y: 0 });
    }
  }, [photoModalOpen, photoModalPan]);

  useEffect(() => {
    if (!resolvedPlantId || !syncIdentity) return;
    let active = true;
    setLocalLoading(true);
    loadPlantLocalData(syncIdentity.scopeKey, resolvedPlantId)
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
  }, [resolvedPlantId, syncIdentity, t]);

  useEffect(() => {
    if (!resolvedPlantId || !syncIdentity || !plant?.entityUuid) return;
    let active = true;
    void migratePlantLocalData({
      scope: syncIdentity.scopeKey,
      legacyPlantId: resolvedPlantId,
      plantUuid: plant.entityUuid,
    }).then((result) => {
      if (!active || result.status !== 'needs_attention') return;
      setPhotoError(t('plant.local_load_error'));
      setActivityError(t('plant.local_load_error'));
      setHarvestError(t('plant.local_load_error'));
    }).catch(() => {
      // The read-only compatibility data remains visible and migration retries next hydration.
    });
    return () => { active = false; };
  }, [plant?.entityUuid, resolvedPlantId, syncIdentity, t]);


  const currentBed = beds.find((b: any) => b._id === bedId);
  const gardenById = useMemo(
    () => new Map((gardens ?? []).map((garden: any) => [String(garden._id), garden])),
    [gardens]
  );
  const currentGarden = useMemo(() => {
    const selectedGardenId = gardenId ? String(gardenId) : undefined;
    if (selectedGardenId) return gardenById.get(selectedGardenId);
    const plantGardenId = (plant as any)?.gardenId ? String((plant as any).gardenId) : undefined;
    if (plantGardenId) return gardenById.get(plantGardenId);
    const bedGardenId = currentBed?.gardenId ? String(currentBed.gardenId) : undefined;
    return bedGardenId ? gardenById.get(bedGardenId) : undefined;
  }, [gardenId, plant, currentBed, gardenById]);

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

  // --- Persist helpers (race condition fixed) ---
  const persistLocalData = async (
    updater: (prev: PlantLocalData) => PlantLocalData,
    errorSetter: (msg: string | null) => void,
  ): Promise<boolean> => {
    if (!resolvedPlantId || !syncIdentity) return false;
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
      await savePlantLocalData(syncIdentity.scopeKey, resolvedPlantId, nextData);
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
    const updates: any = {
      nickname: nickname.trim() || undefined,
      notes: notes.trim() || undefined,
      expectedHarvestDate: expectedDate ? parseDateInput(expectedDate) : undefined,
    };
    const plantGardenId = (plant as any)?.gardenId;
    const hasGardenChanged = appMode === 'gardener' && gardenId !== plantGardenId;
    if (appMode === 'gardener') {
      if (hasGardenChanged) {
        updates.gardenId = gardenId ?? null;
      }
    } else {
      updates.bedId = bedId ?? null;
    }
    try {
      await updatePlant(plant._id, updates);
    } catch (error: any) {
      const message = String(error?.message ?? '');
      const isLegacyGardenIdError =
        appMode === 'gardener' &&
        hasGardenChanged &&
        message.includes('extra field `gardenId`');
      console.error('[PlantDetail] handleSave failed', {
        error,
        appMode,
        hasGardenChanged,
      });

      if (isLegacyGardenIdError) {
        const { gardenId: _skip, ...legacyUpdates } = updates;
        try {
          await updatePlant(plant._id, legacyUpdates);
        } catch (legacyError) {
          console.error('[PlantDetail] legacy fallback save failed', {
            legacyError,
          });
        }
        Alert.alert(
          t('common.error'),
          t('plant.assign_garden_failed', {
            defaultValue: 'Unable to update garden. Please try again.',
          })
        );
      } else {
        Alert.alert(
          t('common.error'),
          t('plant.save_failed_generic', {
            defaultValue: 'Unable to save changes. Please try again.',
          })
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAssignGarden = async (nextGardenId?: Id<'gardens'>) => {
    if (!canEdit || saving) return;
    const previousGardenId = gardenId;
    setGardenId(nextGardenId);
    setSaving(true);
    try {
      await updatePlant(plant._id, { gardenId: nextGardenId ?? null });
    } catch (error: any) {
      setGardenId(previousGardenId);
      const message = String(error?.message ?? '');
      console.error('[PlantDetail] handleAssignGarden failed', {
        error,
        message,
      });
      Alert.alert(
        t('common.error'),
        t('plant.assign_garden_failed', {
          defaultValue: 'Unable to update garden. Please try again.',
        })
      );
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (status: PlantStatus) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await updateStatus(
        plant._id,
        status,
        undefined,
        status === 'growing' && appMode !== 'gardener' ? { bedId: bedId ?? null } : undefined
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    const plantIdToDelete = plant._id;
    // Leave the detail screen first so this component doesn't rerender while the item disappears.
    navigateBackOrGrowing();
    try {
      await deletePlant(plantIdToDelete);
    } catch {
      setSaving(false);
    }
  };

  const formatDisplayDate = (value?: number) => {
    if (!value) return '—';
    return new Date(value).toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
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
      if (!contentCommands || !plant?.entityUuid) throw new Error('sync_scope_unavailable');
      await contentCommands.stageAndAddPhoto({
        plantUuid: plant.entityUuid,
        sourceUri: result.assets[0].uri,
        takenAt: Date.now(),
        source: source === 'camera' ? 'camera' : 'gallery',
      });
      setPhotoError(null);
    } catch {
      setPhotoError(t('plant.local_save_error'));
    } finally {
      setPhotoModalOpen(false);
    }
  };

  const handleRemovePhoto = async (photoId: string) => {
    const backendEntry = backendPhotos?.find((entry: any) => String(entry._id) === photoId);
    if (backendEntry && contentCommands && plant?.entityUuid) {
      await contentCommands.removeChild({
        plantUuid: plant.entityUuid,
        entityType: 'photo',
        entityUuid: backendEntry.entityUuid ?? backendEntry.localId ?? `legacy:${backendEntry._id}`,
        pendingOperationId: backendEntry._pending ? backendEntry._operationId : undefined,
        managedUri: backendEntry.managedUri,
        baseRevision: backendEntry.revision ?? 1,
      });
      return;
    } else if (resolvedPlantId) {
      await removePendingPhoto(resolvedPlantId, photoId);
    }
    await persistLocalData(
      (prev) => ({ ...prev, photos: prev.photos.filter((p) => p.id !== photoId) }),
      setPhotoError,
    );
  };

  // Activity handlers
  const handleSaveActivity = async () => {
    if (!canEdit || !contentCommands || !plant?.entityUuid) return false;
    const date = parseDateInput(activityDate) ?? Date.now();
    const note = activityNote.trim() || undefined;
    try {
      await contentCommands.appendActivity({
        plantUuid: plant.entityUuid,
        type: activityType,
        note,
        date,
      });
      setActivityError(null);
      return true;
    } catch {
      setActivityError(t('plant.local_save_error'));
      return false;
    }
  };

  const handleRemoveActivity = async (entryId: string) => {
    const backendEntry = backendActivities?.find((entry: any) => String(entry._id) === entryId);
    if (backendEntry && contentCommands && plant?.entityUuid) {
      await contentCommands.removeChild({
        plantUuid: plant.entityUuid,
        entityType: 'activity',
        entityUuid: backendEntry.entityUuid ?? backendEntry.localId ?? `legacy:${backendEntry._id}`,
        pendingOperationId: backendEntry._pending ? backendEntry._operationId : undefined,
        baseRevision: backendEntry.revision ?? 1,
      });
      return;
    }
    // Compatibility path for rows loaded from the legacy sidecar.
    if (resolvedPlantId) await removePendingActivity(resolvedPlantId, entryId);
    await persistLocalData(
      (prev) => ({ ...prev, activities: prev.activities.filter((e) => e.id !== entryId) }),
      setActivityError,
    );
  };

  // Harvest handlers
  const handleSaveHarvest = async () => {
    if (!canEdit || !contentCommands || !plant?.entityUuid) return false;
    const date = parseDateInput(harvestDate) ?? Date.now();
    try {
      await contentCommands.appendHarvest({
        plantUuid: plant.entityUuid,
        quantity: harvestQuantity,
        unit: harvestUnit,
        note: harvestNote,
        date,
      });
      setHarvestError(null);
      return true;
    } catch {
      setHarvestError(t('plant.local_save_error'));
      return false;
    }
  };

  const handleRemoveHarvest = async (entryId: string) => {
    const backendEntry = backendHarvests?.find((entry: any) => String(entry._id) === entryId);
    if (backendEntry && contentCommands && plant?.entityUuid) {
      await contentCommands.removeChild({
        plantUuid: plant.entityUuid,
        entityType: 'harvest',
        entityUuid: backendEntry.entityUuid ?? backendEntry.localId ?? `legacy:${backendEntry._id}`,
        pendingOperationId: backendEntry._pending ? backendEntry._operationId : undefined,
        baseRevision: backendEntry.revision ?? 1,
      });
      return;
    }
    // Compatibility path for rows loaded from the legacy sidecar.
    if (resolvedPlantId) await removePendingHarvest(resolvedPlantId, entryId);
    await persistLocalData(
      (prev) => ({ ...prev, harvests: prev.harvests.filter((e) => e.id !== entryId) }),
      setHarvestError,
    );
  };

  const plantMasterId = plant?.plantMasterId;
  const canFavorite = !!plantMasterId;
  const isFavorite = plantMasterId ? favoriteIds.has(String(plantMasterId)) : false;
  const plantTitle =
    nickname.trim() ||
    plant.nickname?.trim?.() ||
    plant.displayName ||
    plant.scientificName ||
    t('plant.unnamed');
  const plantSubtitle =
    plantTitle === plant.displayName
      ? (latinName ?? statusLabel)
      : (plant.displayName ?? latinName ?? statusLabel);
  const shrinkRange = [0, 90];
  const headerPaddingHorizontal = scrollY.interpolate({ inputRange: shrinkRange, outputRange: [16, 12], extrapolate: 'clamp' });
  const headerPaddingBottom = scrollY.interpolate({ inputRange: shrinkRange, outputRange: [12, 8], extrapolate: 'clamp' });
  const buttonSize = scrollY.interpolate({ inputRange: shrinkRange, outputRange: [40, 28], extrapolate: 'clamp' });
  const buttonRadius = scrollY.interpolate({ inputRange: shrinkRange, outputRange: [12, 8], extrapolate: 'clamp' });
  const backButtonMarginRight = scrollY.interpolate({ inputRange: shrinkRange, outputRange: [12, 8], extrapolate: 'clamp' });
  const nameSize = scrollY.interpolate({ inputRange: shrinkRange, outputRange: [22, 15], extrapolate: 'clamp' });
  const latinSize = scrollY.interpolate({ inputRange: shrinkRange, outputRange: [13, 10], extrapolate: 'clamp' });
  const iconScale = scrollY.interpolate({ inputRange: shrinkRange, outputRange: [1, 0.72], extrapolate: 'clamp' });

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Animated.View
        style={{
          paddingHorizontal: headerPaddingHorizontal,
          paddingTop: 0,
          paddingBottom: headerPaddingBottom,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <TouchableOpacity
          onPress={navigateBackOrGrowing}
          style={{}}
        >
          <Animated.View
            style={{
              width: buttonSize,
              height: buttonSize,
              borderRadius: buttonRadius,
              marginRight: backButtonMarginRight,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.accent,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Animated.View style={{ transform: [{ scale: iconScale }] }}>
              <ArrowLeft size={20} color={theme.text} />
            </Animated.View>
          </Animated.View>
        </TouchableOpacity>
        <View style={{ flex: 1, gap: 1 }}>
          <Animated.Text style={{ fontSize: nameSize, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }} numberOfLines={1}>{plantTitle}</Animated.Text>
          <Animated.Text style={{ fontSize: latinSize, color: theme.textSecondary, fontWeight: '500', fontStyle: plantSubtitle === latinName ? 'italic' : 'normal' }} numberOfLines={1}>
            {plantSubtitle}
          </Animated.Text>
        </View>
        <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            onPress={() => {
              if (!plantMasterId) return;
              void toggleFavorite(plantMasterId).catch(() => undefined);
            }}
            disabled={!plantMasterId}
            style={{ opacity: plantMasterId ? 1 : 0.5 }}
          >
            <Animated.View
              style={{
                width: buttonSize,
                height: buttonSize,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.card,
                borderRadius: buttonRadius,
                borderWidth: 1,
                borderColor: theme.border,
                shadowColor: '#1a1a18',
                shadowOpacity: 0.04,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
              }}
            >
              <Animated.View style={{ transform: [{ scale: iconScale }] }}>
                <Heart size={20} stroke={isFavorite ? '#ef4444' : theme.textSecondary} fill={isFavorite ? '#ef4444' : 'none'} />
              </Animated.View>
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (!plantMasterId) return;
              router.push({
                pathname: '/(tabs)/library/[masterPlantId]',
                params: {
                  masterPlantId: String(plantMasterId),
                },
              });
            }}
            disabled={!plantMasterId}
            style={{ opacity: plantMasterId ? 1 : 0.5 }}
          >
            <Animated.View
              style={{
                width: buttonSize,
                height: buttonSize,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.card,
                borderRadius: buttonRadius,
                borderWidth: 1,
                borderColor: theme.border,
                shadowColor: '#1a1a18',
                shadowOpacity: 0.04,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
              }}
            >
              <Animated.View style={{ transform: [{ scale: iconScale }] }}>
                <GitBranch size={20} color={theme.textSecondary} />
              </Animated.View>
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!canEdit || saving}
            style={{ opacity: (!canEdit || saving) ? 0.6 : 1 }}
          >
            <Animated.View style={{ width: buttonSize, height: buttonSize, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary, borderRadius: buttonRadius }}>
              <Animated.View style={{ transform: [{ scale: iconScale }] }}>
                <Check size={20} color="white" />
              </Animated.View>
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      {!canEdit && (
        <View style={{ marginHorizontal: 16, backgroundColor: theme.warningBg, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: theme.warning, marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: theme.warning, fontWeight: '500' }}>{t('plant.auth_warning')}</Text>
        </View>
      )}

      <SyncStatusBanner
        plantId={resolvedPlantId}
        style={{ marginHorizontal: 16, marginBottom: 8 }}
      />

      <Animated.ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 0, gap: 16, paddingBottom: 100 }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        <Image
          source={{
            uri:
              masterPlant?.imageUrl ??
              'https://images.unsplash.com/photo-1463936575829-25148e1db1b8?auto=format&fit=crop&w=1600&q=80',
          }}
          style={{ width: screenWidth, height: 220, marginLeft: -16 }}
          resizeMode="cover"
        />

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

            {masterPlant.purposes?.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  {t('library.detail_uses', { defaultValue: 'Uses' })}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {masterPlant.purposes.map((p: string) => (
                    <View key={p} style={{ backgroundColor: theme.successBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 }}>
                      <Text style={{ fontSize: 12, color: theme.success, fontWeight: '700', textTransform: 'capitalize' }}>
                        {t(`purposes.${p}`, { defaultValue: p.replace(/_/g, ' ') })}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {activeCarePlan && (
          <View testID="care-plan-card" style={{ backgroundColor: theme.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: theme.border, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: theme.text }}>
                {t('plant.care_plan_title', { defaultValue: 'Care plan' })}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted }}>
                {t('plant.care_plan_version', { defaultValue: 'Version {{version}}', version: activeCarePlan.planVersion })}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: theme.textSecondary }}>
              {t('plant.care_plan_source', {
                defaultValue: 'Snapshot from Library content v{{version}}',
                version: activeCarePlan.sourceContentVersion ?? '—',
              })}
            </Text>
            {(activeCarePlan.tasks ?? []).map((task: any) => (
              <View key={task.type} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Text style={{ flex: 1, fontSize: 14, color: theme.text }}>
                  {t(`reminder.type_${task.type === 'harvest_check' ? 'harvest' : task.type}`, { defaultValue: task.type.replace(/_/g, ' ') })}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: task.enabled ? theme.success : theme.textMuted }}>
                  {task.enabled
                    ? task.intervalDays
                      ? t('plant.care_plan_every_days', { defaultValue: 'Every {{days}} days', days: task.intervalDays })
                      : t('reminder.enabled')
                    : t('reminder.disabled')}
                </Text>
              </View>
            ))}
            <Text style={{ fontSize: 11, color: theme.textMuted }}>
              {t('plant.care_plan_edit_hint', { defaultValue: 'Edit or disable individual schedules from Reminders.' })}
            </Text>
          </View>
        )}

        {!masterPlant && (
          <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{t('plant.master_title')}</Text>
            <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 16 }}>{t('plant.no_master')}</Text>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/library',
                  params: {
                    mode: 'attach',
                    from: 'plant',
                    userPlantId: String(plant._id),
                    backFrom: fromParam,
                    backBedId: fromBedId,
                    backGardenId: fromGardenId,
                  },
                })
              }
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
              testID="e2e-plant-nickname"
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
              testID="e2e-plant-notes"
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
              testID="e2e-plant-expected-harvest"
              value={expectedDate}
              onChangeText={setExpectedDate}
              placeholder={t('plant.expected_harvest_placeholder')}
              placeholderTextColor={theme.textMuted}
              style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
            />
          </View>
        </View>

        <PlantHealthTimelineSection
          localData={timelineData}
          localLoading={localLoading}
          formatDate={formatDisplayDate}
        />

        {appMode === 'gardener' ? (
          <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: theme.border, gap: 12, shadowColor: '#1a1a18', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('tabs.garden')}</Text>
            {gardens.length === 0 ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, color: theme.textSecondary }}>
                  {t('plant.no_garden_yet', { defaultValue: 'No garden yet. Create one to assign this plant.' })}
                </Text>
                <TouchableOpacity
                  onPress={() => router.push('/(tabs)/garden?tab=garden&create=1')}
                  style={{ alignSelf: 'flex-start', backgroundColor: theme.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{t('garden.create_button')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {!gardenId && (
                    <TouchableOpacity
                      onPress={() => void handleAssignGarden(undefined)}
                      style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: theme.primary, borderWidth: 1, borderColor: theme.primary }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>
                        {t('plant.no_garden', { defaultValue: 'No garden' })}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {gardens.map((g: any) => {
                    const active = g._id === gardenId;
                    return (
                      <TouchableOpacity
                        key={String(g._id)}
                        onPress={() => void handleAssignGarden(g._id)}
                        style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: active ? theme.primary : theme.accent, borderWidth: 1, borderColor: active ? theme.primary : theme.border }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : theme.textSecondary }}>{g.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4, fontWeight: '500' }}>
                  {t('plant.current_garden', { defaultValue: 'Current garden: {{name}}', name: currentGarden?.name ?? t('plant.no_garden', { defaultValue: 'No garden' }) })}
                </Text>
              </View>
            )}
          </View>
        ) : (
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
        )}

        <View style={{ gap: 12 }}>
          {isPlanning && (
            <TouchableOpacity
              disabled={!canEdit || saving}
              onPress={() => handleStatus('growing')}
              style={{ backgroundColor: theme.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', shadowColor: theme.primary, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.2 }}>{t('plant.start_growing')}</Text>
            </TouchableOpacity>
          )}
          {isGrowing && (
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
              <Text style={{ fontSize: 14, color: theme.text, fontWeight: '600' }}>{t('plant.status_label', { status: statusLabel })}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Leaf size={16} color={theme.primary} />
              </View>
              <Text style={{ fontSize: 14, color: theme.text, fontWeight: '600' }}>
                {appMode === 'gardener'
                  ? `${t('tabs.garden')}: ${currentGarden?.name ?? t('plant.no_garden', { defaultValue: 'No garden' })}`
                  : t('plant.bed_summary', { name: currentBed?.name ?? t('plant.no_bed') })}
              </Text>
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
          localData={timelineData}
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
          localData={{ ...localData, harvests: mergedHarvests }}
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
      </Animated.ScrollView>

      {/* Photo source modal */}
      <Modal
        visible={photoModalOpen}
        transparent
        animationType="slide"
        onRequestClose={closePhotoModal}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
          onPress={closePhotoModal}
        />
        <Animated.View
          {...photoModalPanResponder.panHandlers}
          style={{
            backgroundColor: theme.card,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 40,
            gap: 16,
            transform: [{ translateY: photoModalPan.y }],
          }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: 'center', marginBottom: 4 }} />
          <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text, marginBottom: 4, letterSpacing: -0.5 }}>{t('plant.photos_source_title')}</Text>

          <View style={{ gap: 12 }}>
            <TouchableOpacity
              testID="e2e-plant-photo-camera"
              style={{ backgroundColor: theme.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: theme.border }}
              onPress={() => handleAddPhotoFrom('camera')}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{t('plant.photos_source_camera')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="e2e-plant-photo-gallery"
              style={{ backgroundColor: theme.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: theme.border }}
              onPress={() => handleAddPhotoFrom('library')}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{t('plant.photos_source_library')}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={{ borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 8 }}
            onPress={closePhotoModal}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textSecondary }}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>
    </View>
  );
}
