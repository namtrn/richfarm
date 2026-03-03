import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { useTheme } from '../../lib/theme';
import type { ThemeColors } from '../../lib/theme';
import { useThemeContext } from '../../lib/ThemeContext';
import { useAppMode } from '../../hooks/useAppMode';

const RESULT_LIMIT = 4;

function ResultSection({
    title,
    onViewAll,
    children,
    viewAllLabel,
    theme,
}: {
    title: string;
    onViewAll?: () => void;
    viewAllLabel: string;
    children: ReactNode;
    theme: ThemeColors;
}) {
    return (
        <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{title}</Text>
                {onViewAll && (
                    <TouchableOpacity onPress={onViewAll} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>{viewAllLabel}</Text>
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
    theme,
    isDark,
}: {
    leading: ReactNode;
    title: string;
    subtitle?: string;
    onPress: () => void;
    testID?: string;
    theme: ThemeColors;
    isDark: boolean;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.85}
            testID={testID}
            style={{
                backgroundColor: theme.card,
                borderRadius: 18,
                padding: 12,
                borderWidth: 1,
                borderColor: theme.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                shadowColor: isDark ? '#000000' : '#1a1a18',
                shadowOpacity: 0.06,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
            }}
        >
            {leading}
            <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }} numberOfLines={1}>
                    {title}
                </Text>
                {!!subtitle && (
                    <Text style={{ fontSize: 12, color: theme.textSecondary }} numberOfLines={1}>
                        {subtitle}
                    </Text>
                )}
            </View>
            <ChevronRight size={16} stroke={theme.textMuted} />
        </TouchableOpacity>
    );
}

