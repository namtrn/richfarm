import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Modal,
    TextInput,
    ActivityIndicator,
    NativeScrollEvent,
    NativeSyntheticEvent,
} from 'react-native';
import { Fence, Plus, X, ChevronUp, ChevronDown } from 'lucide-react-native';
import { useQuery, useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api } from '../../../convex/_generated/api';
import { useDeviceId } from '../../../lib/deviceId';
import { formatArea, getAreaUnitLabel, UnitSystem } from '../../../lib/units';
import { useUnitSystem } from '../../../hooks/useUnitSystem';

// ─── Size options ────────────────────────────────────────────────────────────
const ITEM_HEIGHT = 72;
const VISIBLE_ITEMS = 3;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

function getSizeOptions(t: (k: string) => string, unitSystem: UnitSystem) {
    return [
        { label: t('garden.size_mini'), desc: formatArea(0.5, unitSystem), areaM2: 0.5, icon: '🪴' },
        { label: t('garden.size_small'), desc: formatArea(1, unitSystem), areaM2: 1, icon: '🌿' },
        { label: t('garden.size_medium'), desc: formatArea(2, unitSystem), areaM2: 2, icon: '🌱' },
        { label: t('garden.size_large'), desc: formatArea(4, unitSystem), areaM2: 4, icon: '🌳' },
        { label: t('garden.size_wide'), desc: formatArea(8, unitSystem), areaM2: 8, icon: '🏡' },
        { label: t('garden.size_farm'), desc: formatArea(16, unitSystem), areaM2: 16, icon: '🚜' },
    ];
}

// ─── Vertical Scroll Size Picker ─────────────────────────────────────────────
function SizePicker({
    selectedIndex,
    onSelect,
    sizeOptions,
}: {
    selectedIndex: number;
    onSelect: (index: number) => void;
    sizeOptions: ReturnType<typeof getSizeOptions>;
}) {
    const scrollRef = useRef<ScrollView>(null);

    const scrollToIndex = (index: number) => {
        scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: true });
        onSelect(index);
    };

    const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const y = e.nativeEvent.contentOffset.y;
        const index = Math.round(y / ITEM_HEIGHT);
        const clamped = Math.max(0, Math.min(index, sizeOptions.length - 1));
        scrollRef.current?.scrollTo({ y: clamped * ITEM_HEIGHT, animated: true });
        onSelect(clamped);
    };

    const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const y = e.nativeEvent.contentOffset.y;
        const index = Math.round(y / ITEM_HEIGHT);
        const clamped = Math.max(0, Math.min(index, sizeOptions.length - 1));
        if (clamped !== selectedIndex) onSelect(clamped);
    };

    return (
        <View style={{ height: PICKER_HEIGHT, borderRadius: 16, overflow: 'hidden', backgroundColor: '#f9fafb' }}>
            {/* Highlight band */}
            <View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    top: ITEM_HEIGHT,
                    left: 8,
                    right: 8,
                    height: ITEM_HEIGHT,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: '#4ade80',
                    backgroundColor: '#f0fdf4',
                    zIndex: 1,
                }}
            />

            {/* Up arrow */}
            <TouchableOpacity
                onPress={() => scrollToIndex(Math.max(0, selectedIndex - 1))}
                style={{ position: 'absolute', top: 4, left: 0, right: 0, zIndex: 2, alignItems: 'center' }}
            >
                <ChevronUp size={18} stroke="#22c55e" />
            </TouchableOpacity>

            {/* Down arrow */}
            <TouchableOpacity
                onPress={() => scrollToIndex(Math.min(sizeOptions.length - 1, selectedIndex + 1))}
                style={{ position: 'absolute', bottom: 4, left: 0, right: 0, zIndex: 2, alignItems: 'center' }}
            >
                <ChevronDown size={18} stroke="#22c55e" />
            </TouchableOpacity>

            <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_HEIGHT}
                decelerationRate="fast"
                onScroll={handleScroll}
                onMomentumScrollEnd={handleScrollEnd}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
            >
                {sizeOptions.map((opt, i) => {
                    const isSelected = i === selectedIndex;
                    return (
                        <TouchableOpacity
                            key={opt.label}
                            onPress={() => scrollToIndex(i)}
                            style={{ height: ITEM_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12 }}
                        >
                            <Text style={{ fontSize: 28 }}>{opt.icon}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 16, fontWeight: '600', color: isSelected ? '#15803d' : '#9ca3af' }}>
                                    {opt.label}
                                </Text>
                                <Text style={{ fontSize: 13, color: isSelected ? '#22c55e' : '#d1d5db' }}>
                                    {opt.desc}
                                </Text>
                            </View>
                            {isSelected && (
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' }} />
                            )}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

// ─── Garden Card ─────────────────────────────────────────────────────────────
function GardenCard({
    garden,
    sizeOptions,
    onPress,
    unitSystem,
    testID,
}: {
    garden: any;
    sizeOptions: ReturnType<typeof getSizeOptions>;
    onPress: () => void;
    unitSystem: UnitSystem;
    testID?: string;
}) {
    const sizeOpt = sizeOptions.find((s) => s.areaM2 === garden.areaM2);
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
                shadowColor: '#000',
                shadowOpacity: 0.05,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
                borderWidth: 1,
                borderColor: '#f3f4f6',
            }}
        >
            <View style={{ width: 56, height: 56, backgroundColor: '#f0fdf4', borderRadius: 16, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 28 }}>{sizeOpt?.icon ?? '🌿'}</Text>
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>{garden.name}</Text>
                <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                    {sizeOpt ? `${sizeOpt.label} · ${sizeOpt.desc}` : garden.areaM2 ? formatArea(garden.areaM2, unitSystem) : '—'}
                </Text>
            </View>
            <View style={{ backgroundColor: '#f0fdf4', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, color: '#15803d', fontWeight: '600' }}>0 beds</Text>
            </View>
        </TouchableOpacity>
    );
}

