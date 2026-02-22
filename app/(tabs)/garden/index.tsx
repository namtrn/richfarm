import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Modal,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import { Fence, Plus, X, Calendar, Sprout } from 'lucide-react-native';
import { useQuery, useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
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

// ─── Garden Card ─────────────────────────────────────────────────────────────
function GardenCard({
    garden,
    onPress,
    unitSystem,
    testID,
}: {
    garden: any;
    onPress: () => void;
    unitSystem: UnitSystem;
    testID?: string;
}) {
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
                <Text style={{ fontSize: 28 }}>🌿</Text>
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>{garden.name}</Text>
                <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                    {garden.areaM2 ? formatArea(garden.areaM2, unitSystem) : '—'}
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
        if (!widthValue || !lengthValue) { setError(t('garden.error_dimensions')); return; }
        setLoading(true);
        setError('');
        try {
            await createGarden({
                name: name.trim(),
                locationType,
                areaM2: widthValue * lengthValue,
                deviceId,
            });
            setName('');
            setWidth('');
            setLength('');
            setLocationType('outdoor');
            onClose();
        } catch (e: any) {
            const message = typeof e?.message === 'string' ? e.message : '';
            if (message.includes('GARDEN_LIMIT_FREE')) {
                setError(t('garden.error_limit_free'));
            } else {
                setError(message || t('common.error'));
            }
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

                    {/* Location type */}
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>
                        {t('garden.location_label', { defaultValue: 'Location type' })}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                        {[
                            { key: 'outdoor', label: t('garden.location_outdoor', { defaultValue: 'Outdoor' }) },
                            { key: 'greenhouse', label: t('garden.location_greenhouse', { defaultValue: 'Greenhouse' }) },
                            { key: 'balcony', label: t('garden.location_balcony', { defaultValue: 'Balcony' }) },
                            { key: 'indoor', label: t('garden.location_indoor', { defaultValue: 'Indoor' }) },
                        ].map((option) => {
                            const active = locationType === option.key;
                            return (
                                <TouchableOpacity
                                    key={option.key}
                                    onPress={() => setLocationType(option.key as any)}
                                    style={{
                                        paddingHorizontal: 12,
                                        paddingVertical: 8,
                                        borderRadius: 999,
                                        backgroundColor: active ? '#22c55e' : '#f9fafb',
                                        borderWidth: 1,
                                        borderColor: active ? '#22c55e' : '#e5e7eb',
                                    }}
                                >
                                    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#374151' }}>
                                        {option.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Dimensions */}
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>
                        {t('garden.size_label')}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 6 }}>
                                {t('garden.width_label', { unit: getDistanceUnitLabel(unitSystem) })}
                            </Text>
                            <TextInput
                                value={width}
                                onChangeText={(text) => { setWidth(text); setError(''); }}
                                placeholder={t('garden.dimension_placeholder')}
                                placeholderTextColor="#9ca3af"
                                keyboardType="decimal-pad"
                                testID="e2e-garden-create-width-input"
                                style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#111827' }}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 6 }}>
                                {t('garden.length_label', { unit: getDistanceUnitLabel(unitSystem) })}
                            </Text>
                            <TextInput
                                value={length}
                                onChangeText={(text) => { setLength(text); setError(''); }}
                                placeholder={t('garden.dimension_placeholder')}
                                placeholderTextColor="#9ca3af"
                                keyboardType="decimal-pad"
                                testID="e2e-garden-create-length-input"
                                style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#111827' }}
                            />
                        </View>
                    </View>

                    {/* Summary */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20, paddingHorizontal: 4 }}>
                        <Text style={{ fontSize: 13, color: '#6b7280' }}>
                            {areaM2
                                ? t('garden.area_summary', {
                                    value: formatAreaValue(areaM2, unitSystem),
                                    unit: getAreaUnitLabel(unitSystem),
                                })
                                : '—'}
                        </Text>
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
                <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 }}>
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

                    {/* Quick actions */}
                    <View style={{ marginBottom: 20 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 10 }}>
                            {t('garden.quick_actions_title', { defaultValue: 'Garden tools' })}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <TouchableOpacity
                                onPress={() => router.push('/(tabs)/planning')}
                                testID="e2e-garden-quick-planning"
                                style={{ flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6', gap: 8 }}
                            >
                                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#ecfeff', alignItems: 'center', justifyContent: 'center' }}>
                                    <Calendar size={18} stroke="#0e7490" />
                                </View>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>
                                    {t('garden.quick_planning', { defaultValue: 'Planning' })}
                                </Text>
                                <Text style={{ fontSize: 12, color: '#6b7280' }}>
                                    {t('garden.quick_planning_desc', { defaultValue: 'Plan new crops and seedlings.' })}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => router.push('/(tabs)/growing')}
                                testID="e2e-garden-quick-growing"
                                style={{ flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6', gap: 8 }}
                            >
                                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#ecfdf3', alignItems: 'center', justifyContent: 'center' }}>
                                    <Sprout size={18} stroke="#16a34a" />
                                </View>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>
                                    {t('garden.quick_growing', { defaultValue: 'Growing' })}
                                </Text>
                                <Text style={{ fontSize: 12, color: '#6b7280' }}>
                                    {t('garden.quick_growing_desc', { defaultValue: 'Track active plants.' })}
                                </Text>
                            </TouchableOpacity>
                        </View>
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