export default function ExplorerScreen() {
    const { t, i18n } = useTranslation();
    const router = useRouter();
    const theme = useTheme();
    const { isDark } = useThemeContext();
    const { appMode } = useAppMode();
    const locale = i18n.language?.split('-')[0] ?? i18n.language;
    const [query, setQuery] = useState('');
    const deferredQuery = useDeferredValue(query);

    const { plants: libraryPlants, isLoading: isLibraryLoading } = usePlantLibrary(locale);
    const { plants: userPlants, isLoading: isUserPlantsLoading } = usePlants();

    useEffect(() => {
        if (appMode === 'gardener') {
            router.replace('/(tabs)/garden');
        }
    }, [appMode, router]);

    const pestsDiseases = useQuery(api.pestsDiseases.list, {});
    const healthItems = pestsDiseases ?? [];
    const isHealthLoading = pestsDiseases === undefined;

    const isSearching = query.trim().length > 0;
    const normalizedDeferredQuery = deferredQuery.trim();
    const isDeferredSearching = normalizedDeferredQuery.length > 0;

    const libraryById = useMemo(() => {
        const map = new Map<string, any>();
        for (const plant of libraryPlants) {
            map.set(plant._id, plant);
        }
        return map;
    }, [libraryPlants]);

    const myPlantMatches = useMemo(() => {
        if (!isDeferredSearching) return [];
        return userPlants
            .filter((plant: any) => {
                const master = plant.plantMasterId ? libraryById.get(plant.plantMasterId) : undefined;
                return matchesSearch(normalizedDeferredQuery, [
                    plant.displayName,
                    master?.displayName,
                    master?.scientificName,
                    plant.notes,
                ]);
            })
            .slice(0, RESULT_LIMIT);
    }, [isDeferredSearching, userPlants, libraryById, normalizedDeferredQuery]);

    const libraryMatches = useMemo(() => {
        if (!isDeferredSearching) return [];
        return libraryPlants
            .filter((plant: any) => {
                return matchesSearch(normalizedDeferredQuery, [
                    plant.displayName,
                    plant.scientificName,
                    plant.group,
                    plant.group?.replace(/_/g, ' '),
                ]);
            })
            .slice(0, RESULT_LIMIT);
    }, [isDeferredSearching, libraryPlants, normalizedDeferredQuery]);

    const healthMatches = useMemo(() => {
        if (!isDeferredSearching) return [];
        return healthItems
            .filter((item: any) => {
                return matchesSearch(normalizedDeferredQuery, [
                    item.name,
                    item.key,
                    item.type,
                    Array.isArray(item.plantsAffected) ? item.plantsAffected.join(' ') : '',
                ]);
            })
            .slice(0, RESULT_LIMIT);
    }, [isDeferredSearching, healthItems, normalizedDeferredQuery]);

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
        router.push({
            pathname: '/(tabs)/plant/[userPlantId]',
            params: { userPlantId: String(plantId), from: 'explorer' },
        });
    };

    const isLoading = isLibraryLoading || isUserPlantsLoading || isHealthLoading;

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.background }}
            contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
        >
            <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 30, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>
                    {t('search.title')}
                </Text>
                <Text style={{ fontSize: 13, color: theme.textSecondary }}>
                    {t('search.subtitle')}
                </Text>
            </View>

            <View
                style={{
                    backgroundColor: theme.card,
                    borderRadius: 16,
                    paddingHorizontal: 14,
                    paddingVertical: 11,
                    borderWidth: 1,
                    borderColor: theme.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    shadowColor: isDark ? '#000000' : '#1a1a18',
                    shadowOpacity: 0.04,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 1 },
                }}
            >
                <Search size={17} stroke={theme.textMuted} />
                <TextInput
                    placeholder={t('search.placeholder')}
                    placeholderTextColor={theme.textMuted}
                    value={query}
                    onChangeText={setQuery}
                    style={{ flex: 1, fontSize: 15, color: theme.text }}
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
                        <X size={15} stroke={theme.textMuted} />
                    </TouchableOpacity>
                )}
            </View>

            {isLoading && isSearching && !hasResults ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={theme.primary} />
                </View>
            ) : !isSearching ? (
                <View
                    style={{
                        backgroundColor: theme.card,
                        borderRadius: 18,
                        padding: 20,
                        borderWidth: 1,
                        borderColor: theme.border,
                        alignItems: 'center',
                        gap: 10,
                        shadowColor: isDark ? '#000000' : '#1a1a18',
                        shadowOpacity: 0.05,
                        shadowRadius: 10,
                        shadowOffset: { width: 0, height: 2 },
                    }}
                >
                    <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                        <Search size={22} stroke={theme.primary} />
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>
                        {t('search.empty_title')}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary, textAlign: 'center' }}>
                        {t('search.empty_desc')}
                    </Text>
                </View>
            ) : !hasResults ? (
                <View
                    style={{
                        backgroundColor: theme.card,
                        borderRadius: 18,
                        padding: 20,
                        borderWidth: 1,
                        borderColor: theme.border,
                        alignItems: 'center',
                        gap: 10,
                    }}
                >
                    <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: theme.warningBg, alignItems: 'center', justifyContent: 'center' }}>
                        <Search size={22} stroke={theme.warning} />
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>
                        {t('search.no_results', { query: query.trim() })}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary, textAlign: 'center' }}>
                        {t('library.try_different')}
                    </Text>
                </View>
            ) : (
                <View style={{ gap: 16 }}>
                    {myPlantMatches.length > 0 && (
                        <ResultSection
                            title={t('search.section_my_plants')}
                            viewAllLabel={t('search.view_all')}
                            theme={theme}
                        >
                            {myPlantMatches.map((plant: any) => {
                                const master = plant.plantMasterId ? libraryById.get(plant.plantMasterId) : undefined;
                                const title = plant.displayName ?? master?.displayName ?? plant.scientificName ?? master?.scientificName ?? t('plant.unnamed');
                                const subtitle = t('plant.status_label', { status: t(`plant.status_${plant.status}`) });
                                const imageUri = plant.photoUrl ?? master?.imageUrl ?? null;
                                return (
                                    <ResultRow
                                        key={plant._id}
                                        leading={<PlantImage uri={imageUri} size={48} borderRadius={14} />}
                                        title={title}
                                        subtitle={subtitle}
                                        onPress={() => openPlant(plant._id)}
                                        testID="e2e-explorer-plant-result"
                                        theme={theme}
                                        isDark={isDark}
                                    />
                                );
                            })}
                        </ResultSection>
                    )}

                    {libraryMatches.length > 0 && (
                        <ResultSection
                            title={t('search.section_library')}
                            onViewAll={openLibrary}
                            viewAllLabel={t('search.view_all')}
                            theme={theme}
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
                                        theme={theme}
                                        isDark={isDark}
                                    />
                                );
                            })}
                        </ResultSection>
                    )}

                    {healthMatches.length > 0 && (
                        <ResultSection
                            title={t('search.section_health')}
                            onViewAll={() => openHealth()}
                            viewAllLabel={t('search.view_all')}
                            theme={theme}
                        >
                            {healthMatches.map((item: any) => {
                                const isDisease = item.type === 'disease';
                                const badgeBg = isDisease ? (isDark ? '#1e3a8a' : '#dbeafe') : (isDark ? '#7f1d1d' : '#fee2e2');
                                const badgeColor = isDisease ? (isDark ? '#bfdbfe' : '#2563eb') : (isDark ? '#fecaca' : '#b91c1c');
                                const badgeLabel = isDisease
                                    ? t('health.tab_diseases')
                                    : t('health.tab_pests');
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
                                        theme={theme}
                                        isDark={isDark}
                                    />
                                );
                            })}
                        </ResultSection>
                    )}
                </View>
            )}

            {isSearching && hasResults && isLoading && (
                <View style={{ paddingVertical: 8, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={theme.primary} />
                </View>
            )}
        </ScrollView>
    );
}
