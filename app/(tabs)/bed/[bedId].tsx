import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions, Modal, TextInput, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useDeviceId } from '../../../lib/deviceId';
import { useBeds } from '../../../hooks/useBeds';
import { usePlants } from '../../../hooks/usePlants';
import { useUnitSystem } from '../../../hooks/useUnitSystem';
import { formatAreaValue, formatDistanceValue, getAreaUnitLabel, getDistanceUnitLabel, parseDistanceInput } from '../../../lib/units';

const BED_LAYOUTS: Record<string, { cols: number; rows: number; borderRadius: number; borderWidth: number; borderColor: string; background: string; borderStyle?: 'solid' | 'dashed'; mask?: 'circle' }> = {
  in_ground: { cols: 8, rows: 6, borderRadius: 12, borderWidth: 1, borderColor: '#e7e0d6', background: '#ffffff' },
  raised: { cols: 6, rows: 4, borderRadius: 14, borderWidth: 2, borderColor: '#d97706', background: '#fff7ed' },
  container: { cols: 5, rows: 5, borderRadius: 999, borderWidth: 2, borderColor: '#94a3b8', background: '#f8fafc', mask: 'circle' },
  no_dig: { cols: 10, rows: 4, borderRadius: 12, borderWidth: 1, borderColor: '#16a34a', background: '#f0fdf4', borderStyle: 'dashed' },
};

