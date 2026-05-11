import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Image,
    Modal,
    Pressable,
    TextInput,
    LayoutAnimation,
    Platform,
    UIManager,
    StyleSheet,
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
    Dna,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../../packages/convex/convex/_generated/api';
import { buildPlantSeedKey, plantI18nSeed, plantsMasterSeed } from '../../../../../packages/convex/convex/data/plantsMasterSeed';
import { useFavorites } from '../../../hooks/useFavorites';
import { usePlants } from '../../../hooks/usePlants';
import { useBeds } from '../../../hooks/useBeds';
import { useUnitSystem } from '../../../hooks/useUnitSystem';
import { useDeviceId } from '../../../lib/deviceId';
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
import { AddPlantTargetModal, type AddPlantTargetMode } from '../../../components/ui/AddPlantTargetModal';
import { useAppMode } from '../../../hooks/useAppMode';
import { useAddPlantFlow } from '../../../hooks/useAddPlantFlow';
import { usePlantSync } from '../../../hooks/usePlantSync';
import { createLocalId, loadPlantLocalData, savePlantLocalData } from '../../../lib/plantLocalData';

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

function formatDateInput(value?: number) {
    if (!value) return '';
    const d = new Date(value);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parseDateInput(value: string) {
    const parts = value.split('-').map((v) => Number(v));
    if (parts.length !== 3) return undefined;
    const [y, m, d] = parts;
    if (!y || !m || !d) return undefined;
    const date = new Date(y, m - 1, d, 12, 0, 0, 0);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.getTime();
}

function formatDateTimeInput(value?: number) {
    if (!value) return '';
    const d = new Date(value);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
}

function parseDateTimeInput(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const [datePart, timePart] = trimmed.split(/\s+/);
    const dateMs = parseDateInput(datePart);
    if (!dateMs) return undefined;
    if (!timePart) return dateMs;
    const [hRaw, mRaw] = timePart.split(':');
    const h = Number(hRaw);
    const m = Number(mRaw);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
        return undefined;
    }
    const d = new Date(dateMs);
    d.setHours(h, m, 0, 0);
    return d.getTime();
}

function daysAgoTimestamp(daysAgo: number) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.getTime();
}

