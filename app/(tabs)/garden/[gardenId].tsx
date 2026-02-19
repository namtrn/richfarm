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
import { formatAreaValue, getAreaUnitLabel, parseAreaInput, UnitSystem } from '../../../lib/units';
import { useUnitSystem } from '../../../hooks/useUnitSystem';

const LOCATION_TYPES = ['outdoor', 'indoor', 'greenhouse', 'balcony'] as const;

function parsePositiveNumber(value: string) {
  const cleaned = value.trim().replace(',', '.');
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function BedFormModal({
  visible,
  bed,
  gardenId,
  onClose,
  onSave,
  unitSystem,
}: {
  visible: boolean;
  bed: any | null;
  gardenId: Id<'gardens'>;
  onClose: () => void;
  onSave: (payload: {
    bedId?: Id<'beds'>;
    name: string;
    locationType: string;
    areaM2?: number;
    sunlightHours?: number;
    soilType?: string;
  }) => Promise<unknown>;
  unitSystem: UnitSystem;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(bed?.name ?? '');
  const [locationType, setLocationType] = useState(bed?.locationType ?? 'outdoor');
  const [area, setArea] = useState(bed?.areaM2 ? formatAreaValue(bed.areaM2, unitSystem) : '');
  const [sunlight, setSunlight] = useState(bed?.sunlightHours ? String(bed.sunlightHours) : '');
  const [soilType, setSoilType] = useState(bed?.soilType ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(bed?.name ?? '');
    setLocationType(bed?.locationType ?? 'outdoor');
    setArea(bed?.areaM2 ? formatAreaValue(bed.areaM2, unitSystem) : '');
    setSunlight(bed?.sunlightHours ? String(bed.sunlightHours) : '');
    setSoilType(bed?.soilType ?? '');
  }, [bed, unitSystem]);

  const parsedArea = parseAreaInput(area, unitSystem);
  const parsedSunlight = parsePositiveNumber(sunlight);
  const areaInvalid = area.trim() !== '' && parsedArea === undefined;
  const sunlightInvalid = sunlight.trim() !== '' && parsedSunlight === undefined;

  const handleSave = async () => {
    if (!name.trim() || areaInvalid || sunlightInvalid) return;
    setSaving(true);
    try {
      await onSave({
        bedId: bed?._id,
        name: name.trim(),
        locationType,
        areaM2: parsedArea,
        sunlightHours: parsedSunlight,
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
          style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827', marginBottom: 10 }}
        />

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

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('garden.area_label', { unit: getAreaUnitLabel(unitSystem) })}</Text>
            <TextInput
              value={area}
              onChangeText={setArea}
              placeholder={t('garden.area_placeholder', { unit: getAreaUnitLabel(unitSystem) })}
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
              style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: areaInvalid ? '#f87171' : '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
            />
            {areaInvalid && (
              <Text style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{t('garden.error_area')}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('garden.sunlight_label')}</Text>
            <TextInput
              value={sunlight}
              onChangeText={setSunlight}
              placeholder={t('garden.sunlight_placeholder')}
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
              style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: sunlightInvalid ? '#f87171' : '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
            />
            {sunlightInvalid && (
              <Text style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{t('garden.error_sunlight')}</Text>
            )}
          </View>
        </View>

        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('garden.soil_label')}</Text>
        <TextInput
          value={soilType}
          onChangeText={setSoilType}
          placeholder={t('garden.soil_placeholder')}
          placeholderTextColor="#9ca3af"
          style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', marginBottom: 16 }}
        />

        <TouchableOpacity
          disabled={saving || !name.trim() || areaInvalid || sunlightInvalid}
          onPress={handleSave}
          style={{ backgroundColor: '#22c55e', borderRadius: 16, paddingVertical: 14, alignItems: 'center', opacity: (saving || !name.trim() || areaInvalid || sunlightInvalid) ? 0.6 : 1 }}
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

  useEffect(() => {
    setName(garden?.name ?? '');
    setArea(garden?.areaM2 ? formatAreaValue(garden.areaM2, unitSystem) : '');
    setLocationType(garden?.locationType ?? 'outdoor');
    setDescription(garden?.description ?? '');
  }, [garden, unitSystem]);

  const parsedArea = parseAreaInput(area, unitSystem);
  const areaInvalid = area.trim() !== '' && parsedArea === undefined;

  const handleSave = async () => {
    if (!name.trim() || areaInvalid) return;
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
          style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827', marginBottom: 10 }}
        />

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
          disabled={saving || !name.trim() || areaInvalid}
          onPress={handleSave}
          style={{ backgroundColor: '#111827', borderRadius: 16, paddingVertical: 14, alignItems: 'center', opacity: (saving || !name.trim() || areaInvalid) ? 0.6 : 1 }}
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

  const [showGardenEdit, setShowGardenEdit] = useState(false);
  const [showBedForm, setShowBedForm] = useState(false);
  const [editingBed, setEditingBed] = useState<any | null>(null);
  const [confirm, setConfirm] = useState<{ type: 'garden' | 'bed'; bed?: any } | null>(null);
  const getLocationLabel = (key?: string) => {
    if (!key) return '—';
    return t(`garden.location_${key}`, { defaultValue: key });
  };

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
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: '#16a34a', fontWeight: '600' }}>{t('garden.go_back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <TouchableOpacity onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
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
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>{b.name}</Text>
                    <Text style={{ fontSize: 12, color: '#9ca3af' }}>{getLocationLabel(b.locationType)} • {b.areaM2 ? t('garden.area_summary', { value: formatAreaValue(b.areaM2, unitSystem), unit: getAreaUnitLabel(unitSystem) }) : '—'}</Text>
                  </View>
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