const BED_CELL_CM: Record<string, number> = {
  in_ground: 25,
  raised: 20,
  container: 12,
  no_dig: 25,
};
const BED_DEFAULTS_CM: Record<string, { widthCm?: number; heightCm?: number; diameterCm?: number; tiers?: number }> = {
  in_ground: { widthCm: 100, heightCm: 200 },
  raised: { widthCm: 80, heightCm: 160, tiers: 1 },
  container: { diameterCm: 40 },
  no_dig: { widthCm: 120, heightCm: 240 },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function BedDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { bedId } = useLocalSearchParams<{ bedId: string }>();
  const resolvedBedId = Array.isArray(bedId) ? bedId[0] : bedId;
  const { width } = useWindowDimensions();
  const unitSystem = useUnitSystem();
  const { deviceId } = useDeviceId();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustWidth, setAdjustWidth] = useState('');
  const [adjustLength, setAdjustLength] = useState('');
  const [adjustDiameter, setAdjustDiameter] = useState('');
  const [adjustTiers, setAdjustTiers] = useState(1);
  const [adjustSaving, setAdjustSaving] = useState(false);

  const { beds, isLoading: bedsLoading, updateBed } = useBeds();
  const { plants } = usePlants();
  const gardensQuery = useQuery(api.gardens.getGardens, deviceId ? { deviceId } : 'skip');

  const bed = useMemo(
    () => beds.find((item) => item._id === resolvedBedId),
    [beds, resolvedBedId]
  );
  const garden = useMemo(
    () => gardensQuery?.find((g: any) => g._id === bed?.gardenId),
    [gardensQuery, bed?.gardenId]
  );

  const bedTypeKey = bed?.bedType ?? 'in_ground';
  const baseLayout = BED_LAYOUTS[bedTypeKey] ?? BED_LAYOUTS.in_ground;
  const dimensions = bed?.dimensions;
  const cellCm = BED_CELL_CM[bedTypeKey] ?? 25;
  const computedCols = dimensions?.widthCm
    ? clamp(Math.round(dimensions.widthCm / cellCm), 3, 14)
    : undefined;
  const computedRows = dimensions?.heightCm
    ? clamp(Math.round(dimensions.heightCm / cellCm), 3, 12)
    : undefined;
  const layout = {
    ...baseLayout,
    cols: computedCols ?? baseLayout.cols,
    rows: computedRows ?? baseLayout.rows,
  };
  const maxGridWidth = Math.max(1, width - 32 - 28);
  const cellSize = maxGridWidth / layout.cols;
  const gridWidth = maxGridWidth;
  const gridHeight = cellSize * layout.rows;

  const plantsInBed = useMemo(
    () => plants.filter((p: any) => p.bedId === bed?._id),
    [plants, bed?._id]
  );

  const plantByCell = useMemo(() => {
    const map = new Map<string, { plant: any; count: number }>();
    for (const plant of plantsInBed) {
      const pos = plant.positionInBed;
      if (!pos) continue;
      const key = `${pos.x},${pos.y}`;
      const existing = map.get(key);
      if (existing) {
        map.set(key, { plant: existing.plant, count: existing.count + 1 });
      } else {
        map.set(key, { plant, count: 1 });
      }
    }
    return map;
  }, [plantsInBed]);

  const isOutsideMask = (col: number, row: number) => {
    if (layout.mask !== 'circle') return false;
    const centerX = layout.cols / 2;
    const centerY = layout.rows / 2;
    const radius = Math.min(layout.cols, layout.rows) / 2;
    const dx = (col + 0.5) - centerX;
    const dy = (row + 0.5) - centerY;
    return (dx * dx + dy * dy) > radius * radius;
  };

  const firstEmptyCell = useMemo(() => {
    for (let row = 0; row < layout.rows; row += 1) {
      for (let col = 0; col < layout.cols; col += 1) {
        if (isOutsideMask(col, row)) continue;
        if (!plantByCell.has(`${col},${row}`)) {
          return { x: col, y: row };
        }
      }
    }
    return undefined;
  }, [layout.cols, layout.rows, layout.mask, plantByCell]);

  if (bedsLoading || gardensQuery === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' }}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  if (!bed) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' }}>
        <Text style={{ color: '#6b7280' }}>{t('bed.not_found', { defaultValue: 'Bed not found.' })}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: '#16a34a', fontWeight: '600' }}>{t('bed.go_back', { defaultValue: t('garden.go_back', { defaultValue: 'Go back' }) })}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const bedTypeLabel = t(`garden.bed_type_${bedTypeKey}`, { defaultValue: bedTypeKey });
  const isContainer = bedTypeKey === 'container';
  const isRaised = bedTypeKey === 'raised';

  const openAdjust = () => {
    if (!bed) return;
    const defaults = BED_DEFAULTS_CM[bedTypeKey] ?? {};
    const widthCm = bed.dimensions?.widthCm ?? defaults.widthCm;
    const heightCm = bed.dimensions?.heightCm ?? defaults.heightCm;
    const diameterCm = bed.dimensions?.widthCm ?? defaults.diameterCm;
    setAdjustWidth(widthCm ? formatDistanceValue(widthCm / 100, unitSystem) : '');
    setAdjustLength(heightCm ? formatDistanceValue(heightCm / 100, unitSystem) : '');
    setAdjustDiameter(diameterCm ? formatDistanceValue(diameterCm / 100, unitSystem) : '');
    setAdjustTiers(bed.tiers ?? defaults.tiers ?? 1);
    setAdjustOpen(true);
  };

  const adjustParsedWidth = parseDistanceInput(adjustWidth, unitSystem);
  const adjustParsedLength = parseDistanceInput(adjustLength, unitSystem);
  const adjustParsedDiameter = parseDistanceInput(adjustDiameter, unitSystem);
  const adjustInvalid = isContainer ? !adjustParsedDiameter : !adjustParsedWidth || !adjustParsedLength;
  const adjustAreaM2 = isContainer
    ? (adjustParsedDiameter ? Math.PI * Math.pow(adjustParsedDiameter / 2, 2) : undefined)
    : (adjustParsedWidth && adjustParsedLength ? adjustParsedWidth * adjustParsedLength : undefined);

  const openAddPlant = (x?: number, y?: number) => {
    if (!bed) return;
    let targetX = x;
    let targetY = y;
    if (typeof targetX !== 'number' || typeof targetY !== 'number') {
      targetX = firstEmptyCell?.x;
      targetY = firstEmptyCell?.y;
    }
    const query = new URLSearchParams();
    query.set('mode', 'select');
    query.set('from', 'bed');
    query.set('bedId', bed._id);
    if (typeof targetX === 'number' && typeof targetY === 'number') {
      query.set('x', String(targetX));
      query.set('y', String(targetY));
    }
    router.push(`/(tabs)/library?${query.toString()}`);
  };

  const handleAdjustSave = async () => {
    if (!bed || adjustInvalid) return;
    setAdjustSaving(true);
    try {
      const widthCm = isContainer
        ? Math.round((adjustParsedDiameter ?? 0) * 100)
        : Math.round((adjustParsedWidth ?? 0) * 100);
      const heightCm = isContainer
        ? Math.round((adjustParsedDiameter ?? 0) * 100)
        : Math.round((adjustParsedLength ?? 0) * 100);
      await updateBed(bed._id, {
        dimensions: widthCm && heightCm ? { widthCm, heightCm } : undefined,
        areaM2: adjustAreaM2,
        tiers: isRaised ? adjustTiers : undefined,
      });
      setAdjustOpen(false);
    } finally {
      setAdjustSaving(false);
    }
  };

  const areaM2 = bed.areaM2 ?? (() => {
    if (!bed.dimensions?.widthCm || !bed.dimensions?.heightCm) return undefined;
    if (bedTypeKey === 'container') {
      const diameterM = bed.dimensions.widthCm / 100;
      return Math.PI * Math.pow(diameterM / 2, 2);
    }
    return (bed.dimensions.widthCm / 100) * (bed.dimensions.heightCm / 100);
  })();

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <TouchableOpacity onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
              <ArrowLeft size={20} color="#374151" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 24, fontWeight: '800', color: '#111827' }}>{bed.name}</Text>
              <Text style={{ fontSize: 12, color: '#6b7280' }}>{garden?.name ?? t('garden.not_found')}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                onPress={() => openAddPlant()}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1a4731', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}
              >
                <Plus size={14} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('bed.add_plant', { defaultValue: 'Add plant' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={openAdjust}
                style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff' }}
              >
                <Text style={{ color: '#374151', fontSize: 12, fontWeight: '700' }}>{t('bed.adjust', { defaultValue: 'Adjust' })}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#e7e0d6', marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>{t('garden.bed_type_label')}</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 10 }}>{bedTypeLabel}</Text>
            {isRaised && (
              <View style={{ marginBottom: 10 }}>
                <Text style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>{t('bed.tiers_label', { defaultValue: 'Tiers' })}</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>{bed.tiers ?? 1}</Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>{t('garden.area_label', { unit: getAreaUnitLabel(unitSystem) })}</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>
                  {areaM2 ? t('garden.area_summary', { value: formatAreaValue(areaM2, unitSystem), unit: getAreaUnitLabel(unitSystem) }) : '—'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>{t('garden.soil_label')}</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>{bed.soilType ?? '—'}</Text>
              </View>
            </View>
          </View>

          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#e7e0d6' }}>
            <View style={{ alignItems: 'center' }}>
              <View
                style={{
                  width: gridWidth,
                  height: gridHeight,
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  backgroundColor: layout.background,
                  borderRadius: layout.borderRadius,
                  borderWidth: layout.borderWidth,
                  borderColor: layout.borderColor,
                  borderStyle: layout.borderStyle ?? 'solid',
                  overflow: 'hidden',
                }}
              >
                {Array.from({ length: layout.cols * layout.rows }).map((_, index) => {
                  const row = Math.floor(index / layout.cols);
                  const col = index % layout.cols;
                  const isAlt = (row + col) % 2 === 0;
                  const outside = isOutsideMask(col, row);
                  const plantEntry = plantByCell.get(`${col},${row}`);
                  const plantLabel = plantEntry?.plant?.nickname ?? '';

                  if (outside) {
                    return (
                      <View
                        key={index}
                        style={{
                          width: cellSize,
                          height: cellSize,
                          backgroundColor: 'transparent',
                          borderWidth: 1,
                          borderColor: 'transparent',
                        }}
                      />
                    );
                  }

                  return (
                    <TouchableOpacity
                      key={index}
                      activeOpacity={0.7}
                      onPress={() => openAddPlant(col, row)}
                      style={{
                        width: cellSize,
                        height: cellSize,
                        backgroundColor: isAlt ? '#f8faf7' : '#ffffff',
                        borderWidth: 1,
                        borderColor: '#e7e0d6',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {plantEntry ? (
                        <View style={{ backgroundColor: '#1a4731', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 10 }}>
                          <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>
                            {plantLabel.slice(0, 2).toUpperCase()}
                            {plantEntry.count > 1 ? `+${plantEntry.count - 1}` : ''}
                          </Text>
                        </View>
                      ) : (
                        <Text style={{ fontSize: 10, color: '#c4bdb3' }}>+</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={adjustOpen} transparent animationType="slide" onRequestClose={() => setAdjustOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setAdjustOpen(false)} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}>
          <View style={{ width: 40, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, alignSelf: 'center', marginBottom: 12 }} />
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 10 }}>
            {t('bed.adjust_title', { defaultValue: 'Adjust bed' })}
          </Text>

          {isRaised && (
            <>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('bed.tiers_label', { defaultValue: 'Tiers' })}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {[1, 2, 3].map((value) => {
                  const active = value === adjustTiers;
                  return (
                    <TouchableOpacity
                      key={value}
                      onPress={() => setAdjustTiers(value)}
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? '#22c55e' : '#fff', borderWidth: 1, borderColor: active ? '#22c55e' : '#e5e7eb' }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#374151' }}>{value}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {isContainer ? (
            <View style={{ marginBottom: adjustInvalid ? 0 : 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
                {t('bed.diameter_label', { unit: getDistanceUnitLabel(unitSystem) })}
              </Text>
              <TextInput
                value={adjustDiameter}
                onChangeText={setAdjustDiameter}
                placeholder={t('garden.dimension_placeholder')}
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: adjustInvalid ? '#f87171' : '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
              />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: adjustInvalid ? 0 : 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
                  {t('garden.width_label', { unit: getDistanceUnitLabel(unitSystem) })}
                </Text>
                <TextInput
                  value={adjustWidth}
                  onChangeText={setAdjustWidth}
                  placeholder={t('garden.dimension_placeholder')}
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: adjustInvalid ? '#f87171' : '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>
                  {t('garden.length_label', { unit: getDistanceUnitLabel(unitSystem) })}
                </Text>
                <TextInput
                  value={adjustLength}
                  onChangeText={setAdjustLength}
                  placeholder={t('garden.dimension_placeholder')}
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: adjustInvalid ? '#f87171' : '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
                />
              </View>
            </View>
          )}
          {adjustInvalid && (
            <Text style={{ fontSize: 11, color: '#ef4444', marginTop: 4, marginBottom: 10 }}>{t('garden.error_dimensions')}</Text>
          )}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <TouchableOpacity
              onPress={() => setAdjustOpen(false)}
              style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ fontWeight: '700', color: '#374151' }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={adjustSaving || adjustInvalid}
              onPress={handleAdjustSave}
              style={{ flex: 1, backgroundColor: '#1a4731', borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: (adjustSaving || adjustInvalid) ? 0.6 : 1 }}
            >
              <Text style={{ fontWeight: '700', color: '#fff' }}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
