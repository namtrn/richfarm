import { useMemo, useState, type ReactNode } from 'react';
import {
    View,
    Text,
    ScrollView,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { Search, X, ChevronRight, Bug } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { usePlantLibrary } from '../../hooks/usePlantLibrary';
import { usePlants } from '../../hooks/usePlants';
import { PlantImage } from '../../components/ui/PlantImage';
import { matchesSearch } from '../../lib/search';

const RESULT_LIMIT = 4;

function ResultSection({
    title,
    onViewAll,
    children,
    viewAllLabel,
}: {
    title: string;
    onViewAll?: () => void;
    viewAllLabel: string;
    children: ReactNode;
}) {
    return (
        <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#1c1917' }}>{title}</Text>
                {onViewAll && (
                    <TouchableOpacity onPress={onViewAll} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>{viewAllLabel}</Text>
                    </TouchableOpacity>
                )}
            </View>
            <View style={{ gap: 10 }}>{children}</View>
        </View>
    );
}

function ResultRow({
    leading,
    title,
    subtitle,
    onPress,
    testID,
}: {
    leading: ReactNode;
    title: string;
    subtitle?: string;
    onPress: () => void;
    testID?: string;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.85}
            testID={testID}
            style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                padding: 12,
                borderWidth: 1,
                borderColor: '#e7e0d6',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                shadowColor: '#1a1a18',
                shadowOpacity: 0.06,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
            }}
        >
            {leading}
            <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#1c1917' }} numberOfLines={1}>
                    {title}
                </Text>
                {!!subtitle && (
                    <Text style={{ fontSize: 12, color: '#78716c' }} numberOfLines={1}>
                        {subtitle}
                    </Text>
                )}
            </View>
            <ChevronRight size={16} stroke="#c4bdb3" />
        </TouchableOpacity>
    );
}

