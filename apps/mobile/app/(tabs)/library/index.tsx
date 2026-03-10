import { useState, useMemo, useEffect, useRef, useCallback, useDeferredValue } from 'react';
import {
    View,
    Text,
    ScrollView,
    FlatList,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Modal,
    Pressable,
    Animated,
    LayoutChangeEvent,
    PanResponder,
    StyleSheet,
} from 'react-native';
import { Search, X, Droplets, Sun, Clock, Bug, Heart, ShieldAlert, BookOpen, ScanSearch, Dna, Tags, SlidersHorizontal } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { usePlantLibrary, usePlantGroups } from '../../../hooks/usePlantLibrary';
import { PlantImage } from '../../../components/ui/PlantImage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '../../../../../packages/convex/_generated/api';
import { usePlants } from '../../../hooks/usePlants';
import { useBeds } from '../../../hooks/useBeds';
import { usePlantDisplayName } from '../../../hooks/usePlantLocalized';
import { useUnitSystem } from '../../../hooks/useUnitSystem';
import { usePlantScanner } from '../../../hooks/usePlantScanner';
import { formatLengthCm, formatSeedsPerArea, formatPlantsPerArea, formatWaterPerArea, formatYieldPerArea } from '../../../lib/units';
import { matchesSearch } from '../../../lib/search';
import { formatPlantFamilyDisplayName } from '../../../../../packages/shared/src/plantFamily';
import { useFavorites } from '../../../hooks/useFavorites';
import { usePestsDiseases, PestDiseaseType } from '../../../hooks/usePestsDiseases';
import { loadCachedCareContent, parseCareContent, saveCareContent, type PlantCareContent } from '../../../lib/plantCareCache';
import { useTheme } from '../../../lib/theme';
import { useThemeContext } from '../../../lib/ThemeContext';
import { compareGroupsForOnboarding, getOnboardingFocusItems, scorePlantForOnboarding } from '../../../lib/personalization';
import { buildSortedPlantUiClusters } from '../../../../../packages/shared/src/plantUiClusters';
import { AddPlantTargetModal, type AddPlantTargetMode } from '../../../components/ui/AddPlantTargetModal';
import { useAppMode } from '../../../hooks/useAppMode';
import { useAddPlantFlow } from '../../../hooks/useAddPlantFlow';
import { useUserSettings } from '../../../hooks/useUserSettings';

type LibraryTab = 'plants' | 'pests' | 'guide';
type PlantBrowseMode = 'common' | 'families';
type LayoutMode = 'list' | 'grid';

const LIBRARY_TABS: LibraryTab[] = ['plants', 'pests', 'guide'];
const PLANT_BROWSE_MODES: PlantBrowseMode[] = ['common', 'families'];

const GROUP_ICONS: Record<string, string> = {
    herbs: '🌿',
    vegetables: '🥦',
    fruits: '🍎',
    nightshades: '🍅',
    alliums: '🧅',
    leafy_greens: '🥬',
    roots: '🥕',
    legumes: '🫘',
    indoor: '🪴',
    flowers: '🌸',
};

function normalizeTab(value?: string): LibraryTab {
    if (!value) return 'plants';
    if (value === 'diseases') return 'pests';
    return LIBRARY_TABS.includes(value as LibraryTab) ? (value as LibraryTab) : 'plants';
}

function normalizeBrowseMode(value?: string): PlantBrowseMode {
    if (!value) return 'common';
    return PLANT_BROWSE_MODES.includes(value as PlantBrowseMode)
        ? (value as PlantBrowseMode)
        : 'common';
}

function buildLibraryRoutePassthrough(params: Record<string, string | string[] | undefined>) {
    const keys = ['mode', 'from', 'userPlantId', 'bedId', 'x', 'y', 'backFrom', 'backBedId', 'backGardenId'];
    const next: Record<string, string> = {};
    for (const key of keys) {
        const value = params[key];
        const normalized = Array.isArray(value) ? value[0] : value;
        if (typeof normalized === 'string' && normalized.length > 0) {
            next[key] = normalized;
        }
    }
    return next;
}

function formatScientificLabel(plant: any) {
    const scientificName = String(plant?.scientificName ?? '').trim();
    const cultivar = typeof plant?.cultivar === 'string' ? plant.cultivar.trim() : '';
    const normalizedScientific = scientificName.toLowerCase().replace(/\s+/g, ' ').trim();
    const normalizedCultivar = cultivar.toLowerCase().replace(/\s+/g, ' ').trim();

    if (!scientificName) return '—';
    if (!cultivar) return scientificName;
    if (normalizedScientific.includes(normalizedCultivar)) return scientificName;
    return `${scientificName} '${cultivar}'`;
}

function getSpeciesGroupTitle(basePlant: any) {
    if (!basePlant) return 'Plant';
    if (basePlant.uiGroupLabel) {
        return String(basePlant.uiGroupLabel);
    }

    return String(basePlant.displayName ?? basePlant.scientificName ?? 'Plant');
}

const LIGHT_META: Record<string, { key: string; color: string }> = {
    full_sun: { key: 'library.light_full_sun', color: '#f59e0b' },
    partial_shade: { key: 'library.light_partial_shade', color: '#84cc16' },
    shade: { key: 'library.light_shade', color: '#78716c' },
};

const CARE_SECTION_META: Array<{ key: keyof PlantCareContent; titleKey: string }> = [
    { key: 'watering', titleKey: 'library.care_watering' },
    { key: 'fertilizing', titleKey: 'library.care_fertilizing' },
    { key: 'location', titleKey: 'library.care_location' },
    { key: 'soil', titleKey: 'library.care_soil' },
    { key: 'nutrition', titleKey: 'library.care_nutrition' },
    { key: 'propagation', titleKey: 'library.care_propagation' },
    { key: 'temperature', titleKey: 'library.care_temperature' },
    { key: 'toxicity', titleKey: 'library.care_toxicity' },
];

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    const theme = useTheme();
    return (
        <View style={{ flex: 1, backgroundColor: theme.accent, borderRadius: 10, padding: 12, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: theme.border }}>
            {icon}
            <Text style={{ fontSize: 13, fontWeight: '500', color: theme.text }}>{value}</Text>
            <Text style={{ fontSize: 11, color: theme.textMuted }}>{label}</Text>
        </View>
    );
}

