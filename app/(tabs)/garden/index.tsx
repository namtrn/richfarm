import React, { useState, useRef, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { Fence, Plus, X, Calendar, Sprout, Leaf, ChevronRight } from 'lucide-react-native';
import { useQuery, useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { api } from '../../../convex/_generated/api';
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
import { useAuth } from '../../../lib/auth';
import { useBeds } from '../../../hooks/useBeds';
import { isPremiumActive } from '../../../lib/access';
import { buildAiDetectorKey, consumeAiDetectorUsage, isAiDetectorLimitReached } from '../../../lib/aiDetectorLimit';
import * as ImagePicker from 'expo-image-picker';
import { usePlantLibrary } from '../../../hooks/usePlantLibrary';

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
        <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: '#e7e0d6', borderRadius: 22, padding: 2, position: 'relative' }}>
            <Animated.View
                pointerEvents="none"
                style={[
                    { position: 'absolute', top: 2, bottom: 2, backgroundColor: '#1a4731', borderRadius: 18 },
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
                        <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? '#fff' : '#a8a29e', letterSpacing: active ? 0.1 : 0 }}>
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
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            testID={testID}
            style={{
                backgroundColor: '#fff',
                borderRadius: 20,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                shadowColor: '#1a1a18',
                shadowOpacity: 0.06,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
                borderWidth: 1,
                borderColor: '#e7e0d6',
            }}
        >
            <View style={{ width: 56, height: 56, backgroundColor: '#e8f5ec', borderRadius: 16, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 28 }}>🌿</Text>
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#1c1917' }}>{garden.name}</Text>
                <Text style={{ fontSize: 13, color: '#78716c', marginTop: 2 }}>
                    {garden.areaM2 ? formatArea(garden.areaM2, unitSystem) : '—'}
                </Text>
            </View>
            <ChevronRight size={16} stroke="#c4bdb3" />
        </TouchableOpacity>
    );
}

