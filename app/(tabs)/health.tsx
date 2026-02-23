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
import { useTheme } from '../../lib/theme';

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
    const theme = useTheme();
    const chips = item.plantsAffected?.slice(0, 4) ?? [];
    const extra = (item.plantsAffected?.length ?? 0) - chips.length;
    const typeLabel = item.type === 'disease' ? 'Disease' : 'Pest';
    const typeColor = item.type === 'disease' ? theme.primary : theme.danger;
    const typeBg = item.type === 'disease' ? theme.accent : theme.dangerBg;

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.85}
            style={{
                backgroundColor: theme.card,
                borderRadius: 18,
                padding: 16,
                borderWidth: 1,
                borderColor: theme.border,
                shadowColor: '#1a1a18',
                shadowOpacity: 0.06,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
                gap: 10,
            }}
        >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, flex: 1, letterSpacing: -0.3 }}>{item.name}</Text>
                <View style={{ backgroundColor: typeBg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 }}>
                    <Text style={{ color: typeColor, fontSize: 11, fontWeight: '700' }}>{typeLabel}</Text>
                </View>
            </View>
            <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                {t('health.section_plants', { defaultValue: 'Plants affected' })}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {chips.map((plant: string) => (
                    <View key={plant} style={{ backgroundColor: theme.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 11, color: theme.textSecondary, fontWeight: '600' }}>{plant}</Text>
                    </View>
                ))}
                {extra > 0 && (
                    <View style={{ backgroundColor: theme.background, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: theme.border }}>
                        <Text style={{ fontSize: 11, color: theme.textMuted, fontWeight: '600' }}>+{extra} more</Text>
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
}

function Section({ title, items }: { title: string; items?: string[] }) {
    const theme = useTheme();
    if (!items || items.length === 0) return null;
    return (
        <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textSecondary, marginBottom: 6 }}>{title}</Text>
            <View style={{ gap: 6 }}>
                {items.map((item, idx) => (
                    <Text key={`${title}-${idx}`} style={{ fontSize: 13, color: theme.text, lineHeight: 20 }}>
                        - {item}
                    </Text>
                ))}
            </View>
        </View>
    );
}

