import { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useDeviceId } from '../../../lib/deviceId';
import { useBeds } from '../../../hooks/useBeds';
import { Id } from '../../../convex/_generated/dataModel';

const LOCATION_TYPES = [
  { key: 'outdoor', label: 'Outdoor' },
  { key: 'indoor', label: 'Indoor' },
  { key: 'greenhouse', label: 'Greenhouse' },
  { key: 'balcony', label: 'Balcony' },
];

function BedFormModal({
  visible,
  bed,
  gardenId,
  onClose,
  onSave,
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
}) {
  const [name, setName] = useState(bed?.name ?? '');
  const [locationType, setLocationType] = useState(bed?.locationType ?? 'outdoor');
  const [area, setArea] = useState(bed?.areaM2 ? String(bed.areaM2) : '');
  const [sunlight, setSunlight] = useState(bed?.sunlightHours ? String(bed.sunlightHours) : '');
  const [soilType, setSoilType] = useState(bed?.soilType ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(bed?.name ?? '');
    setLocationType(bed?.locationType ?? 'outdoor');
    setArea(bed?.areaM2 ? String(bed.areaM2) : '');
    setSunlight(bed?.sunlightHours ? String(bed.sunlightHours) : '');
    setSoilType(bed?.soilType ?? '');
  }, [bed]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        bedId: bed?._id,
        name: name.trim(),
        locationType,
        areaM2: area ? Number(area) : undefined,
        sunlightHours: sunlight ? Number(sunlight) : undefined,
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
          {bed ? 'Edit bed' : 'Create bed'}
        </Text>

        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Bed name"
          placeholderTextColor="#9ca3af"
          style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827', marginBottom: 10 }}
        />

        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Location</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {LOCATION_TYPES.map((t) => {
            const active = t.key === locationType;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setLocationType(t.key)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? '#22c55e' : '#fff', borderWidth: 1, borderColor: active ? '#22c55e' : '#e5e7eb' }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#374151' }}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Area (m²)</Text>
            <TextInput
              value={area}
              onChangeText={setArea}
              placeholder="e.g. 2"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
              style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Sunlight (hrs)</Text>
            <TextInput
              value={sunlight}
              onChangeText={setSunlight}
              placeholder="e.g. 6"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
              style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
            />
          </View>
        </View>

        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Soil type</Text>
        <TextInput
          value={soilType}
          onChangeText={setSoilType}
          placeholder="e.g. Loamy"
          placeholderTextColor="#9ca3af"
          style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', marginBottom: 16 }}
        />

        <TouchableOpacity
          disabled={saving || !name.trim()}
          onPress={handleSave}
          style={{ backgroundColor: '#22c55e', borderRadius: 16, paddingVertical: 14, alignItems: 'center', opacity: (saving || !name.trim()) ? 0.6 : 1 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Save bed</Text>
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
}) {
  const [name, setName] = useState(garden?.name ?? '');
  const [area, setArea] = useState(garden?.areaM2 ? String(garden.areaM2) : '');
  const [locationType, setLocationType] = useState(garden?.locationType ?? 'outdoor');
  const [description, setDescription] = useState(garden?.description ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(garden?.name ?? '');
    setArea(garden?.areaM2 ? String(garden.areaM2) : '');
    setLocationType(garden?.locationType ?? 'outdoor');
    setDescription(garden?.description ?? '');
  }, [garden]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        areaM2: area ? Number(area) : undefined,
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
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 10 }}>Edit garden</Text>

        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Garden name"
          placeholderTextColor="#9ca3af"
          style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827', marginBottom: 10 }}
        />

        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Location</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {LOCATION_TYPES.map((t) => {
            const active = t.key === locationType;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setLocationType(t.key)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? '#22c55e' : '#fff', borderWidth: 1, borderColor: active ? '#22c55e' : '#e5e7eb' }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#374151' }}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Area (m²)</Text>
        <TextInput
          value={area}
          onChangeText={setArea}
          placeholder="e.g. 2"
          placeholderTextColor="#9ca3af"
          keyboardType="numeric"
          style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', marginBottom: 10 }}
        />

        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Notes"
          placeholderTextColor="#9ca3af"
          style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', marginBottom: 16 }}
        />

        <TouchableOpacity
          disabled={saving || !name.trim()}
          onPress={handleSave}
          style={{ backgroundColor: '#111827', borderRadius: 16, paddingVertical: 14, alignItems: 'center', opacity: (saving || !name.trim()) ? 0.6 : 1 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Save garden</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export default function GardenDetailScreen() {
  const router = useRouter();
  const { gardenId } = useLocalSearchParams<{ gardenId: string }>();
  const resolvedGardenId = Array.isArray(gardenId) ? gardenId[0] : gardenId;
  const { deviceId } = useDeviceId();

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

  if (!garden) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' }}>
        <Text style={{ color: '#6b7280' }}>Garden not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: '#16a34a', fontWeight: '600' }}>Go back</Text>
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
              <Text style={{ fontSize: 12, color: '#6b7280' }}>{garden.locationType} • {garden.areaM2 ? `${garden.areaM2} m²` : '—'}</Text>
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
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>Beds ({beds.length})</Text>
            <TouchableOpacity
              onPress={() => { setEditingBed(null); setShowBedForm(true); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#22c55e', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <Plus size={14} color="white" />
              <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>Add bed</Text>
            </TouchableOpacity>
          </View>

          {beds.length === 0 ? (
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#f3f4f6' }}>
              <Text style={{ fontSize: 13, color: '#6b7280' }}>No beds yet. Add your first bed.</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {beds.map((b) => (
                <View key={b._id} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>{b.name}</Text>
                    <Text style={{ fontSize: 12, color: '#9ca3af' }}>{b.locationType} • {b.areaM2 ? `${b.areaM2} m²` : '—'}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => { setEditingBed(b); setShowBedForm(true); }}
                    style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', borderRadius: 10 }}
                  >
                    <Pencil size={16} color="#6b7280" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => deleteBed(b._id)}
                    style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fee2e2', borderRadius: 10 }}
                  >
                    <Trash2 size={16} color="#b91c1c" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            onPress={async () => {
              await deleteGarden({ gardenId: garden._id, deviceId });
              router.replace('/(tabs)/garden');
            }}
            style={{ marginTop: 24, backgroundColor: '#fee2e2', borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Delete garden</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <GardenEditModal
        visible={showGardenEdit}
        garden={garden}
        onClose={() => setShowGardenEdit(false)}
        onSave={(updates) => updateGarden({ gardenId: garden._id, deviceId, ...updates })}
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
      />
    </View>
  );
}
