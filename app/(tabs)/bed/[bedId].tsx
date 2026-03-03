import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions, Modal, TextInput, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Plus, Search, X, Sprout, Leaf } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useDeviceId } from '../../../lib/deviceId';
import { useBeds } from '../../../hooks/useBeds';
import { usePlants } from '../../../hooks/usePlants';
import { useUnitSystem } from '../../../hooks/useUnitSystem';
import { useTheme } from '../../../lib/theme';
import { formatAreaValue, formatDistanceValue, getAreaUnitLabel, getDistanceUnitLabel, parseDistanceInput } from '../../../lib/units';
import { usePlantLibrary, usePlantGroups } from '../../../hooks/usePlantLibrary';
import { PlantImage } from '../../../components/ui/PlantImage';
import { matchesSearch } from '../../../lib/search';
import { useAppMode } from '../../../hooks/useAppMode';

const BED_LAYOUTS: Record<string, { cols: number; rows: number; borderRadius: number; borderWidth: number; borderStyle?: 'solid' | 'dashed'; mask?: 'circle' }> = {
  in_ground: { cols: 8, rows: 6, borderRadius: 12, borderWidth: 1 },
  raised: { cols: 6, rows: 4, borderRadius: 14, borderWidth: 2 },
  container: { cols: 5, rows: 5, borderRadius: 999, borderWidth: 2, mask: 'circle' },
  no_dig: { cols: 10, rows: 4, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' },
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
  const { t, i18n } = useTranslation();
  const currentLocale = (i18n.language ?? 'en').split('-')[0].toLowerCase();
  const theme = useTheme();
  const router = useRouter();
  const { appMode } = useAppMode();
  const { bedId } = useLocalSearchParams<{ bedId: string }>();
  const resolvedBedId = Array.isArray(bedId) ? bedId[0] : bedId;
  const { width } = useWindowDimensions();
  const unitSystem = useUnitSystem();
  const { deviceId } = useDeviceId();

  useEffect(() => {
    if (appMode === 'gardener') {
      router.replace('/(tabs)/garden');
    }
  }, [appMode, router]);

  // Adjust state
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustWidth, setAdjustWidth] = useState('');
  const [adjustLength, setAdjustLength] = useState('');
  const [adjustDiameter, setAdjustDiameter] = useState('');
  const [adjustCols, setAdjustCols] = useState('');
  const [adjustRows, setAdjustRows] = useState('');
  const [adjustTiers, setAdjustTiers] = useState(1);
  const [adjustSaving, setAdjustSaving] = useState(false);

  // Plant Selector state
  const [plantSelectorOpen, setPlantSelectorOpen] = useState(false);
  const [plantSearch, setPlantSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [targetCell, setTargetCell] = useState<{ x: number; y: number } | null>(null);
  const [addingPlant, setAddingPlant] = useState(false);

  const { beds, isLoading: bedsLoading, updateBed } = useBeds();
  const { plants, addPlant, deletePlant } = usePlants();
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
  const layoutColors = {
    in_ground: { borderColor: theme.border, background: theme.card },
    raised: { borderColor: theme.warning, background: theme.warningBg },
    container: { borderColor: theme.textMuted, background: theme.accent },
    no_dig: { borderColor: theme.success, background: theme.successBg },
  }[bedTypeKey] ?? { borderColor: theme.border, background: theme.card };
  const maxGridWidth = Math.max(1, width - 32);
  const innerWidth = maxGridWidth - (layout.borderWidth * 2);
  const cellSize = Math.floor(innerWidth / layout.cols);
  const gridWidth = cellSize * layout.cols + (layout.borderWidth * 2);
  const gridHeight = cellSize * layout.rows + (layout.borderWidth * 2);

  const plantsInBed = useMemo(
    () => plants.filter(
      (p: any) =>
        p.bedId === bed?._id &&
        (p.status === 'growing' || p.status === 'planning' || p.status === 'planting')
    ),
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

  const { plants: libraryPlants, isLoading: libraryLoading } = usePlantLibrary(i18n.language?.split('-')[0] ?? 'en');
  const { groups } = usePlantGroups();

  const filteredLibrary = useMemo(() => {
    let result = libraryPlants || [];
    if (selectedCategory) result = result.filter(p => p.group === selectedCategory);
    if (plantSearch.trim()) {
      result = result.filter(p => matchesSearch(plantSearch, [p.displayName, p.scientificName]));
    }
    return result;
  }, [libraryPlants, selectedCategory, plantSearch]);

  if (bedsLoading || gardensQuery === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.success} />
      </View>
    );
  }

  if (!bed) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <Text style={{ color: theme.textSecondary }}>{t('bed.not_found')}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: theme.primary, fontWeight: '600' }}>{t('bed.go_back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const bedTypeLabel = t(`garden.bed_type_${bedTypeKey}`);
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
    setAdjustCols(computedCols ? String(computedCols) : '');
    setAdjustRows(computedRows ? String(computedRows) : '');
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
      if (!firstEmptyCell) {
        Alert.alert(t('bed.no_space'));
        return;
      }
      targetX = firstEmptyCell.x;
      targetY = firstEmptyCell.y;
    }
    setTargetCell({ x: targetX, y: targetY });
    setPlantSelectorOpen(true);
  };

  const handleAddPlantFromSelector = async (plantMasterId: string) => {
    if (!bed || !targetCell) return;
    setAddingPlant(true);
    try {
      await addPlant({
        plantMasterId: plantMasterId as any,
        bedId: bed._id,
        positionInBed: { ...targetCell, width: 1, height: 1 },
      });
      setPlantSelectorOpen(false);
      setPlantSearch('');
      setSelectedCategory(undefined);
    } finally {
      setAddingPlant(false);
    }
  };

  const handleDeletePlantFromBed = (plant: any) => {
    Alert.alert(
      t('common.confirm'),
      t('bed.delete_plant_confirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void deletePlant(plant._id as any).catch(() => {
              Alert.alert(
                t('common.error'),
                t('bed.delete_plant_failed')
              );
            });
          },
        },
      ]
    );
  };

  const openCellAction = (col: number, row: number, plantEntry?: { plant: any; count: number }) => {
    if (!plantEntry) {
      openAddPlant(col, row);
      return;
    }

    Alert.alert(
      plantEntry.plant.displayName ?? plantEntry.plant.scientificName ?? t('bed.plant_in_cell'),
      t('bed.choose_action'),
      [
        {
          text: t('common.view_details'),
          onPress: () =>
            router.push({
              pathname: '/(tabs)/plant/[userPlantId]',
              params: {
                userPlantId: String(plantEntry.plant._id),
                from: 'bed',
                bedId: String(resolvedBedId),
                gardenId: bed?.gardenId ? String(bed.gardenId) : undefined,
              },
            }),
        },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => handleDeletePlantFromBed(plantEntry.plant),
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  };

  const handleAdjustSave = async () => {
    if (!bed || adjustInvalid) return;
    setAdjustSaving(true);
    try {
      const parsedCols = parseInt(adjustCols);
      const parsedRows = parseInt(adjustRows);

      let widthCm = isContainer
        ? Math.round((adjustParsedDiameter ?? 0) * 100)
        : Math.round((adjustParsedWidth ?? 0) * 100);
      let heightCm = isContainer
        ? Math.round((adjustParsedDiameter ?? 0) * 100)
        : Math.round((adjustParsedLength ?? 0) * 100);

      if (!isContainer && !isNaN(parsedCols) && !isNaN(parsedRows)) {
        widthCm = parsedCols * cellCm;
        heightCm = parsedRows * cellCm;
      }

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
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 0, gap: 16, paddingBottom: 100 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent, borderRadius: 12, marginRight: 12 }}
          >
            <ArrowLeft size={20} color={theme.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>{bed.name}</Text>
            <Text style={{ fontSize: 13, color: theme.textSecondary }}>{garden?.name ?? t('garden.not_found')}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={() => openAddPlant()}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.primary, borderRadius: 16, paddingVertical: 14 }}
          >
            <Plus size={18} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.2 }}>{t('bed.add_plant')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openAdjust}
            style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', shadowColor: '#1a1a18', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}
          >
            <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '700' }}>{t('bed.adjust')}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: theme.border, gap: 16, shadowColor: '#1a1a18', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
          <View style={{ flexDirection: 'row', gap: 20 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>{t('garden.bed_type_label')}</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{bedTypeLabel}</Text>
            </View>
            {isRaised && (
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>{t('bed.tiers_label')}</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{bed.tiers ?? 1}</Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 20 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>{t('garden.area_label', { unit: getAreaUnitLabel(unitSystem) })}</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>
                {areaM2 ? t('garden.area_summary', { value: formatAreaValue(areaM2, unitSystem), unit: getAreaUnitLabel(unitSystem) }) : '—'}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>{t('garden.soil_label')}</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{bed.soilType ?? '—'}</Text>
            </View>
          </View>
        </View>

        <View style={{ alignItems: 'center', paddingTop: 8 }}>
          <View
            style={{
              width: gridWidth,
              height: gridHeight,
              flexDirection: 'row',
              flexWrap: 'wrap',
              backgroundColor: layoutColors.background,
              borderRadius: layout.borderRadius,
              borderWidth: layout.borderWidth,
              borderColor: layoutColors.borderColor,
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
              const masterPlant = plantEntry ? libraryPlants?.find(p => p._id === plantEntry.plant.plantMasterId) : null;

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
                  onPress={() => openCellAction(col, row, plantEntry)}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    backgroundColor: isAlt ? '#a06045' : '#6e3314',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.05)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {plantEntry ? (
                    <View style={{ width: cellSize, height: cellSize, alignItems: 'center', justifyContent: 'center' }}>
                      <PlantImage
                        uri={masterPlant?.imageUrl}
                        size={cellSize * 0.74}
                        borderRadius={0}
                      />
                      {plantEntry.count > 1 && (
                        <View style={{ position: 'absolute', bottom: 4, right: 4, backgroundColor: theme.primary, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } }}>
                          <Text style={{ fontSize: 9, color: '#fff', fontWeight: '900' }}>
                            +{plantEntry.count - 1}
                          </Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', fontWeight: '300' }}>+</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <Modal visible={adjustOpen} transparent animationType="slide" onRequestClose={() => setAdjustOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={() => setAdjustOpen(false)} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: theme.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}>
          <View style={{ width: 40, height: 4, backgroundColor: theme.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
          <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text, marginBottom: 20, letterSpacing: -0.5 }}>
            {t('bed.adjust_title')}
          </Text>

          <View style={{ gap: 20, marginBottom: 24 }}>
            {isRaised && (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('bed.tiers_label')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {[1, 2, 3].map((value) => {
                    const active = value === adjustTiers;
                    return (
                      <TouchableOpacity
                        key={value}
                        onPress={() => setAdjustTiers(value)}
                        style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: active ? theme.primary : theme.accent, borderWidth: 1, borderColor: active ? theme.primary : theme.border }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : theme.textSecondary }}>{value}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {isContainer ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>
                  {t('bed.diameter_label', { unit: getDistanceUnitLabel(unitSystem) })}
                </Text>
                <TextInput
                  value={adjustDiameter}
                  onChangeText={setAdjustDiameter}
                  placeholder={t('garden.dimension_placeholder')}
                  placeholderTextColor={theme.textMuted}
                  keyboardType="numeric"
                  style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: adjustInvalid ? theme.danger : theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                />
              </View>
            ) : (
              <View style={{ gap: 20 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1, gap: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>
                      {t('bed.cols_label')}
                    </Text>
                    <TextInput
                      value={adjustCols}
                      onChangeText={setAdjustCols}
                      placeholder="8"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="numeric"
                      style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>
                      {t('bed.rows_label')}
                    </Text>
                    <TextInput
                      value={adjustRows}
                      onChangeText={setAdjustRows}
                      placeholder="6"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="numeric"
                      style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1, gap: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>
                      {t('garden.width_label', { unit: getDistanceUnitLabel(unitSystem) })}
                    </Text>
                    <TextInput
                      value={adjustWidth}
                      onChangeText={setAdjustWidth}
                      placeholder={t('garden.dimension_placeholder')}
                      placeholderTextColor={theme.textMuted}
                      keyboardType="numeric"
                      style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: adjustInvalid ? theme.danger : theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>
                      {t('garden.length_label', { unit: getDistanceUnitLabel(unitSystem) })}
                    </Text>
                    <TextInput
                      value={adjustLength}
                      onChangeText={setAdjustLength}
                      placeholder={t('garden.dimension_placeholder')}
                      placeholderTextColor={theme.textMuted}
                      keyboardType="numeric"
                      style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: adjustInvalid ? theme.danger : theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                    />
                  </View>
                </View>
              </View>
            )}
            {adjustInvalid && (
              <Text style={{ fontSize: 11, color: theme.danger, marginTop: -4 }}>{t('garden.error_dimensions')}</Text>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              onPress={() => setAdjustOpen(false)}
              style={{ flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textSecondary }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={adjustSaving || adjustInvalid}
              onPress={handleAdjustSave}
              style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: (adjustSaving || adjustInvalid) ? 0.5 : 1 }}
            >
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.2 }}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Plant Selector Modal */}
      <Modal visible={plantSelectorOpen} transparent animationType="slide" onRequestClose={() => setPlantSelectorOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setPlantSelectorOpen(false)} />
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, top: 120, backgroundColor: theme.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 16 }}>
          <View style={{ width: 40, height: 4, backgroundColor: theme.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>{t('bed.add_plant')}</Text>
            <TouchableOpacity onPress={() => setPlantSelectorOpen(false)} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent, borderRadius: 16 }}>
              <X size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={{ gap: 12, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.background, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: theme.border }}>
              <Search size={16} color={theme.textMuted} />
              <TextInput
                style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 10, fontSize: 15, color: theme.text }}
                placeholder={t('library.search_placeholder')}
                placeholderTextColor={theme.textMuted}
                value={plantSearch}
                onChangeText={setPlantSearch}
              />
              {!!plantSearch && (
                <TouchableOpacity onPress={() => setPlantSearch('')}>
                  <X size={16} color={theme.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <TouchableOpacity
                onPress={() => setSelectedCategory(undefined)}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: selectedCategory === undefined ? theme.primary : theme.accent, borderWidth: 1, borderColor: selectedCategory === undefined ? theme.primary : theme.border }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: selectedCategory === undefined ? '#fff' : theme.textSecondary }}>{t('library.filter_all')}</Text>
              </TouchableOpacity>
              {groups.map(g => {
                const active = selectedCategory === g.key;
                const translated = t(`plantGroups.${g.key}`);
                const label =
                  translated !== `plantGroups.${g.key}`
                    ? translated
                    : (g.displayName?.[currentLocale] ?? g.displayName?.en ?? g.key);
                return (
                  <TouchableOpacity
                    key={g.key}
                    onPress={() => setSelectedCategory(active ? undefined : g.key)}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? theme.primary : theme.accent, borderWidth: 1, borderColor: active ? theme.primary : theme.border }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : theme.textSecondary }}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60, gap: 10 }}>
            {libraryLoading ? (
              <ActivityIndicator color={theme.primary} style={{ marginTop: 20 }} />
            ) : filteredLibrary.map(plant => (
              <TouchableOpacity
                key={plant._id}
                onPress={() => handleAddPlantFromSelector(plant._id)}
                disabled={addingPlant}
                style={{ backgroundColor: theme.background, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: theme.border }}
              >
                <PlantImage uri={plant.imageUrl} size={48} borderRadius={10} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{plant.displayName}</Text>
                  <Text style={{ fontSize: 12, color: theme.textSecondary, fontStyle: 'italic' }}>{plant.scientificName}</Text>
                </View>
                <Plus size={18} color={theme.primary} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