// ─── Create Garden Modal ──────────────────────────────────────────────────────
function CreateGardenModal({ visible, onClose, unitSystem }: { visible: boolean; onClose: () => void; unitSystem: UnitSystem }) {
    const { t } = useTranslation();
    const { deviceId, isLoading: isDeviceLoading } = useDeviceId();
    const createGarden = useMutation(api.gardens.createGarden);

    const [name, setName] = useState('');
    const [width, setWidth] = useState('');
    const [length, setLength] = useState('');
    const [locationType, setLocationType] = useState<'outdoor' | 'greenhouse' | 'balcony' | 'indoor'>('outdoor');
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

    const LOCATION_TYPES = [
        { key: 'outdoor', label: t('garden.location_outdoor') },
        { key: 'greenhouse', label: t('garden.location_greenhouse') },
        { key: 'balcony', label: t('garden.location_balcony') },
        { key: 'indoor', label: t('garden.location_indoor') },
    ];

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}>
                    <View style={{ width: 36, height: 4, backgroundColor: '#e7e0d6', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <Text style={{ fontSize: 20, fontWeight: '700', color: '#1c1917' }}>{t('garden.create_title')}</Text>
                        <TouchableOpacity onPress={onClose} testID="e2e-garden-create-close" style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                            <X size={20} stroke="#78716c" />
                        </TouchableOpacity>
                    </View>

                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#5c5247', marginBottom: 8 }}>{t('garden.name_label')}</Text>
                    <TextInput
                        value={name}
                        onChangeText={(v) => { setName(v); setError(''); }}
                        placeholder={t('garden.name_placeholder')}
                        placeholderTextColor="#a8a29e"
                        testID="e2e-garden-create-name-input"
                        maxLength={NAME_MAX}
                        style={{ backgroundColor: '#f5f0e8', borderWidth: 1, borderColor: '#e7e0d6', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#1c1917', marginBottom: 20 }}
                    />

                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#5c5247', marginBottom: 8 }}>{t('garden.location_label')}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                        {LOCATION_TYPES.map((option) => {
                            const active = locationType === option.key;
                            return (
                                <TouchableOpacity
                                    key={option.key}
                                    onPress={() => setLocationType(option.key as any)}
                                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? '#1a4731' : '#f5f0e8', borderWidth: 1, borderColor: active ? '#1a4731' : '#e7e0d6' }}
                                >
                                    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#5c5247' }}>{option.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#5c5247', marginBottom: 8 }}>{t('garden.size_label')}</Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#78716c', marginBottom: 6 }}>{t('garden.width_label', { unit: getDistanceUnitLabel(unitSystem) })}</Text>
                            <TextInput
                                value={width}
                                onChangeText={(v) => { setWidth(v); setError(''); }}
                                placeholder={t('garden.dimension_placeholder')}
                                placeholderTextColor="#a8a29e"
                                keyboardType="decimal-pad"
                                testID="e2e-garden-create-width-input"
                                style={{ backgroundColor: '#f5f0e8', borderWidth: 1, borderColor: '#e7e0d6', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#1c1917' }}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#78716c', marginBottom: 6 }}>{t('garden.length_label', { unit: getDistanceUnitLabel(unitSystem) })}</Text>
                            <TextInput
                                value={length}
                                onChangeText={(v) => { setLength(v); setError(''); }}
                                placeholder={t('garden.dimension_placeholder')}
                                placeholderTextColor="#a8a29e"
                                keyboardType="decimal-pad"
                                testID="e2e-garden-create-length-input"
                                style={{ backgroundColor: '#f5f0e8', borderWidth: 1, borderColor: '#e7e0d6', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#1c1917' }}
                            />
                        </View>
                    </View>

                    <View style={{ marginBottom: 20, paddingHorizontal: 4 }}>
                        <Text style={{ fontSize: 13, color: '#78716c' }}>
                            {areaM2 ? t('garden.area_summary', { value: formatAreaValue(areaM2, unitSystem), unit: getAreaUnitLabel(unitSystem) }) : '—'}
                        </Text>
                    </View>

                    {!!error && <Text style={{ color: '#ef4444', fontSize: 13, marginBottom: 10 }}>{error}</Text>}

                    <TouchableOpacity
                        onPress={handleCreate}
                        disabled={loading || isDeviceLoading}
                        testID="e2e-garden-create-submit"
                        style={{ backgroundColor: '#1a4731', borderRadius: 18, paddingVertical: 16, alignItems: 'center', opacity: (loading || isDeviceLoading) ? 0.6 : 1 }}
                    >
                        {(loading || isDeviceLoading)
                            ? <ActivityIndicator color="white" />
                            : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{t('garden.create_action')}</Text>
                        }
                    </TouchableOpacity>
                </View>
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
    const router = useRouter();
    const { deviceId } = useDeviceId();
    const gardensQuery = useQuery(api.gardens.getGardens, deviceId ? { deviceId } : 'skip');
    const gardens = gardensQuery ?? [];
    const isLoading = gardensQuery === undefined;

    if (isLoading) {
        return (
            <View style={{ paddingVertical: 80, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#166534" />
            </View>
        );
    }

    if (gardens.length === 0) {
        return (
            <View style={{ paddingVertical: 60, alignItems: 'center', gap: 16, backgroundColor: '#fff', borderRadius: 24, borderWidth: 1, borderColor: '#e7e0d6' }}>
                <View style={{ width: 80, height: 80, backgroundColor: '#e8f5ec', borderRadius: 40, alignItems: 'center', justifyContent: 'center' }}>
                    <Fence size={36} stroke="#166534" />
                </View>
                <View style={{ alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#1c1917' }}>{t('garden.empty_title')}</Text>
                    <Text style={{ fontSize: 13, color: '#a8a29e', textAlign: 'center', paddingHorizontal: 32 }}>{t('garden.empty_desc')}</Text>
                </View>
                <TouchableOpacity
                    onPress={onCreateGarden}
                    disabled={!canCreateGarden}
                    testID="e2e-garden-empty-create"
                    style={{ backgroundColor: '#1a4731', borderRadius: 16, paddingHorizontal: 24, paddingVertical: 12, marginTop: 4, opacity: canCreateGarden ? 1 : 0.5 }}
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
        </View>
    );
}

// ─── Planning Tab Content ─────────────────────────────────────────────────────
function PlanningTabContent({ openAddSheetSignal }: { openAddSheetSignal: number }) {
    const { t, i18n } = useTranslation();
    const router = useRouter();
    const { plants, isLoading, addPlant } = usePlants();
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

    const canEdit = !isAuthLoading && isAuthenticated;
    const gardens = gardensQuery ?? [];
    const isSetupLoading = gardensQuery === undefined || isBedsLoading;
    const hasGardenOrBed = gardens.length > 0 || beds.length > 0;
    const canCreatePlant = canEdit && hasGardenOrBed;
    const isSetupRequired = canEdit && !isSetupLoading && !hasGardenOrBed;
    const isPremium = isPremiumActive(user);
    const aiDetectorKey = buildAiDetectorKey(user?._id ? String(user._id) : null, deviceId);
    const locale = i18n.language?.split('-')[0] ?? i18n.language;
    const { plants: libraryPlants } = usePlantLibrary(locale);
    const plannedPlants = plants.filter((p) => p.status === 'planting');
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
        try { await addPlant({ nickname: nickname.trim() }); setNickname(''); setSheetOpen(false); }
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
            const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true });
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
                router.push({
                    pathname: '/(tabs)/library',
                    params: {
                        q: detected,
                        tab: 'plants',
                        aiMatchId: String(matchedPlant._id),
                        aiFrom: 'scan',
                    },
                });
                return;
            }
        }
        setDetectNoMatch(true);
    };

    const handleSaveAsUnknown = async () => {
        if (!canCreatePlant) return;
        setPhotoSaving(true);
        try { await addPlant({ nickname: detectedName.trim() || t('planning.unknown_plant') }); setPhotoOpen(false); setPhotoUri(null); }
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
                <View style={{ backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fde68a', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 }}>
                    <Text style={{ color: '#92400e', fontSize: 13 }}>{t('planning.auth_warning')}</Text>
                </View>
            )}

            {/* Content */}
            {isLoading || isSetupLoading ? (
                <View style={{ paddingVertical: 60, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#166534" />
                </View>
            ) : isSetupRequired ? (
                <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#e7e0d6' }}>
                    <Calendar size={48} stroke="#d97706" />
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#1c1917' }}>{t('planning.setup_required_title')}</Text>
                    <Text style={{ fontSize: 13, color: '#78716c', textAlign: 'center', paddingHorizontal: 24 }}>{t('planning.setup_required_desc')}</Text>
                </View>
            ) : plannedPlants.length === 0 ? (
                <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#e7e0d6' }}>
                    <Calendar size={48} stroke="#a8a29e" />
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#a8a29e' }}>{t('planning.empty_title')}</Text>
                    <Text style={{ fontSize: 13, color: '#c4bdb3', textAlign: 'center' }}>{t('planning.empty_desc')}</Text>
                </View>
            ) : (
                <View style={{ gap: 10 }}>
                    {plannedPlants.map((plant) => (
                        <TouchableOpacity
                            key={plant._id}
                            onPress={() =>
                                router.push({
                                    pathname: '/(tabs)/plant/[plantId]',
                                    params: { plantId: String(plant._id), from: 'planning' },
                                })
                            }
                            activeOpacity={0.8}
                            style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7e0d6', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                        >
                            <View style={{ width: 44, height: 44, backgroundColor: '#e8f5ec', borderRadius: 14, justifyContent: 'center', alignItems: 'center' }}>
                                <Leaf size={22} stroke="#166534" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: '600', color: '#1c1917' }}>{plant.nickname ?? t('planning.unnamed')}</Text>
                                <Text style={{ fontSize: 12, color: '#a8a29e' }}>{t('planning.status_planning')}</Text>
                            </View>
                            <ChevronRight size={16} stroke="#c4bdb3" />
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {/* Add plant sheet */}
            <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
                <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setSheetOpen(false)} />
                <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 12 }}>
                    <View style={{ width: 36, height: 4, backgroundColor: '#e7e0d6', borderRadius: 2, alignSelf: 'center', marginBottom: 4 }} />
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#1c1917' }}>{t('planning.modal_title')}</Text>
                    <TouchableOpacity disabled={!canCreatePlant} onPress={() => { setSheetOpen(false); router.push('/(tabs)/library?mode=select&from=planning'); }} testID="e2e-planning-option-library" style={{ backgroundColor: '#f5f0e8', borderRadius: 14, padding: 16, opacity: !canCreatePlant ? 0.5 : 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#1c1917' }}>{t('planning.option_library_title')}</Text>
                        <Text style={{ fontSize: 12, color: '#78716c', marginTop: 2 }}>{t('planning.option_library_desc')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity disabled={!canCreatePlant} onPress={handleCapture} testID="e2e-planning-option-camera" style={{ backgroundColor: '#f5f0e8', borderRadius: 14, padding: 16, opacity: !canCreatePlant ? 0.5 : 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#1c1917' }}>{t('planning.option_camera_title')}</Text>
                        <Text style={{ fontSize: 12, color: '#78716c', marginTop: 2 }}>{t('planning.option_camera_desc')}</Text>
                    </TouchableOpacity>
                    {!!aiLimitError && (
                        <View style={{ backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
                            <Text style={{ color: '#b91c1c', fontSize: 12 }}>{aiLimitError}</Text>
                        </View>
                    )}
                    <Text style={{ fontSize: 12, color: '#a8a29e' }}>{t('planning.quick_input_label')}</Text>
                    <TextInput
                        style={{ backgroundColor: '#f5f0e8', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: '#1c1917', borderWidth: 1, borderColor: '#e7e0d6' }}
                        placeholder={t('planning.quick_input_placeholder')}
                        placeholderTextColor="#a8a29e"
                        value={nickname}
                        onChangeText={setNickname}
                        testID="e2e-planning-quick-input"
                    />
                    <TouchableOpacity
                        disabled={!canCreatePlant || !nickname.trim() || saving}
                        onPress={handleAddPlant}
                        testID="e2e-planning-confirm-add"
                        style={{ backgroundColor: '#1a4731', borderRadius: 16, paddingVertical: 14, alignItems: 'center', opacity: (!canCreatePlant || !nickname.trim() || saving) ? 0.5 : 1 }}
                    >
                        {saving ? <ActivityIndicator color="white" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.2 }}>{t('planning.add_confirm')}</Text>}
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
                <View style={{ position: 'absolute', top: 120, left: '33.5%', width: '33%', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e7e0d6', overflow: 'hidden' }}>
                    <TouchableOpacity style={{ paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e7e0d6' }} onPress={() => { void handleCaptureFromCamera(); }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#1c1917' }}>{t('planning.scan_source_camera')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{ paddingHorizontal: 10, paddingVertical: 10 }} onPress={() => { void handlePickFromLibrary(); }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#1c1917' }}>{t('planning.scan_source_library')}</Text>
                    </TouchableOpacity>
                </View>
            </Modal>

            {/* Photo plant modal */}
            <Modal visible={photoOpen} transparent animationType="slide" onRequestClose={() => setPhotoOpen(false)}>
                <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setPhotoOpen(false)} />
                <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 12 }}>
                    <View style={{ width: 36, height: 4, backgroundColor: '#e7e0d6', borderRadius: 2, alignSelf: 'center', marginBottom: 4 }} />
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#1c1917' }}>{t('planning.detect_title')}</Text>
                    {photoUri && <Image source={{ uri: photoUri }} style={{ width: '100%', height: 180, borderRadius: 16 }} resizeMode="cover" />}
                    <Text style={{ fontSize: 12, color: '#78716c' }}>{t('planning.detect_hint')}</Text>
                    <TextInput
                        style={{ backgroundColor: '#f5f0e8', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: '#1c1917', borderWidth: 1, borderColor: '#e7e0d6' }}
                        placeholder={t('planning.detect_name_placeholder')}
                        placeholderTextColor="#a8a29e"
                        value={detectedName}
                        onChangeText={(value) => {
                            setDetectedName(value);
                            if (detectNoMatch) setDetectNoMatch(false);
                        }}
                    />
                    {detectNoMatch && (
                        <View style={{ gap: 8 }}>
                            <Text style={{ fontSize: 12, color: '#92400e', textAlign: 'center' }}>{t('planning.detect_not_found')}</Text>
                            <TouchableOpacity
                                style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e7e0d6', backgroundColor: '#f5f0e8' }}
                                onPress={handleCapture}
                            >
                                <Text style={{ color: '#5c5247', fontWeight: '700', fontSize: 14 }}>{t('planning.detect_retake')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e7e0d6', backgroundColor: '#fff' }}
                                onPress={() => {
                                    setPhotoOpen(false);
                                    router.push({ pathname: '/(tabs)/library', params: { q: detectedName.trim(), tab: 'plants' } });
                                }}
                            >
                                <Text style={{ color: '#1c1917', fontWeight: '700', fontSize: 14 }}>{t('planning.scan_source_library')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#1a4731', opacity: photoSaving ? 0.6 : 1 }}
                                disabled={photoSaving}
                                onPress={handleSaveAsUnknown}
                            >
                                {photoSaving ? <ActivityIndicator color="white" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('planning.detect_save_unknown')}</Text>}
                            </TouchableOpacity>
                        </View>
                    )}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity disabled={!canCreatePlant} onPress={canCreatePlant ? handleCapture : undefined} style={{ flex: 1, backgroundColor: '#f5f0e8', borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: !canCreatePlant ? 0.5 : 1 }}>
                            <Text style={{ color: '#5c5247', fontWeight: '600' }}>{t('planning.detect_retake')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity disabled={!canCreatePlant || photoSaving} onPress={handleSavePhotoPlant} style={{ flex: 1, backgroundColor: '#1a4731', borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: (!canCreatePlant || photoSaving) ? 0.5 : 1 }}>
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
    const { t } = useTranslation();
    const router = useRouter();
    const { plants, isLoading, updateStatus } = usePlants();
    const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
    const canEdit = !isAuthLoading && isAuthenticated;

    const activePlants = plants.filter((p) => p.status === 'growing' || p.status === 'planting');

    return (
        <>
            {!isAuthLoading && !isAuthenticated && (
                <View style={{ backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fde68a', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 }}>
                    <Text style={{ color: '#92400e', fontSize: 13 }}>{t('growing.auth_warning')}</Text>
                </View>
            )}

            {isLoading ? (
                <View style={{ paddingVertical: 60, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#166534" />
                </View>
            ) : activePlants.length === 0 ? (
                <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#e7e0d6' }}>
                    <Sprout size={48} stroke="#a8a29e" />
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#a8a29e' }}>{t('growing.no_plants')}</Text>
                    <Text style={{ fontSize: 13, color: '#c4bdb3', textAlign: 'center' }}>{t('growing.no_plants_desc')}</Text>
                </View>
            ) : (
                <View style={{ gap: 10 }}>
                    {activePlants.map((plant) => (
                        <TouchableOpacity
                            key={plant._id}
                            onPress={() =>
                                router.push({
                                    pathname: '/(tabs)/plant/[plantId]',
                                    params: { plantId: String(plant._id), from: 'growing' },
                                })
                            }
                            activeOpacity={0.8}
                            style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7e0d6', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                        >
                            <View style={{ width: 44, height: 44, backgroundColor: '#e8f5ec', borderRadius: 14, justifyContent: 'center', alignItems: 'center' }}>
                                <Sprout size={22} stroke="#166534" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: '600', color: '#1c1917' }}>{plant.nickname ?? t('growing.unnamed')}</Text>
                                <Text style={{ fontSize: 12, color: '#a8a29e', textTransform: 'capitalize' }}>{plant.status}</Text>
                            </View>
                            <TouchableOpacity
                                disabled={!canEdit}
                                onPress={() => updateStatus(plant._id, 'harvested')}
                                testID="e2e-growing-harvest-button"
                                style={{ backgroundColor: '#1a4731', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, opacity: !canEdit ? 0.5 : 1 }}
                            >
                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{t('growing.harvest')}</Text>
                            </TouchableOpacity>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function GardenScreen() {
    const { t } = useTranslation();
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

    return (
        <View style={{ flex: 1, backgroundColor: '#faf8f4' }}>
            {/* Sticky header: title + tab bar */}
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e7e0d6' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 26, fontWeight: '800', color: '#1c1917', letterSpacing: -0.5 }}>{t('garden.title')}</Text>
                    {activeTab === 'garden' && (
                        <TouchableOpacity
                            onPress={handleOpenCreateGarden}
                            testID="e2e-garden-open-create"
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1a4731', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}
                        >
                            <Plus size={13} stroke="white" />
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('garden.create_button')}</Text>
                        </TouchableOpacity>
                    )}
                    {activeTab === 'planning' && (
                        <TouchableOpacity
                            onPress={() => setOpenAddSheetSignal((v) => v + 1)}
                            testID="e2e-planning-add-button"
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1a4731', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}
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
                            <View style={{ marginBottom: 12, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
                                <Text style={{ color: '#b91c1c', fontSize: 13 }}>
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
