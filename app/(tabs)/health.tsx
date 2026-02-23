import { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Modal,
} from 'react-native';
import { Bug, ShieldAlert, Sun, Search, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { LightSensor } from 'expo-sensors';
import { usePestsDiseases, PestDiseaseType } from '../../hooks/usePestsDiseases';
import { matchesSearch } from '../../lib/search';

type TabKey = 'pests' | 'diseases' | 'light';

type LuxRange = {
    min: number;
    max: number;
    label: string;
    example: string;
};

const LUX_RANGES: LuxRange[] = [
    { min: 0, max: 50, label: 'Very low', example: 'Moonlight or very dark room' },
    { min: 50, max: 200, label: 'Low', example: 'Dim indoor light' },
    { min: 200, max: 1000, label: 'Moderate', example: 'Bright indoor or shaded window' },
    { min: 1000, max: 10000, label: 'Bright', example: 'Overcast daylight or shade' },
    { min: 10000, max: 100000, label: 'Very bright', example: 'Direct sun' },
];

type ParamValue = string | string[] | undefined;

function resolveParam(value: ParamValue) {
    if (value === undefined) return undefined;
    return Array.isArray(value) ? value[0] : value;
}

function resolveTab(value: ParamValue): TabKey {
    const resolved = resolveParam(value);
    if (resolved === 'pests' || resolved === 'diseases' || resolved === 'light') return resolved;
    return 'pests';
}

function getLuxRange(lux: number | null) {
    if (lux === null || Number.isNaN(lux)) return null;
    for (const range of LUX_RANGES) {
        if (lux >= range.min && lux < range.max) return range;
    }
    return LUX_RANGES[LUX_RANGES.length - 1] ?? null;
}

function PestDiseaseCard({
    item,
    onPress,
}: {
    item: any;
    onPress: () => void;
}) {
    const { t } = useTranslation();
    const chips = item.plantsAffected?.slice(0, 4) ?? [];
    const extra = (item.plantsAffected?.length ?? 0) - chips.length;
    const typeLabel = item.type === 'disease' ? 'Disease' : 'Pest';
    const typeColor = item.type === 'disease' ? '#2563eb' : '#b91c1c';
    const typeBg = item.type === 'disease' ? '#dbeafe' : '#fee2e2';

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.85}
            style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                padding: 16,
                borderWidth: 1,
                borderColor: '#e7e0d6',
                shadowColor: '#1a1a18',
                shadowOpacity: 0.06,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
                gap: 10,
            }}
        >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#1c1917', flex: 1, letterSpacing: -0.3 }}>{item.name}</Text>
                <View style={{ backgroundColor: typeBg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 }}>
                    <Text style={{ color: typeColor, fontSize: 11, fontWeight: '700' }}>{typeLabel}</Text>
                </View>
            </View>
            <Text style={{ fontSize: 12, color: '#78716c' }}>
                {t('health.section_plants', { defaultValue: 'Plants affected' })}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {chips.map((plant: string) => (
                    <View key={plant} style={{ backgroundColor: '#f5f0e8', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 11, color: '#5c5247', fontWeight: '600' }}>{plant}</Text>
                    </View>
                ))}
                {extra > 0 && (
                    <View style={{ backgroundColor: '#faf8f4', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#e7e0d6' }}>
                        <Text style={{ fontSize: 11, color: '#a8a29e', fontWeight: '600' }}>+{extra} more</Text>
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
}

function Section({ title, items }: { title: string; items?: string[] }) {
    if (!items || items.length === 0) return null;
    return (
        <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#5c5247', marginBottom: 6 }}>{title}</Text>
            <View style={{ gap: 6 }}>
                {items.map((item, idx) => (
                    <Text key={`${title}-${idx}`} style={{ fontSize: 13, color: '#4b5563', lineHeight: 20 }}>
                        - {item}
                    </Text>
                ))}
            </View>
        </View>
    );
}

function ControlSection({ control }: { control: { physical: string[]; organic: string[]; chemical: string[] } }) {
    const { t } = useTranslation();

    return (
        <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#5c5247', marginBottom: 6 }}>
                {t('health.section_control', { defaultValue: 'Control' })}
            </Text>
            <View style={{ gap: 10 }}>
                <View>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#1c1917', marginBottom: 4 }}>
                        {t('health.control_physical', { defaultValue: 'Physical' })}
                    </Text>
                    {control.physical.map((item, idx) => (
                        <Text key={`physical-${idx}`} style={{ fontSize: 13, color: '#4b5563', lineHeight: 20 }}>
                            - {item}
                        </Text>
                    ))}
                </View>
                <View>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#1c1917', marginBottom: 4 }}>
                        {t('health.control_organic', { defaultValue: 'Organic' })}
                    </Text>
                    {control.organic.map((item, idx) => (
                        <Text key={`organic-${idx}`} style={{ fontSize: 13, color: '#4b5563', lineHeight: 20 }}>
                            - {item}
                        </Text>
                    ))}
                </View>
                <View>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#1c1917', marginBottom: 4 }}>
                        {t('health.control_chemical', { defaultValue: 'Chemical' })}
                    </Text>
                    {control.chemical.map((item, idx) => (
                        <Text key={`chemical-${idx}`} style={{ fontSize: 13, color: '#4b5563', lineHeight: 20 }}>
                            - {item}
                        </Text>
                    ))}
                </View>
            </View>
        </View>
    );
}

function PestDiseaseDetailModal({
    item,
    onClose,
}: {
    item: any;
    onClose: () => void;
}) {
    const { t } = useTranslation();

    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
                <View style={{
                    backgroundColor: '#fff',
                    borderTopLeftRadius: 28,
                    borderTopRightRadius: 28,
                    paddingHorizontal: 20,
                    paddingTop: 20,
                    paddingBottom: 40,
                    maxHeight: '85%',
                }}>
                    <View style={{ width: 40, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <Text style={{ fontSize: 22, fontWeight: '800', color: '#1c1917', flex: 1 }}>{item.name}</Text>
                        <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
                            <X size={20} stroke="#6b7280" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        <Section title={t('health.section_identification', { defaultValue: 'Identification' })} items={item.identification} />
                        <Section title={t('health.section_damage', { defaultValue: 'Damage' })} items={item.damage} />
                        <Section title={t('health.section_prevention', { defaultValue: 'Prevention' })} items={item.prevention} />
                        <ControlSection control={item.control} />
                        <Section title={t('health.section_plants', { defaultValue: 'Plants affected' })} items={item.plantsAffected} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

export default function HealthScreen() {
    const { t } = useTranslation();
    const params = useLocalSearchParams<{ q?: string; tab?: TabKey }>();
    const [activeTab, setActiveTab] = useState<TabKey>(() => resolveTab(params.tab));
    const [search, setSearch] = useState(resolveParam(params.q) ?? '');
    const [selected, setSelected] = useState<any>(null);

    const type: PestDiseaseType | undefined =
        activeTab === 'pests'
            ? 'pest'
            : activeTab === 'diseases'
                ? 'disease'
                : undefined;

    const { items, isLoading } = usePestsDiseases(type);

    useEffect(() => {
        setActiveTab(resolveTab(params.tab));
    }, [params.tab]);

    useEffect(() => {
        if (params.q === undefined) return;
        const nextQuery = resolveParam(params.q);
        if (typeof nextQuery === 'string') {
            setSearch(nextQuery);
        }
    }, [params.q]);

    const filtered = useMemo(() => {
        if (!search.trim()) return items;
        return items.filter((item: any) =>
            matchesSearch(search, [
                item.name,
                item.key,
                item.type,
                Array.isArray(item.plantsAffected) ? item.plantsAffected.join(' ') : '',
            ])
        );
    }, [items, search]);

    const [lux, setLux] = useState<number | null>(null);
    const [sensorAvailable, setSensorAvailable] = useState<boolean | null>(null);

    useEffect(() => {
        if (activeTab !== 'light') return;
        let subscription: { remove: () => void } | null = null;
        let cancelled = false;

        LightSensor.isAvailableAsync()
            .then((available) => {
                if (cancelled) return;
                setSensorAvailable(available);
                if (!available) return;
                LightSensor.setUpdateInterval(750);
                subscription = LightSensor.addListener((data) => {
                    const value = typeof data.illuminance === 'number' ? Math.round(data.illuminance) : null;
                    setLux(value);
                });
            })
            .catch(() => {
                if (!cancelled) setSensorAvailable(false);
            });

        return () => {
            cancelled = true;
            if (subscription) subscription.remove();
        };
    }, [activeTab]);

    const currentRange = getLuxRange(lux);

    return (
        <View style={{ flex: 1, backgroundColor: '#faf8f4' }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Bug size={24} stroke="#166534" />
                    <Text style={{ fontSize: 30, fontWeight: '800', color: '#1c1917', letterSpacing: -0.5 }}>
                        {t('health.title', { defaultValue: 'Plant Health' })}
                    </Text>
                </View>
                <Text style={{ fontSize: 13, color: '#78716c' }}>
                    {t('health.subtitle', { defaultValue: 'Pest, disease, and light checks in one place.' })}
                </Text>

                <View style={{ flexDirection: 'row', backgroundColor: '#f5f0e8', borderRadius: 16, padding: 4 }}>
                    <TouchableOpacity
                        onPress={() => setActiveTab('pests')}
                        testID="e2e-health-tab-pests"
                        style={{
                            flex: 1,
                            backgroundColor: activeTab === 'pests' ? '#0f172a' : 'transparent',
                            borderRadius: 12,
                            paddingVertical: 8,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                        }}
                    >
                        <Bug size={15} stroke={activeTab === 'pests' ? '#fff' : '#64748b'} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: activeTab === 'pests' ? '#fff' : '#475569' }}>
                            {t('health.tab_pests', { defaultValue: 'Pests' })}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setActiveTab('diseases')}
                        testID="e2e-health-tab-diseases"
                        style={{
                            flex: 1,
                            backgroundColor: activeTab === 'diseases' ? '#0f172a' : 'transparent',
                            borderRadius: 12,
                            paddingVertical: 8,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                        }}
                    >
                        <ShieldAlert size={15} stroke={activeTab === 'diseases' ? '#fff' : '#64748b'} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: activeTab === 'diseases' ? '#fff' : '#475569' }}>
                            {t('health.tab_diseases', { defaultValue: 'Diseases' })}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setActiveTab('light')}
                        testID="e2e-health-tab-light"
                        style={{
                            flex: 1,
                            backgroundColor: activeTab === 'light' ? '#0f172a' : 'transparent',
                            borderRadius: 12,
                            paddingVertical: 8,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                        }}
                    >
                        <Sun size={15} stroke={activeTab === 'light' ? '#fff' : '#64748b'} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: activeTab === 'light' ? '#fff' : '#475569' }}>
                            {t('health.tab_light', { defaultValue: 'Light Sensor' })}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {activeTab === 'light' ? (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }}>
                    <View
                        testID="e2e-health-light-card"
                        style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#ede7dc', gap: 8 }}
                    >
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#1c1917' }}>
                            {t('health.light_title', { defaultValue: 'Current light level' })}
                        </Text>
                        {sensorAvailable === null ? (
                            <View style={{ paddingVertical: 8 }}>
                                <ActivityIndicator size="small" color="#22c55e" />
                            </View>
                        ) : sensorAvailable === false ? (
                            <Text style={{ fontSize: 13, color: '#b45309' }}>
                                {t('health.light_unavailable', { defaultValue: 'Light sensor not available on this device.' })}
                            </Text>
                        ) : (
                            <View style={{ gap: 6 }}>
                                <Text style={{ fontSize: 28, fontWeight: '800', color: '#166534' }}>
                                    {lux === null ? '--' : `${lux} lux`}
                                </Text>
                                <Text style={{ fontSize: 13, color: '#78716c' }}>
                                    {currentRange
                                        ? `${currentRange.label} (${currentRange.min}-${currentRange.max} lux)`
                                        : t('health.light_waiting', { defaultValue: 'Waiting for sensor data...' })}
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={{ gap: 10 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#1c1917' }}>
                            {t('health.light_ranges', { defaultValue: 'Lux ranges and examples' })}
                        </Text>
                        {LUX_RANGES.map((range) => (
                            <View
                                key={`${range.label}-${range.min}`}
                                style={{ backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#e7e0d6' }}
                            >
                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1c1917' }}>{range.label}</Text>
                                <Text style={{ fontSize: 12, color: '#78716c' }}>{range.min}-{range.max} lux</Text>
                                <Text style={{ fontSize: 12, color: '#a8a29e' }}>{range.example}</Text>
                            </View>
                        ))}
                    </View>
                </ScrollView>
            ) : (
                <>
                    <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 12, gap: 8, borderWidth: 1, borderColor: '#e7e0d6' }}>
                            <Search size={16} stroke="#a8a29e" />
                            <TextInput
                                style={{ flex: 1, paddingVertical: 12, fontSize: 15, color: '#1c1917' }}
                                placeholder={t('health.search_placeholder', { defaultValue: 'Search pests and diseases...' })}
                                placeholderTextColor="#a8a29e"
                                value={search}
                                onChangeText={setSearch}
                            />
                            {!!search && (
                                <TouchableOpacity onPress={() => setSearch('')}>
                                    <X size={16} stroke="#a8a29e" />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {isLoading ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <ActivityIndicator size="large" color="#166534" />
                        </View>
                    ) : filtered.length === 0 ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                            <Bug size={48} stroke="#c4bdb3" />
                            <Text style={{ fontSize: 16, fontWeight: '600', color: '#a8a29e' }}>
                                {t('health.no_results', { defaultValue: 'No matches found' })}
                            </Text>
                        </View>
                    ) : (
                        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}>
                            {filtered.map((item: any) => (
                                <PestDiseaseCard key={item._id} item={item} onPress={() => setSelected(item)} />
                            ))}
                        </ScrollView>
                    )}

                    {selected && (
                        <PestDiseaseDetailModal
                            item={selected}
                            onClose={() => setSelected(null)}
                        />
                    )}
                </>
            )}
        </View>
    );
}
