import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Image,
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
import { plantI18nSeed, plantsMasterSeed } from '../../../convex/data/plantsMasterSeed';
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
import { useTheme } from '../../../lib/theme';
import { useThemeContext } from '../../../lib/ThemeContext';

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

function normalizeScientificName(value: string) {
    return value
        .toLowerCase()
        .replaceAll('×', 'x')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildSeedMasterPlant(scientificName: string, locale: string) {
    const normalizedScientific = normalizeScientificName(scientificName);
    const normalizedLocale = (locale ?? 'en').split('-')[0].toLowerCase();

    const plant = plantsMasterSeed.find(
        (item) => normalizeScientificName(item.scientificName) === normalizedScientific
    );
    if (!plant) return null;

    const localeRow = plantI18nSeed.find(
        (row) =>
            row.locale === normalizedLocale &&
            normalizeScientificName(row.scientificName) === normalizedScientific
    );
    const fallbackRow = plantI18nSeed.find(
        (row) =>
            row.locale === 'en' &&
            normalizeScientificName(row.scientificName) === normalizedScientific
    );
    const localized = localeRow ?? fallbackRow;

    return {
        ...plant,
        _id: `seed:${plant.scientificName}`,
        displayName: localized?.commonName ?? plant.scientificName,
        description: localized?.description ?? undefined,
        contentVersion: 0,
        careContent: undefined,
    };
}

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
    const theme = useTheme();
    const [open, setOpen] = useState(false);

    const toggle = useCallback(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setOpen((v) => !v);
    }, []);

    return (
        <View
            style={{
                backgroundColor: theme.card,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: theme.border,
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
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: theme.text, letterSpacing: -0.2 }}>
                    {title}
                </Text>
                <ChevronDown
                    size={18}
                    stroke={theme.textMuted}
                    style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
                />
            </TouchableOpacity>

            {open && (
                <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
                    {!!content.intro && (
                        <Text style={{ fontSize: 13, color: theme.textAccent, lineHeight: 20 }}>{content.intro}</Text>
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
                                <Text style={{ flex: 1, fontSize: 13, color: theme.textSecondary, lineHeight: 20 }}>
                                    {label ? (
                                        <>
                                            <Text style={{ fontWeight: '700', color: theme.text }}>{label}: </Text>
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
    const theme = useTheme();
    return (
        <View
            style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: 12,
                borderTopWidth: 1,
                borderTopColor: theme.border,
            }}
        >
            <Text style={{ fontSize: 14, color: theme.textSecondary }}>{label}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{value}</Text>
        </View>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function LibraryPlantDetailScreen() {
    const { t, i18n } = useTranslation();
    const theme = useTheme();
    const { isDark } = useThemeContext();
    const router = useRouter();
    const { masterPlantId, mode, from, fromPlantId, bedId, x, y } = useLocalSearchParams<{
        masterPlantId: string;
        mode?: string;
        from?: string;
        fromPlantId?: string;
        bedId?: string;
        x?: string;
        y?: string;
    }>();

    const resolvedId = Array.isArray(masterPlantId) ? masterPlantId[0] : masterPlantId;
    const modeParam = Array.isArray(mode) ? mode[0] : mode;
    const fromParam = Array.isArray(from) ? from[0] : from;
    const bedIdParam = Array.isArray(bedId) ? bedId[0] : bedId;
    const xParam = Array.isArray(x) ? x[0] : x;
    const yParam = Array.isArray(y) ? y[0] : y;
    const locale = i18n.language?.split('-')[0] ?? 'en';
    const isSeedFallbackId = !!resolvedId && resolvedId.startsWith('seed:');
    const seedScientificName = useMemo(() => {
        if (!isSeedFallbackId || !resolvedId) return null;
        const raw = resolvedId.slice('seed:'.length);
        try {
            return decodeURIComponent(raw);
        } catch {
            return raw;
        }
    }, [isSeedFallbackId, resolvedId]);

    const unitSystem = useUnitSystem();

    const { favorites, toggleFavorite } = useFavorites();
    const { addPlant, updatePlant } = usePlants();

    const masterPlant = useQuery(
        api.plantImages.getPlantById,
        resolvedId && !isSeedFallbackId ? { plantId: resolvedId as any, locale } : 'skip',
    );
    const seedMasterPlant = useMemo(
        () => (seedScientificName ? buildSeedMasterPlant(seedScientificName, locale) : null),
        [seedScientificName, locale]
    );
    const currentPlant = masterPlant ?? seedMasterPlant;
    const canMutateMaster = Boolean(resolvedId && !isSeedFallbackId);

    const isFavorite = canMutateMaster
        ? favorites.some((fav: any) => String(fav.plantMasterId) === String(resolvedId))
        : false;

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
        if (!currentPlant || !resolvedId) return;
        const serverVersion = currentPlant.contentVersion ?? 0;

        loadCachedCareContent(resolvedId, locale).then((cached) => {
            const localVersion = cached?.contentVersion ?? -1;

            if (serverVersion > localVersion) {
                // Server is newer → parse and cache
                const parsed = parseCareContent(currentPlant.careContent);
                const content = parsed ?? LOREM_CARE; // fall back to lorem ipsum
                setCare(content);
                saveCareContent(resolvedId, locale, serverVersion, content).catch(() => undefined);
            } else if (!cached) {
                // No cache at all → use lorem ipsum
                setCare(LOREM_CARE);
            }
        });
    }, [currentPlant, resolvedId, locale]);

    const isEdible =
        currentPlant?.purposes?.some((p: string) => ['edible', 'cooking', 'vegetable', 'herb', 'fruit', 'food'].includes(p)) ?? true;

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

    const showAdd = (modeParam === 'select' || modeParam === 'attach') && canMutateMaster;
    const addLabel = fromParam === 'bed' ? t('bed.add_plant', { defaultValue: 'Add to garden' }) : undefined;

    const handleAdd = async () => {
        if (!currentPlant || !resolvedId || !canMutateMaster) return;
        const localName = currentPlant.displayName ?? currentPlant.scientificName;
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
            router.replace('/(tabs)/garden?tab=planning');
        } else if (fromParam === 'bed' && bedIdParam) {
            router.replace(`/(tabs)/bed/${bedIdParam}`);
        }
    };

    const lightMeta: Record<string, { label: string; color: string; bg: string }> = {
        full_sun: { label: t('library.light_full_sun', { defaultValue: 'Full Sun' }), color: '#d97706', bg: '#fef3c7' },
        partial_shade: { label: t('library.light_partial_shade', { defaultValue: 'Partial Shade' }), color: '#16a34a', bg: '#dcfce7' },
        shade: { label: t('library.light_shade', { defaultValue: 'Shade' }), color: '#64748b', bg: '#f1f5f9' },
    };
    const lightInfo = currentPlant?.lightRequirements ? lightMeta[currentPlant.lightRequirements] : undefined;
    const heroImageUri =
        currentPlant?.imageUrl ||
        'https://images.unsplash.com/photo-1463936575829-25148e1db1b8?auto=format&fit=crop&w=1600&q=80';

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            {/* ── Header ── */}
            <View
                style={{
                    paddingHorizontal: 16,
                    paddingTop: 8,
                    paddingBottom: 12,
                    backgroundColor: theme.background,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                }}
            >
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: theme.background,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: theme.border,
                    }}
                >
                    <ArrowLeft size={20} stroke={theme.text} />
                </TouchableOpacity>

                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text, letterSpacing: -0.4 }} numberOfLines={1}>
                        {currentPlant?.displayName ?? '…'}
                    </Text>
                    {!!currentPlant?.scientificName && (
                        <Text style={{ fontSize: 12, color: theme.textMuted, fontStyle: 'italic' }} numberOfLines={1}>
                            {currentPlant.scientificName}
                        </Text>
                    )}
                </View>

                {canMutateMaster && (
                    <TouchableOpacity
                        onPress={() => {
                            if (!resolvedId) return;
                            void toggleFavorite(resolvedId as any).catch(() => undefined);
                        }}
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 12,
                            backgroundColor: theme.background,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1,
                            borderColor: theme.border,
                        }}
                    >
                        <Heart size={20} stroke={isFavorite ? '#ef4444' : '#94a3b8'} fill={isFavorite ? '#ef4444' : 'none'} />
                    </TouchableOpacity>
                )}
            </View>

            {/* ── Content ── */}
            {!currentPlant ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 15, color: theme.textSecondary }}>{t('library.no_plants')}</Text>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={{ paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Hero image */}
                    <View style={{ borderBottomWidth: 1, borderBottomColor: theme.border }}>
                        <Image source={{ uri: heroImageUri }} style={{ width: '100%', height: 220 }} resizeMode="cover" />
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
                            {!!currentPlant.wateringFrequencyDays && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: isDark ? '#1e3a8a' : '#dbeafe', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}>
                                    <Droplets size={14} stroke={BLUE} />
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: BLUE }}>
                                        {t('library.watering_every', { days: currentPlant.wateringFrequencyDays, defaultValue: `Every ${currentPlant.wateringFrequencyDays}d` })}
                                    </Text>
                                </View>
                            )}
                            {!!currentPlant.typicalDaysToHarvest && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: isDark ? '#14532d' : '#dcfce7', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}>
                                    <Clock size={14} stroke={GREEN} />
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: GREEN }}>
                                        {currentPlant.typicalDaysToHarvest}{t('library.days_suffix', { defaultValue: 'd' })}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Purposes / uses */}
                        {currentPlant.purposes?.length > 0 && (
                            <View style={{ marginTop: 0, marginBottom: 16 }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                                    {t('library.detail_uses', { defaultValue: 'Uses' })}
                                </Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                    {currentPlant.purposes.map((p: string) => (
                                        <View key={p} style={{ backgroundColor: theme.accent, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 }}>
                                            <Text style={{ fontSize: 12, color: theme.primary, fontWeight: '700', textTransform: 'capitalize' }}>
                                                {t(`purposes.${p}`, { defaultValue: p.replace(/_/g, ' ') })}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* Description */}
                        {!!currentPlant.description && (
                            <View style={{ backgroundColor: theme.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border, marginBottom: 16 }}>
                                <Text style={{ fontSize: 14, color: theme.textAccent, lineHeight: 22 }}>{currentPlant.description}</Text>
                            </View>
                        )}

                        {/* Add to planning button */}
                        {showAdd && (
                            <TouchableOpacity
                                onPress={handleAdd}
                                style={{ backgroundColor: theme.primary, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginBottom: 16 }}
                            >
                                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.2 }}>
                                    {addLabel ?? t('library.add_to_planning', { defaultValue: 'Add to Planning' })}
                                </Text>
                            </TouchableOpacity>
                        )}

                        {/* Care section header */}
                        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
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
                            <ActivityIndicator size="small" color={theme.textMuted} style={{ marginVertical: 20 }} />
                        )}

                        {/* Detailed stats */}
                        {(currentPlant.germinationDays ?? currentPlant.spacingCm ?? currentPlant.maxPlantsPerM2 ?? currentPlant.seedRatePerM2 ?? currentPlant.waterLitersPerM2 ?? currentPlant.yieldKgPerM2 ?? currentPlant.source) && (
                            <View style={{ backgroundColor: theme.card, borderRadius: 18, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 16, marginTop: 6, marginBottom: 10 }}>
                                {!!currentPlant.germinationDays && <StatRow label={t('library.detail_germination')} value={`${currentPlant.germinationDays} days`} />}
                                {!!currentPlant.spacingCm && <StatRow label={t('library.detail_spacing')} value={formatLengthCm(currentPlant.spacingCm, unitSystem)} />}
                                {!!currentPlant.maxPlantsPerM2 && <StatRow label={t('library.detail_max_plants')} value={formatPlantsPerArea(currentPlant.maxPlantsPerM2, unitSystem)} />}
                                {!!currentPlant.seedRatePerM2 && <StatRow label={t('library.detail_seed_rate')} value={formatSeedsPerArea(currentPlant.seedRatePerM2, unitSystem)} />}
                                {!!currentPlant.waterLitersPerM2 && <StatRow label={t('library.detail_water_per_area')} value={formatWaterPerArea(currentPlant.waterLitersPerM2, unitSystem)} />}
                                {!!currentPlant.yieldKgPerM2 && <StatRow label={t('library.detail_yield_per_area')} value={formatYieldPerArea(currentPlant.yieldKgPerM2, unitSystem)} />}
                                {!!currentPlant.source && <StatRow label={t('library.detail_propagation')} value={currentPlant.source} />}
                            </View>
                        )}

                    </View>
                </ScrollView>
            )}
        </View>
    );
}
