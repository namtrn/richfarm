import { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react-native';
import { useQuery, useMutation } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../convex/_generated/api';
import { useDeviceId } from '../../../lib/deviceId';
import { useBeds } from '../../../hooks/useBeds';
import { Id } from '../../../convex/_generated/dataModel';
import { formatAreaValue, formatDistanceValue, getAreaUnitLabel, getDistanceUnitLabel, parseAreaInput, parseDistanceInput, UnitSystem } from '../../../lib/units';
import { useUnitSystem } from '../../../hooks/useUnitSystem';

const LOCATION_TYPES = ['outdoor', 'indoor', 'greenhouse', 'balcony'] as const;
const BED_TYPES = ['in_ground', 'raised', 'container', 'no_dig'] as const;
const NAME_MAX = 40;
const BED_DEFAULTS_CM: Record<string, { widthCm?: number; heightCm?: number; diameterCm?: number; tiers?: number }> = {
  in_ground: { widthCm: 100, heightCm: 200 },
  raised: { widthCm: 80, heightCm: 160, tiers: 1 },
  container: { diameterCm: 40 },
  no_dig: { widthCm: 120, heightCm: 240 },
};

function BedFormModal({
  visible,
  bed,
  gardenId,
  gardenLocationType,
  gardenName,
  onClose,
  onSave,
  unitSystem,
}: {
  visible: boolean;
  bed: any | null;
  gardenId: Id<'gardens'>;
  gardenLocationType?: string;
  gardenName: string;
  onClose: () => void;
  onSave: (payload: {
    bedId?: Id<'beds'>;
    name: string;
    bedType?: string;
    tiers?: number;
    locationType: string;
    dimensions?: { widthCm: number; heightCm: number };
    areaM2?: number;
    soilType?: string;
  }) => Promise<unknown>;
  unitSystem: UnitSystem;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(bed?.name ?? '');
  const [bedType, setBedType] = useState(bed?.bedType ?? 'in_ground');
  const [locationType, setLocationType] = useState(
    gardenLocationType ?? bed?.locationType ?? 'outdoor'
  );
  const [width, setWidth] = useState('');
  const [length, setLength] = useState('');
  const [diameter, setDiameter] = useState('');
  const [tiers, setTiers] = useState<number>(1);
  const [soilType, setSoilType] = useState(bed?.soilType ?? '');
  const [saving, setSaving] = useState(false);
  const isContainer = bedType === 'container';
  const isRaised = bedType === 'raised';
  const nameTooLong = name.trim().length > NAME_MAX;

  useEffect(() => {
    setName(bed?.name ?? '');
    const nextType = bed?.bedType ?? 'in_ground';
    setBedType(nextType);
    setLocationType(gardenLocationType ?? bed?.locationType ?? 'outdoor');
    const defaults = BED_DEFAULTS_CM[nextType] ?? {};
    const widthCm = bed?.dimensions?.widthCm ?? defaults.widthCm;
    const heightCm = bed?.dimensions?.heightCm ?? defaults.heightCm;
    const diameterCm = bed?.dimensions?.widthCm ?? defaults.diameterCm;
    setWidth(widthCm ? formatDistanceValue(widthCm / 100, unitSystem) : '');
    setLength(heightCm ? formatDistanceValue(heightCm / 100, unitSystem) : '');
    setDiameter(diameterCm ? formatDistanceValue(diameterCm / 100, unitSystem) : '');
    setTiers(bed?.tiers ?? defaults.tiers ?? 1);
    setSoilType(bed?.soilType ?? '');
  }, [bed, gardenLocationType, unitSystem]);

  const parsedWidth = parseDistanceInput(width, unitSystem);
  const parsedLength = parseDistanceInput(length, unitSystem);
  const parsedDiameter = parseDistanceInput(diameter, unitSystem);
  const dimensionsInvalid = isContainer ? !parsedDiameter : !parsedWidth || !parsedLength;
  const computedAreaM2 = isContainer
    ? (parsedDiameter ? Math.PI * Math.pow(parsedDiameter / 2, 2) : undefined)
    : (parsedWidth && parsedLength ? parsedWidth * parsedLength : undefined);

  const handleBedTypeChange = (typeKey: string) => {
    setBedType(typeKey);
    const defaults = BED_DEFAULTS_CM[typeKey] ?? {};
    if (typeKey === 'container') {
      setDiameter(defaults.diameterCm ? formatDistanceValue(defaults.diameterCm / 100, unitSystem) : '');
      setWidth('');
      setLength('');
    } else {
      setWidth(defaults.widthCm ? formatDistanceValue(defaults.widthCm / 100, unitSystem) : '');
      setLength(defaults.heightCm ? formatDistanceValue(defaults.heightCm / 100, unitSystem) : '');
      setDiameter('');
    }
    setTiers(defaults.tiers ?? 1);
  };

  const handleSave = async () => {
    if (!name.trim() || dimensionsInvalid || nameTooLong) return;
    setSaving(true);
    try {
      const widthCm = isContainer
        ? Math.round((parsedDiameter ?? 0) * 100)
        : Math.round((parsedWidth ?? 0) * 100);
      const heightCm = isContainer
        ? Math.round((parsedDiameter ?? 0) * 100)
        : Math.round((parsedLength ?? 0) * 100);
      await onSave({
        bedId: bed?._id,
        name: name.trim(),
        bedType,
        tiers: isRaised ? tiers : undefined,
        locationType,
        dimensions: widthCm && heightCm ? { widthCm, heightCm } : undefined,
        areaM2: computedAreaM2,
        soilType: soilType.trim() || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}>
        <View style={{ width: 40, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, alignSelf: 'center', marginBottom: 12 }} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 10 }}>
          {bed ? t('garden.bed_modal_edit_title') : t('garden.bed_modal_create_title')}
        </Text>

        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('garden.bed_name_label')}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('garden.bed_name_placeholder')}
          placeholderTextColor="#9ca3af"
          testID="e2e-garden-bed-name-input"
          maxLength={NAME_MAX}
          style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827', marginBottom: 10 }}
        />
        {nameTooLong && (
          <Text style={{ fontSize: 11, color: '#ef4444', marginTop: -4, marginBottom: 10 }}>
            {t('garden.error_name_length', { max: NAME_MAX })}
          </Text>
        )}

        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('garden.bed_type_label')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {BED_TYPES.map((typeKey) => {
            const active = typeKey === bedType;
            return (
              <TouchableOpacity
                key={typeKey}
                onPress={() => handleBedTypeChange(typeKey)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? '#22c55e' : '#fff', borderWidth: 1, borderColor: active ? '#22c55e' : '#e5e7eb' }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#374151' }}>
                  {t(`garden.bed_type_${typeKey}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {isRaised && (
          <>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('bed.tiers_label', { defaultValue: 'Tiers' })}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {[1, 2, 3].map((value) => {
                const active = value === tiers;
                return (
                  <TouchableOpacity
                    key={value}
                    onPress={() => setTiers(value)}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? '#22c55e' : '#fff', borderWidth: 1, borderColor: active ? '#22c55e' : '#e5e7eb' }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#374151' }}>{value}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('garden.location_label')}</Text>
        <View style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>
                {gardenName}
              </Text>
            </View>
          </View>
        </View>

        {isContainer ? (
          <View style={{ marginBottom: dimensionsInvalid ? 0 : 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
              {t('bed.diameter_label', { unit: getDistanceUnitLabel(unitSystem) })}
            </Text>
            <TextInput
              value={diameter}
              onChangeText={setDiameter}
              placeholder={t('garden.dimension_placeholder')}
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
              style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: dimensionsInvalid ? '#f87171' : '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
            />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: dimensionsInvalid ? 0 : 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
                {t('garden.width_label', { unit: getDistanceUnitLabel(unitSystem) })}
              </Text>
              <TextInput
                value={width}
                onChangeText={setWidth}
                placeholder={t('garden.dimension_placeholder')}
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: dimensionsInvalid ? '#f87171' : '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
                {t('garden.length_label', { unit: getDistanceUnitLabel(unitSystem) })}
              </Text>
              <TextInput
                value={length}
                onChangeText={setLength}
                placeholder={t('garden.dimension_placeholder')}
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: dimensionsInvalid ? '#f87171' : '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
              />
            </View>
          </View>
        )}
        {dimensionsInvalid && (
          <Text style={{ fontSize: 11, color: '#ef4444', marginTop: 4, marginBottom: 10 }}>{t('garden.error_dimensions')}</Text>
        )}

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('garden.area_label', { unit: getAreaUnitLabel(unitSystem) })}</Text>
            <TextInput
              value={computedAreaM2 ? formatAreaValue(computedAreaM2, unitSystem) : ''}
              placeholder={t('garden.area_placeholder', { unit: getAreaUnitLabel(unitSystem) })}
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
              editable={false}
              style={{ backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('garden.soil_label')}</Text>
            <TextInput
              value={soilType}
              onChangeText={setSoilType}
              placeholder={t('garden.soil_placeholder')}
              placeholderTextColor="#9ca3af"
              style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
            />
          </View>
        </View>

        <TouchableOpacity
          disabled={saving || !name.trim() || dimensionsInvalid || nameTooLong}
          onPress={handleSave}
          testID="e2e-garden-bed-save"
          style={{ backgroundColor: '#22c55e', borderRadius: 16, paddingVertical: 14, alignItems: 'center', opacity: (saving || !name.trim() || dimensionsInvalid || nameTooLong) ? 0.6 : 1 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{t('garden.bed_save')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function GardenEditModal({
  visible,
  garden,
  onClose,
  onSave,
  unitSystem,
}: {
  visible: boolean;
  garden: any;
  onClose: () => void;
  onSave: (updates: {
    name?: string;
    areaM2?: number;
    locationType?: string;
    description?: string;
  }) => Promise<unknown>;
  unitSystem: UnitSystem;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(garden?.name ?? '');
  const [area, setArea] = useState(garden?.areaM2 ? formatAreaValue(garden.areaM2, unitSystem) : '');
  const [locationType, setLocationType] = useState(garden?.locationType ?? 'outdoor');
  const [description, setDescription] = useState(garden?.description ?? '');
  const [saving, setSaving] = useState(false);
  const nameTooLong = name.trim().length > NAME_MAX;

  useEffect(() => {
    setName(garden?.name ?? '');
    setArea(garden?.areaM2 ? formatAreaValue(garden.areaM2, unitSystem) : '');
    setLocationType(garden?.locationType ?? 'outdoor');
    setDescription(garden?.description ?? '');
  }, [garden, unitSystem]);

  const parsedArea = parseAreaInput(area, unitSystem);
  const areaInvalid = area.trim() !== '' && parsedArea === undefined;

  const handleSave = async () => {
    if (!name.trim() || areaInvalid || nameTooLong) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        areaM2: parsedArea,
        locationType,
        description: description.trim() || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}>
        <View style={{ width: 40, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, alignSelf: 'center', marginBottom: 12 }} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 10 }}>{t('garden.edit_title')}</Text>

        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('garden.name_label')}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('garden.name_placeholder')}
          placeholderTextColor="#9ca3af"
          maxLength={NAME_MAX}
          style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827', marginBottom: 10 }}
        />
        {nameTooLong && (
          <Text style={{ fontSize: 11, color: '#ef4444', marginTop: -4, marginBottom: 10 }}>
            {t('garden.error_name_length', { max: NAME_MAX })}
          </Text>
        )}

        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('garden.location_label')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {LOCATION_TYPES.map((typeKey) => {
            const active = typeKey === locationType;
            return (
              <TouchableOpacity
                key={typeKey}
                onPress={() => setLocationType(typeKey)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? '#22c55e' : '#fff', borderWidth: 1, borderColor: active ? '#22c55e' : '#e5e7eb' }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#374151' }}>{t(`garden.location_${typeKey}`)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('garden.area_label', { unit: getAreaUnitLabel(unitSystem) })}</Text>
        <TextInput
          value={area}
          onChangeText={setArea}
          placeholder={t('garden.area_placeholder', { unit: getAreaUnitLabel(unitSystem) })}
          placeholderTextColor="#9ca3af"
          keyboardType="numeric"
          style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: areaInvalid ? '#f87171' : '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', marginBottom: areaInvalid ? 0 : 10 }}
        />
        {areaInvalid && (
          <Text style={{ fontSize: 11, color: '#ef4444', marginTop: 4, marginBottom: 10 }}>{t('garden.error_area')}</Text>
        )}

        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('garden.description_label')}</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={t('garden.description_placeholder')}
          placeholderTextColor="#9ca3af"
          style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', marginBottom: 16 }}
        />

        <TouchableOpacity
          disabled={saving || !name.trim() || areaInvalid || nameTooLong}
          onPress={handleSave}
          style={{ backgroundColor: '#111827', borderRadius: 16, paddingVertical: 14, alignItems: 'center', opacity: (saving || !name.trim() || areaInvalid || nameTooLong) ? 0.6 : 1 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{t('garden.save_garden')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export default function GardenDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { gardenId } = useLocalSearchParams<{ gardenId: string }>();
  const resolvedGardenId = Array.isArray(gardenId) ? gardenId[0] : gardenId;
  const { deviceId } = useDeviceId();
  const unitSystem = useUnitSystem();

  const gardensQuery = useQuery(api.gardens.getGardens, deviceId ? { deviceId } : 'skip');
  const garden = useMemo(
    () => gardensQuery?.find((g: any) => g._id === resolvedGardenId),
    [gardensQuery, resolvedGardenId]
  );

  const { beds, createBed, updateBed, deleteBed } = useBeds(resolvedGardenId as Id<'gardens'>);
  const updateGarden = useMutation(api.gardens.updateGarden);
  const deleteGarden = useMutation(api.gardens.deleteGarden);

  const navigateToGardenList = () => {
    router.replace('/(tabs)/garden');
  };

  const [showGardenEdit, setShowGardenEdit] = useState(false);
  const [showBedForm, setShowBedForm] = useState(false);
  const [editingBed, setEditingBed] = useState<any | null>(null);
  const [confirm, setConfirm] = useState<{ type: 'garden' | 'bed'; bed?: any } | null>(null);
  const getLocationLabel = (key?: string) => {
    if (!key) return '—';
    return t(`garden.location_${key}`, { defaultValue: key });
  };

  useEffect(() => {
    if (gardensQuery === undefined) return;
    if (garden) return;
    router.replace('/(tabs)/garden');
  }, [garden, gardensQuery, router]);

  if (gardensQuery === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' }}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  if (!garden) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' }}>
        <Text style={{ color: '#6b7280' }}>{t('garden.not_found')}</Text>
        <TouchableOpacity onPress={navigateToGardenList} style={{ marginTop: 12 }}>
          <Text style={{ color: '#16a34a', fontWeight: '600' }}>{t('garden.go_back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <TouchableOpacity onPress={navigateToGardenList} testID="e2e-garden-detail-back" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
              <ArrowLeft size={20} color="#374151" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 24, fontWeight: '800', color: '#111827' }}>{garden.name}</Text>
              <Text style={{ fontSize: 12, color: '#6b7280' }}>{getLocationLabel(garden.locationType)} • {garden.areaM2 ? t('garden.area_summary', { value: formatAreaValue(garden.areaM2, unitSystem), unit: getAreaUnitLabel(unitSystem) }) : '—'}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowGardenEdit(true)}
              style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', borderRadius: 10 }}
            >
              <Pencil size={16} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {garden.description && (
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#f3f4f6', marginBottom: 16 }}>
              <Text style={{ fontSize: 13, color: '#374151' }}>{garden.description}</Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>{t('garden.beds_section', { count: beds.length })}</Text>
            <TouchableOpacity
              onPress={() => { setEditingBed(null); setShowBedForm(true); }}
              testID="e2e-garden-detail-add-bed"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#22c55e', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <Plus size={14} color="white" />
              <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>{t('garden.add_bed')}</Text>
            </TouchableOpacity>
          </View>

          {beds.length === 0 ? (
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#f3f4f6' }}>
              <Text style={{ fontSize: 13, color: '#6b7280' }}>{t('garden.no_beds')}</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {beds.map((b) => (
                <View key={b._id} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => router.push(`/(tabs)/bed/${b._id}`)}
                    activeOpacity={0.8}
                    style={{ flex: 1 }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>{b.name}</Text>
                    <Text style={{ fontSize: 12, color: '#9ca3af' }}>{getLocationLabel(b.locationType)} • {b.areaM2 ? t('garden.area_summary', { value: formatAreaValue(b.areaM2, unitSystem), unit: getAreaUnitLabel(unitSystem) }) : '—'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setEditingBed(b); setShowBedForm(true); }}
                    style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', borderRadius: 10 }}
                  >
                    <Pencil size={16} color="#6b7280" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setConfirm({ type: 'bed', bed: b })}
                    style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fee2e2', borderRadius: 10 }}
                  >
                    <Trash2 size={16} color="#b91c1c" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            onPress={() => setConfirm({ type: 'garden' })}
            style={{ marginTop: 24, backgroundColor: '#fee2e2', borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ color: '#b91c1c', fontWeight: '700' }}>{t('garden.delete_garden')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <GardenEditModal
        visible={showGardenEdit}
        garden={garden}
        onClose={() => setShowGardenEdit(false)}
        onSave={(updates) => updateGarden({ gardenId: garden._id, deviceId, ...updates })}
        unitSystem={unitSystem}
      />

      <BedFormModal
        visible={showBedForm}
        bed={editingBed}
        gardenId={garden._id}
        gardenLocationType={garden.locationType}
        gardenName={garden.name}
        onClose={() => setShowBedForm(false)}
        onSave={async (payload) => {
          if (payload.bedId) {
            await updateBed(payload.bedId, { ...payload, gardenId: garden._id });
            return;
          }
          await createBed({ ...payload, gardenId: garden._id });
        }}
        unitSystem={unitSystem}
      />

      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setConfirm(null)} />
        <View style={{ position: 'absolute', left: 24, right: 24, top: '40%', backgroundColor: '#fff', borderRadius: 16, padding: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
            {confirm?.type === 'garden' ? t('garden.confirm_delete_garden_title') : t('garden.confirm_delete_bed_title')}
          </Text>
          <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
            {confirm?.type === 'garden'
              ? t('garden.confirm_delete_garden_desc')
              : t('garden.confirm_delete_bed_desc')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => setConfirm(null)}
              style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}
            >
              <Text style={{ fontWeight: '600', color: '#374151' }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                const action = confirm;
                setConfirm(null);
                if (!action) return;
                if (action.type === 'bed' && action.bed) {
                  await deleteBed(action.bed._id);
                  return;
                }
                if (action.type === 'garden') {
                  await deleteGarden({ gardenId: garden._id, deviceId });
                  router.replace('/(tabs)/garden');
                }
              }}
              style={{ flex: 1, backgroundColor: '#ef4444', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}
            >
              <Text style={{ fontWeight: '700', color: '#fff' }}>{t('common.delete')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
