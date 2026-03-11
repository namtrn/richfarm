import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Modal,
    TextInput,
    ActivityIndicator,
    Animated,
    LayoutChangeEvent,
    Pressable,
    Image,
    Alert,
    StyleSheet,
    PanResponder,
} from 'react-native';
import { Plus, Sprout, Leaf, Camera, Image as ImageIcon, X, Trash2, ArrowRight, BookOpen, Fence, Calendar, ChevronRight } from 'lucide-react-native';
import { useQuery, useMutation, useAction } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { api } from '../../../../../packages/convex/convex/_generated/api';
import { useDeviceId } from '../../../lib/deviceId';
import {
    formatArea,
    formatAreaValue,
    getAreaUnitLabel,
    getDistanceUnitLabel,
    parseDistanceInput,
    UnitSystem,
} from '../../../lib/units';
import { useUnitSystem } from '../../../hooks/useUnitSystem';
import { usePlants } from '../../../hooks/usePlants';
import { useReminders } from '../../../hooks/useReminders';
import { useAuth } from '../../../lib/auth';
import { useBeds } from '../../../hooks/useBeds';
import { isPremiumActive } from '../../../lib/access';
import { buildAiDetectorKey, consumeAiDetectorUsage, isAiDetectorLimitReached } from '../../../lib/aiDetectorLimit';
import * as ImagePicker from 'expo-image-picker';
import { usePlantLibrary } from '../../../hooks/usePlantLibrary';
import { normalizeCustomPlantNickname, useAddPlantFlow } from '../../../hooks/useAddPlantFlow';
import { useTheme } from '../../../lib/theme';
import { useThemeContext } from '../../../lib/ThemeContext';
import { useAppMode } from '../../../hooks/useAppMode';
import { GardenerMyPlantsView } from '../../../features/garden/GardenerMyPlantsView';

