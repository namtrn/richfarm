import { useState, useMemo, useEffect, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Modal,
    Pressable,
    Animated,
    LayoutChangeEvent,
} from 'react-native';
import { Search, X, Bug, Heart, BookOpen } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { usePlantLibrary, usePlantGroups } from '../../../hooks/usePlantLibrary';
import { PlantImage } from '../../../components/ui/PlantImage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePlants } from '../../../hooks/usePlants';
import { usePlantDisplayName } from '../../../hooks/usePlantLocalized';
import { matchesSearch } from '../../../lib/search';
import { useFavorites } from '../../../hooks/useFavorites';
import { usePestsDiseases, PestDiseaseType } from '../../../hooks/usePestsDiseases';

type LibraryTab = 'plants' | 'pests' | 'guide';

const LIBRARY_TABS: LibraryTab[] = ['plants', 'pests', 'guide'];

function normalizeTab(value?: string): LibraryTab {
    if (!value) return 'plants';
    if (value === 'diseases') return 'pests';
    return LIBRARY_TABS.includes(value as LibraryTab) ? (value as LibraryTab) : 'plants';
}

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
    const { displayName, scientificName } = usePlantDisplayName(plant);

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            testID={testID}
            style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                padding: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                borderWidth: 1,
                borderColor: '#e7e0d6',
                shadowColor: '#1a1a18',
                shadowOpacity: 0.06,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
            }}
        >
            <PlantImage uri={plant.imageUrl} size={52} borderRadius={14} />
            <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#1c1917', letterSpacing: -0.3 }} numberOfLines={1}>{displayName}</Text>
                <Text style={{ fontSize: 12, color: '#a8a29e', fontStyle: 'italic' }} numberOfLines={1}>
                    {scientificName || '—'}
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
                    stroke={isFavorite ? '#ef4444' : '#cbd5e1'}
                    fill={isFavorite ? '#ef4444' : 'none'}
                />
            </Pressable>
        </TouchableOpacity>
    );
}