// ─── Plant Detail Modal ───────────────────────────────────────────────────────
function PlantDetailModal({
    plant,
    care,
    onClose,
    showAdd,
    addLabel,
    onAdd,
    isFavorite,
    onToggleFavorite,
    canFavorite,
}: {
    plant: any;
    care: PlantCareContent | null;
    onClose: () => void;
    showAdd: boolean;
    addLabel?: string;
    onAdd: () => void;
    isFavorite: boolean;
    onToggleFavorite: () => void;
    canFavorite: boolean;
}) {
    const { t } = useTranslation();
    const theme = useTheme();
    const { displayName, scientificName, description } = usePlantDisplayName(plant);
    const lightMeta = LIGHT_META[plant.lightRequirements ?? ''];
    const lightLabel = lightMeta ? t(lightMeta.key) : plant.lightRequirements;
    const unitSystem = useUnitSystem();
    const careSections = CARE_SECTION_META
        .map(({ key, titleKey }) => ({ key, title: t(titleKey), content: care?.[key] }))
        .filter((section) => section.content && ((section.content.items?.length ?? 0) > 0 || !!section.content.intro));

    const pan = useRef(new Animated.ValueXY()).current;
    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    pan.setValue({ x: 0, y: gestureState.dy });
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 120 || gestureState.vy > 0.5) {
                    onClose();
                    Animated.timing(pan, { toValue: { x: 0, y: 500 }, duration: 200, useNativeDriver: false }).start();
                } else {
                    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
                }
            },
        })
    ).current;

    useEffect(() => {
        pan.setValue({ x: 0, y: 0 });
    }, [plant._id, pan]);

    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <Animated.View
                    {...panResponder.panHandlers}
                    style={{
                        backgroundColor: theme.card,
                        borderTopLeftRadius: 12,
                        borderTopRightRadius: 12,
                        paddingHorizontal: 20,
                        paddingTop: 12,
                        paddingBottom: 48,
                        maxHeight: '88%',
                        transform: [{ translateY: pan.y }],
                    }}
                >
                    <View style={{ width: 40, height: 5, backgroundColor: theme.border, borderRadius: 2.5, alignSelf: 'center', marginBottom: 20 }} />

                    <ScrollView showsVerticalScrollIndicator={false}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                            <View style={{ flex: 1, gap: 4 }}>
                                <Text style={{ fontSize: 22, fontWeight: '500', color: theme.text, letterSpacing: -0.5 }}>{displayName}</Text>
                                <Text style={{ fontSize: 12, color: theme.textMuted, fontStyle: 'italic' }}>{scientificName}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 }}>
                                {canFavorite && (
                                    <TouchableOpacity
                                        onPress={onToggleFavorite}
                                        testID="e2e-library-modal-favorite"
                                        style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border }}
                                    >
                                        <Heart size={17} stroke={isFavorite ? '#ef4444' : '#a3a3a3'} fill={isFavorite ? '#ef4444' : 'none'} />
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity onPress={onClose} testID="e2e-library-modal-close" style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border }}>
                                    <X size={18} stroke={theme.textSecondary} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={{ alignItems: 'center', marginBottom: 20 }}>
                            <PlantImage uri={plant.imageUrl} size={120} borderRadius={12} />
                        </View>

                        {!!description && (
                            <View style={{ backgroundColor: theme.background, borderRadius: 10, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: theme.border }}>
                                <Text style={{ fontSize: 14, color: theme.textAccent, lineHeight: 22 }}>{description}</Text>
                            </View>
                        )}

                        {showAdd && (
                            <TouchableOpacity
                                onPress={onAdd}
                                testID="e2e-library-modal-add"
                                style={{ backgroundColor: theme.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 16 }}
                            >
                                <Text style={{ color: '#fff', fontWeight: '500', letterSpacing: 0.2 }}>
                                    {addLabel ?? t('library.add_to_planning')}
                                </Text>
                            </TouchableOpacity>
                        )}

                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                            {plant.typicalDaysToHarvest && (
                                <StatCard icon={<Clock size={18} stroke={theme.primary} />} label={t('library.stat_harvest')} value={t('library.days_value', { count: plant.typicalDaysToHarvest })} />
                            )}
                            {plant.wateringFrequencyDays && (
                                <StatCard icon={<Droplets size={18} stroke={theme.primary} />} label={t('library.stat_watering')} value={t('library.watering_every', { days: plant.wateringFrequencyDays })} />
                            )}
                            {plant.lightRequirements && (
                                <StatCard icon={<Sun size={18} stroke={theme.warning} />} label={t('library.stat_light')} value={lightLabel ?? plant.lightRequirements} />
                            )}
                        </View>

                        {plant.germinationDays > 0 && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
                                <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('library.detail_germination')}</Text>
                                <Text style={{ fontSize: 14, fontWeight: '500', color: theme.text }}>{t('library.days_value', { count: plant.germinationDays })}</Text>
                            </View>
                        )}
                        {plant.spacingCm && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
                                <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('library.detail_spacing')}</Text>
                                <Text style={{ fontSize: 14, fontWeight: '500', color: theme.text }}>{formatLengthCm(plant.spacingCm, unitSystem)}</Text>
                            </View>
                        )}
                        {plant.maxPlantsPerM2 && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
                                <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('library.detail_max_plants')}</Text>
                                <Text style={{ fontSize: 14, fontWeight: '500', color: theme.text }}>{formatPlantsPerArea(plant.maxPlantsPerM2, unitSystem)}</Text>
                            </View>
                        )}
                        {plant.seedRatePerM2 && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
                                <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('library.detail_seed_rate')}</Text>
                                <Text style={{ fontSize: 14, fontWeight: '500', color: theme.text }}>{formatSeedsPerArea(plant.seedRatePerM2, unitSystem)}</Text>
                            </View>
                        )}
                        {plant.waterLitersPerM2 && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
                                <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('library.detail_water_per_area')}</Text>
                                <Text style={{ fontSize: 14, fontWeight: '500', color: theme.text }}>{formatWaterPerArea(plant.waterLitersPerM2, unitSystem)}</Text>
                            </View>
                        )}
                        {plant.yieldKgPerM2 && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
                                <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('library.detail_yield_per_area')}</Text>
                                <Text style={{ fontSize: 14, fontWeight: '500', color: theme.text }}>{formatYieldPerArea(plant.yieldKgPerM2, unitSystem)}</Text>
                            </View>
                        )}
                        {plant.source && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
                                <Text style={{ fontSize: 14, color: theme.textSecondary }}>{t('library.detail_propagation')}</Text>
                                <Text style={{ fontSize: 14, fontWeight: '500', color: theme.text }}>{t(`library.source_${plant.source}`)}</Text>
                            </View>
                        )}

                        {plant.purposes?.length > 0 && (
                            <View style={{ marginTop: 16 }}>
                                <Text style={{ fontSize: 13, fontWeight: '500', color: theme.textAccent, marginBottom: 8 }}>{t('library.detail_uses')}</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                    {plant.purposes.map((p: string) => (
                                        <View key={p} style={{ backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                                            <Text style={{ fontSize: 12, color: theme.primary, fontWeight: '500', textTransform: 'capitalize' }}>
                                                {t(`purposes.${p}`)}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}

                        {careSections.length > 0 && (
                            <View style={{ marginTop: 20, gap: 12 }}>
                                <Text style={{ fontSize: 16, fontWeight: '500', color: theme.text }}>
                                    {t('library.section_care')}
                                </Text>
                                {careSections.map((section) => (
                                    <View
                                        key={section.key}
                                        style={{
                                            backgroundColor: theme.background,
                                            borderRadius: 10,
                                            padding: 12,
                                            borderWidth: 1,
                                            borderColor: theme.border,
                                        }}
                                    >
                                        <Text style={{ fontSize: 13, fontWeight: '500', color: theme.text, marginBottom: 6 }}>
                                            {section.title}
                                        </Text>
                                        {!!section.content?.intro && (
                                            <Text style={{ fontSize: 12, color: theme.textAccent, lineHeight: 18, marginBottom: section.content.items?.length ? 6 : 0 }}>
                                                {section.content.intro}
                                            </Text>
                                        )}
                                        {section.content?.items?.map((item, idx) => (
                                            <Text key={`${section.key}-${idx}`} style={{ fontSize: 12, color: theme.textAccent, lineHeight: 18 }}>
                                                - {item}
                                            </Text>
                                        ))}
                                    </View>
                                ))}
                            </View>
                        )}
                    </ScrollView>
                </Animated.View>
            </View>
        </Modal>
    );
}
// ─── Plant Card ───────────────────────────────────────────────────────────────
function PlantCard({
    plant,
    onPress,
    onToggleFavorite,
    isFavorite,
    testID,
}: {
    plant: any;
    onPress: () => void;
    onToggleFavorite: () => void;
    isFavorite: boolean;
    testID?: string;
}) {
    const theme = useTheme();
    const { isDark } = useThemeContext();
    const { displayName } = usePlantDisplayName(plant);
    const scientificLabel = formatScientificLabel(plant);

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            testID={testID}
            style={{
                backgroundColor: theme.card,
                borderRadius: 12,
                padding: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                borderWidth: 1,
                borderColor: theme.border,
                shadowColor: isDark ? '#000000' : '#1a1a18',
                shadowOpacity: 0.06,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
            }}
        >
            <PlantImage uri={plant.imageUrl} size={52} borderRadius={10} />
            <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 15, fontWeight: '500', color: theme.text, letterSpacing: -0.3 }} numberOfLines={1}>{displayName}</Text>
                <Text style={{ fontSize: 12, color: theme.textMuted, fontStyle: 'italic' }} numberOfLines={1}>
                    {scientificLabel}
                </Text>
            </View>
            <Pressable
                onPress={(event) => {
                    event.stopPropagation?.();
                    onToggleFavorite();
                }}
                hitSlop={8}
                testID="e2e-library-favorite-toggle"
            >
                <Heart
                    size={18}
                    stroke={isFavorite ? '#ef4444' : '#a3a3a3'}
                    fill={isFavorite ? '#ef4444' : 'none'}
                />
            </Pressable>
        </TouchableOpacity>
    );
}

function PlantGridCard({
    plant,
    onPress,
    onToggleFavorite,
    isFavorite,
    testID,
}: {
    plant: any;
    onPress: () => void;
    onToggleFavorite: () => void;
    isFavorite: boolean;
    testID?: string;
}) {
    const theme = useTheme();
    const { isDark } = useThemeContext();
    const { displayName } = usePlantDisplayName(plant);

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            testID={testID}
            style={{
                backgroundColor: theme.card,
                borderRadius: 12,
                overflow: 'hidden',
                flex: 1,
                borderWidth: 1,
                borderColor: theme.border,
                shadowColor: isDark ? '#000000' : '#1a1a18',
                shadowOpacity: 0.05,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
            }}
        >
            <View style={{ height: 140, width: '100%', backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
                <PlantImage uri={plant.imageUrl} size="100%" borderRadius={0} />
                <Pressable
                    onPress={(event) => {
                        event.stopPropagation?.();
                        onToggleFavorite();
                    }}
                    hitSlop={12}
                    style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        backgroundColor: 'rgba(0,0,0,0.25)',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <Heart
                        size={16}
                        stroke={isFavorite ? '#ef4444' : '#fff'}
                        fill={isFavorite ? '#ef4444' : 'none'}
                    />
                </Pressable>
            </View>
            <View style={{ padding: 12, gap: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: theme.text }} numberOfLines={2}>
                    {displayName}
                </Text>
            </View>
        </TouchableOpacity>
    );
}

function SpeciesGroupHeader({ basePlant, count }: { basePlant: any; count: number }) {
    const theme = useTheme();
    const title = getSpeciesGroupTitle(basePlant);
    const subtitle = String(basePlant?.scientificName ?? '');

    return (
        <View style={{ gap: 10, paddingTop: 8, paddingBottom: 4 }}>
            <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: 4 }} />
            <View
                style={{
                    paddingHorizontal: 4,
                }}
            >
                <Text style={{ fontSize: 13, fontWeight: '500', color: theme.textSecondary }}>
                    {title} ({count})
                </Text>
                {!!subtitle && (
                    <Text style={{ fontSize: 11, color: theme.textMuted, fontStyle: 'italic' }}>
                        {subtitle}
                    </Text>
                )}
            </View>
        </View>
    );
}

