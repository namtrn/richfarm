import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, Search } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../../../../packages/convex/_generated/api';
import { PlantImage } from '../../../../components/ui/PlantImage';
import { useTheme } from '../../../../lib/theme';
import { useThemeContext } from '../../../../lib/ThemeContext';
import { matchesSearch } from '../../../../lib/search';
import { formatPlantFamilyDisplayName } from '../../../../../../packages/shared/src/plantFamily';

type LayoutMode = 'list' | 'grid';

function buildPassthrough(params: Record<string, string | string[] | undefined>) {
    const keys = ['mode', 'from', 'userPlantId', 'bedId', 'x', 'y', 'backFrom', 'backBedId', 'backGardenId'];
    const next: Record<string, string> = {};
    for (const key of keys) {
        const value = Array.isArray(params[key]) ? params[key]?.[0] : params[key];
        if (typeof value === 'string' && value.length > 0) next[key] = value;
    }
    return next;
}

export default function FamilyScreen() {
    const { i18n } = useTranslation();
    const theme = useTheme();
    const { isDark } = useThemeContext();
    const router = useRouter();
    const params = useLocalSearchParams() as Record<string, string | string[] | undefined>;
    const family = Array.isArray(params.family) ? params.family[0] : params.family;
    const initialLayout = (Array.isArray(params.layout) ? params.layout[0] : params.layout) as LayoutMode | undefined;
    const locale = i18n.language?.split('-')[0] ?? i18n.language;
    const [search, setSearch] = useState('');
    const [layoutMode, setLayoutMode] = useState<LayoutMode>(initialLayout ?? 'list');
    const familyDisplayName = formatPlantFamilyDisplayName(family, i18n.language);

    const genera = useQuery(
        api.plantLibrary.listGeneraByFamily,
        family ? { family, locale, limit: 200 } : 'skip'
    );
    const passthrough = useMemo(() => buildPassthrough(params), [params]);

    const filtered = useMemo(() => {
        const rows = genera ?? [];
        const query = search.trim();
        if (!query) return rows;
        return rows.filter((item: any) =>
            matchesSearch(query, [item.genus, item.samplePlant?.commonName, item.samplePlant?.scientificName])
        );
    }, [genera, search]);

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 12, backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <TouchableOpacity onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border }}>
                        <ArrowLeft size={18} stroke={theme.text} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text }}>{familyDisplayName || family || 'Family'}</Text>
                        <Text style={{ fontSize: 12, color: theme.textSecondary }}>Browse genera</Text>
                    </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.background, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: theme.border }}>
                    <Search size={16} stroke={theme.textMuted} />
                    <TextInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search genera"
                        placeholderTextColor={theme.textMuted}
                        style={{ flex: 1, fontSize: 14, color: theme.text }}
                    />
                </View>
            </View>

            {genera === undefined ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={theme.primary} />
                </View>
            ) : (
                <FlatList
                    key={layoutMode}
                    data={filtered}
                    keyExtractor={(item: any) => String(item.key)}
                    numColumns={layoutMode === 'grid' ? 2 : 1}
                    columnWrapperStyle={layoutMode === 'grid' ? { gap: 12, paddingHorizontal: 12 } : undefined}
                    renderItem={({ item }: { item: any }) => {
                        if (layoutMode === 'grid') {
                            return (
                                <TouchableOpacity
                                    onPress={() =>
                                        router.push({
                                            pathname: '/(tabs)/library/family/[family]/genus/[genusNormalized]',
                                            params: {
                                                family: String(family ?? ''),
                                                genusNormalized: String(item.genusNormalized),
                                                ...passthrough,
                                                layout: layoutMode,
                                            },
                                        })
                                    }
                                    style={{
                                        backgroundColor: theme.card,
                                        borderRadius: 20,
                                        overflow: 'hidden',
                                        flex: 1,
                                        borderWidth: 1,
                                        borderColor: theme.border,
                                        shadowColor: isDark ? '#000000' : '#1a1a18',
                                        shadowOpacity: 0.05,
                                        shadowRadius: 10,
                                        shadowOffset: { width: 0, height: 2 },
                                    }}
                                >
                                    <View style={{ height: 110, width: '100%', backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
                                        <PlantImage uri={item.samplePlant?.imageUrl} size="100%" borderRadius={0} />
                                    </View>
                                    <View style={{ padding: 12, gap: 2 }}>
                                        <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text }} numberOfLines={1}>
                                            {item.genus}
                                        </Text>
                                        <Text style={{ fontSize: 11, color: theme.textSecondary, fontStyle: 'italic', marginBottom: 4 }} numberOfLines={1}>
                                            {item.samplePlant?.commonName ?? item.samplePlant?.scientificName}
                                        </Text>
                                        <Text style={{ fontSize: 10, color: theme.textMuted, fontWeight: '500' }} numberOfLines={1}>
                                            {item.speciesCount} species · {item.plantCount} plants
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        }

                        return (
                            <TouchableOpacity
                                onPress={() =>
                                    router.push({
                                        pathname: '/(tabs)/library/family/[family]/genus/[genusNormalized]',
                                        params: {
                                            family: String(family ?? ''),
                                            genusNormalized: String(item.genusNormalized),
                                            ...passthrough,
                                            layout: layoutMode,
                                        },
                                    })
                                }
                                style={{ backgroundColor: theme.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                            >
                                <PlantImage uri={item.samplePlant?.imageUrl ?? undefined} size={52} borderRadius={14} />
                                <View style={{ flex: 1, gap: 4 }}>
                                    <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{item.genus}</Text>
                                    <Text style={{ fontSize: 12, color: theme.textSecondary }} numberOfLines={1}>
                                        {item.samplePlant?.commonName ?? item.samplePlant?.scientificName ?? ''}
                                    </Text>
                                    <Text style={{ fontSize: 11, color: theme.textMuted }}>
                                        {item.speciesCount} species • {item.plantCount} plants
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                    ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                    contentContainerStyle={{ paddingVertical: 12, paddingBottom: 100, paddingHorizontal: layoutMode === 'grid' ? 4 : 12 }}
                />
            )}
        </View>
    );
}