// ─── Create Garden Modal ──────────────────────────────────────────────────────
function CreateGardenModal({
    visible,
    onClose,
    unitSystem,
}: {
    visible: boolean;
    onClose: () => void;
    unitSystem: UnitSystem;
}) {
    const { t } = useTranslation();
    const { deviceId, isLoading: isDeviceLoading } = useDeviceId();
    const createGarden = useMutation(api.gardens.createGarden);
    const sizeOptions = getSizeOptions(t, unitSystem);

    const [name, setName] = useState('');
    const [sizeIndex, setSizeIndex] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleCreate = async () => {
        if (!deviceId) { setError(t('common.error')); return; }
        if (!name.trim()) { setError(t('garden.error_name')); return; }
        setLoading(true);
        setError('');
        try {
            await createGarden({
                name: name.trim(),
                locationType: 'outdoor',
                areaM2: sizeOptions[sizeIndex].areaM2,
                deviceId,
            });
            setName('');
            setSizeIndex(1);
            onClose();
        } catch (e: any) {
            setError(e.message ?? t('common.error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}>
                    {/* Handle */}
                    <View style={{ width: 40, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />

                    {/* Header */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827' }}>{t('garden.create_title')}</Text>
                        <TouchableOpacity onPress={onClose} testID="e2e-garden-create-close" style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                            <X size={20} stroke="#6b7280" />
                        </TouchableOpacity>
                    </View>

                    {/* Name */}
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>{t('garden.name_label')}</Text>
                    <TextInput
                        value={name}
                        onChangeText={(t) => { setName(t); setError(''); }}
                        placeholder={t('garden.name_placeholder')}
                        placeholderTextColor="#9ca3af"
                        testID="e2e-garden-create-name-input"
                        style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#111827', marginBottom: 20 }}
                    />

                    {/* Size picker */}
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>
                        {t('garden.size_label')} ({getAreaUnitLabel(unitSystem)})
                    </Text>
                    <SizePicker selectedIndex={sizeIndex} onSelect={setSizeIndex} sizeOptions={sizeOptions} />

                    {/* Summary */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, marginBottom: 20, paddingHorizontal: 4 }}>
                        <Text style={{ fontSize: 13, color: '#6b7280' }}>{t('garden.size_selected', { label: sizeOptions[sizeIndex].label, desc: sizeOptions[sizeIndex].desc })}</Text>
                    </View>

                    {!!error && <Text style={{ color: '#ef4444', fontSize: 13, marginBottom: 10 }}>{error}</Text>}

                    <TouchableOpacity
                        onPress={handleCreate}
                        disabled={loading || isDeviceLoading}
                        testID="e2e-garden-create-submit"
                        style={{ backgroundColor: '#22c55e', borderRadius: 18, paddingVertical: 16, alignItems: 'center', opacity: (loading || isDeviceLoading) ? 0.6 : 1 }}
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

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function GardenScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { deviceId } = useDeviceId();
    const unitSystem = useUnitSystem();
    const sizeOptions = getSizeOptions(t, unitSystem);
    const gardensQuery = useQuery(api.gardens.getGardens, deviceId ? { deviceId } : 'skip');
    const gardens = gardensQuery ?? [];
    const isLoading = gardensQuery === undefined;
    const [showCreate, setShowCreate] = useState(false);

    const handleOpenGarden = (gardenId: string) => {
        router.push(`/(tabs)/garden/${gardenId}`);
    };

    return (
        <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
                <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 }}>
                    {/* Header */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <View>
                            <Text style={{ fontSize: 32, fontWeight: '800', color: '#111827' }}>{t('garden.title')}</Text>
                            <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                                {gardens.length > 0
                                    ? t('garden.subtitle_count', { count: gardens.length })
                                    : t('garden.subtitle_empty')}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setShowCreate(true)}
                            testID="e2e-garden-open-create"
                            style={{ width: 44, height: 44, backgroundColor: '#22c55e', borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
                        >
                            <Plus size={22} stroke="white" />
                        </TouchableOpacity>
                    </View>

                    {/* Content */}
                    {isLoading ? (
                        <View style={{ paddingVertical: 80, alignItems: 'center' }}>
                            <ActivityIndicator size="large" color="#22c55e" />
                        </View>
                    ) : gardens.length === 0 ? (
                        <View style={{ paddingVertical: 60, alignItems: 'center', gap: 16, backgroundColor: '#fff', borderRadius: 24, borderWidth: 1, borderColor: '#f3f4f6' }}>
                            <View style={{ width: 80, height: 80, backgroundColor: '#f0fdf4', borderRadius: 40, alignItems: 'center', justifyContent: 'center' }}>
                                <Fence size={36} stroke="#22c55e" />
                            </View>
                            <View style={{ alignItems: 'center', gap: 4 }}>
                                <Text style={{ fontSize: 18, fontWeight: '700', color: '#1f2937' }}>{t('garden.empty_title')}</Text>
                                <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingHorizontal: 32 }}>{t('garden.empty_desc')}</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setShowCreate(true)}
                                testID="e2e-garden-empty-create"
                                style={{ backgroundColor: '#22c55e', borderRadius: 16, paddingHorizontal: 24, paddingVertical: 12, marginTop: 4 }}
                            >
                                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{t('garden.create_button')}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={{ gap: 12 }}>
                            {(gardens as any[]).map((g) => (
                                <GardenCard
                                    key={g._id}
                                    garden={g}
                                    sizeOptions={sizeOptions}
                                    unitSystem={unitSystem}
                                    onPress={() => handleOpenGarden(g._id)}
                                    testID="e2e-garden-card"
                                />
                            ))}
                        </View>
                    )}
                </View>
            </ScrollView>

            <CreateGardenModal visible={showCreate} onClose={() => setShowCreate(false)} unitSystem={unitSystem} />
        </View>
    );
}
