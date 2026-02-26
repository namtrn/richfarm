import { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    LayoutAnimation,
    Platform,
    UIManager,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    ArrowLeft,
    Heart,
    ChevronDown,
    Droplets,
    Sun,
    Clock,
    Sprout,
    Leaf,
    Thermometer,
    AlertTriangle,
    FlaskConical,
    MapPin,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { PlantImage } from '../../../components/ui/PlantImage';
import { useFavorites } from '../../../hooks/useFavorites';
import { usePlants } from '../../../hooks/usePlants';
import { useUnitSystem } from '../../../hooks/useUnitSystem';
import {
    formatLengthCm,
    formatSeedsPerArea,
    formatPlantsPerArea,
    formatWaterPerArea,
    formatYieldPerArea,
} from '../../../lib/units';
import {
    loadCachedCareContent,
    saveCareContent,
    parseCareContent,
    PlantCareContent,
    CareSectionContent,
} from '../../../lib/plantCareCache';

if (Platform.OS === 'android') {
    UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// ─── Lorem ipsum care content (placeholder until DB is populated) ─────────────
const LOREM_CARE: PlantCareContent = {
    watering: {
        intro:
            'Consistent moisture is key to healthy growth. Allow the top inch of soil to dry slightly between sessions to prevent root rot.',
        items: [
            'General: Water deeply 2–3 times per week during the growing season, reducing to once a week in cooler months.',
            'Frequency: During hot summers, daily watering may be needed. Check soil moisture before each session.',
            'Seasonal: Reduce watering significantly in autumn and winter when growth slows down.',
        ],
    },
    fertilizing: {
        intro:
            'Regular fertilization promotes healthy growth and abundant yield. Choose a balanced formula suited to the growth stage.',
        items: [
            'Type: Use a balanced, water-soluble fertilizer with an N-P-K ratio of 10-10-10 or 14-14-14.',
            'Frequency: Feed every 4–6 weeks during the active growing season. Cease in winter.',
            'Application: Always follow manufacturer instructions. Over-fertilizing can cause weak, leafy growth with fewer flowers or fruits.',
        ],
    },
    location: {
        intro:
            'Selecting the right location is critical for thriving plants. Assess sunlight, wind exposure, and proximity to other plants.',
        items: [
            'Sunlight: Thrives in full sunlight and requires at least 6–8 hours of direct sun per day for best results.',
            'Wind: Sheltered spots are preferred. Strong wind can damage stems and dry out soil rapidly.',
            'Companion planting: Grows well near nitrogen-fixing plants; avoid planting near fennel or brassicas.',
        ],
    },
    soil: {
        intro:
            'Well-draining, fertile soil with the right pH ensures optimal nutrient availability and root health.',
        items: [
            'Type: Prefers well-draining soil with a slightly acidic to neutral pH (6.0–7.0).',
            'Amendments: Amend heavy clay soils with perlite or coarse sand to improve drainage.',
            'Preparation: Incorporate generous amounts of compost before planting to boost organic matter.',
        ],
    },
    nutrition: {
        intro:
            'Adequate nutrition throughout the growing cycle ensures vigorous growth, good flowering, and bountiful harvest.',
        items: [
            'Seedling stage: Apply a diluted liquid fertilizer at half strength every two weeks.',
            'Vegetative stage: Switch to a higher-nitrogen formula to support leaf and stem development.',
            'Fruiting/flowering: Use a low-nitrogen, high-phosphorus and potassium feed to support blooms and fruit set.',
        ],
    },
    propagation: {
        intro: 'This plant can be propagated through seeds, cuttings, or division, depending on the time of year.',
        items: [
            'Seeds: Sow indoors 6–8 weeks before the last expected frost. Keep soil moist and provide plenty of light.',
            'Cuttings: Take 3–4 inch cuttings from healthy plants in late spring or early summer. Dip in rooting hormone and plant in a mix of perlite and peat.',
            'Division: Divide mature plants in early spring or late fall. Gently separate root clumps and replant immediately.',
        ],
    },
    temperature: {
        intro:
            'This plant grows best within a moderate temperature range and may need protection in extreme weather.',
        items: [
            'Optimal: Grows best in temperatures between 15 °C and 25 °C (59 °F–77 °F).',
            'Frost tolerance: It can tolerate light frosts, but prolonged exposure to freezing temperatures can cause severe damage.',
            'Heat: Provide afternoon shade when temperatures consistently exceed 35 °C (95 °F) to prevent heat stress.',
        ],
    },
    toxicity: {
        intro:
            'This plant is generally considered non-toxic to humans and pets, but individual sensitivities can vary.',
        items: [
            'Humans: No significant toxic compounds identified. Contact with sap may cause mild skin irritation in sensitive individuals.',
            'Pets: As with all plants, keep this out of reach of children and animals that may chew on leaves or stems.',
            'Warning: If symptoms such as vomiting, lethargy, or skin irritation occur after contact, seek medical or veterinary advice.',
        ],
    },
};

// ─── Section config ───────────────────────────────────────────────────────────
interface SectionConfig {
    key: keyof PlantCareContent;
    icon: React.ReactNode;
    color: string;
    bg: string;
    i18nTitle: string;
    edibleOnly?: boolean;
}

const GREEN = '#1a4731';
const AMBER = '#d97706';
const BLUE = '#2563eb';
const ROSE = '#e11d48';
const TEAL = '#0d9488';
const PURPLE = '#7c3aed';
const ORANGE = '#ea580c';
const GRAY = '#64748b';

// ─── Care Section (expandable) ────────────────────────────────────────────────
function CareSection({
    icon,
    title,
    config,
    content,
}: {
    icon: React.ReactNode;
    title: string;
    config: { color: string; bg: string };
    content: CareSectionContent;
}) {
    const [open, setOpen] = useState(false);

    const toggle = useCallback(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setOpen((v) => !v);
    }, []);

    return (
        <View
            style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                borderWidth: 1,
                borderColor: '#e7e0d6',
                overflow: 'hidden',
                marginBottom: 10,
            }}
        >
            <TouchableOpacity
                onPress={toggle}
                activeOpacity={0.7}
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 16,
                    gap: 12,
                }}
            >
                <View
                    style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: config.bg,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {icon}
                </View>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: '#1c1917', letterSpacing: -0.2 }}>
                    {title}
                </Text>
                <ChevronDown
                    size={18}
                    stroke="#a8a29e"
                    style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
                />
            </TouchableOpacity>

            {open && (
                <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
                    {!!content.intro && (
                        <Text style={{ fontSize: 13, color: '#5c5247', lineHeight: 20 }}>{content.intro}</Text>
                    )}
                    {content.items?.map((item, idx) => {
                        const colonIdx = item.indexOf(':');
                        const label = colonIdx > -1 ? item.slice(0, colonIdx) : null;
                        const body = colonIdx > -1 ? item.slice(colonIdx + 1).trim() : item;
                        return (
                            <View key={idx} style={{ flexDirection: 'row', gap: 8 }}>
                                <View
                                    style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: 3,
                                        backgroundColor: config.color,
                                        marginTop: 7,
                                        flexShrink: 0,
                                    }}
                                />
                                <Text style={{ flex: 1, fontSize: 13, color: '#4b5563', lineHeight: 20 }}>
                                    {label ? (
                                        <>
                                            <Text style={{ fontWeight: '700', color: '#1c1917' }}>{label}: </Text>
                                            {body}
                                        </>
                                    ) : (
                                        body
                                    )}
                                </Text>
                            </View>
                        );
                    })}
                </View>
            )}
        </View>
    );
}