type GardenTab = 'garden' | 'planning' | 'growing';
const NAME_MAX = 40;

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
        <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: theme.border, borderRadius: 22, padding: 2, position: 'relative' }}>
            <Animated.View
                pointerEvents="none"
                style={[
                    { position: 'absolute', top: 2, bottom: 2, backgroundColor: theme.primary, borderRadius: 18 },
                    { left: slideAnim, width: widthAnim },
                ]}
            />
            {tabs.map(({ key, label, flex }, index) => {
                const active = key === activeTab;
                return (
                    <TouchableOpacity
                        key={key}
                        onPress={() => onTabChange(key)}
                        onLayout={(e) => handleLayout(index, e)}
                        style={{ flex: flex ?? 1, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}
                        testID={`e2e-garden-tab-${key}`}
                    >
                        <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? '#fff' : theme.textMuted, letterSpacing: active ? 0.1 : 0 }}>
                            {label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

// ─── Garden Card ──────────────────────────────────────────────────────────────
function GardenCard({ garden, onPress, unitSystem, testID }: { garden: any; onPress: () => void; unitSystem: UnitSystem; testID?: string }) {
    const theme = useTheme();
    const { isDark } = useThemeContext();
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            testID={testID}
            style={{
                backgroundColor: theme.card,
                borderRadius: 20,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                shadowColor: isDark ? '#000000' : '#1a1a18',
                shadowOpacity: 0.06,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
                borderWidth: 1,
                borderColor: theme.border,
            }}
        >
            <View style={{ width: 56, height: 56, backgroundColor: theme.accent, borderRadius: 16, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 28 }}>🌿</Text>
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{garden.name}</Text>
                <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 2 }}>
                    {garden.areaM2 ? formatArea(garden.areaM2, unitSystem) : '—'}
                </Text>
            </View>
            <ChevronRight size={16} stroke={theme.textMuted} />
        </TouchableOpacity>
    );
}

// ─── Create Garden Modal ──────────────────────────────────────────────────────
function CreateGardenModal({ visible, onClose, unitSystem }: { visible: boolean; onClose: () => void; unitSystem: UnitSystem }) {
    const { t } = useTranslation();
    const theme = useTheme();
    const { deviceId, isLoading: isDeviceLoading } = useDeviceId();
    const createGarden = useMutation(api.gardens.createGarden);

    const [name, setName] = useState('');
    const [width, setWidth] = useState('');
    const [length, setLength] = useState('');
    const [locationType, setLocationType] = useState<string>('outdoor');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const widthValue = parseDistanceInput(width, unitSystem);
    const lengthValue = parseDistanceInput(length, unitSystem);
    const areaM2 = widthValue && lengthValue ? widthValue * lengthValue : undefined;

    const handleCreate = async () => {
        if (!deviceId) { setError(t('common.error')); return; }
        if (!name.trim()) { setError(t('garden.error_name')); return; }
        if (name.trim().length > NAME_MAX) { setError(t('garden.error_name_length', { max: NAME_MAX })); return; }
        if (!widthValue || !lengthValue) { setError(t('garden.error_dimensions')); return; }
        setLoading(true);
        setError('');
        try {
            await createGarden({ name: name.trim(), locationType, areaM2: widthValue * lengthValue, deviceId });
            setName(''); setWidth(''); setLength(''); setLocationType('outdoor');
            onClose();
        } catch (e: any) {
            const message = typeof e?.message === 'string' ? e.message : '';
            if (message === 'GARDEN_LIMIT_FREE') {
                setError(t('garden.error_limit_free'));
            } else {
                setError(message || t('common.error'));
            }
        } finally { setLoading(false); }
    };

    const OUTDOOR_OPTIONS = [
        { key: 'outdoor', label: t('garden.location_outdoor') },
        { key: 'frontyard', label: t('garden.location_frontyard') },
        { key: 'backyard', label: t('garden.location_backyard') },
        { key: 'garden_bed', label: t('garden.location_garden_bed') },
        { key: 'vegetable_bed', label: t('garden.location_vegetable_bed') },
        { key: 'flower_bed', label: t('garden.location_flower_bed') },
        { key: 'patio', label: t('garden.location_patio') },
        { key: 'porch', label: t('garden.location_porch') },
        { key: 'terrace', label: t('garden.location_terrace') },
        { key: 'balcony', label: t('garden.location_balcony') },
        { key: 'greenhouse', label: t('garden.location_greenhouse') },
    ];

    const INDOOR_OPTIONS = [
        { key: 'indoor', label: t('garden.location_indoor') },
        { key: 'living_room', label: t('garden.location_living_room') },
        { key: 'bedroom', label: t('garden.location_bedroom') },
        { key: 'kitchen', label: t('garden.location_kitchen') },
        { key: 'office', label: t('garden.location_office') },
        { key: 'bathroom', label: t('garden.location_bathroom') },
        { key: 'hall', label: t('garden.location_hall') },
    ];

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
        if (visible) {
            pan.setValue({ x: 0, y: 0 });
        }
    }, [visible, pan]);

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <Animated.View
                    {...panResponder.panHandlers}
                    style={{
                        backgroundColor: theme.card,
                        borderTopLeftRadius: 32,
                        borderTopRightRadius: 32,
                        paddingHorizontal: 20,
                        paddingTop: 12,
                        paddingBottom: 40,
                        transform: [{ translateY: pan.y }],
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: -4 },
                        shadowOpacity: 0.1,
                        shadowRadius: 12,
                        elevation: 5,
                    }}
                >
                    <View style={{ width: 40, height: 5, backgroundColor: theme.border, borderRadius: 2.5, alignSelf: 'center', marginBottom: 20 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>{t('garden.create_title')}</Text>
                        <TouchableOpacity onPress={onClose} testID="e2e-garden-create-close" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                            <X size={20} stroke={theme.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textAccent, marginBottom: 8 }}>{t('garden.name_label')}</Text>
                    <TextInput
                        value={name}
                        onChangeText={(v) => { setName(v); setError(''); }}
                        placeholder={t('garden.name_placeholder')}
                        placeholderTextColor={theme.textMuted}
                        testID="e2e-garden-create-name-input"
                        maxLength={NAME_MAX}
                        style={{ backgroundColor: theme.accent, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: theme.text, marginBottom: 20 }}
                    />

                    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textAccent, marginBottom: 8 }}>{t('garden.location_label')}</Text>

                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 }}>
                        {t('garden.location_outdoor_sites')}
                    </Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 8, paddingBottom: 16, paddingHorizontal: 4 }}
                    >
                        {OUTDOOR_OPTIONS.map((option) => {
                            const active = locationType === option.key;
                            return (
                                <TouchableOpacity
                                    key={option.key}
                                    onPress={() => setLocationType(option.key)}
                                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? theme.primary : theme.accent, borderWidth: 1, borderColor: active ? theme.primary : theme.border }}
                                >
                                    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : theme.textAccent }}>{option.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 }}>
                        {t('garden.location_indoor_sites')}
                    </Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 8, paddingBottom: 20, paddingHorizontal: 4 }}
                    >
                        {INDOOR_OPTIONS.map((option) => {
                            const active = locationType === option.key;
                            return (
                                <TouchableOpacity
                                    key={option.key}
                                    onPress={() => setLocationType(option.key)}
                                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? theme.primary : theme.accent, borderWidth: 1, borderColor: active ? theme.primary : theme.border }}
                                >
                                    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : theme.textAccent }}>{option.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textAccent, marginBottom: 8 }}>{t('garden.size_label')}</Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 }}>{t('garden.width_label', { unit: getDistanceUnitLabel(unitSystem) })}</Text>
                            <TextInput
                                value={width}
                                onChangeText={(v) => { setWidth(v); setError(''); }}
                                placeholder={t('garden.dimension_placeholder')}
                                placeholderTextColor={theme.textMuted}
                                keyboardType="decimal-pad"
                                testID="e2e-garden-create-width-input"
                                style={{ backgroundColor: theme.accent, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: theme.text }}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 }}>{t('garden.length_label', { unit: getDistanceUnitLabel(unitSystem) })}</Text>
                            <TextInput
                                value={length}
                                onChangeText={(v) => { setLength(v); setError(''); }}
                                placeholder={t('garden.dimension_placeholder')}
                                placeholderTextColor={theme.textMuted}
                                keyboardType="decimal-pad"
                                testID="e2e-garden-create-length-input"
                                style={{ backgroundColor: theme.accent, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: theme.text }}
                            />
                        </View>
                    </View>

                    <View style={{ marginBottom: 20, paddingHorizontal: 4 }}>
                        <Text style={{ fontSize: 13, color: theme.textSecondary }}>
                            {areaM2 ? t('garden.area_summary', { value: formatAreaValue(areaM2, unitSystem), unit: getAreaUnitLabel(unitSystem) }) : '—'}
                        </Text>
                    </View>

                    {!!error && <Text style={{ color: theme.danger, fontSize: 13, marginBottom: 10 }}>{error}</Text>}

                    <TouchableOpacity
                        onPress={handleCreate}
                        disabled={loading || isDeviceLoading}
                        testID="e2e-garden-create-submit"
                        style={{ backgroundColor: theme.primary, borderRadius: 18, paddingVertical: 16, alignItems: 'center', opacity: (loading || isDeviceLoading) ? 0.6 : 1 }}
                    >
                        {(loading || isDeviceLoading)
                            ? <ActivityIndicator color="white" />
                            : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{t('garden.create_action')}</Text>
                        }
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </Modal>
    );
}