// ─── Pest & Disease Card ──────────────────────────────────────────────────────
function PestDiseaseCard({ item, onPress }: { item: any; onPress: () => void }) {
    const typeColor = item.type === 'disease' ? '#2563eb' : '#b91c1c';
    const typeBg = item.type === 'disease' ? '#dbeafe' : '#fee2e2';
    const typeLabel = item.type === 'disease' ? 'Disease' : 'Pest';
    const chips = item.plantsAffected?.slice(0, 4) ?? [];
    const extra = (item.plantsAffected?.length ?? 0) - chips.length;

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

// ─── Pest Detail Section helper ───────────────────────────────────────────────
function InfoSection({ title, items }: { title: string; items?: string[] }) {
    if (!items || items.length === 0) return null;
    return (
        <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#5c5247', marginBottom: 6 }}>{title}</Text>
            {items.map((item, idx) => (
                <Text key={`${title}-${idx}`} style={{ fontSize: 13, color: '#4b5563', lineHeight: 20 }}>- {item}</Text>
            ))}
        </View>
    );
}

function PestDiseaseDetailModal({ item, onClose }: { item: any; onClose: () => void }) {
    const { t } = useTranslation();
    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
                <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, maxHeight: '85%' }}>
                    <View style={{ width: 40, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <Text style={{ fontSize: 22, fontWeight: '800', color: '#1c1917', flex: 1 }}>{item.name}</Text>
                        <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
                            <X size={20} stroke="#6b7280" />
                        </TouchableOpacity>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <InfoSection title={t('health.section_identification', { defaultValue: 'Identification' })} items={item.identification} />
                        <InfoSection title={t('health.section_damage', { defaultValue: 'Damage' })} items={item.damage} />
                        <InfoSection title={t('health.section_prevention', { defaultValue: 'Prevention' })} items={item.prevention} />
                        <InfoSection title={t('health.section_plants', { defaultValue: 'Plants affected' })} items={item.plantsAffected} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// ─── Guide Tab ────────────────────────────────────────────────────────────────
function GuideTab() {
    const { t } = useTranslation();
    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 }}>
            <BookOpen size={48} stroke="#c4bdb3" />
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#a8a29e', textAlign: 'center' }}>
                {t('library.section_guides', { defaultValue: 'Guides' })}
            </Text>
            <Text style={{ fontSize: 13, color: '#c4bdb3', textAlign: 'center' }}>
                {t('library.section_soon', { defaultValue: 'Coming soon' })}
            </Text>
        </View>
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
            {/* Sliding dark green pill */}
            <Animated.View
                pointerEvents="none"
                style={[
                    { position: 'absolute', top: 2, bottom: 2, backgroundColor: '#1a4731', borderRadius: 18 },
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
                        <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? '#fff' : '#a8a29e', letterSpacing: active ? 0.1 : 0 }}>
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
    const router = useRouter();
    const params = useLocalSearchParams<{ mode?: string; from?: string; plantId?: string; bedId?: string; x?: string; y?: string; q?: string; tab?: string }>();
    const fromParam = Array.isArray(params.from) ? params.from[0] : params.from;
    const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
    const selectMode = modeParam === 'select';
    const attachMode = modeParam === 'attach';
    const locale = i18n.language?.split('-')[0] ?? i18n.language;
    const bedIdParam = Array.isArray(params.bedId) ? params.bedId[0] : params.bedId;
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
    const [search, setSearch] = useState(initialQuery ?? '');
    const [activeTab, setActiveTab] = useState<LibraryTab>(() => normalizeTab(tabParam));
    const [selectedGroup, setSelectedGroup] = useState<string | undefined>(undefined);
    const [selectedPest, setSelectedPest] = useState<any>(null);

    // Plants data
    const { plants, isLoading: plantsLoading } = usePlantLibrary(locale);
    const { groups } = usePlantGroups();
    const { addPlant, updatePlant } = usePlants();
    const { favorites, toggleFavorite } = useFavorites();

    // Pests & Diseases data
    const pestType: PestDiseaseType | undefined = undefined; // show all
    const { items: pestItems, isLoading: pestsLoading } = usePestsDiseases(pestType);

    const favoriteIds = useMemo(
        () => new Set(favorites.map((fav: any) => String(fav.plantMasterId))),
        [favorites]
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

    const filteredPlants = useMemo(() => {
        let result = plants;
        if (selectedGroup) result = result.filter((p) => p.group === selectedGroup);
        if (search.trim()) result = result.filter((p) =>
            matchesSearch(search, [p.displayName, p.scientificName, p.group, p.group?.replace(/_/g, ' ')])
        );
        return result;
    }, [plants, selectedGroup, search]);

    const filteredPests = useMemo(() => {
        if (!search.trim()) return pestItems;
        return pestItems.filter((item: any) =>
            matchesSearch(search, [
                item.name,
                item.key,
                item.type,
                Array.isArray(item.plantsAffected) ? item.plantsAffected.join(' ') : '',
            ])
        );
    }, [pestItems, search]);

    // Dynamic search placeholder based on active tab
    const searchPlaceholder =
        activeTab === 'plants'
            ? t('library.search_plants', { defaultValue: 'Search plants...' })
            : activeTab === 'pests'
                ? t('library.search_pests', { defaultValue: 'Search pests & diseases...' })
                : t('library.search_guides', { defaultValue: 'Search guides...' });

    return (
        <View style={{ flex: 1, backgroundColor: '#faf8f4' }}>
            {/* Top bar: Search + Tabs */}
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e7e0d6' }}>
                {/* Search bar — white card style */}
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#fff',
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    gap: 10,
                    borderWidth: 1,
                    borderColor: '#e7e0d6',
                    shadowColor: '#1a1a18',
                    shadowOpacity: 0.05,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 2 },
                }}>
                    <Search size={15} stroke="#a8a29e" />
                    <TextInput
                        style={{ flex: 1, paddingVertical: 12, fontSize: 15, color: '#1c1917' }}
                        placeholder={searchPlaceholder}
                        placeholderTextColor="#a8a29e"
                        value={search}
                        onChangeText={setSearch}
                        testID="e2e-library-search-input"
                    />
                    {!!search && (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <X size={15} stroke="#a8a29e" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Internal tabs — animated sliding pill */}
                <SlidingTabBar
                    tabs={[
                        { key: 'plants', label: t('library.tab_plants', { defaultValue: 'Plants' }), flex: 3 },
                        { key: 'pests', label: t('library.tab_pests', { defaultValue: 'Pest & Diseases' }), flex: 4 },
                        { key: 'guide', label: t('library.tab_guide', { defaultValue: 'Guide' }), flex: 3 },
                    ]}
                    activeTab={activeTab}
                    onTabChange={(key: string) => { setActiveTab(key as LibraryTab); setSearch(''); }}
                />
            </View>

            {/* ── Plants Tab ── */}
            {activeTab === 'plants' && (
                <>
                    {/* Group filter chips */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ paddingLeft: 16, marginTop: 10, marginBottom: 4, maxHeight: 44 }}
                        contentContainerStyle={{ gap: 8, paddingRight: 16, alignItems: 'center' }}
                    >
                        <TouchableOpacity
                            onPress={() => setSelectedGroup(undefined)}
                            style={{
                                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                                backgroundColor: selectedGroup === undefined ? '#059669' : '#fff',
                                borderWidth: 1,
                                borderColor: selectedGroup === undefined ? '#059669' : '#e2e8f0',
                            }}
                        >
                            <Text style={{ fontSize: 13, fontWeight: '600', color: selectedGroup === undefined ? '#fff' : '#475569' }}>
                                {t('library.filter_all')}
                            </Text>
                        </TouchableOpacity>
                        {groups.map((g: any) => {
                            const active = selectedGroup === g.key;
                            const label = g.displayName?.[locale] ?? g.displayName?.en ?? g.key;
                            return (
                                <TouchableOpacity
                                    key={g.key}
                                    onPress={() => setSelectedGroup(active ? undefined : g.key)}
                                    style={{
                                        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                                        backgroundColor: active ? '#059669' : '#fff',
                                        borderWidth: 1,
                                        borderColor: active ? '#059669' : '#e2e8f0',
                                        flexDirection: 'row', alignItems: 'center', gap: 5,
                                    }}
                                >
                                    <Text style={{ fontSize: 14 }}>{GROUP_ICONS[g.key] ?? '🌱'}</Text>
                                    <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : '#475569' }}>{label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {plantsLoading ? null : filteredPlants.length === 0 ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                            <Text style={{ fontSize: 32 }}>🌱</Text>
                            <Text style={{ fontSize: 16, fontWeight: '600', color: '#a8a29e' }}>
                                {search ? t('library.no_results') : t('library.no_plants')}
                            </Text>
                        </View>
                    ) : (
                        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}>
                            {filteredPlants.map((plant) => (
                                <PlantCard
                                    key={plant._id}
                                    plant={plant}
                                    onPress={() => {
                                        const query = new URLSearchParams();
                                        if (modeParam) query.set('mode', modeParam);
                                        if (fromParam) query.set('from', fromParam);
                                        if (params.plantId) query.set('fromPlantId', String(params.plantId));
                                        if (bedIdParam) query.set('bedId', bedIdParam);
                                        if (xParam !== undefined) query.set('x', xParam);
                                        if (yParam !== undefined) query.set('y', yParam);
                                        const qs = query.toString();
                                        router.push(`/(tabs)/library/${plant._id}${qs ? `?${qs}` : ''}`);
                                    }}
                                    onToggleFavorite={() => { void toggleFavorite(plant._id).catch(() => undefined); }}
                                    isFavorite={favoriteIds.has(String(plant._id))}
                                    testID="e2e-library-plant-card"
                                />
                            ))}
                        </ScrollView>
                    )}
                </>
            )}

            {/* ── Pest & Diseases Tab ── */}
            {activeTab === 'pests' && (
                <View testID="e2e-library-tab-pests-content" style={{ flex: 1 }}>
                    {pestsLoading ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <ActivityIndicator size="large" color="#166534" />
                        </View>
                    ) : filteredPests.length === 0 ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                            <Bug size={48} stroke="#c4bdb3" />
                            <Text style={{ fontSize: 16, fontWeight: '600', color: '#a8a29e' }}>
                                {t('health.no_results', { defaultValue: 'No matches found' })}
                            </Text>
                        </View>
                    ) : (
                        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}>
                            {filteredPests.map((item: any) => (
                                <PestDiseaseCard key={item._id} item={item} onPress={() => setSelectedPest(item)} />
                            ))}
                        </ScrollView>
                    )}
                </View>
            )}

            {/* ── Guide Tab ── */}
            {activeTab === 'guide' && <GuideTab />}

            {/* Pest detail modal */}
            {selectedPest && (
                <PestDiseaseDetailModal item={selectedPest} onClose={() => setSelectedPest(null)} />
            )}
        </View>
    );
}