// ─── Pest & Disease Card ──────────────────────────────────────────────────────
function PestDiseaseCard({ item, onPress }: { item: any; onPress: () => void }) {
    const { t } = useTranslation();
    const theme = useTheme();
    const { isDark } = useThemeContext();
    const typeColor = item.type === 'disease' ? '#2563eb' : '#b91c1c';
    const typeBg = item.type === 'disease'
        ? (isDark ? '#1e3a8a' : '#dbeafe')
        : (isDark ? '#7f1d1d' : '#fee2e2');
    const typeLabel = item.type === 'disease' ? t('library.disease_label') : t('library.pest_label');
    const chips = item.plantsAffected?.slice(0, 4) ?? [];
    const extra = (item.plantsAffected?.length ?? 0) - chips.length;

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.85}
            style={{
                backgroundColor: theme.card,
                borderRadius: 12,
                padding: 16,
                borderWidth: 1,
                borderColor: theme.border,
                shadowColor: isDark ? '#000000' : '#1a1a18',
                shadowOpacity: 0.06,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
                gap: 10,
            }}
        >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flexDirection: 'row', flex: 1, gap: 12 }}>
                    <PlantImage uri={item.imageUrl} size={56} borderRadius={10} />
                    <Text style={{ fontSize: 16, fontWeight: '500', color: theme.text, flex: 1, letterSpacing: -0.3 }}>{item.name}</Text>
                </View>
                <View style={{ backgroundColor: typeBg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8, marginLeft: 8 }}>
                    <Text style={{ color: typeColor, fontSize: 11, fontWeight: '500' }}>{typeLabel}</Text>
                </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {chips.map((plant: string) => (
                    <View key={plant} style={{ backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 11, color: theme.textAccent, fontWeight: '500' }}>{plant}</Text>
                    </View>
                ))}
                {extra > 0 && (
                    <View style={{ backgroundColor: theme.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: theme.border }}>
                        <Text style={{ fontSize: 11, color: theme.textMuted, fontWeight: '500' }}>{t('library.more_items', { count: extra })}</Text>
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
}

// ─── Pest Detail Section helper ───────────────────────────────────────────────
function InfoSection({ title, items }: { title: string; items?: string[] }) {
    const theme = useTheme();
    if (!items || items.length === 0) return null;
    return (
        <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: theme.textAccent, marginBottom: 6 }}>{title}</Text>
            {items.map((item, idx) => (
                <Text key={`${title}-${idx}`} style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 20 }}>- {item}</Text>
            ))}
        </View>
    );
}

function PestDiseaseDetailModal({ item, onClose }: { item: any; onClose: () => void }) {
    const { t } = useTranslation();
    const theme = useTheme();

    const pan = useRef(new Animated.ValueXY()).current;
    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    pan.setValue({ x: 0, y: gestureState.dy });
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 120 || gestureState.vy > 0.5) {
                    onClose();
                    Animated.timing(pan, { toValue: { x: 0, y: 500 }, duration: 200, useNativeDriver: false }).start();
                } else {
                    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
                }
            },
        })
    ).current;

    useEffect(() => {
        pan.setValue({ x: 0, y: 0 });
    }, [item?._id, pan]);

    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <Animated.View
                    {...panResponder.panHandlers}
                    style={{
                        backgroundColor: theme.card,
                        borderTopLeftRadius: 12,
                        borderTopRightRadius: 12,
                        paddingHorizontal: 20,
                        paddingTop: 12,
                        paddingBottom: 40,
                        maxHeight: '85%',
                        transform: [{ translateY: pan.y }],
                    }}
                >
                    <View style={{ width: 40, height: 5, backgroundColor: theme.border, borderRadius: 2.5, alignSelf: 'center', marginBottom: 16 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <Text style={{ fontSize: 22, fontWeight: '500', color: theme.text, flex: 1 }}>{item.name}</Text>
                        <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
                            <X size={20} stroke={theme.textSecondary} />
                        </TouchableOpacity>
                    </View>
                    <View style={{ alignItems: 'center', marginBottom: 14 }}>
                        <PlantImage uri={item.imageUrl} size={180} borderRadius={12} />
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <InfoSection title={t('health.section_identification')} items={item.identification} />
                        <InfoSection title={t('health.section_damage')} items={item.damage} />
                        <InfoSection title={t('health.section_prevention')} items={item.prevention} />
                        <InfoSection title={t('health.section_plants')} items={item.plantsAffected} />
                    </ScrollView>
                </Animated.View>
            </View>
        </Modal>
    );
}