export default function ExplorerScreen() {
    const { t, i18n } = useTranslation();
    const router = useRouter();
    const locale = i18n.language?.split('-')[0] ?? i18n.language;
    const [query, setQuery] = useState('');

    const { plants: libraryPlants, isLoading: isLibraryLoading } = usePlantLibrary(locale);
    const { plants: userPlants, isLoading: isUserPlantsLoading } = usePlants();

    const pestsDiseases = useQuery(api.pestsDiseases.list, {});
    const healthItems = pestsDiseases ?? [];
    const isHealthLoading = pestsDiseases === undefined;

    const isSearching = query.trim().length > 0;

    const libraryById = useMemo(() => {
        const map = new Map<string, any>();
        for (const plant of libraryPlants) {
            map.set(plant._id, plant);
        }
        return map;
    }, [libraryPlants]);

    const myPlantMatches = useMemo(() => {
        if (!isSearching) return [];
        return userPlants
            .filter((plant: any) => {
                const master = plant.plantMasterId ? libraryById.get(plant.plantMasterId) : undefined;
                return matchesSearch(query, [
                    plant.nickname,
                    master?.displayName,
                    master?.scientificName,
                    plant.notes,
                ]);
            })
            .slice(0, RESULT_LIMIT);
    }, [isSearching, userPlants, libraryById, query]);

    const libraryMatches = useMemo(() => {
        if (!isSearching) return [];
        return libraryPlants
            .filter((plant: any) => {
                return matchesSearch(query, [
                    plant.displayName,
                    plant.scientificName,
                    plant.group,
                    plant.group?.replace(/_/g, ' '),
                ]);
            })
            .slice(0, RESULT_LIMIT);
    }, [isSearching, libraryPlants, query]);

    const healthMatches = useMemo(() => {
        if (!isSearching) return [];
        return healthItems
            .filter((item: any) => {
                return matchesSearch(query, [
                    item.name,
                    item.key,
                    item.type,
                    Array.isArray(item.plantsAffected) ? item.plantsAffected.join(' ') : '',
                ]);
            })
            .slice(0, RESULT_LIMIT);
    }, [isSearching, healthItems, query]);

    const hasResults = myPlantMatches.length + libraryMatches.length + healthMatches.length > 0;

    const openLibrary = () => {
        if (!query.trim()) {
            router.push('/(tabs)/library');
            return;
        }
        router.push({ pathname: '/(tabs)/library', params: { q: query.trim() } });
    };

    const openHealth = (_tab?: 'pests' | 'diseases') => {
        const tab = _tab === 'diseases' ? 'diseases' : 'pests';
        if (!query.trim()) {
            router.push({ pathname: '/(tabs)/library', params: { tab } });
            return;
        }
        router.push({ pathname: '/(tabs)/library', params: { q: query.trim(), tab } });
    };

    const openPlant = (plantId: string) => {
        router.push(`/(tabs)/plant/${plantId}`);
    };

    const isLoading = isLibraryLoading || isUserPlantsLoading || isHealthLoading;

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#faf8f4' }}
            contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
        >
            <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 30, fontWeight: '800', color: '#1c1917', letterSpacing: -0.5 }}>
                    {t('search.title', { defaultValue: 'Search' })}
                </Text>
                <Text style={{ fontSize: 13, color: '#78716c' }}>
                    {t('search.subtitle', { defaultValue: 'Find plants, pests, and your garden items.' })}
                </Text>
            </View>

            <View
                style={{
                    backgroundColor: '#fff',
                    borderRadius: 16,
                    paddingHorizontal: 14,
                    paddingVertical: 11,
                    borderWidth: 1,
                    borderColor: '#e7e0d6',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    shadowColor: '#1a1a18',
                    shadowOpacity: 0.04,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 1 },
                }}
            >
                <Search size={17} stroke="#a8a29e" />
                <TextInput
                    placeholder={t('search.placeholder', { defaultValue: 'Search plants, pests, diseases...' })}
                    placeholderTextColor="#a8a29e"
                    value={query}
                    onChangeText={setQuery}
                    style={{ flex: 1, fontSize: 15, color: '#1c1917' }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    testID="e2e-explorer-search-input"
                />
                {!!query && (
                    <TouchableOpacity
                        onPress={() => setQuery('')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        testID="e2e-explorer-search-clear"
                    >
                        <X size={15} stroke="#a8a29e" />
                    </TouchableOpacity>
                )}
            </View>

            {isLoading && isSearching && !hasResults ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#166534" />
                </View>
            ) : !isSearching ? (
                <View
                    style={{
                        backgroundColor: '#fff',
                        borderRadius: 18,
                        padding: 20,
                        borderWidth: 1,
                        borderColor: '#e7e0d6',
                        alignItems: 'center',
                        gap: 10,
                        shadowColor: '#1a1a18',
                        shadowOpacity: 0.05,
                        shadowRadius: 10,
                        shadowOffset: { width: 0, height: 2 },
                    }}
                >
                    <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#e8f5ec', alignItems: 'center', justifyContent: 'center' }}>
                        <Search size={22} stroke="#166534" />
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#1c1917' }}>
                        {t('search.empty_title', { defaultValue: 'Start typing to search' })}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#78716c', textAlign: 'center' }}>
                        {t('search.empty_desc', { defaultValue: 'Search across your garden, library, and health guides.' })}
                    </Text>
                </View>
            ) : !hasResults ? (
                <View
                    style={{
                        backgroundColor: '#fff',
                        borderRadius: 18,
                        padding: 20,
                        borderWidth: 1,
                        borderColor: '#e7e0d6',
                        alignItems: 'center',
                        gap: 10,
                    }}
                >
                    <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' }}>
                        <Search size={22} stroke="#d97706" />
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#1c1917' }}>
                        {t('search.no_results', { defaultValue: 'No results for "{{query}}"', query: query.trim() })}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#78716c', textAlign: 'center' }}>
                        {t('library.try_different', { defaultValue: 'Try a different search term' })}
                    </Text>
                </View>
            ) : (
                <View style={{ gap: 16 }}>
                    {myPlantMatches.length > 0 && (
                        <ResultSection
                            title={t('search.section_my_plants', { defaultValue: 'My plants' })}
                            viewAllLabel={t('search.view_all', { defaultValue: 'View all' })}
                        >
                            {myPlantMatches.map((plant: any) => {
                                const master = plant.plantMasterId ? libraryById.get(plant.plantMasterId) : undefined;
                                const title = plant.nickname ?? master?.displayName ?? master?.scientificName ?? t('plant.unnamed');
                                const subtitle = t('plant.status_label', { status: plant.status });
                                const imageUri = plant.photoUrl ?? master?.imageUrl ?? null;
                                return (
                                    <ResultRow
                                        key={plant._id}
                                        leading={<PlantImage uri={imageUri} size={48} borderRadius={14} />}
                                        title={title}
                                        subtitle={subtitle}
                                        onPress={() => openPlant(plant._id)}
                                        testID="e2e-explorer-plant-result"
                                    />
                                );
                            })}
                        </ResultSection>
                    )}

                    {libraryMatches.length > 0 && (
                        <ResultSection
                            title={t('search.section_library', { defaultValue: 'Plant library' })}
                            onViewAll={openLibrary}
                            viewAllLabel={t('search.view_all', { defaultValue: 'View all' })}
                        >
                            {libraryMatches.map((plant: any) => {
                                const title = plant.displayName ?? plant.scientificName ?? t('plant.unnamed');
                                const subtitle = plant.scientificName ?? plant.group?.replace(/_/g, ' ') ?? '';
                                return (
                                    <ResultRow
                                        key={plant._id}
                                        leading={<PlantImage uri={plant.imageUrl} size={48} borderRadius={14} />}
                                        title={title}
                                        subtitle={subtitle}
                                        onPress={openLibrary}
                                        testID="e2e-explorer-library-result"
                                    />
                                );
                            })}
                        </ResultSection>
                    )}

                    {healthMatches.length > 0 && (
                        <ResultSection
                            title={t('search.section_health', { defaultValue: 'Pests & diseases' })}
                            onViewAll={() => openHealth()}
                            viewAllLabel={t('search.view_all', { defaultValue: 'View all' })}
                        >
                            {healthMatches.map((item: any) => {
                                const isDisease = item.type === 'disease';
                                const badgeBg = isDisease ? '#dbeafe' : '#fee2e2';
                                const badgeColor = isDisease ? '#2563eb' : '#b91c1c';
                                const badgeLabel = isDisease
                                    ? t('health.tab_diseases', { defaultValue: 'Diseases' })
                                    : t('health.tab_pests', { defaultValue: 'Pests' });
                                return (
                                    <ResultRow
                                        key={item._id}
                                        leading={
                                            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: badgeBg, alignItems: 'center', justifyContent: 'center' }}>
                                                <Bug size={20} stroke={badgeColor} />
                                            </View>
                                        }
                                        title={item.name}
                                        subtitle={badgeLabel}
                                        onPress={() => openHealth(isDisease ? 'diseases' : 'pests')}
                                        testID="e2e-explorer-health-result"
                                    />
                                );
                            })}
                        </ResultSection>
                    )}
                </View>
            )}

            {isSearching && hasResults && isLoading && (
                <View style={{ paddingVertical: 8, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#166534" />
                </View>
            )}
        </ScrollView>
    );
}