// ─── Stat row ─────────────────────────────────────────────────────────────────
function StatRow({ label, value }: { label: string; value: string }) {
    return (
        <View
            style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: 12,
                borderTopWidth: 1,
                borderTopColor: '#f1ece4',
            }}
        >
            <Text style={{ fontSize: 14, color: '#78716c' }}>{label}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1c1917' }}>{value}</Text>
        </View>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function LibraryPlantDetailScreen() {
    const { t, i18n } = useTranslation();
    const router = useRouter();
    const { plantId, mode, from, fromPlantId, bedId, x, y } = useLocalSearchParams<{
        plantId: string;
        mode?: string;
        from?: string;
        fromPlantId?: string;
        bedId?: string;
        x?: string;
        y?: string;
    }>();

    const resolvedId = Array.isArray(plantId) ? plantId[0] : plantId;
    const modeParam = Array.isArray(mode) ? mode[0] : mode;
    const fromParam = Array.isArray(from) ? from[0] : from;
    const bedIdParam = Array.isArray(bedId) ? bedId[0] : bedId;
    const xParam = Array.isArray(x) ? x[0] : x;
    const yParam = Array.isArray(y) ? y[0] : y;
    const locale = i18n.language?.split('-')[0] ?? 'en';

    const unitSystem = useUnitSystem();

    const { favorites, toggleFavorite } = useFavorites();
    const { addPlant, updatePlant } = usePlants();

    const masterPlant = useQuery(
        api.plantImages.getPlantById,
        resolvedId ? { plantId: resolvedId as any, locale } : 'skip',
    );

    const isFavorite = favorites.some((fav: any) => String(fav.plantMasterId) === String(resolvedId));

    // ── Care content: offline-first cache ──────────────────────────────────────
    const [care, setCare] = useState<PlantCareContent | null>(null);

    useEffect(() => {
        if (!resolvedId) return;

        // 1) Load from cache immediately
        loadCachedCareContent(resolvedId, locale).then((cached) => {
            if (cached) setCare(cached.care);
        });
    }, [resolvedId, locale]);

    useEffect(() => {
        if (!masterPlant || !resolvedId) return;
        const serverVersion = masterPlant.contentVersion ?? 0;

        loadCachedCareContent(resolvedId, locale).then((cached) => {
            const localVersion = cached?.contentVersion ?? -1;

            if (serverVersion > localVersion) {
                // Server is newer → parse and cache
                const parsed = parseCareContent(masterPlant.careContent);
                const content = parsed ?? LOREM_CARE; // fall back to lorem ipsum
                setCare(content);
                saveCareContent(resolvedId, locale, serverVersion, content).catch(() => undefined);
            } else if (!cached) {
                // No cache at all → use lorem ipsum
                setCare(LOREM_CARE);
            }
        });
    }, [masterPlant, resolvedId, locale]);

    const isEdible =
        masterPlant?.purposes?.some((p: string) => ['edible', 'cooking', 'vegetable', 'herb', 'fruit', 'food'].includes(p)) ?? true;

    const sections: SectionConfig[] = [
        { key: 'watering', icon: <Droplets size={20} stroke={BLUE} />, color: BLUE, bg: '#dbeafe', i18nTitle: t('library.care_watering', { defaultValue: 'Watering Care' }) },
        { key: 'fertilizing', icon: <FlaskConical size={20} stroke={TEAL} />, color: TEAL, bg: '#ccfbf1', i18nTitle: t('library.care_fertilizing', { defaultValue: 'Fertilizing Care' }) },
        { key: 'location', icon: <MapPin size={20} stroke={AMBER} />, color: AMBER, bg: '#fef3c7', i18nTitle: t('library.care_location', { defaultValue: 'Suitable Location' }) },
        { key: 'soil', icon: <Leaf size={20} stroke={GREEN} />, color: GREEN, bg: '#dcfce7', i18nTitle: t('library.care_soil', { defaultValue: 'Soil Preparation' }) },
        { key: 'nutrition', icon: <Sprout size={20} stroke={ORANGE} />, color: ORANGE, bg: '#ffedd5', i18nTitle: t('library.care_nutrition', { defaultValue: 'Nutrition' }), edibleOnly: true },
        { key: 'propagation', icon: <Leaf size={20} stroke={PURPLE} />, color: PURPLE, bg: '#ede9fe', i18nTitle: t('library.care_propagation', { defaultValue: 'Propagation' }) },
        { key: 'temperature', icon: <Thermometer size={20} stroke={ROSE} />, color: ROSE, bg: '#ffe4e6', i18nTitle: t('library.care_temperature', { defaultValue: 'Temperature' }) },
        { key: 'toxicity', icon: <AlertTriangle size={20} stroke={GRAY} />, color: GRAY, bg: '#f1f5f9', i18nTitle: t('library.care_toxicity', { defaultValue: 'Plant Toxicity' }) },
    ];

    const showAdd = modeParam === 'select' || modeParam === 'attach';
    const addLabel = fromParam === 'bed' ? t('bed.add_plant', { defaultValue: 'Add to garden' }) : undefined;

    const handleAdd = async () => {
        if (!masterPlant) return;
        const localName = masterPlant.displayName ?? masterPlant.scientificName;
        const xValue = xParam !== undefined ? Number(xParam) : undefined;
        const yValue = yParam !== undefined ? Number(yParam) : undefined;
        const positionInBed =
            typeof xValue === 'number' && Number.isFinite(xValue) &&
                typeof yValue === 'number' && Number.isFinite(yValue)
                ? { x: xValue, y: yValue, width: 1, height: 1 }
                : undefined;

        if (modeParam === 'attach' && fromPlantId) {
            await updatePlant(fromPlantId as any, { plantMasterId: resolvedId as any, nickname: localName });
        } else if (fromParam === 'bed' && bedIdParam) {
            await addPlant({ plantMasterId: resolvedId as any, nickname: localName, bedId: bedIdParam as any, positionInBed });
        } else {
            await addPlant({ plantMasterId: resolvedId as any, nickname: localName });
        }

        if (router.canGoBack()) {
            router.back();
        } else if (fromParam === 'planning') {
            router.replace('/(tabs)/planning');
        } else if (fromParam === 'bed' && bedIdParam) {
            router.replace(`/(tabs)/bed/${bedIdParam}`);
        }
    };

    const lightMeta: Record<string, { label: string; color: string; bg: string }> = {
        full_sun: { label: t('library.light_full_sun', { defaultValue: 'Full Sun' }), color: '#d97706', bg: '#fef3c7' },
        partial_shade: { label: t('library.light_partial_shade', { defaultValue: 'Partial Shade' }), color: '#16a34a', bg: '#dcfce7' },
        shade: { label: t('library.light_shade', { defaultValue: 'Shade' }), color: '#64748b', bg: '#f1f5f9' },
    };
    const lightInfo = masterPlant?.lightRequirements ? lightMeta[masterPlant.lightRequirements] : undefined;

    return (
        <View style={{ flex: 1, backgroundColor: '#faf8f4' }}>
            {/* ── Header ── */}
            <View
                style={{
                    paddingHorizontal: 16,
                    paddingTop: 56,
                    paddingBottom: 12,
                    backgroundColor: '#fff',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: '#e7e0d6',
                }}
            >
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: '#faf8f4',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: '#e7e0d6',
                    }}
                >
                    <ArrowLeft size={20} stroke="#1c1917" />
                </TouchableOpacity>

                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#1c1917', letterSpacing: -0.4 }} numberOfLines={1}>
                        {masterPlant?.displayName ?? '…'}
                    </Text>
                    {!!masterPlant?.scientificName && (
                        <Text style={{ fontSize: 12, color: '#a8a29e', fontStyle: 'italic' }} numberOfLines={1}>
                            {masterPlant.scientificName}
                        </Text>
                    )}
                </View>

                <TouchableOpacity
                    onPress={() => {
                        if (!resolvedId) return;
                        void toggleFavorite(resolvedId as any).catch(() => undefined);
                    }}
                    style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: '#faf8f4',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: '#e7e0d6',
                    }}
                >
                    <Heart size={20} stroke={isFavorite ? '#ef4444' : '#94a3b8'} fill={isFavorite ? '#ef4444' : 'none'} />
                </TouchableOpacity>
            </View>

            {/* ── Content ── */}
            {!masterPlant ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color="#1a4731" />
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={{ paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Hero image */}
                    <View style={{ alignItems: 'center', paddingVertical: 24, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1ece4' }}>
                        <PlantImage uri={masterPlant.imageUrl} size={160} borderRadius={24} />
                    </View>

                    <View style={{ padding: 16, gap: 0 }}>
                        {/* Quick stat chips */}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                            {lightInfo && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: lightInfo.bg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}>
                                    <Sun size={14} stroke={lightInfo.color} />
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: lightInfo.color }}>{lightInfo.label}</Text>
                                </View>
                            )}
                            {!!masterPlant.wateringFrequencyDays && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#dbeafe', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}>
                                    <Droplets size={14} stroke={BLUE} />
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: BLUE }}>
                                        {t('library.watering_every', { days: masterPlant.wateringFrequencyDays, defaultValue: `Every ${masterPlant.wateringFrequencyDays}d` })}
                                    </Text>
                                </View>
                            )}
                            {!!masterPlant.typicalDaysToHarvest && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#dcfce7', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}>
                                    <Clock size={14} stroke={GREEN} />
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: GREEN }}>
                                        {masterPlant.typicalDaysToHarvest}{t('library.days_suffix', { defaultValue: 'd' })}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Description */}
                        {!!masterPlant.description && (
                            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e7e0d6', marginBottom: 16 }}>
                                <Text style={{ fontSize: 14, color: '#5c5247', lineHeight: 22 }}>{masterPlant.description}</Text>
                            </View>
                        )}

                        {/* Add to planning button */}
                        {showAdd && (
                            <TouchableOpacity
                                onPress={handleAdd}
                                style={{ backgroundColor: '#1a4731', borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginBottom: 16 }}
                            >
                                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.2 }}>
                                    {addLabel ?? t('library.add_to_planning', { defaultValue: 'Add to Planning' })}
                                </Text>
                            </TouchableOpacity>
                        )}

                        {/* Care section header */}
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#a8a29e', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                            {t('library.section_care', { defaultValue: 'Care Guide' })}
                        </Text>

                        {/* Care sections */}
                        {care ? (
                            sections
                                .filter((s) => !s.edibleOnly || isEdible)
                                .map((s) => {
                                    const content = care[s.key];
                                    if (!content) return null;
                                    return (
                                        <CareSection
                                            key={s.key}
                                            icon={s.icon}
                                            title={s.i18nTitle}
                                            config={{ color: s.color, bg: s.bg }}
                                            content={content}
                                        />
                                    );
                                })
                        ) : (
                            <ActivityIndicator size="small" color="#a8a29e" style={{ marginVertical: 20 }} />
                        )}

                        {/* Detailed stats */}
                        {(masterPlant.germinationDays ?? masterPlant.spacingCm ?? masterPlant.maxPlantsPerM2 ?? masterPlant.seedRatePerM2 ?? masterPlant.waterLitersPerM2 ?? masterPlant.yieldKgPerM2 ?? masterPlant.source) && (
                            <View style={{ backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#e7e0d6', paddingHorizontal: 16, marginTop: 6, marginBottom: 10 }}>
                                {!!masterPlant.germinationDays && <StatRow label={t('library.detail_germination')} value={`${masterPlant.germinationDays} days`} />}
                                {!!masterPlant.spacingCm && <StatRow label={t('library.detail_spacing')} value={formatLengthCm(masterPlant.spacingCm, unitSystem)} />}
                                {!!masterPlant.maxPlantsPerM2 && <StatRow label={t('library.detail_max_plants')} value={formatPlantsPerArea(masterPlant.maxPlantsPerM2, unitSystem)} />}
                                {!!masterPlant.seedRatePerM2 && <StatRow label={t('library.detail_seed_rate')} value={formatSeedsPerArea(masterPlant.seedRatePerM2, unitSystem)} />}
                                {!!masterPlant.waterLitersPerM2 && <StatRow label={t('library.detail_water_per_area')} value={formatWaterPerArea(masterPlant.waterLitersPerM2, unitSystem)} />}
                                {!!masterPlant.yieldKgPerM2 && <StatRow label={t('library.detail_yield_per_area')} value={formatYieldPerArea(masterPlant.yieldKgPerM2, unitSystem)} />}
                                {!!masterPlant.source && <StatRow label={t('library.detail_propagation')} value={masterPlant.source} />}
                            </View>
                        )}

                        {/* Purposes / uses */}
                        {masterPlant.purposes?.length > 0 && (
                            <View style={{ marginTop: 4 }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#a8a29e', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                                    {t('library.detail_uses', { defaultValue: 'Uses' })}
                                </Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                    {masterPlant.purposes.map((p: string) => (
                                        <View key={p} style={{ backgroundColor: '#f0f7f2', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 }}>
                                            <Text style={{ fontSize: 12, color: '#166534', fontWeight: '700', textTransform: 'capitalize' }}>
                                                {t(`purposes.${p}`, { defaultValue: p.replace(/_/g, ' ') })}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                    </View>
                </ScrollView>
            )}
        </View>
    );
}