// ─── Guide Tab ────────────────────────────────────────────────────────────────
function GuideTab() {
    const { t } = useTranslation();
    const theme = useTheme();
    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 }}>
            <BookOpen size={48} stroke={theme.textMuted} />
            <Text style={{ fontSize: 16, fontWeight: '500', color: theme.textMuted, textAlign: 'center' }}>
                {t('library.section_guides')}
            </Text>
            <Text style={{ fontSize: 13, color: theme.textMuted, textAlign: 'center' }}>
                {t('library.section_soon')}
            </Text>
        </View>
    );
}

function TaxonomyCard({
    title,
    subtitle,
    imageUrl,
    meta,
    onPress,
}: {
    title: string;
    subtitle?: string;
    imageUrl?: string | null;
    meta: string;
    onPress: () => void;
}) {
    const theme = useTheme();
    const { isDark } = useThemeContext();

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            style={{
                backgroundColor: theme.card,
                borderRadius: 12,
                padding: 14,
                borderWidth: 1,
                borderColor: theme.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                shadowColor: isDark ? '#000000' : '#1a1a18',
                shadowOpacity: 0.06,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
            }}
        >
            <PlantImage uri={imageUrl ?? undefined} size={52} borderRadius={10} />
            <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 15, fontWeight: '500', color: theme.text }} numberOfLines={1}>
                    {title}
                </Text>
                {!!subtitle && (
                    <Text style={{ fontSize: 12, color: theme.textSecondary }} numberOfLines={1}>
                        {subtitle}
                    </Text>
                )}
                <Text style={{ fontSize: 11, color: theme.textMuted }} numberOfLines={1}>
                    {meta}
                </Text>
            </View>
        </TouchableOpacity>
    );
}