function ControlSection({ control }: { control: { physical: string[]; organic: string[]; chemical: string[] } }) {
    const { t } = useTranslation();
    const theme = useTheme();

    return (
        <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textSecondary, marginBottom: 6 }}>
                {t('health.section_control', { defaultValue: 'Control' })}
            </Text>
            <View style={{ gap: 10 }}>
                <View>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 4 }}>
                        {t('health.control_physical', { defaultValue: 'Physical' })}
                    </Text>
                    {control.physical.map((item, idx) => (
                        <Text key={`physical-${idx}`} style={{ fontSize: 13, color: theme.text, lineHeight: 20 }}>
                            - {item}
                        </Text>
                    ))}
                </View>
                <View>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 4 }}>
                        {t('health.control_organic', { defaultValue: 'Organic' })}
                    </Text>
                    {control.organic.map((item, idx) => (
                        <Text key={`organic-${idx}`} style={{ fontSize: 13, color: theme.text, lineHeight: 20 }}>
                            - {item}
                        </Text>
                    ))}
                </View>
                <View>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 4 }}>
                        {t('health.control_chemical', { defaultValue: 'Chemical' })}
                    </Text>
                    {control.chemical.map((item, idx) => (
                        <Text key={`chemical-${idx}`} style={{ fontSize: 13, color: theme.text, lineHeight: 20 }}>
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
    const theme = useTheme();

    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
                <View style={{
                    backgroundColor: theme.card,
                    borderTopLeftRadius: 28,
                    borderTopRightRadius: 28,
                    paddingHorizontal: 20,
                    paddingTop: 20,
                    paddingBottom: 40,
                    maxHeight: '85%',
                }}>
                    <View style={{ width: 40, height: 4, backgroundColor: theme.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text, flex: 1 }}>{item.name}</Text>
                        <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
                            <X size={20} color={theme.textSecondary} />
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
    const theme = useTheme();
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
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16, gap: 12 }}>
                <View style={{ gap: 2 }}>
                    <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>
                        {t('health.title', { defaultValue: 'Plant Health' })}
                    </Text>
                    <Text style={{ fontSize: 13, color: theme.textSecondary }}>
                        {t('health.subtitle', { defaultValue: 'Pest, disease, and light checks in one place.' })}
                    </Text>
                </View>

                <View style={{ flexDirection: 'row', backgroundColor: theme.accent, borderRadius: 16, padding: 4, marginTop: 4 }}>
                    <TouchableOpacity
                        onPress={() => setActiveTab('pests')}
                        testID="e2e-health-tab-pests"
                        style={{
                            flex: 1,
                            backgroundColor: activeTab === 'pests' ? theme.primary : 'transparent',
                            borderRadius: 12,
                            paddingVertical: 10,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                        }}
                    >
                        <Bug size={16} color={activeTab === 'pests' ? '#fff' : theme.textSecondary} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: activeTab === 'pests' ? '#fff' : theme.textSecondary }}>
                            {t('health.tab_pests', { defaultValue: 'Pests' })}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setActiveTab('diseases')}
                        testID="e2e-health-tab-diseases"
                        style={{
                            flex: 1,
                            backgroundColor: activeTab === 'diseases' ? theme.primary : 'transparent',
                            borderRadius: 12,
                            paddingVertical: 10,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                        }}
                    >
                        <ShieldAlert size={16} color={activeTab === 'diseases' ? '#fff' : theme.textSecondary} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: activeTab === 'diseases' ? '#fff' : theme.textSecondary }}>
                            {t('health.tab_diseases', { defaultValue: 'Diseases' })}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setActiveTab('light')}
                        testID="e2e-health-tab-light"
                        style={{
                            flex: 1,
                            backgroundColor: activeTab === 'light' ? theme.primary : 'transparent',
                            borderRadius: 12,
                            paddingVertical: 10,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                        }}
                    >
                        <Sun size={16} color={activeTab === 'light' ? '#fff' : theme.textSecondary} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: activeTab === 'light' ? '#fff' : theme.textSecondary }}>
                            {t('health.tab_light', { defaultValue: 'Light Sensor' })}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {activeTab === 'light' ? (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }}>
                    <View
                        testID="e2e-health-light-card"
                        style={{
                            backgroundColor: theme.card,
                            borderRadius: 20,
                            padding: 20,
                            borderWidth: 1,
                            borderColor: theme.border,
                            gap: 12,
                            shadowColor: '#1a1a18',
                            shadowOpacity: 0.04,
                            shadowRadius: 10,
                            shadowOffset: { width: 0, height: 2 },
                        }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                                <Sun size={20} color={theme.success} />
                            </View>
                            <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text }}>
                                {t('health.light_title', { defaultValue: 'Current light level' })}
                            </Text>
                        </View>

                        {sensorAvailable === null ? (
                            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                                <ActivityIndicator size="small" color={theme.success} />
                            </View>
                        ) : sensorAvailable === false ? (
                            <View style={{ backgroundColor: theme.warningBg, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.warning }}>
                                <Text style={{ fontSize: 13, color: theme.warning, lineHeight: 20 }}>
                                    {t('health.light_unavailable', { defaultValue: 'Light sensor not available on this device.' })}
                                </Text>
                            </View>
                        ) : (
                            <View style={{ gap: 6, backgroundColor: theme.background, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: theme.border }}>
                                <Text style={{ fontSize: 32, fontWeight: '800', color: theme.primary }}>
                                    {lux === null ? '--' : `${lux} lux`}
                                </Text>
                                <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textSecondary }}>
                                    {currentRange
                                        ? `${currentRange.label} (${currentRange.min}-${currentRange.max} lux)`
                                        : t('health.light_waiting', { defaultValue: 'Waiting for sensor data...' })}
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={{ gap: 12 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 1.2, textTransform: 'uppercase', paddingLeft: 4 }}>
                            {t('health.light_ranges', { defaultValue: 'Lux ranges and examples' })}
                        </Text>
                        <View style={{ gap: 10 }}>
                            {LUX_RANGES.map((range) => (
                                <View
                                    key={`${range.label}-${range.min}`}
                                    style={{
                                        backgroundColor: theme.card,
                                        borderRadius: 16,
                                        padding: 14,
                                        borderWidth: 1,
                                        borderColor: theme.border,
                                        gap: 2,
                                        shadowColor: '#1a1a18',
                                        shadowOpacity: 0.03,
                                        shadowRadius: 8,
                                        shadowOffset: { width: 0, height: 1 },
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{range.label}</Text>
                                        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.success, backgroundColor: theme.successBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>{range.min}-{range.max} lux</Text>
                                    </View>
                                    <Text style={{ fontSize: 13, color: theme.textSecondary }}>{range.example}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                </ScrollView>
            ) : (
                <>
                    <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: theme.card,
                            borderRadius: 16,
                            paddingHorizontal: 14,
                            gap: 10,
                            borderWidth: 1,
                            borderColor: theme.border,
                            shadowColor: '#1a1a18',
                            shadowOpacity: 0.04,
                            shadowRadius: 8,
                            shadowOffset: { width: 0, height: 1 },
                        }}>
                            <Search size={18} color={theme.textMuted} />
                            <TextInput
                                style={{ flex: 1, paddingVertical: 12, fontSize: 15, color: theme.text }}
                                placeholder={t('health.search_placeholder', { defaultValue: 'Search pests and diseases...' })}
                                placeholderTextColor={theme.textMuted}
                                value={search}
                                onChangeText={setSearch}
                            />
                            {!!search && (
                                <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                    <X size={18} color={theme.textMuted} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {isLoading ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <ActivityIndicator size="small" color={theme.success} />
                        </View>
                    ) : filtered.length === 0 ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, opacity: 0.6 }}>
                            <Bug size={48} color={theme.textMuted} />
                            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.textMuted }}>
                                {t('health.no_results', { defaultValue: 'No matches found' })}
                            </Text>
                        </View>
                    ) : (
                        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }}>
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