// ─── Garden Tab Content ───────────────────────────────────────────────────────
function GardenTabContent({
    onCreateGarden,
    canCreateGarden,
    unitSystem,
}: {
    onCreateGarden: () => void;
    canCreateGarden: boolean;
    unitSystem: UnitSystem;
}) {
    const { t } = useTranslation();
    const theme = useTheme();
    const router = useRouter();
    const { deviceId } = useDeviceId();
    const gardensQuery = useQuery(api.gardens.getGardens, deviceId ? { deviceId } : 'skip');
    const gardens = gardensQuery ?? [];
    const isLoading = gardensQuery === undefined;
    const { plants } = usePlants();
    const { beds } = useBeds();
    const { todayReminders } = useReminders();
    const unassignedPlants = useMemo(
        () => plants.filter((p: any) => !p.bedId),
        [plants]
    );
    const planningPlants = useMemo(
        () => plants.filter((p: any) => p.status === 'planning' || p.status === 'planting'),
        [plants]
    );

    if (isLoading) {
        return (
            <View style={{ paddingVertical: 80, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={theme.primary} />
            </View>
        );
    }

    if (gardens.length === 0) {
        return (
            <View style={{ paddingVertical: 60, alignItems: 'center', gap: 16, backgroundColor: theme.card, borderRadius: 24, borderWidth: 1, borderColor: theme.border }}>
                <View style={{ width: 80, height: 80, backgroundColor: theme.accent, borderRadius: 40, alignItems: 'center', justifyContent: 'center' }}>
                    <Fence size={36} stroke={theme.primary} />
                </View>
                <View style={{ alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text }}>{t('garden.empty_title')}</Text>
                    <Text style={{ fontSize: 13, color: theme.textMuted, textAlign: 'center', paddingHorizontal: 32 }}>{t('garden.empty_desc')}</Text>
                </View>
                <TouchableOpacity
                    onPress={onCreateGarden}
                    disabled={!canCreateGarden}
                    testID="e2e-garden-empty-create"
                    style={{ backgroundColor: theme.primary, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 12, marginTop: 4, opacity: canCreateGarden ? 1 : 0.5 }}
                >
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{t('garden.create_button')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={{ gap: 12 }}>
            {(gardens as any[]).map((g) => (
                <GardenCard
                    key={g._id}
                    garden={g}
                    unitSystem={unitSystem}
                    onPress={() => router.push(`/(tabs)/garden/${g._id}`)}
                    testID="e2e-garden-card"
                />
            ))}
            {unassignedPlants.length > 0 && (
                <View style={{ backgroundColor: theme.card, borderRadius: 20, borderWidth: 1, borderColor: theme.border, padding: 16, gap: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Sprout size={16} stroke={theme.warning} />
                        <Text style={{ fontSize: 13, fontWeight: '800', color: theme.warning, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            {t('garden.unassigned_plants')} ({unassignedPlants.length})
                        </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: theme.textMuted }}>{t('garden.unassigned_plants_desc')}</Text>
                    <View style={{ gap: 8 }}>
                        {unassignedPlants.map((plant: any) => (
                            <TouchableOpacity
                                key={plant._id}
                                onPress={() => router.push({ pathname: '/(tabs)/plant/[userPlantId]', params: { userPlantId: String(plant._id), from: 'garden' } })}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.background, borderRadius: 12, padding: 10 }}
                            >
                                <View style={{ width: 36, height: 36, backgroundColor: theme.accent, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                                    <Leaf size={18} stroke={theme.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }} numberOfLines={1}>
                                        {plant.displayName ?? plant.scientificName ?? t('growing.unnamed')}
                                    </Text>
                                    <Text style={{ fontSize: 11, color: theme.textMuted }}>{plant.status ?? 'planning'}</Text>
                                </View>
                                <ChevronRight size={14} stroke={theme.textMuted} />
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}
        </View>
    );
}

// ─── Planning Tab Content ─────────────────────────────────────────────────────
function PlanningTabContent({ openAddSheetSignal }: { openAddSheetSignal: number }) {
    const { t, i18n } = useTranslation();
    const theme = useTheme();
    const router = useRouter();
    const { plants, isLoading, addPlant } = usePlants();
    const { createUserPlant, openLibrarySelect, openLibraryMatch } = useAddPlantFlow({ addPlant });
    const { beds, isLoading: isBedsLoading } = useBeds();
    const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
    const { deviceId } = useDeviceId();
    const gardensQuery = useQuery(api.gardens.getGardens, deviceId ? { deviceId } : 'skip');

    const [sheetOpen, setSheetOpen] = useState(false);
    const [nickname, setNickname] = useState('');
    const [saving, setSaving] = useState(false);
    const [photoOpen, setPhotoOpen] = useState(false);
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [detectedName, setDetectedName] = useState(t('planning.unknown_plant'));
    const [photoSaving, setPhotoSaving] = useState(false);
    const [aiLimitError, setAiLimitError] = useState('');
    const [aiSessionActive, setAiSessionActive] = useState(false);
    const [scanSourceOpen, setScanSourceOpen] = useState(false);
    const [detectNoMatch, setDetectNoMatch] = useState(false);

    const canEdit = !isAuthLoading && (isAuthenticated || !!deviceId);
    const gardens = gardensQuery ?? [];
    const isSetupLoading = gardensQuery === undefined || isBedsLoading;
    const hasGardenOrBed = gardens.length > 0 || beds.length > 0;
    const canCreatePlant = canEdit;
    const isSetupRequired = false;
    const isPremium = isPremiumActive(user);
    const aiDetectorKey = buildAiDetectorKey(user?._id ? String(user._id) : null, deviceId);
    const locale = i18n.language?.split('-')[0] ?? i18n.language;
    const { plants: libraryPlants } = usePlantLibrary(locale);
    const plannedPlants = useMemo(
        () => plants.filter((p) => p.status === 'planning' || p.status === 'planting'),
        [plants]
    );
    const normalize = (value: string) =>
        value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();

    const findLibraryMatchByName = (name: string) => {
        const query = normalize(name);
        if (!query) return null;
        return (
            libraryPlants.find((plant: any) => normalize(plant.displayName ?? '') === query || normalize(plant.scientificName ?? '') === query) ??
            libraryPlants.find((plant: any) => normalize(plant.displayName ?? '').includes(query) || normalize(plant.scientificName ?? '').includes(query)) ??
            null
        );
    };

    const handleAddPlant = async () => {
        if (!canCreatePlant || !nickname.trim()) return;
        setSaving(true);
        try { await createUserPlant({ nickname: nickname.trim() }); setNickname(''); setSheetOpen(false); }
        finally { setSaving(false); }
    };

    const canStartAiScan = async () => {
        if (!canCreatePlant) return false;
        if (!isPremium && !aiSessionActive) {
            if (!aiDetectorKey) {
                setAiLimitError(t('common.error'));
                return false;
            }
            const reached = await isAiDetectorLimitReached(aiDetectorKey, 1);
            if (reached) {
                setAiLimitError(t('planning.detect_limit_free'));
                return false;
            }
        }
        setAiLimitError('');
        return true;
    };

    const applyPickedImage = async (result: ImagePicker.ImagePickerResult) => {
        if (result.canceled || !result.assets?.[0]?.uri) return;
        if (!isPremium && !aiSessionActive) {
            const consumption = await consumeAiDetectorUsage(aiDetectorKey, 1);
            if (!consumption.allowed) {
                setAiLimitError(t('planning.detect_limit_free'));
                return;
            }
        }
        setAiSessionActive(true);
        setPhotoUri(result.assets[0].uri);
        setDetectedName(t('planning.unknown_plant'));
        setDetectNoMatch(false);
        setPhotoOpen(true);

        // Auto trigger detection
        if (result.assets[0].base64) {
            void runDetection(result.assets[0].base64);
        }
    };

    const detectPlantAction = useAction((api as any).plantScan.detectPlant);
    const [detectionResults, setDetectionResults] = useState<{
        match: any;
        alternatives: any[];
    } | null>(null);
    const [isDetecting, setIsDetecting] = useState(false);

    const runDetection = async (base64: string) => {
        setIsDetecting(true);
        setDetectionResults(null);
        try {
            const res = await detectPlantAction({ images: [base64], locale: i18n.language });
            setDetectionResults(res as any);
            if (res.match) {
                setDetectedName(res.match.name);
            }
        } catch (err) {
            console.error('Detection failed:', err);
        } finally {
            setIsDetecting(false);
        }
    };

    const handleCaptureFromCamera = async () => {
        const canStart = await canStartAiScan();
        if (!canStart) return;
        setScanSourceOpen(false);

        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
            if (permission.canAskAgain) {
                Alert.alert(
                    t('planning.camera_permission_title'),
                    t('planning.camera_permission_desc')
                );
            } else {
                Alert.alert(
                    t('planning.camera_permission_title'),
                    t('planning.camera_permission_settings_desc')
                );
            }
            return;
        }
        try {
            const result = await ImagePicker.launchCameraAsync({
                quality: 0.7,
                allowsEditing: true,
                base64: true,
            });
            await applyPickedImage(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : '';
            const simulatorCameraUnavailable = /camera not available on simulator/i.test(message);
            if (!simulatorCameraUnavailable) {
                Alert.alert(t('planning.camera_open_failed_title'), t('planning.camera_open_failed_desc'));
                return;
            }
            Alert.alert(t('planning.camera_unavailable_title'), t('planning.camera_unavailable_desc'));
        }
    };

    const handlePickFromLibrary = async () => {
        const canStart = await canStartAiScan();
        if (!canStart) return;
        setScanSourceOpen(false);
        const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!mediaPermission.granted) {
            if (mediaPermission.canAskAgain) {
                Alert.alert(t('planning.photo_permission_title'), t('planning.photo_permission_desc'));
            } else {
                Alert.alert(t('planning.photo_permission_title'), t('planning.photo_permission_settings_desc'));
            }
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            quality: 0.7,
            allowsEditing: true,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            base64: true,
        });
        await applyPickedImage(result);
    };

    const handleCapture = () => {
        if (!canCreatePlant) return;
        setAiLimitError('');
        setSheetOpen(false);
        setScanSourceOpen(true);
    };

    const handleSavePhotoPlant = async () => {
        if (!canCreatePlant) return;
        const detected = detectedName.trim();
        const unknown = t('planning.unknown_plant');
        const hasDetectedName = detected.length > 0 && normalize(detected) !== normalize(unknown);
        if (hasDetectedName) {
            const matchedPlant = findLibraryMatchByName(detected);
            if (matchedPlant) {
                setPhotoOpen(false);
                setPhotoUri(null);
                setAiSessionActive(false);
                setAiLimitError('');
                openLibraryMatch(String(matchedPlant._id), {
                    mode: 'select',
                    from: 'scanner',
                    scannedPhotoUri: photoUri ?? undefined,
                });
                return;
            }
        }
        setDetectNoMatch(true);
    };

    const handleSaveAsUnknown = async () => {
        if (!canCreatePlant) return;
        setPhotoSaving(true);
        try {
            await createUserPlant({
                nickname: normalizeCustomPlantNickname(detectedName, t('planning.unknown_plant')),
            });
            setPhotoOpen(false);
            setPhotoUri(null);
        }
        finally {
            setAiSessionActive(false);
            setAiLimitError('');
            setDetectNoMatch(false);
            setPhotoSaving(false);
        }
    };

    useEffect(() => {
        if (!sheetOpen) {
            setAiLimitError('');
        }
    }, [sheetOpen]);

    useEffect(() => {
        if (!photoOpen) {
            setAiSessionActive(false);
        }
    }, [photoOpen]);

    useEffect(() => {
        if (openAddSheetSignal <= 0) return;
        if (!canCreatePlant) return;
        setAiLimitError('');
        setSheetOpen(true);
    }, [openAddSheetSignal, canCreatePlant]);

    useFocusEffect(
        useCallback(() => {
            setAiLimitError('');
            return () => {
                setAiLimitError('');
                setScanSourceOpen(false);
                setAiSessionActive(false);
            };
        }, [])
    );

    return (
        <>
            {/* Auth warning */}
            {!isAuthLoading && !isAuthenticated && (
                <View style={{ backgroundColor: theme.warningBg, borderWidth: 1, borderColor: theme.warning, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 }}>
                    <Text style={{ color: theme.warning, fontSize: 13 }}>{t('planning.auth_warning')}</Text>
                </View>
            )}

            {/* Content */}
            {isLoading || isSetupLoading ? (
                <View style={{ paddingVertical: 60, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={theme.primary} />
                </View>
            ) : isSetupRequired ? (
                <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12, backgroundColor: theme.card, borderRadius: 20, borderWidth: 1, borderColor: theme.border }}>
                    <Calendar size={48} stroke={theme.warning} />
                    <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{t('planning.setup_required_title')}</Text>
                    <Text style={{ fontSize: 13, color: theme.textSecondary, textAlign: 'center', paddingHorizontal: 24 }}>{t('planning.setup_required_desc')}</Text>
                </View>
            ) : plannedPlants.length === 0 ? (
                <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12, backgroundColor: theme.card, borderRadius: 20, borderWidth: 1, borderColor: theme.border }}>
                    <Calendar size={48} stroke={theme.textMuted} />
                    <Text style={{ fontSize: 16, fontWeight: '700', color: theme.textMuted }}>{t('planning.empty_title')}</Text>
                    <Text style={{ fontSize: 13, color: theme.textMuted, textAlign: 'center' }}>{t('planning.empty_desc')}</Text>
                </View>
            ) : (
                <View style={{ gap: 10 }}>
                    {plannedPlants.map((plant) => (
                        <TouchableOpacity
                            key={plant._id}
                            onPress={() =>
                                router.push({
                                    pathname: '/(tabs)/plant/[userPlantId]',
                                    params: { userPlantId: String(plant._id), from: 'planning' },
                                })
                            }
                            activeOpacity={0.8}
                            style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                        >
                            <View style={{ width: 44, height: 44, backgroundColor: theme.accent, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }}>
                                <Leaf size={22} stroke={theme.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{plant.displayName ?? plant.scientificName ?? t('planning.unnamed')}</Text>
                                <Text style={{ fontSize: 12, color: theme.textMuted }}>{t('planning.status_planning')}</Text>
                            </View>
                            <ChevronRight size={16} stroke={theme.textMuted} />
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {/* Add plant sheet */}
            <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
                <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={() => setSheetOpen(false)} />
                <View style={{ backgroundColor: theme.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 20 }}>
                    <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: 'center', marginBottom: -4 }} />
                    <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>{t('planning.modal_title')}</Text>

                    <View style={{ gap: 12 }}>
                        <TouchableOpacity
                            disabled={!canCreatePlant}
                            onPress={() => {
                                setSheetOpen(false);
                                openLibrarySelect({ mode: 'select', from: 'planning' });
                            }}
                            testID="e2e-planning-option-library"
                            style={{ backgroundColor: theme.background, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.border, opacity: !canCreatePlant ? 0.6 : 1 }}
                        >
                            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>{t('planning.option_library_title')}</Text>
                            <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4, fontWeight: '500' }}>{t('planning.option_library_desc')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            disabled={!canCreatePlant}
                            onPress={handleCapture}
                            testID="e2e-planning-option-camera"
                            style={{ backgroundColor: theme.background, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.border, opacity: !canCreatePlant ? 0.6 : 1 }}
                        >
                            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>{t('planning.option_camera_title')}</Text>
                            <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4, fontWeight: '500' }}>{t('planning.option_camera_desc')}</Text>
                        </TouchableOpacity>
                    </View>
                    {!!aiLimitError && (
                        <View style={{ backgroundColor: theme.dangerBg, borderWidth: 1, borderColor: theme.danger, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
                            <Text style={{ color: theme.danger, fontSize: 12 }}>{aiLimitError}</Text>
                        </View>
                    )}
                    <View style={{ gap: 8, marginTop: 4 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('planning.quick_input_label')}</Text>
                        <TextInput
                            style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                            placeholder={t('planning.quick_input_placeholder')}
                            placeholderTextColor={theme.textMuted}
                            value={nickname}
                            onChangeText={setNickname}
                            testID="e2e-planning-quick-input"
                        />
                    </View>
                    <TouchableOpacity
                        disabled={!canCreatePlant || !nickname.trim() || saving}
                        onPress={handleAddPlant}
                        testID="e2e-planning-confirm-add"
                        style={{ backgroundColor: theme.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: (!canCreatePlant || !nickname.trim() || saving) ? 0.6 : 1, marginTop: 8 }}
                    >
                        {saving ? <ActivityIndicator color="white" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, textAlign: 'center' }}>{t('planning.add_confirm')}</Text>}
                    </TouchableOpacity>
                </View>
            </Modal>

            <Modal
                visible={scanSourceOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setScanSourceOpen(false)}
            >
                <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' }} onPress={() => setScanSourceOpen(false)} />
                <View style={{ position: 'absolute', top: 120, left: '33.5%', width: '33%', backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' }}>
                    <TouchableOpacity style={{ paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border }} onPress={() => { void handleCaptureFromCamera(); }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>{t('planning.scan_source_camera')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{ paddingHorizontal: 10, paddingVertical: 10 }} onPress={() => { void handlePickFromLibrary(); }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>{t('planning.scan_source_library')}</Text>
                    </TouchableOpacity>
                </View>
            </Modal>

            {/* Photo plant modal */}
            <Modal visible={photoOpen} transparent animationType="slide" onRequestClose={() => setPhotoOpen(false)}>
                <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setPhotoOpen(false)} />
                <View style={{ backgroundColor: theme.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 12 }}>
                    <View style={{ width: 36, height: 4, backgroundColor: theme.border, borderRadius: 2, alignSelf: 'center', marginBottom: 4 }} />
                    <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text }}>{t('planning.detect_title')}</Text>
                    {photoUri && (
                        <View style={{ position: 'relative' }}>
                            <Image source={{ uri: photoUri }} style={{ width: '100%', height: 200, borderRadius: 16 }} resizeMode="cover" />
                            {isDetecting && (
                                <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
                                    <ActivityIndicator size="large" color="#fff" />
                                </View>
                            )}
                        </View>
                    )}

                    {/* AI Suggestions UI */}
                    {detectionResults ? (
                        <View style={{ gap: 12 }}>
                            {detectionResults.match ? (
                                <View style={{ backgroundColor: theme.primary + '10', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: theme.primary + '30' }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.primary, textTransform: 'uppercase' }}>{t('planning.top_match') || 'Top Match'}</Text>
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.primary }}>{Math.round(detectionResults.match.probability * 100)}%</Text>
                                    </View>
                                    <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text, marginTop: 4 }}>{detectionResults.match.name}</Text>
                                    {detectionResults.match.common_names?.[0] && (
                                        <Text style={{ fontSize: 13, color: theme.textSecondary }}>{detectionResults.match.common_names[0]}</Text>
                                    )}
                                    {detectionResults.match.plantMasterId && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: theme.primary + '20' }}>
                                            <BookOpen size={14} stroke={theme.primary} />
                                            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.primary }}>{t('planning.linked_to_library') || 'Linked to Library'}</Text>
                                        </View>
                                    )}
                                </View>
                            ) : (
                                <Text style={{ textAlign: 'center', color: theme.textSecondary }}>{t('planning.no_match_found') || 'No match found'}</Text>
                            )}

                            {detectionResults.alternatives.length > 0 && (
                                <View style={{ gap: 8 }}>
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase' }}>{t('planning.similar_plants') || 'Similar Plants'}</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                                        {detectionResults.alternatives.map((alt: any, idx: number) => (
                                            <TouchableOpacity
                                                key={idx}
                                                onPress={() => {
                                                    setDetectedName(alt.name);
                                                    setDetectionResults({ ...detectionResults, match: alt, alternatives: detectionResults.alternatives.filter((_, i) => i !== idx).concat(detectionResults.match ? [detectionResults.match] : []) });
                                                }}
                                                style={{ width: 140, backgroundColor: theme.accent, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: theme.border }}
                                            >
                                                {alt.image_url && <Image source={{ uri: alt.image_url }} style={{ width: '100%', height: 80, borderRadius: 8, marginBottom: 6 }} />}
                                                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }} numberOfLines={1}>{alt.name}</Text>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <Text style={{ fontSize: 11, color: theme.textSecondary }}>{Math.round(alt.probability * 100)}% Match</Text>
                                                    {alt.plantMasterId && <BookOpen size={12} stroke={theme.primary} />}
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}
                        </View>
                    ) : !isDetecting && (
                        <Text style={{ fontSize: 12, color: theme.textSecondary }}>{t('planning.detect_hint')}</Text>
                    )}

                    <TextInput
                        style={{ backgroundColor: theme.accent, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: theme.text, borderWidth: 1, borderColor: theme.border }}
                        placeholder={t('planning.detect_name_placeholder')}
                        placeholderTextColor={theme.textMuted}
                        value={detectedName}
                        onChangeText={(value) => {
                            setDetectedName(value);
                            if (detectNoMatch) setDetectNoMatch(false);
                        }}
                    />
                    {detectNoMatch && (
                        <View style={{ gap: 8 }}>
                            <Text style={{ fontSize: 12, color: theme.warning, textAlign: 'center' }}>{t('planning.detect_not_found')}</Text>
                            <TouchableOpacity
                                style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.border, backgroundColor: theme.accent }}
                                onPress={handleCapture}
                            >
                                <Text style={{ color: theme.textAccent, fontWeight: '700', fontSize: 14 }}>{t('planning.detect_retake')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card }}
                                onPress={() => {
                                    setPhotoOpen(false);
                                    openLibrarySelect({
                                        mode: 'select',
                                        from: 'scanner',
                                        searchQuery: detectedName.trim(),
                                        tab: 'plants',
                                    });
                                }}
                            >
                                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{t('planning.scan_source_library')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: theme.primary, opacity: photoSaving ? 0.6 : 1 }}
                                disabled={photoSaving}
                                onPress={handleSaveAsUnknown}
                            >
                                {photoSaving ? <ActivityIndicator color="white" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('planning.detect_save_unknown')}</Text>}
                            </TouchableOpacity>
                        </View>
                    )}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity disabled={!canCreatePlant || isDetecting} onPress={canCreatePlant ? handleCapture : undefined} style={{ flex: 1, backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: (!canCreatePlant || isDetecting) ? 0.5 : 1 }}>
                            <Text style={{ color: theme.textAccent, fontWeight: '600' }}>{t('planning.detect_retake')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity disabled={!canCreatePlant || photoSaving || isDetecting} onPress={handleSavePhotoPlant} style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: (!canCreatePlant || photoSaving || isDetecting) ? 0.5 : 1 }}>
                            {photoSaving ? <ActivityIndicator color="white" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{t('planning.detect_save')}</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </>
    );
}