function TaxonomyGridCard({
    title,
    subtitle,
    imageUrl,
    meta,
    onPress,
}: {
    title: string;
    subtitle?: string;
    imageUrl?: string | null;
    meta: string;
    onPress: () => void;
}) {
    const theme = useTheme();
    const { isDark } = useThemeContext();

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            style={{
                backgroundColor: theme.card,
                borderRadius: 12,
                overflow: 'hidden',
                flex: 1,
                borderWidth: 1,
                borderColor: theme.border,
                shadowColor: isDark ? '#000000' : '#1a1a18',
                shadowOpacity: 0.05,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
            }}
        >
            <View style={{ height: 120, width: '100%', backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
                <PlantImage uri={imageUrl} size="100%" borderRadius={0} />
            </View>
            <View style={{ padding: 12, gap: 2 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: theme.text }} numberOfLines={1}>
                    {title}
                </Text>
                <Text style={{ fontSize: 11, color: theme.textSecondary, fontStyle: 'italic', marginBottom: 4 }} numberOfLines={1}>
                    {subtitle}
                </Text>
                <Text style={{ fontSize: 10, color: theme.textMuted }} numberOfLines={1}>
                    {meta.replace(/ • /g, ' · ')}
                </Text>
            </View>
        </TouchableOpacity>
    );
}

function BrowseModeMenu({
    visible,
    value,
    layoutMode,
    groups,
    selectedGroup,
    onClose,
    onSelect,
    onSelectGroup,
    onToggleLayout,
}: {
    visible: boolean;
    value: PlantBrowseMode;
    layoutMode: LayoutMode;
    groups: any[];
    selectedGroup?: string;
    onClose: () => void;
    onSelect: (next: PlantBrowseMode) => void;
    onSelectGroup: (next?: string) => void;
    onToggleLayout: (next: LayoutMode) => void;
}) {
    const { t, i18n } = useTranslation();
    const theme = useTheme();
    const { isDark } = useThemeContext();
    const translateX = useRef(new Animated.Value(400)).current;

    useEffect(() => {
        Animated.timing(translateX, {
            toValue: visible ? 0 : 400,
            duration: 270,
            useNativeDriver: true,
        }).start();
    }, [translateX, visible]);

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, gestureState) =>
                Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && gestureState.dx > 6,
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dx > 0) {
                    translateX.setValue(gestureState.dx);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dx > 80 || gestureState.vx > 0.5) {
                    Animated.timing(translateX, {
                        toValue: 400,
                        duration: 200,
                        useNativeDriver: true,
                    }).start(({ finished }) => {
                        if (finished) onClose();
                    });
                } else {
                    Animated.spring(translateX, {
                        toValue: 0,
                        useNativeDriver: true,
                        damping: 20,
                        stiffness: 220,
                    }).start();
                }
            },
        })
    ).current;

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Animated.View
                        {...panResponder.panHandlers}
                        style={{
                            width: '74%',
                            height: '100%',
                            backgroundColor: theme.card,
                            transform: [{ translateX }],
                            shadowColor: '#000000',
                            shadowOpacity: 0.25,
                            shadowRadius: 24,
                            shadowOffset: { width: -6, height: 0 },
                            elevation: 24,
                        }}
                    >
                        {/* Drag handle strip */}
                        <View style={{
                            position: 'absolute',
                            left: -20,
                            top: '50%',
                            width: 5,
                            height: 48,
                            borderRadius: 3,
                            backgroundColor: 'rgba(255,255,255,0.25)',
                            marginTop: -24,
                        }} />

                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: 40 }}
                        >
                            {/* Header */}
                            <View style={{
                                paddingTop: 60,
                                paddingHorizontal: 22,
                                paddingBottom: 20,
                                borderBottomWidth: 1,
                                borderBottomColor: theme.border,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 8,
                            }}>
                                <View>
                                    <Text style={{ fontSize: 11, fontWeight: '500', color: theme.primary, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
                                        Library
                                    </Text>
                                    <Text style={{ fontSize: 22, fontWeight: '500', color: theme.text, letterSpacing: -0.5 }}>
                                        View Options
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    onPress={onClose}
                                    style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: 10,
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <X size={18} stroke={theme.textSecondary} />
                                </TouchableOpacity>
                            </View>

                            {/* Browse By section */}
                            <View style={{ paddingHorizontal: 22, paddingTop: 20 }}>
                                <Text style={{ fontSize: 11, fontWeight: '500', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 14 }}>
                                    Browse By
                                </Text>

                                <View style={{ gap: 8 }}>
                                    {[
                                        {
                                            key: 'common' as PlantBrowseMode,
                                            label: 'Common Names',
                                            desc: 'Standard library with search & groups.',
                                            icon: Tags
                                        },
                                        {
                                            key: 'families' as PlantBrowseMode,
                                            label: 'Botanical Families',
                                            desc: 'Organized by scientific taxonomy.',
                                            icon: Dna
                                        },
                                    ].map((item) => {
                                        const Icon = item.icon;
                                        const active = value === item.key;
                                        return (
                                            <TouchableOpacity
                                                key={item.key}
                                                onPress={() => {
                                                    onSelect(item.key);
                                                    onClose();
                                                }}
                                                activeOpacity={0.65}
                                                style={{
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    paddingVertical: 13,
                                                    paddingHorizontal: 14,
                                                    borderRadius: 12,
                                                    backgroundColor: active
                                                        ? (isDark ? 'rgba(34, 197, 94, 0.14)' : 'rgba(34, 197, 94, 0.08)')
                                                        : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)'),
                                                    borderWidth: 1.5,
                                                    borderColor: active ? theme.primary : 'transparent',
                                                    gap: 14,
                                                }}
                                            >
                                                <View style={{
                                                    width: 42,
                                                    height: 42,
                                                    borderRadius: 10,
                                                    backgroundColor: active ? theme.primary : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'),
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}>
                                                    <Icon size={20} stroke={active ? '#fff' : theme.textSecondary} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontSize: 14, fontWeight: active ? '500' : '500', color: active ? theme.primary : theme.text, marginBottom: 2 }}>
                                                        {item.label}
                                                    </Text>
                                                    <Text style={{ fontSize: 11.5, color: theme.textMuted, lineHeight: 16 }}>
                                                        {item.desc}
                                                    </Text>
                                                </View>
                                                {active && (
                                                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary }} />
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 22, marginHorizontal: 22 }} />

                            {value === 'common' ? (
                                <View style={{ paddingHorizontal: 22 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '500', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 14 }}>
                                        Category Filter
                                    </Text>

                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                        <TouchableOpacity
                                            onPress={() => onSelectGroup(undefined)}
                                            style={{
                                                paddingHorizontal: 14,
                                                paddingVertical: 9,
                                                borderRadius: 10,
                                                backgroundColor: selectedGroup === undefined ? theme.primary : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                                                borderWidth: 1.5,
                                                borderColor: selectedGroup === undefined ? theme.primary : theme.border,
                                            }}
                                        >
                                            <Text style={{ fontSize: 13, fontWeight: '500', color: selectedGroup === undefined ? '#fff' : theme.text }}>
                                                {t('library.filter_all')}
                                            </Text>
                                        </TouchableOpacity>

                                        {groups.map((group) => {
                                            const active = selectedGroup === group.key;
                                            const localeKey = i18n.language?.split('-')[0] ?? 'en';
                                            const translated = t(`plantGroups.${group.key}`);
                                            const label =
                                                translated !== `plantGroups.${group.key}`
                                                    ? translated
                                                    : (group.displayName?.[localeKey] ?? group.displayName?.en ?? group.key);

                                            return (
                                                <TouchableOpacity
                                                    key={group.key}
                                                    onPress={() => onSelectGroup(active ? undefined : group.key)}
                                                    style={{
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                        paddingHorizontal: 14,
                                                        paddingVertical: 9,
                                                        borderRadius: 10,
                                                        backgroundColor: active ? theme.primary : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                                                        borderWidth: 1.5,
                                                        borderColor: active ? theme.primary : theme.border,
                                                    }}
                                                >
                                                    <Text style={{ fontSize: 13 }}>{GROUP_ICONS[group.key] ?? '🌱'}</Text>
                                                    <Text style={{ fontSize: 13, fontWeight: '500', color: active ? '#fff' : theme.text }}>
                                                        {label}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>

                                    <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 22 }} />
                                </View>
                            ) : null}

                            {/* Display Mode section */}
                            <View style={{ paddingHorizontal: 22 }}>
                                <Text style={{ fontSize: 11, fontWeight: '500', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 14 }}>
                                    Display Mode
                                </Text>

                                <View style={{
                                    flexDirection: 'row',
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                    borderRadius: 12,
                                    padding: 5,
                                    gap: 4,
                                }}>
                                    {[
                                        { key: 'list' as LayoutMode, icon: BookOpen, label: 'List' },
                                        { key: 'grid' as LayoutMode, icon: ScanSearch, label: 'Grid' },
                                    ].map((item) => {
                                        const Icon = item.icon;
                                        const active = layoutMode === item.key;
                                        return (
                                            <TouchableOpacity
                                                key={item.key}
                                                onPress={() => onToggleLayout(item.key)}
                                                style={{
                                                    flex: 1,
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: 8,
                                                    paddingVertical: 11,
                                                    borderRadius: 10,
                                                    backgroundColor: active ? theme.primary : 'transparent',
                                                }}
                                            >
                                                <Icon size={16} stroke={active ? '#fff' : theme.textSecondary} />
                                                <Text style={{ fontSize: 13, fontWeight: '500', color: active ? '#fff' : theme.textSecondary }}>
                                                    {item.label}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        </ScrollView>
                    </Animated.View>
                </View>
            </View>
        </Modal>
    );
}

// ─── Animated Sliding Tab Bar ─────────────────────────────────────────────────
function SlidingTabBar({
    tabs,
    activeTab,
    onTabChange,
}: {
    tabs: { key: string; label: string; flex?: number }[];
    activeTab: string;
    onTabChange: (key: string) => void;
}) {
    const theme = useTheme();
    const tabWidths = useRef<number[]>([]);
    const tabOffsets = useRef<number[]>([]);
    const slideAnim = useRef(new Animated.Value(0)).current;
    const widthAnim = useRef(new Animated.Value(80)).current;
    const [measured, setMeasured] = useState(false);

    const activeIndex = tabs.findIndex((t) => t.key === activeTab);

    const animateTo = (index: number) => {
        if (!measured) return;
        Animated.parallel([
            Animated.spring(slideAnim, {
                toValue: tabOffsets.current[index] ?? 0,
                useNativeDriver: false,
                damping: 22,
                stiffness: 220,
            }),
            Animated.spring(widthAnim, {
                toValue: tabWidths.current[index] ?? 80,
                useNativeDriver: false,
                damping: 22,
                stiffness: 220,
            }),
        ]).start();
    };

    const handleLayout = (index: number, e: LayoutChangeEvent) => {
        tabWidths.current[index] = e.nativeEvent.layout.width;
        tabOffsets.current[index] = e.nativeEvent.layout.x;
        if (tabWidths.current.filter(Boolean).length === tabs.length && !measured) {
            setMeasured(true);
            slideAnim.setValue(tabOffsets.current[activeIndex] ?? 0);
            widthAnim.setValue(tabWidths.current[activeIndex] ?? 80);
        }
    };

    useEffect(() => {
        animateTo(activeIndex);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeIndex, measured]);

    return (
        <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 2, position: 'relative' }}>
            {/* Sliding dark green pill */}
            <Animated.View
                pointerEvents="none"
                style={[
                    { position: 'absolute', top: 2, bottom: 2, backgroundColor: theme.primary, borderRadius: 10 },
                    { left: slideAnim, width: widthAnim },
                ]}
            />
            {/* Tab labels */}
            {tabs.map(({ key, label, flex }, index) => {
                const active = key === activeTab;
                return (
                    <TouchableOpacity
                        key={key}
                        onPress={() => onTabChange(key)}
                        onLayout={(e) => handleLayout(index, e)}
                        style={{ flex: flex ?? 1, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}
                        testID={`e2e-library-tab-${key}`}
                    >
                        <Text style={{ fontSize: 12, fontWeight: active ? '500' : '400', color: active ? '#fff' : theme.textMuted, letterSpacing: active ? 0.1 : 0 }}>
                            {label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function LibraryScreen() {
    const { t, i18n } = useTranslation();
    const theme = useTheme();
    const { isDark } = useThemeContext();
    const { appMode } = useAppMode();
    const { settings } = useUserSettings();
    const router = useRouter();
    const { openScanner, scannerModals } = usePlantScanner();
    const params = useLocalSearchParams<{
        mode?: string;
        from?: string;
        aiFrom?: string;
        aiMatchId?: string;
        userPlantId?: string;
        bedId?: string;
        x?: string;
        y?: string;
        q?: string;
        tab?: string;
        browse?: string;
        backFrom?: string;
        backBedId?: string;
        backGardenId?: string;
    }>();
    const fromParam = Array.isArray(params.from) ? params.from[0] : params.from;
    const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
    const selectMode = modeParam === 'select';
    const attachMode = modeParam === 'attach';
    const locale = i18n.language?.split('-')[0] ?? i18n.language;
    const bedIdParam = Array.isArray(params.bedId) ? params.bedId[0] : params.bedId;
    const backFromParam = Array.isArray(params.backFrom) ? params.backFrom[0] : params.backFrom;
    const backBedIdParam = Array.isArray(params.backBedId) ? params.backBedId[0] : params.backBedId;
    const backGardenIdParam = Array.isArray(params.backGardenId) ? params.backGardenId[0] : params.backGardenId;
    const xParam = Array.isArray(params.x) ? params.x[0] : params.x;
    const yParam = Array.isArray(params.y) ? params.y[0] : params.y;
    const xValue = xParam !== undefined ? Number(xParam) : undefined;
    const yValue = yParam !== undefined ? Number(yParam) : undefined;
    const positionInBed =
        typeof xValue === 'number' &&
            Number.isFinite(xValue) &&
            typeof yValue === 'number' &&
            Number.isFinite(yValue)
            ? { x: xValue, y: yValue, width: 1, height: 1 }
            : undefined;

    const initialQuery = Array.isArray(params.q) ? params.q[0] : params.q;
    const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    const browseParam = Array.isArray(params.browse) ? params.browse[0] : params.browse;
    const [search, setSearch] = useState(initialQuery ?? '');
    const deferredSearch = useDeferredValue(search);
    const [activeTab, setActiveTab] = useState<LibraryTab>(() => normalizeTab(tabParam));
    const [plantBrowseMode, setPlantBrowseMode] = useState<PlantBrowseMode>(() => normalizeBrowseMode(browseParam));
    const [layoutMode, setLayoutMode] = useState<LayoutMode>('list');
    const [browseMenuOpen, setBrowseMenuOpen] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<string | undefined>(undefined);
    const [selectedPest, setSelectedPest] = useState<any>(null);
    const [selectedPlant, setSelectedPlant] = useState<any>(null);
    const [selectedPlantCare, setSelectedPlantCare] = useState<PlantCareContent | null>(null);
    const [targetModalOpen, setTargetModalOpen] = useState(false);
    const [addSaving, setAddSaving] = useState(false);
    const aiRouteHandledRef = useRef<string | null>(null);

    // Plants data
    const { plants, isLoading: plantsLoading } = usePlantLibrary(locale, { allowSeedFallback: true });
    const { groups } = usePlantGroups();
    const { addPlant, updatePlant } = usePlants();
    const { completeLibraryAdd } = useAddPlantFlow({ addPlant, updatePlant });
    const { beds } = useBeds();
    const { favorites, toggleFavorite } = useFavorites();
    const familyRows = useQuery(
        api.plantLibrary.listFamilies,
        activeTab === 'plants' && plantBrowseMode === 'families'
            ? { locale, limit: 200 }
            : 'skip'
    );

    // Pests & Diseases data
    const pestType: PestDiseaseType | undefined = undefined; // show all
    const { items: pestItems, isLoading: pestsLoading } = usePestsDiseases(pestType);

    const favoriteIds = useMemo(
        () => new Set(favorites.map((fav: any) => String(fav.plantMasterId))),
        [favorites]
    );
    const focusItems = useMemo(() => getOnboardingFocusItems(settings?.onboarding, 3), [settings?.onboarding]);
    const sortedGroups = useMemo(
        () => [...groups].sort((a, b) => compareGroupsForOnboarding(a, b, settings?.onboarding)),
        [groups, settings?.onboarding]
    );
    const selectedGroupLabel = useMemo(() => {
        if (!selectedGroup) return '';
        const group = sortedGroups.find((item: any) => item.key === selectedGroup);
        if (!group) return selectedGroup;
        const translated = t(`plantGroups.${group.key}`);
        return translated !== `plantGroups.${group.key}`
            ? translated
            : (group.displayName?.[locale] ?? group.displayName?.en ?? group.key);
    }, [locale, selectedGroup, sortedGroups, t]);
    const isSeedPlant = useCallback((plant: any) => String(plant?._id ?? '').startsWith('seed:'), []);
    const selectedPlantIsSeed = selectedPlant ? isSeedPlant(selectedPlant) : false;
    const selectedPlantId = selectedPlant && !selectedPlantIsSeed ? String(selectedPlant._id) : undefined;
    const selectedPlantRemote = useQuery(
        api.plantImages.getPlantById,
        selectedPlantId ? { plantId: selectedPlantId as any, locale } : 'skip'
    );

    useEffect(() => {
        if (params.q === undefined) return;
        const nextQuery = Array.isArray(params.q) ? params.q[0] : params.q;
        if (typeof nextQuery === 'string') setSearch(nextQuery);
    }, [params.q]);

    useEffect(() => {
        if (params.tab === undefined) return;
        const nextTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
        if (typeof nextTab !== 'string') return;
        const normalized = normalizeTab(nextTab);
        setActiveTab((current) => (current === normalized ? current : normalized));
    }, [params.tab]);

    useEffect(() => {
        if (params.browse === undefined) return;
        const nextBrowse = Array.isArray(params.browse) ? params.browse[0] : params.browse;
        if (typeof nextBrowse !== 'string') return;
        const normalized = normalizeBrowseMode(nextBrowse);
        setPlantBrowseMode((current) => (current === normalized ? current : normalized));
    }, [params.browse]);

    useEffect(() => {
        const aiMatchIdParam = Array.isArray(params.aiMatchId) ? params.aiMatchId[0] : params.aiMatchId;
        if (!aiMatchIdParam || plantsLoading) return;
        if (aiRouteHandledRef.current === aiMatchIdParam) return;
        const matched = plants.find((plant: any) => String(plant._id) === String(aiMatchIdParam));
        if (!matched) return;
        aiRouteHandledRef.current = aiMatchIdParam;
        router.push({
            pathname: '/(tabs)/plant/[userPlantId]',
            params: {
                userPlantId: String(matched._id),
                from: 'library',
            },
        });
    }, [params.aiMatchId, plantsLoading, plants, router]);

    useEffect(() => {
        if (!selectedPlantRemote || !selectedPlantId) return;
        setSelectedPlant((prev: any) => {
            if (!prev || String(prev._id) !== selectedPlantId) return prev;
            return { ...prev, ...selectedPlantRemote };
        });
    }, [selectedPlantRemote, selectedPlantId]);

    useEffect(() => {
        if (!selectedPlant) {
            setSelectedPlantCare(null);
            return;
        }

        let cancelled = false;
        const plantId = String(selectedPlant._id);
        const serverVersion =
            typeof selectedPlant.contentVersion === 'number'
                ? selectedPlant.contentVersion
                : 0;
        const parsedCare = parseCareContent(selectedPlant.careContent);

        if (parsedCare) {
            setSelectedPlantCare(parsedCare);
            if (!selectedPlantIsSeed) {
                saveCareContent(plantId, locale, serverVersion, parsedCare).catch(() => undefined);
            }
        }

        loadCachedCareContent(plantId, locale).then((cached) => {
            if (cancelled || !cached?.care) return;
            setSelectedPlantCare((current) => current ?? cached.care);
        });

        return () => {
            cancelled = true;
        };
    }, [selectedPlant, selectedPlantIsSeed, locale]);

    const completeAdd = useCallback(async (plant: any, selectionMode: AddPlantTargetMode, selectedBedId?: string) => {
        if (!plant || isSeedPlant(plant)) return;
        await completeLibraryAdd({
            plantMasterId: String(plant._id),
            selectionMode,
            mode: modeParam,
            from: fromParam,
            attachPlantId: params.userPlantId ? String(params.userPlantId) : undefined,
            bedId: bedIdParam,
            x: xParam,
            y: yParam,
            backFrom: backFromParam,
            backBedId: backBedIdParam,
            backGardenId: backGardenIdParam,
            selectedBedId,
        });
        setSelectedPlant(null);
    }, [backBedIdParam, backFromParam, backGardenIdParam, bedIdParam, completeLibraryAdd, fromParam, isSeedPlant, modeParam, params.userPlantId, xParam, yParam]);

    const handleAddSelectedPlant = useCallback(async () => {
        if (!selectedPlant || selectedPlantIsSeed) return;
        if (attachMode && params.userPlantId) {
            await completeAdd(selectedPlant, 'planning');
            return;
        }
        if (fromParam === 'bed' && bedIdParam) {
            await completeAdd(selectedPlant, 'growing', bedIdParam);
            return;
        }
        setTargetModalOpen(true);
    }, [attachMode, bedIdParam, completeAdd, fromParam, params.userPlantId, selectedPlant, selectedPlantIsSeed]);

    const normalizedSearch = deferredSearch.trim();

    const filteredPlants = useMemo(() => {
        let result = plants;
        if (selectedGroup) {
            result = result.filter((p) => p.group === selectedGroup);
        }
        if (normalizedSearch) result = result.filter((p) =>
            matchesSearch(normalizedSearch, [p.displayName, p.scientificName, p.group, p.group?.replace(/_/g, ' ')])
        );
        return [...result].sort((a, b) => {
            const scoreDiff = scorePlantForOnboarding(b, settings?.onboarding) - scorePlantForOnboarding(a, settings?.onboarding);
            if (scoreDiff !== 0 && !normalizedSearch) return scoreDiff;
            const aName = String(a.displayName ?? a.scientificName ?? '').toLowerCase();
            const bName = String(b.displayName ?? b.scientificName ?? '').toLowerCase();
            return aName.localeCompare(bName);
        });
    }, [plants, selectedGroup, normalizedSearch, settings?.onboarding]);

    const groupedPlantRows = useMemo(() => {
        const rows: Array<
            | { rowType: 'header'; key: string; basePlant: any; count: number }
            | { rowType: 'plant'; key: string; plant: any }
        > = [];

        for (const cluster of buildSortedPlantUiClusters(filteredPlants, i18n.language)) {
            if (cluster.plants.length > 1) {
                rows.push({
                    rowType: 'header',
                    key: `header:${cluster.key}`,
                    basePlant: { ...cluster.basePlant, uiGroupLabel: cluster.label },
                    count: cluster.plants.length,
                });
            }
            for (const plant of cluster.plants) {
                rows.push({
                    rowType: 'plant',
                    key: `plant:${String(plant._id)}`,
                    plant,
                });
            }
        }

        return rows;
    }, [filteredPlants, i18n.language]);

    const filteredPests = useMemo(() => {
        if (!normalizedSearch) return pestItems;
        return pestItems.filter((item: any) =>
            matchesSearch(normalizedSearch, [
                item.name,
                item.key,
                item.type,
                Array.isArray(item.plantsAffected) ? item.plantsAffected.join(' ') : '',
            ])
        );
    }, [pestItems, normalizedSearch]);

    const filteredFamilies = useMemo(() => {
        const rows = familyRows ?? [];
        if (!normalizedSearch) return rows;
        return rows.filter((item: any) =>
            matchesSearch(normalizedSearch, [
                item.family,
                item.familyDisplayName,
                item.samplePlant?.commonName,
                item.samplePlant?.scientificName,
            ])
        );
    }, [familyRows, normalizedSearch]);

    // Dynamic search placeholder based on active tab
    const searchPlaceholder =
        activeTab === 'plants'
            ? plantBrowseMode === 'families'
                ? 'Search families'
                : t('library.search_plants')
            : activeTab === 'pests'
                ? t('library.search_pests')
                : t('library.search_guides');

    const openPlantDetail = useCallback(
        (plant: any) => {
            const query = new URLSearchParams();
            if (modeParam) query.set('mode', modeParam);
            if (fromParam) query.set('from', fromParam);
            if (params.userPlantId) query.set('fromPlantId', String(params.userPlantId));
            if (bedIdParam) query.set('bedId', bedIdParam);
            if (xParam !== undefined) query.set('x', xParam);
            if (yParam !== undefined) query.set('y', yParam);
            const qs = query.toString();
            router.push(`/(tabs)/library/${plant._id}${qs ? `?${qs}` : ''}`);
        },
        [modeParam, fromParam, params.userPlantId, bedIdParam, xParam, yParam, router]
    );

    const handleTogglePlantFavorite = useCallback(
        (plant: any) => {
            if (isSeedPlant(plant)) return;
            void toggleFavorite(plant._id).catch(() => undefined);
        },
        [isSeedPlant, toggleFavorite]
    );

    const renderPlantItem = useCallback(
        ({ item }: { item: any }) => {
            if (item.rowType === 'header') {
                return layoutMode === 'list' || !!normalizedSearch ? (
                    <SpeciesGroupHeader basePlant={item.basePlant} count={item.count} />
                ) : null;
            }

            const plant = item.plant;
            if (layoutMode === 'grid' && !normalizedSearch) {
                return (
                    <PlantGridCard
                        plant={plant}
                        onPress={() => openPlantDetail(plant)}
                        onToggleFavorite={() => handleTogglePlantFavorite(plant)}
                        isFavorite={!isSeedPlant(plant) && favoriteIds.has(String(plant._id))}
                        testID="e2e-library-plant-card"
                    />
                );
            }

            return (
                <PlantCard
                    plant={plant}
                    onPress={() => openPlantDetail(plant)}
                    onToggleFavorite={() => handleTogglePlantFavorite(plant)}
                    isFavorite={!isSeedPlant(plant) && favoriteIds.has(String(plant._id))}
                    testID="e2e-library-plant-card"
                />
            );
        },
        [layoutMode, normalizedSearch, openPlantDetail, handleTogglePlantFavorite, isSeedPlant, favoriteIds]
    );

    const renderPestItem = useCallback(
        ({ item }: { item: any }) => (
            <PestDiseaseCard item={item} onPress={() => setSelectedPest(item)} />
        ),
        []
    );

    const plantKeyExtractor = useCallback((row: any) => String(row.key), []);
    const pestKeyExtractor = useCallback((item: any) => String(item._id), []);
    const passthroughParams = useMemo(
        () => buildLibraryRoutePassthrough(params as Record<string, string | string[] | undefined>),
        [params]
    );

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            {/* Top bar: Search + Tabs */}
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 12, backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                {/* Search bar — white card style */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        gap: 10,
                    }}>
                        <Search size={15} stroke={theme.textMuted} />
                        <TextInput
                            style={{ flex: 1, paddingVertical: 10, fontSize: 15, color: theme.text }}
                            placeholder={searchPlaceholder}
                            placeholderTextColor={theme.textMuted}
                            value={search}
                            onChangeText={setSearch}
                            testID="e2e-library-search-input"
                        />
                        {!!search && (
                            <TouchableOpacity onPress={() => setSearch('')}>
                                <X size={15} stroke={theme.textMuted} />
                            </TouchableOpacity>
                        )}
                    </View>
                    {activeTab === 'plants' && (
                        <TouchableOpacity
                            onPress={() => setBrowseMenuOpen(true)}
                            accessibilityLabel="Browse mode menu"
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 12,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                            }}
                        >
                            <SlidersHorizontal size={18} stroke={theme.primary} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Internal tabs — animated sliding pill */}
                <SlidingTabBar
                    tabs={[
                        { key: 'plants', label: t('library.tab_plants'), flex: 3 },
                        { key: 'pests', label: t('library.tab_pests'), flex: 4 },
                        { key: 'guide', label: t('library.tab_guide'), flex: 3 },
                    ]}
                    activeTab={activeTab}
                    onTabChange={(key: string) => { setActiveTab(key as LibraryTab); setSearch(''); }}
                />

                {activeTab === 'plants' && plantBrowseMode === 'common' && selectedGroup ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 10,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                                borderWidth: 1,
                                borderColor: theme.border,
                            }}
                        >
                            <Text style={{ fontSize: 12, color: theme.textMuted }}>Filter:</Text>
                            <Text style={{ fontSize: 13, fontWeight: '500', color: theme.text }}>
                                {selectedGroupLabel}
                            </Text>
                            <TouchableOpacity onPress={() => setSelectedGroup(undefined)} hitSlop={8}>
                                <X size={14} stroke={theme.textMuted} />
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : null}
            </View>

            {/* ── Plants Tab ── */}
            {activeTab === 'plants' && (
                <View style={{ flex: 1 }}>
                    {plantBrowseMode === 'families' ? (
                        familyRows === undefined ? (
                            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                                <ActivityIndicator size="large" color={theme.primary} />
                            </View>
                        ) : filteredFamilies.length === 0 ? (
                            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                                <Text style={{ fontSize: 32 }}>🧬</Text>
                                <Text style={{ fontSize: 16, fontWeight: '500', color: theme.textMuted }}>
                                    {search ? 'No families found' : 'No family data available'}
                                </Text>
                            </View>
                        ) : (
                            <FlatList
                                key={`families-${layoutMode}-${normalizedSearch ? 'search' : 'browse'}`}
                                style={{ flex: 1 }}
                                data={filteredFamilies}
                                keyExtractor={(item: any) => String(item.key)}
                                renderItem={({ item }: { item: any }) => {
                                    const props = {
                                        title: item.familyDisplayName ?? formatPlantFamilyDisplayName(item.family, i18n.language),
                                        subtitle: item.samplePlant?.commonName ?? item.samplePlant?.scientificName,
                                        imageUrl: item.samplePlant?.imageUrl,
                                        meta: `${item.genusCount} genera • ${item.speciesCount} species • ${item.plantCount} plants`,
                                        onPress: () =>
                                            router.push({
                                                pathname: '/(tabs)/library/family/[family]',
                                                params: {
                                                    family: String(item.family),
                                                    ...passthroughParams,
                                                    layout: layoutMode, // pass layout to detail screen
                                                },
                                            }),
                                    };
                                    return layoutMode === 'grid' ? (
                                        <TaxonomyGridCard {...props} />
                                    ) : (
                                        <TaxonomyCard {...props} />
                                    );
                                }}
                                numColumns={layoutMode === 'grid' ? 2 : 1}
                                columnWrapperStyle={layoutMode === 'grid' ? { gap: 12, paddingHorizontal: 12 } : undefined}
                                ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{ paddingVertical: 12, paddingBottom: 100, paddingHorizontal: layoutMode === 'grid' ? 4 : 12 }}
                            />
                        )
                    ) : (
                        <>
                            {focusItems.length > 0 && !normalizedSearch ? (
                                <View style={{ paddingHorizontal: 16, paddingTop: 6, gap: 8 }}>
                                    <Text style={{ fontSize: 12, fontWeight: '500', color: theme.textSecondary }}>
                                        {t('library.personalized_hint')}
                                    </Text>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                        {focusItems.map((item) => (
                                            <View
                                                key={`${item.kind}:${item.id}`}
                                                style={{
                                                    backgroundColor: theme.accent,
                                                    borderRadius: 10,
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 5,
                                                    borderWidth: 1,
                                                    borderColor: theme.border,
                                                }}
                                            >
                                                <Text style={{ fontSize: 11, fontWeight: '500', color: theme.text }}>
                                                    {t(item.labelKey)}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            ) : null}

                            {plantsLoading ? (
                                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                                    <ActivityIndicator size="large" color={theme.primary} />
                                </View>
                            ) : filteredPlants.length === 0 ? (
                                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                                    <Text style={{ fontSize: 32 }}>🌱</Text>
                                    <Text style={{ fontSize: 16, fontWeight: '500', color: theme.textMuted }}>
                                        {search ? t('library.no_results') : t('library.no_plants')}
                                    </Text>
                                </View>
                            ) : (
                                <FlatList
                                    key={`${layoutMode}-${normalizedSearch ? 'search' : 'browse'}`}
                                    style={{ flex: 1 }}
                                    data={groupedPlantRows}
                                    keyExtractor={plantKeyExtractor}
                                    renderItem={renderPlantItem}
                                    numColumns={layoutMode === 'grid' && !normalizedSearch ? 2 : 1}
                                    columnWrapperStyle={layoutMode === 'grid' && !normalizedSearch ? { gap: 12, paddingHorizontal: 12 } : undefined}
                                    ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={{ paddingVertical: 12, paddingBottom: 100, paddingHorizontal: layoutMode === 'grid' && !normalizedSearch ? 4 : 12 }}
                                    removeClippedSubviews
                                    initialNumToRender={8}
                                    maxToRenderPerBatch={8}
                                    updateCellsBatchingPeriod={50}
                                    windowSize={7}
                                />
                            )}
                        </>
                    )}
                </View>
            )}

            {/* ── Pest & Diseases Tab ── */}
            {activeTab === 'pests' && (
                <View testID="e2e-library-tab-pests-content" style={{ flex: 1 }}>
                    {pestsLoading ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <ActivityIndicator size="large" color={theme.primary} />
                        </View>
                    ) : filteredPests.length === 0 ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                            <Bug size={48} stroke={theme.textMuted} />
                            <Text style={{ fontSize: 16, fontWeight: '500', color: theme.textMuted }}>
                                {t('health.no_results')}
                            </Text>
                        </View>
                    ) : (
                        <FlatList
                            data={filteredPests}
                            keyExtractor={pestKeyExtractor}
                            renderItem={renderPestItem}
                            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                            removeClippedSubviews
                            initialNumToRender={8}
                            maxToRenderPerBatch={8}
                            updateCellsBatchingPeriod={50}
                            windowSize={7}
                        />
                    )}
                </View>
            )}

            {/* ── Guide Tab ── */}
            {activeTab === 'guide' && <GuideTab />}

            {/* Plant detail modal */}
            {selectedPlant && (
                <PlantDetailModal
                    plant={selectedPlant}
                    care={selectedPlantCare}
                    onClose={() => setSelectedPlant(null)}
                    showAdd={(selectMode || attachMode) && !selectedPlantIsSeed}
                    addLabel={fromParam === 'bed' ? t('bed.add_plant') : undefined}
                    onAdd={() => {
                        void handleAddSelectedPlant();
                    }}
                    isFavorite={selectedPlantIsSeed ? false : favoriteIds.has(String(selectedPlant._id))}
                    canFavorite={!selectedPlantIsSeed}
                    onToggleFavorite={() => {
                        if (selectedPlantIsSeed) return;
                        void toggleFavorite(selectedPlant._id).catch(() => undefined);
                    }}
                />
            )}
            <AddPlantTargetModal
                visible={targetModalOpen}
                beds={beds.map((bed: any) => ({ _id: String(bed._id), name: bed.name }))}
                isGardener={appMode === 'gardener'}
                loading={addSaving}
                onClose={() => {
                    if (addSaving) return;
                    setTargetModalOpen(false);
                }}
                onConfirm={async ({ mode, bedId }) => {
                    if (!selectedPlant) return;
                    setAddSaving(true);
                    try {
                        await completeAdd(selectedPlant, mode, bedId);
                        setTargetModalOpen(false);
                    } finally {
                        setAddSaving(false);
                    }
                }}
            />
            {/* Pest detail modal */}
            {
                selectedPest && (
                    <PestDiseaseDetailModal item={selectedPest} onClose={() => setSelectedPest(null)} />
                )
            }
            <BrowseModeMenu
                visible={browseMenuOpen}
                value={plantBrowseMode}
                layoutMode={layoutMode}
                groups={sortedGroups}
                selectedGroup={selectedGroup}
                onClose={() => setBrowseMenuOpen(false)}
                onSelect={(next) => {
                    setPlantBrowseMode(next);
                    setSearch('');
                }}
                onSelectGroup={setSelectedGroup}
                onToggleLayout={setLayoutMode}
            />
            <TouchableOpacity
                onPress={openScanner}
                accessibilityLabel={t('planning.option_camera_title')}
                testID="e2e-library-ai-scanner"
                activeOpacity={0.9}
                style={{
                    position: 'absolute',
                    right: 18,
                    bottom: 108,
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.primary,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.72)',
                    shadowColor: isDark ? '#000000' : '#1a4731',
                    shadowOpacity: isDark ? 0.42 : 0.24,
                    shadowRadius: 14,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 10,
                }}
            >
                <ScanSearch size={24} stroke="#fff" />
            </TouchableOpacity>
            {scannerModals}
        </View >
    );
}