function buildSeedMasterPlant(seedKeyOrScientificName: string, locale: string) {
    const normalizedSeedInput = seedKeyOrScientificName.trim();
    let plant = plantsMasterSeed.find(
        (item) =>
            buildPlantSeedKey({
                scientificName: item.scientificName,
                cultivar: (item as any).cultivar,
            }) === normalizedSeedInput
    );

    // Backward compatibility for older cached seed IDs: `seed:${scientificName}`.
    if (!plant && !normalizedSeedInput.includes('|')) {
        const normalizedScientific = normalizeScientificName(normalizedSeedInput);
        plant = plantsMasterSeed.find(
            (item) => normalizeScientificName(item.scientificName) === normalizedScientific
        );
    }

    const normalizedLocale = (locale ?? 'en').split('-')[0].toLowerCase();
    if (!plant) return null;

    const plantSeedKey = buildPlantSeedKey({
        scientificName: plant.scientificName,
        cultivar: (plant as any).cultivar,
    });
    const localeRow = plantI18nSeed.find(
        (row) =>
            row.locale === normalizedLocale &&
            buildPlantSeedKey({
                scientificName: row.scientificName,
                cultivar: row.cultivar,
            }) === plantSeedKey
    );
    const fallbackRow = plantI18nSeed.find(
        (row) =>
            row.locale === 'en' &&
            buildPlantSeedKey({
                scientificName: row.scientificName,
                cultivar: row.cultivar,
            }) === plantSeedKey
    );
    const localized = localeRow ?? fallbackRow;

    return {
        ...plant,
        _id: `seed:${encodeURIComponent(plantSeedKey)}`,
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
                overflow: 'hidden',
                marginBottom: 6,
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
    const { appMode } = useAppMode();
    const isGardener = appMode === 'gardener';
    const router = useRouter();
    const { bottom: safeBottom } = useSafeAreaInsets();
    const { deviceId } = useDeviceId();
    const { masterPlantId, mode, from, fromPlantId, bedId, x, y, scannedPhotoUri, backFrom, backBedId, backGardenId } = useLocalSearchParams<{
        masterPlantId: string;
        mode?: string;
        from?: string;
        fromPlantId?: string;
        bedId?: string;
        x?: string;
        y?: string;
        scannedPhotoUri?: string;
        backFrom?: string;
        backBedId?: string;
        backGardenId?: string;
    }>();

    const resolvedId = Array.isArray(masterPlantId) ? masterPlantId[0] : masterPlantId;
    const modeParam = Array.isArray(mode) ? mode[0] : mode;
    const fromParam = Array.isArray(from) ? from[0] : from;
    const bedIdParam = Array.isArray(bedId) ? bedId[0] : bedId;
    const xParam = Array.isArray(x) ? x[0] : x;
    const yParam = Array.isArray(y) ? y[0] : y;
    const scannedPhotoUriParam = Array.isArray(scannedPhotoUri) ? scannedPhotoUri[0] : scannedPhotoUri;
    const backFromParam = Array.isArray(backFrom) ? backFrom[0] : backFrom;
    const backBedIdParam = Array.isArray(backBedId) ? backBedId[0] : backBedId;
    const backGardenIdParam = Array.isArray(backGardenId) ? backGardenId[0] : backGardenId;
    const locale = i18n.language?.split('-')[0] ?? 'en';
    const isSeedFallbackId = !!resolvedId && resolvedId.startsWith('seed:');
    const seedPlantKey = useMemo(() => {
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
    const { queueActivity } = usePlantSync();
    const { completeLibraryAdd } = useAddPlantFlow({ addPlant, updatePlant });
    const { beds } = useBeds();
    const createGarden = useMutation(api.gardens.createGarden);
    const gardens = useQuery(api.gardens.getGardens, deviceId ? { deviceId } : 'skip') ?? [];

    const masterPlant = useQuery(
        api.plantImages.getPlantById,
        resolvedId && !isSeedFallbackId ? { plantId: resolvedId as any, locale } : 'skip',
    );
    const plantVariants = useQuery(
        api.plantImages.getPlantVariants,
        resolvedId && !isSeedFallbackId ? { plantId: resolvedId as any, locale } : 'skip',
    );
    const seedMasterPlant = useMemo(
        () => (seedPlantKey ? buildSeedMasterPlant(seedPlantKey, locale) : null),
        [seedPlantKey, locale]
    );
    const currentPlant = masterPlant ?? seedMasterPlant;
    const variantOptions = useMemo(
        () => (Array.isArray(plantVariants) ? plantVariants : []),
        [plantVariants]
    );
    const canMutateMaster = Boolean(resolvedId && !isSeedFallbackId);

    const isFavorite = canMutateMaster
        ? favorites.some((fav: any) => String(fav.plantMasterId) === String(resolvedId))
        : false;

    // ── Care content: offline-first cache ──────────────────────────────────────
    const [care, setCare] = useState<PlantCareContent | null>(null);
    const scrollRef = useRef<ScrollView>(null);
    const [variantsSectionY, setVariantsSectionY] = useState(0);
    const [targetModalOpen, setTargetModalOpen] = useState(false);
    const [addSaving, setAddSaving] = useState(false);
    const [gardenerDetailsOpen, setGardenerDetailsOpen] = useState(false);
    const [gardenerNickname, setGardenerNickname] = useState('');
    const [selectedGardenId, setSelectedGardenId] = useState<string | undefined>(undefined);
    const [createGardenMode, setCreateGardenMode] = useState(false);
    const [newGardenName, setNewGardenName] = useState('');
    const [plantedPreset, setPlantedPreset] = useState<'today' | 'yesterday' | 'seven_days' | 'thirty_days' | 'custom'>('today');
    const [plantedCustomValue, setPlantedCustomValue] = useState('');
    const [waterPreset, setWaterPreset] = useState<'today' | 'yesterday' | 'three_days' | 'seven_days' | 'custom'>('today');
    const [waterCustomValue, setWaterCustomValue] = useState('');
    const [gardenerExpectedDate, setGardenerExpectedDate] = useState('');
    const [activeDropdown, setActiveDropdown] = useState<'planted' | 'water' | 'growth' | null>(null);
    const [customDateEditor, setCustomDateEditor] = useState<'planted' | 'water' | null>(null);
    const [gardenerGrowthStage, setGardenerGrowthStage] = useState('vegetative');

    const growthStageOptions = useMemo(
        () => [
            { key: 'sowing', label: t('library.growth_stage_sowing', { defaultValue: 'Sowing' }) },
            { key: 'seedling', label: t('library.growth_stage_seedling', { defaultValue: 'Seedling' }) },
            { key: 'vegetative', label: t('library.growth_stage_vegetative', { defaultValue: 'Vegetative' }) },
            { key: 'flowering', label: t('library.growth_stage_flowering', { defaultValue: 'Flowering' }) },
            { key: 'fruiting', label: t('library.growth_stage_fruiting', { defaultValue: 'Fruiting' }) },
        ],
        [t]
    );
    const selectedGrowthStageLabel =
        growthStageOptions.find((option) => option.key === gardenerGrowthStage)?.label ??
        growthStageOptions[0]?.label ??
        '';
    const plantedOptions = useMemo(
        () => [
            { key: 'today' as const, label: t('library.date_today', { defaultValue: 'Today' }) },
            { key: 'yesterday' as const, label: t('library.date_yesterday', { defaultValue: 'Yesterday' }) },
            { key: 'seven_days' as const, label: t('library.date_7_days_ago', { defaultValue: '7 days ago' }) },
            { key: 'thirty_days' as const, label: t('library.date_30_days_ago', { defaultValue: '30 days ago' }) },
            { key: 'custom' as const, label: t('library.date_custom', { defaultValue: 'Custom date' }) },
        ],
        [t]
    );
    const waterOptions = useMemo(
        () => [
            { key: 'today' as const, label: t('library.date_today', { defaultValue: 'Today' }) },
            { key: 'yesterday' as const, label: t('library.date_yesterday', { defaultValue: 'Yesterday' }) },
            { key: 'three_days' as const, label: t('library.date_3_days_ago', { defaultValue: '3 days ago' }) },
            { key: 'seven_days' as const, label: t('library.date_7_days_ago', { defaultValue: '7 days ago' }) },
            { key: 'custom' as const, label: t('library.date_custom', { defaultValue: 'Custom date' }) },
        ],
        [t]
    );
    const selectedPlantedLabel =
        plantedOptions.find((option) => option.key === plantedPreset)?.label ?? plantedOptions[0]?.label ?? '';
    const selectedWaterLabel =
        waterOptions.find((option) => option.key === waterPreset)?.label ?? waterOptions[0]?.label ?? '';

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

    const showAdd = canMutateMaster;
    const isAttachMode = modeParam === 'attach';
    const isSelectMode = modeParam === 'select';
    const addLabel =
        !isGardener && fromParam === 'bed'
            ? t('bed.add_plant', { defaultValue: 'Add to garden' })
            : fromParam === 'scanner'
                ? t('library.add_to_my_garden', { defaultValue: 'Add to My Garden' })
                : undefined;

    const completeAdd = async (selectionMode: AddPlantTargetMode, selectedBedId?: string) => {
        if (!currentPlant || !resolvedId || !canMutateMaster) return;
        await completeLibraryAdd({
            plantMasterId: String(resolvedId),
            selectionMode,
            mode: modeParam,
            from: fromParam,
            attachPlantId: fromPlantId ? String(fromPlantId) : undefined,
            bedId: bedIdParam,
            x: xParam,
            y: yParam,
            scannedPhotoUri: scannedPhotoUriParam,
            backFrom: backFromParam,
            backBedId: backBedIdParam,
            backGardenId: backGardenIdParam,
            selectedBedId,
        });
    };

    const handleAdd = async () => {
        if (!currentPlant || !resolvedId || !canMutateMaster) return;
        if (isAttachMode && fromPlantId) {
            await completeAdd('planning');
            return;
        }
        if (!isGardener && fromParam === 'bed' && bedIdParam) {
            await completeAdd('growing', bedIdParam);
            return;
        }
        setTargetModalOpen(true);
    };

    const handleAddPlanning = async () => {
        if (!showAdd) return;
        await completeAdd('planning');
    };

    const handleAddGrowing = async () => {
        if (!showAdd) return;
        if (fromParam === 'bed' && bedIdParam) {
            await completeAdd('growing', bedIdParam);
            return;
        }
        setTargetModalOpen(true);
    };

    const handleAddMyPlants = async () => {
        if (!showAdd) return;
        setCreateGardenMode(false);
        setNewGardenName('');
        setSelectedGardenId(gardens.length > 0 ? String(gardens[0]._id) : undefined);
        setPlantedPreset('today');
        setPlantedCustomValue('');
        setWaterPreset('today');
        setWaterCustomValue('');
        setGardenerExpectedDate('');
        setGardenerGrowthStage('vegetative');
        setActiveDropdown(null);
        setCustomDateEditor(null);
        setGardenerDetailsOpen(true);
    };

    const handleCreateGardenerPlant = async () => {
        if (!resolvedId || !canMutateMaster || addSaving) return;
        setAddSaving(true);
        try {
            let resolvedGardenId = selectedGardenId;
            if (createGardenMode) {
                const name = newGardenName.trim();
                if (!name) {
                    setAddSaving(false);
                    return;
                }
                const createdGardenId = await createGarden({
                    name,
                    locationType: 'outdoor',
                    deviceId,
                });
                resolvedGardenId = String(createdGardenId);
            }
            const createdPlantId = await addPlant({
                plantMasterId: resolvedId as any,
                nickname: gardenerNickname.trim() || undefined,
                gardenId: resolvedGardenId ? (resolvedGardenId as any) : undefined,
                plantedAt:
                    plantedPreset === 'custom'
                        ? parseDateTimeInput(plantedCustomValue)
                        : plantedPreset === 'today'
                            ? daysAgoTimestamp(0)
                            : plantedPreset === 'yesterday'
                                ? daysAgoTimestamp(1)
                                : plantedPreset === 'seven_days'
                                    ? daysAgoTimestamp(7)
                                    : daysAgoTimestamp(30),
            });
            const expectedHarvestDate = parseDateInput(gardenerExpectedDate);
            if (expectedHarvestDate) {
                await updatePlant(createdPlantId, { expectedHarvestDate });
            }
            const lastWaterAt =
                waterPreset === 'custom'
                    ? parseDateTimeInput(waterCustomValue)
                    : waterPreset === 'today'
                        ? daysAgoTimestamp(0)
                        : waterPreset === 'yesterday'
                            ? daysAgoTimestamp(1)
                            : waterPreset === 'three_days'
                                ? daysAgoTimestamp(3)
                                : daysAgoTimestamp(7);
            if (lastWaterAt) {
                const existing = await loadPlantLocalData(String(createdPlantId));
                const wateringEntry = {
                    id: createLocalId(),
                    type: 'watering' as const,
                    date: lastWaterAt,
                    note: undefined,
                };
                await savePlantLocalData(String(createdPlantId), {
                    ...existing,
                    activities: [wateringEntry, ...existing.activities],
                });
                await queueActivity(String(createdPlantId), wateringEntry);
            }
            if (gardenerGrowthStage) {
                const existing = await loadPlantLocalData(String(createdPlantId));
                const growthStageEntry = {
                    id: createLocalId(),
                    type: 'custom' as const,
                    date:
                        plantedPreset === 'custom'
                            ? parseDateTimeInput(plantedCustomValue) ?? Date.now()
                            : plantedPreset === 'today'
                                ? daysAgoTimestamp(0)
                                : plantedPreset === 'yesterday'
                                    ? daysAgoTimestamp(1)
                                    : plantedPreset === 'seven_days'
                                        ? daysAgoTimestamp(7)
                                        : daysAgoTimestamp(30),
                    note: `${t('library.growth_stage', { defaultValue: 'Growth stage' })}: ${selectedGrowthStageLabel}`,
                };
                await savePlantLocalData(String(createdPlantId), {
                    ...existing,
                    activities: [growthStageEntry, ...existing.activities],
                });
                await queueActivity(String(createdPlantId), growthStageEntry);
            }
            setGardenerDetailsOpen(false);
            setGardenerNickname('');
            setSelectedGardenId(undefined);
            setCreateGardenMode(false);
            setNewGardenName('');
            setGardenerExpectedDate('');
            setPlantedPreset('today');
            setPlantedCustomValue('');
            setWaterPreset('today');
            setWaterCustomValue('');
            setGardenerGrowthStage('vegetative');
            setActiveDropdown(null);
            setCustomDateEditor(null);
            router.replace({
                pathname: '/(tabs)/plant/[userPlantId]',
                params: {
                    userPlantId: String(createdPlantId),
                    from: 'garden',
                    ...(resolvedGardenId ? { gardenId: resolvedGardenId } : {}),
                },
            });
        } finally {
            setAddSaving(false);
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

    const openVariant = useCallback(
        (variantId: string) => {
            if (!variantId || String(variantId) === String(resolvedId)) return;
            router.replace({
                pathname: '/(tabs)/library/[masterPlantId]',
                params: {
                    masterPlantId: String(variantId),
                    ...(modeParam ? { mode: modeParam } : {}),
                    ...(fromParam ? { from: fromParam } : {}),
                    ...(fromPlantId ? { fromPlantId: String(fromPlantId) } : {}),
                    ...(bedIdParam ? { bedId: String(bedIdParam) } : {}),
                    ...(xParam !== undefined ? { x: String(xParam) } : {}),
                    ...(yParam !== undefined ? { y: String(yParam) } : {}),
                    ...(scannedPhotoUriParam ? { scannedPhotoUri: String(scannedPhotoUriParam) } : {}),
                    ...(backFromParam ? { backFrom: String(backFromParam) } : {}),
                    ...(backBedIdParam ? { backBedId: String(backBedIdParam) } : {}),
                    ...(backGardenIdParam ? { backGardenId: String(backGardenIdParam) } : {}),
                },
            });
        },
        [
            resolvedId,
            router,
            modeParam,
            fromParam,
            fromPlantId,
            bedIdParam,
            xParam,
            yParam,
            scannedPhotoUriParam,
            backFromParam,
            backBedIdParam,
            backGardenIdParam,
        ]
    );

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
                        onPress={() => scrollRef.current?.scrollTo({ y: Math.max(variantsSectionY - 12, 0), animated: true })}
                        disabled={variantOptions.length <= 1}
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 12,
                            backgroundColor: theme.background,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1,
                            borderColor: theme.border,
                            opacity: variantOptions.length > 1 ? 1 : 0.5,
                            marginRight: 8,
                        }}
                    >
                        <Dna size={20} stroke={theme.textMuted} />
                    </TouchableOpacity>
                )}

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
                    ref={scrollRef}
                    contentContainerStyle={{ paddingBottom: showAdd ? safeBottom + 66 + 16 + 90 : 100 }}
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
                            <View style={{ marginBottom: 12 }}>
                                <Text style={{ fontSize: 14, color: theme.textAccent, lineHeight: 22 }}>{currentPlant.description}</Text>
                            </View>
                        )}

                        {variantOptions.length > 1 && (
                            <View
                                onLayout={(event) => {
                                    setVariantsSectionY(event.nativeEvent.layout.y);
                                }}
                                style={{
                                    marginBottom: 16,
                                    gap: 10,
                                }}
                            >
                                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
                                    {t('library.varieties_title', { defaultValue: 'Varieties' })}
                                </Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 2 }}>
                                    {variantOptions.map((variant: any) => {
                                        const active = String(variant._id) === String(resolvedId);
                                        return (
                                            <TouchableOpacity
                                                key={String(variant._id)}
                                                onPress={() => openVariant(String(variant._id))}
                                                disabled={active}
                                                style={{
                                                    width: 132,
                                                    borderWidth: 1,
                                                    borderColor: active ? theme.primary : theme.border,
                                                    backgroundColor: active ? theme.accent : theme.background,
                                                    borderRadius: 12,
                                                    overflow: 'hidden',
                                                    opacity: active ? 1 : 0.95,
                                                }}
                                            >
                                                <Image
                                                    source={{
                                                        uri:
                                                            variant.imageUrl ||
                                                            currentPlant.imageUrl ||
                                                            heroImageUri,
                                                    }}
                                                    style={{ width: '100%', height: 80 }}
                                                    resizeMode="cover"
                                                />
                                                <Text
                                                    style={{
                                                        fontSize: 12,
                                                        fontWeight: active ? '700' : '600',
                                                        color: active ? theme.primary : theme.textSecondary,
                                                        paddingHorizontal: 10,
                                                        paddingVertical: 8,
                                                    }}
                                                    numberOfLines={2}
                                                >
                                                    {variant.displayName ?? variant.scientificName}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            </View>
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
                        {Boolean(
                            currentPlant.germinationDays ??
                            currentPlant.spacingCm ??
                            currentPlant.maxPlantsPerM2 ??
                            currentPlant.seedRatePerM2 ??
                            currentPlant.waterLitersPerM2 ??
                            currentPlant.yieldKgPerM2 ??
                            currentPlant.source
                        ) && (
                            <View style={{ paddingHorizontal: 2, marginTop: 2, marginBottom: 4 }}>
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
            {showAdd && (
                <View
                    style={{
                        position: 'absolute',
                        left: 16,
                        right: 16,
                        bottom: safeBottom + 66 + 16,
                        flexDirection: 'row',
                        gap: 10,
                    }}
                >
                    {isAttachMode ? (
                        <TouchableOpacity
                            onPress={handleAdd}
                            style={{
                                flex: 1,
                                backgroundColor: theme.primary,
                                borderRadius: 16,
                                paddingVertical: 14,
                                alignItems: 'center',
                                borderWidth: 1,
                                borderColor: theme.primary,
                            }}
                        >
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                                {addLabel ?? t('plant.link_library', { defaultValue: 'Link from Library' })}
                            </Text>
                        </TouchableOpacity>
                    ) : isGardener ? (
                        <TouchableOpacity
                            onPress={handleAddMyPlants}
                            style={{
                                flex: 1,
                                backgroundColor: theme.primary,
                                borderRadius: 16,
                                paddingVertical: 14,
                                alignItems: 'center',
                                borderWidth: 1,
                                borderColor: theme.primary,
                            }}
                        >
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                                {t('library.add_to_my_plants', { defaultValue: 'Add to My Plants' })}
                            </Text>
                        </TouchableOpacity>
                    ) : isSelectMode ? (
                        <>
                            <TouchableOpacity
                                onPress={handleAddPlanning}
                                style={{
                                    flex: 1,
                                    backgroundColor: theme.background,
                                    borderRadius: 16,
                                    paddingVertical: 14,
                                    alignItems: 'center',
                                    borderWidth: 1,
                                    borderColor: theme.primary,
                                }}
                            >
                                <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 14 }}>
                                    {t('library.add_to_planning', { defaultValue: 'Add to Planning' })}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleAddGrowing}
                                style={{
                                    flex: 1,
                                    backgroundColor: theme.primary,
                                    borderRadius: 16,
                                    paddingVertical: 14,
                                    alignItems: 'center',
                                    borderWidth: 1,
                                    borderColor: theme.primary,
                                }}
                            >
                                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                                    {t('library.add_to_growing', { defaultValue: 'Add to Growing' })}
                                </Text>
                            </TouchableOpacity>
                        </>
                    ) : null}
                </View>
            )}
            <AddPlantTargetModal
                visible={targetModalOpen}
                beds={beds.map((bed: any) => ({ _id: String(bed._id), name: bed.name }))}
                initialMode="growing"
                isGardener={isGardener}
                loading={addSaving}
                onClose={() => {
                    if (addSaving) return;
                    setTargetModalOpen(false);
                }}
                onConfirm={async ({ mode, bedId }) => {
                    setAddSaving(true);
                    try {
                        await completeAdd(mode, bedId);
                        setTargetModalOpen(false);
                    } finally {
                        setAddSaving(false);
                    }
                }}
            />
            <Modal
                visible={gardenerDetailsOpen}
                transparent
                animationType="slide"
                onRequestClose={() => {
                    if (addSaving) return;
                    setGardenerDetailsOpen(false);
                }}
            >
                <Pressable
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
                    onPress={() => {
                        if (addSaving) return;
                        setGardenerDetailsOpen(false);
                    }}
                />
                <View style={{ position: 'relative', backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, borderColor: theme.border, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24, gap: 12 }}>
                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: 'center' }} />
                    <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text }}>
                        {t('library.add_to_my_plants', { defaultValue: 'Add to My Plants' })}
                    </Text>
                    <TextInput
                        value={gardenerNickname}
                        onChangeText={setGardenerNickname}
                        placeholder={t('planning.nickname_placeholder', { defaultValue: 'Plant name' })}
                        placeholderTextColor={theme.textMuted}
                        style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: theme.text, fontSize: 14 }}
                    />
                    <View style={{ gap: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                            Garden
                        </Text>
                        {!createGardenMode ? (
                            <>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                    {gardens.map((garden: any) => {
                                        const active = selectedGardenId === String(garden._id);
                                        return (
                                            <TouchableOpacity
                                                key={String(garden._id)}
                                                onPress={() => setSelectedGardenId(String(garden._id))}
                                                style={{
                                                    borderRadius: 10,
                                                    borderWidth: 1,
                                                    borderColor: active ? theme.primary : theme.border,
                                                    backgroundColor: active ? theme.primary : theme.background,
                                                    paddingHorizontal: 12,
                                                    paddingVertical: 8,
                                                }}
                                            >
                                                <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '600', fontSize: 13 }}>
                                                    {garden.name}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                                <TouchableOpacity
                                    onPress={() => setCreateGardenMode(true)}
                                    style={{ borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.background, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' }}
                                >
                                    <Text style={{ color: theme.textSecondary, fontWeight: '600', fontSize: 13 }}>
                                        + Create a new garden
                                    </Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <View style={{ gap: 8 }}>
                                <TextInput
                                    value={newGardenName}
                                    onChangeText={setNewGardenName}
                                    placeholder={t('garden.name_placeholder', { defaultValue: 'Garden name' })}
                                    placeholderTextColor={theme.textMuted}
                                    style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: theme.text, fontSize: 14 }}
                                />
                                <TouchableOpacity
                                    onPress={() => setCreateGardenMode(false)}
                                    style={{ borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.background, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' }}
                                >
                                    <Text style={{ color: theme.textSecondary, fontWeight: '600', fontSize: 13 }}>
                                        Select existing garden
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1, gap: 6 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                {t('plant.planted_at_label', { defaultValue: 'Planted time' })}
                            </Text>
                            <TouchableOpacity
                                onPress={() => setActiveDropdown('planted')}
                                style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>
                                    {plantedPreset === 'custom' && plantedCustomValue ? plantedCustomValue : selectedPlantedLabel}
                                </Text>
                                <ChevronDown size={16} stroke={theme.textMuted} />
                            </TouchableOpacity>
                        </View>
                        <View style={{ flex: 1, gap: 6 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                Last time water
                            </Text>
                            <TouchableOpacity
                                onPress={() => setActiveDropdown('water')}
                                style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>
                                    {waterPreset === 'custom' && waterCustomValue ? waterCustomValue : selectedWaterLabel}
                                </Text>
                                <ChevronDown size={16} stroke={theme.textMuted} />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View style={{ gap: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                            {t('library.growth_stage', { defaultValue: 'Growth stage' })}
                        </Text>
                        <TouchableOpacity
                            onPress={() => setActiveDropdown('growth')}
                            style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                        >
                            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{selectedGrowthStageLabel}</Text>
                            <ChevronDown size={16} stroke={theme.textMuted} />
                        </TouchableOpacity>
                    </View>
                    <View style={{ gap: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                            {t('plant.expected_harvest_label')}
                        </Text>
                        <TextInput
                            value={gardenerExpectedDate}
                            onChangeText={setGardenerExpectedDate}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor={theme.textMuted}
                            style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: theme.text, fontSize: 14 }}
                        />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
                        <TouchableOpacity
                            onPress={() => setGardenerDetailsOpen(false)}
                            disabled={addSaving}
                            style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: 'center', paddingVertical: 12, backgroundColor: theme.background }}
                        >
                            <Text style={{ color: theme.textSecondary, fontWeight: '600', fontSize: 14 }}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => void handleCreateGardenerPlant()}
                            disabled={addSaving}
                            style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: theme.primary, alignItems: 'center', paddingVertical: 12, backgroundColor: theme.primary, opacity: addSaving ? 0.7 : 1 }}
                        >
                            {addSaving ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('common.save')}</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                    {activeDropdown !== null && (
                        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
                            <Pressable style={{ ...{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, backgroundColor: 'rgba(0,0,0,0.32)' }} onPress={() => setActiveDropdown(null)} />
                            <View style={{ width: '100%', maxWidth: 420, backgroundColor: theme.card, borderRadius: 18, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, gap: 4, borderWidth: 1, borderColor: theme.border }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6 }}>
                                    <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>
                                        {activeDropdown === 'planted'
                                            ? t('plant.planted_at_label', { defaultValue: 'Planted time' })
                                            : activeDropdown === 'water'
                                                ? 'Last time water'
                                                : t('library.growth_stage', { defaultValue: 'Growth stage' })}
                                    </Text>
                                    <TouchableOpacity onPress={() => setActiveDropdown(null)} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: theme.textSecondary, fontSize: 20 }}>×</Text>
                                    </TouchableOpacity>
                                </View>
                                {(activeDropdown === 'planted' ? plantedOptions : activeDropdown === 'water' ? waterOptions : growthStageOptions).map((option: any) => {
                                    const key = String(option.key);
                                    const active =
                                        activeDropdown === 'planted'
                                            ? plantedPreset === key
                                            : activeDropdown === 'water'
                                                ? waterPreset === key
                                                : gardenerGrowthStage === key;
                                    return (
                                        <TouchableOpacity
                                            key={key}
                                            onPress={() => {
                                                if (activeDropdown === 'planted') {
                                                    setPlantedPreset(key as any);
                                                    if (key === 'custom') setCustomDateEditor('planted');
                                                } else if (activeDropdown === 'water') {
                                                    setWaterPreset(key as any);
                                                    if (key === 'custom') setCustomDateEditor('water');
                                                } else {
                                                    setGardenerGrowthStage(key);
                                                }
                                                setActiveDropdown(null);
                                            }}
                                            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 2 }}
                                        >
                                            <Text style={{ color: theme.text, fontSize: 15, fontWeight: active ? '700' : '500' }}>{option.label}</Text>
                                            <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: active ? theme.primary : theme.textSecondary, alignItems: 'center', justifyContent: 'center' }}>
                                                {active && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary }} />}
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    )}
                    {customDateEditor !== null && (
                        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
                            <Pressable style={{ ...{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, backgroundColor: 'rgba(0,0,0,0.32)' }} onPress={() => setCustomDateEditor(null)} />
                            <View style={{ width: '100%', maxWidth: 420, backgroundColor: theme.card, borderRadius: 18, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, gap: 10, borderWidth: 1, borderColor: theme.border }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>
                                        {customDateEditor === 'planted' ? t('plant.planted_at_label', { defaultValue: 'Planted time' }) : 'Last time water'}
                                    </Text>
                                    <TouchableOpacity onPress={() => setCustomDateEditor(null)} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: theme.textSecondary, fontSize: 20 }}>×</Text>
                                    </TouchableOpacity>
                                </View>
                                <TextInput
                                    value={customDateEditor === 'planted' ? plantedCustomValue : waterCustomValue}
                                    onChangeText={(value) => {
                                        if (customDateEditor === 'planted') setPlantedCustomValue(value);
                                        else setWaterCustomValue(value);
                                    }}
                                    placeholder="YYYY-MM-DD HH:mm"
                                    placeholderTextColor={theme.textMuted}
                                    style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: theme.text, fontSize: 14 }}
                                />
                                <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
                                    <TouchableOpacity onPress={() => setCustomDateEditor(null)} style={{ flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 12, alignItems: 'center', paddingVertical: 11 }}>
                                        <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>{t('common.cancel')}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setCustomDateEditor(null)} style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 12, alignItems: 'center', paddingVertical: 11 }}>
                                        <Text style={{ color: '#fff', fontWeight: '700' }}>{t('common.save')}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    )}
                </View>
            </Modal>
        </View>
    );
}