// ─── Growing Tab Content ──────────────────────────────────────────────────────
function GrowingTabContent() {
    const { t, i18n } = useTranslation();
    const theme = useTheme();
    const router = useRouter();
    const { plants, isLoading, updateStatus } = usePlants();
    const { beds } = useBeds();
    const { deviceId } = useDeviceId();
    const gardens = useQuery(api.gardens.getGardens, deviceId ? { deviceId } : 'skip');
    const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
    const canEdit = !isAuthLoading && (isAuthenticated || !!deviceId);

    const activePlants = useMemo(
        () => plants.filter((p) => p.status === 'growing'),
        [plants]
    );
    const archivedPlants = useMemo(
        () => plants.filter((p) => p.status === 'archived' || p.status === 'harvested'),
        [plants]
    );
    const bedMap = useMemo(
        () => new Map(beds.map((bed: any) => [String(bed._id), bed])),
        [beds]
    );
    const gardenMap = useMemo(
        () => new Map((gardens ?? []).map((garden: any) => [String(garden._id), garden])),
        [gardens]
    );

    const formatArchiveDate = (value?: number) => {
        if (!value) return '—';
        return new Date(value).toLocaleDateString(i18n.language, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
        });
    };

    return (
        <>
            {!isAuthLoading && !isAuthenticated && (
                <View style={{ backgroundColor: theme.warningBg, borderWidth: 1, borderColor: theme.warning, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 }}>
                    <Text style={{ color: theme.warning, fontSize: 13 }}>{t('growing.auth_warning')}</Text>
                </View>
            )}

            {isLoading ? (
                <View style={{ paddingVertical: 60, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={theme.primary} />
                </View>
            ) : (
                <View style={{ gap: 18 }}>
                    {activePlants.length === 0 ? (
                        <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12, backgroundColor: theme.card, borderRadius: 20, borderWidth: 1, borderColor: theme.border }}>
                            <Sprout size={48} stroke={theme.textMuted} />
                            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.textMuted }}>{t('growing.no_plants')}</Text>
                            <Text style={{ fontSize: 13, color: theme.textMuted, textAlign: 'center' }}>{t('growing.no_plants_desc')}</Text>
                        </View>
                    ) : (
                        <View style={{ gap: 10 }}>
                            {activePlants.map((plant) => {
                                const bed = plant.bedId ? bedMap.get(String(plant.bedId)) : undefined;
                                const garden = bed?.gardenId ? gardenMap.get(String(bed.gardenId)) : undefined;
                                const pos = plant.positionInBed;
                                const hasPosition = typeof pos?.x === 'number' && typeof pos?.y === 'number';
                                const positionLabel = hasPosition ? ` • Cell ${(pos?.x ?? 0) + 1},${(pos?.y ?? 0) + 1}` : '';
                                const locationLabel = bed
                                    ? `${garden?.name ?? t('growing.unknown_garden')} > ${bed.name}${positionLabel}`
                                    : t('growing.no_location');

                                return (
                                    <TouchableOpacity
                                        key={plant._id}
                                        onPress={() =>
                                            router.push({
                                                pathname: '/(tabs)/plant/[userPlantId]',
                                                params: { userPlantId: String(plant._id), from: 'growing' },
                                            })
                                        }
                                        activeOpacity={0.8}
                                        style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                                    >
                                        <View style={{ width: 44, height: 44, backgroundColor: theme.accent, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }}>
                                            <Sprout size={22} stroke={theme.primary} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{plant.displayName ?? plant.scientificName ?? t('growing.unnamed')}</Text>
                                            <Text style={{ fontSize: 12, color: theme.textMuted }} numberOfLines={2}>{locationLabel}</Text>
                                            <Text style={{ fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', marginTop: 2 }}>{t('plant.status_growing')}</Text>
                                        </View>
                                        <TouchableOpacity
                                            disabled={!canEdit}
                                            onPress={() => updateStatus(plant._id, 'archived')}
                                            testID="e2e-growing-harvest-button"
                                            style={{ backgroundColor: theme.primary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, opacity: !canEdit ? 0.5 : 1 }}
                                        >
                                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{t('growing.harvest')}</Text>
                                        </TouchableOpacity>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}

                    <View style={{ gap: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, letterSpacing: 1, textTransform: 'uppercase' }}>
                            {t('growing.archive_title')}
                        </Text>
                        {archivedPlants.length === 0 ? (
                            <Text style={{ fontSize: 12, color: theme.textMuted, fontStyle: 'italic' }}>
                                {t('growing.archive_empty')}
                            </Text>
                        ) : (
                            <View style={{ gap: 10 }}>
                                {archivedPlants.map((plant) => (
                                    <TouchableOpacity
                                        key={`archived-${plant._id}`}
                                        onPress={() =>
                                            router.push({
                                                pathname: '/(tabs)/plant/[userPlantId]',
                                                params: { userPlantId: String(plant._id), from: 'growing' },
                                            })
                                        }
                                        activeOpacity={0.8}
                                        style={{ backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: 0.9 }}
                                    >
                                        <View style={{ width: 44, height: 44, backgroundColor: theme.accent, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }}>
                                            <Leaf size={20} stroke={theme.textMuted} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{plant.displayName ?? plant.scientificName ?? t('growing.unnamed')}</Text>
                                            <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                                                {t('plant.status_archived')} • {formatArchiveDate(plant.actualHarvestDate ?? plant.archivedAt)}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>
                </View>
            )}
        </>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
function FarmerGardenScreen() {
    const { t } = useTranslation();
    const theme = useTheme();
    const params = useLocalSearchParams<{ tab?: string | string[]; scanner?: string | string[]; create?: string | string[] }>();
    const { deviceId } = useDeviceId();
    const { user, isLoading: isAuthLoading } = useAuth();
    const gardensQuery = useQuery(api.gardens.getGardens, deviceId ? { deviceId } : 'skip');
    const gardens = gardensQuery ?? [];
    const isPremium = isPremiumActive(user);
    const canCreateGarden = !isAuthLoading && (isPremium || gardens.length < 1);

    const [activeTab, setActiveTab] = useState<GardenTab>('garden');
    const [showCreate, setShowCreate] = useState(false);
    const [openAddSheetSignal, setOpenAddSheetSignal] = useState(0);
    const [gardenLimitError, setGardenLimitError] = useState('');
    const scannerHandledRef = useRef(false);
    const unitSystem = useUnitSystem();

    const TABS = [
        { key: 'garden', label: t('garden.tab_garden') },
        { key: 'planning', label: t('garden.tab_planning') },
        { key: 'growing', label: t('garden.tab_growing') },
    ];

    const handleOpenCreateGarden = () => {
        if (!canCreateGarden) {
            setGardenLimitError(t('garden.error_limit_free'));
            return;
        }
        setGardenLimitError('');
        setShowCreate(true);
    };

    useEffect(() => {
        if (canCreateGarden) {
            setGardenLimitError('');
        }
    }, [canCreateGarden]);

    useEffect(() => {
        if (activeTab !== 'garden') {
            setGardenLimitError('');
        }
    }, [activeTab]);

    useFocusEffect(
        useCallback(() => {
            setGardenLimitError('');
            return () => {
                setGardenLimitError('');
            };
        }, [])
    );

    useEffect(() => {
        const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
        if (tabParam === 'garden' || tabParam === 'planning' || tabParam === 'growing') {
            setActiveTab(tabParam);
        }
    }, [params.tab]);

    useEffect(() => {
        const createParam = Array.isArray(params.create) ? params.create[0] : params.create;
        if (createParam !== '1') return;
        setActiveTab('garden');
        if (canCreateGarden) {
            setShowCreate(true);
        } else {
            setGardenLimitError(t('garden.error_limit_free'));
        }
    }, [params.create, canCreateGarden, t]);

    useEffect(() => {
        const scannerParam = Array.isArray(params.scanner) ? params.scanner[0] : params.scanner;
        if (scannerParam !== '1') {
            scannerHandledRef.current = false;
            return;
        }
        if (scannerHandledRef.current) return;
        scannerHandledRef.current = true;
        setActiveTab('planning');
        setOpenAddSheetSignal((v) => v + 1);
    }, [params.scanner]);

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            {/* Sticky header: title + tab bar */}
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 12, backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>{t('garden.title')}</Text>
                    {activeTab === 'garden' && (
                        <TouchableOpacity
                            onPress={handleOpenCreateGarden}
                            testID="e2e-garden-open-create"
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}
                        >
                            <Plus size={13} stroke="white" />
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('garden.create_button')}</Text>
                        </TouchableOpacity>
                    )}
                    {activeTab === 'planning' && (
                        <TouchableOpacity
                            onPress={() => setOpenAddSheetSignal((v) => v + 1)}
                            testID="e2e-planning-add-button"
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}
                        >
                            <Plus size={13} stroke="white" />
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('planning.add_button')}</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <SlidingTabBar
                    tabs={TABS}
                    activeTab={activeTab}
                    onTabChange={(key) => setActiveTab(key as GardenTab)}
                />
            </View>

            {/* Scrollable content area */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
                {activeTab === 'garden' && (
                    <>
                        {!!gardenLimitError && (
                            <View style={{ marginBottom: 12, backgroundColor: theme.dangerBg, borderWidth: 1, borderColor: theme.danger, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
                                <Text style={{ color: theme.danger, fontSize: 13 }}>
                                    {gardenLimitError}
                                </Text>
                            </View>
                        )}
                        <GardenTabContent onCreateGarden={handleOpenCreateGarden} canCreateGarden={canCreateGarden} unitSystem={unitSystem} />
                    </>
                )}
                {activeTab === 'planning' && <PlanningTabContent openAddSheetSignal={openAddSheetSignal} />}
                {activeTab === 'growing' && <GrowingTabContent />}
            </ScrollView>

            <CreateGardenModal visible={showCreate} onClose={() => setShowCreate(false)} unitSystem={unitSystem} />
        </View>
    );
}

export default function GardenScreen() {
    const { appMode } = useAppMode();
    const isGardener = appMode === 'gardener';

    if (isGardener) {
        return <GardenerMyPlantsView />;
    }

    return <FarmerGardenScreen />;
}
