import { useState, useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Modal,
} from 'react-native';
import { Search, BookOpen, X, Droplets, Sun, Clock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { usePlantLibrary, usePlantGroups } from '../../hooks/usePlantLibrary';
import { PlantImage } from '../../components/ui/PlantImage';

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

const LIGHT_LABELS: Record<string, { label: string; color: string }> = {
    full_sun: { label: 'Full Sun', color: '#f59e0b' },
    partial_shade: { label: 'Part Shade', color: '#84cc16' },
    shade: { label: 'Shade', color: '#6b7280' },
};

// ─── Plant Detail Modal ───────────────────────────────────────────────────────
function PlantDetailModal({ plant, onClose }: { plant: any; onClose: () => void }) {
    const { i18n } = useTranslation();
    const locale = i18n.language;
    const viName = plant.commonNames?.find((n: any) => n.locale === 'vi')?.name;
    const enName = plant.commonNames?.find((n: any) => n.locale === 'en')?.name;
    const localName = plant.commonNames?.find((n: any) => n.locale === locale)?.name ?? enName ?? viName;
    const light = LIGHT_LABELS[plant.lightRequirements ?? ''];

    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
                <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, maxHeight: '85%' }}>
                    {/* Handle */}
                    <View style={{ width: 40, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Header */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                            <View style={{ flex: 1, gap: 4 }}>
                                <Text style={{ fontSize: 22, fontWeight: '800', color: '#111827' }}>{localName}</Text>
                                {localName !== enName && enName && (
                                    <Text style={{ fontSize: 14, color: '#9ca3af' }}>{enName}</Text>
                                )}
                                <Text style={{ fontSize: 12, color: '#d1d5db', fontStyle: 'italic' }}>{plant.scientificName}</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
                                <X size={20} stroke="#6b7280" />
                            </TouchableOpacity>
                        </View>

                        {/* Image */}
                        <View style={{ alignItems: 'center', marginBottom: 20 }}>
                            <PlantImage uri={plant.imageUrl} size={120} borderRadius={20} />
                        </View>

                        {/* Description */}
                        {!!plant.description && (
                            <View style={{ backgroundColor: '#f9fafb', borderRadius: 14, padding: 14, marginBottom: 16 }}>
                                <Text style={{ fontSize: 14, color: '#374151', lineHeight: 22 }}>{plant.description}</Text>
                            </View>
                        )}

                        {/* Stats grid */}
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                            {plant.typicalDaysToHarvest && (
                                <StatCard
                                    icon={<Clock size={18} stroke="#22c55e" />}
                                    label="Harvest"
                                    value={`${plant.typicalDaysToHarvest}d`}
                                />
                            )}
                            {plant.wateringFrequencyDays && (
                                <StatCard
                                    icon={<Droplets size={18} stroke="#3b82f6" />}
                                    label="Watering"
                                    value={`Every ${plant.wateringFrequencyDays}d`}
                                />
                            )}
                            {plant.lightRequirements && (
                                <StatCard
                                    icon={<Sun size={18} stroke="#f59e0b" />}
                                    label="Light"
                                    value={light?.label ?? plant.lightRequirements}
                                />
                            )}
                        </View>

                        {/* Germination */}
                        {plant.germinationDays > 0 && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
                                <Text style={{ fontSize: 14, color: '#6b7280' }}>Germination</Text>
                                <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>{plant.germinationDays} days</Text>
                            </View>
                        )}
                        {plant.spacingCm && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
                                <Text style={{ fontSize: 14, color: '#6b7280' }}>Spacing</Text>
                                <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>{plant.spacingCm} cm</Text>
                            </View>
                        )}
                        {plant.source && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
                                <Text style={{ fontSize: 14, color: '#6b7280' }}>Propagation</Text>
                                <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827', textTransform: 'capitalize' }}>{plant.source}</Text>
                            </View>
                        )}

                        {/* Purposes */}
                        {plant.purposes?.length > 0 && (
                            <View style={{ marginTop: 16 }}>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Uses</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                    {plant.purposes.map((p: string) => (
                                        <View key={p} style={{ backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                                            <Text style={{ fontSize: 12, color: '#3b82f6', fontWeight: '500', textTransform: 'capitalize' }}>
                                                {p.replace(/_/g, ' ')}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <View style={{ flex: 1, backgroundColor: '#f9fafb', borderRadius: 14, padding: 12, alignItems: 'center', gap: 6 }}>
            {icon}
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>{value}</Text>
            <Text style={{ fontSize: 11, color: '#9ca3af' }}>{label}</Text>
        </View>
    );
}

// ─── Plant Card ───────────────────────────────────────────────────────────────
function PlantCard({ plant, onPress }: { plant: any; onPress: () => void }) {
    const { i18n } = useTranslation();
    const locale = i18n.language;
    const localName = plant.commonNames?.find((n: any) => n.locale === locale)?.name
        ?? plant.commonNames?.find((n: any) => n.locale === 'en')?.name
        ?? plant.commonNames?.[0]?.name
        ?? '—';
    const enName = plant.commonNames?.find((n: any) => n.locale === 'en')?.name;
    const groupIcon = GROUP_ICONS[plant.group] ?? '🌱';

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            style={{
                backgroundColor: '#fff',
                borderRadius: 16,
                padding: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderWidth: 1,
                borderColor: '#f3f4f6',
                shadowColor: '#000',
                shadowOpacity: 0.04,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 1 },
            }}
        >
            <View style={{ width: 52, height: 52, backgroundColor: '#f0fdf4', borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 26 }}>{groupIcon}</Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }} numberOfLines={1}>{localName}</Text>
                {enName && localName !== enName && (
                    <Text style={{ fontSize: 12, color: '#9ca3af' }} numberOfLines={1}>{enName}</Text>
                )}
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <View style={{ backgroundColor: '#f0fdf4', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 11, color: '#16a34a', fontWeight: '600' }}>
                            {plant.group.replace(/_/g, ' ')}
                        </Text>
                    </View>
                    {plant.typicalDaysToHarvest && (
                        <Text style={{ fontSize: 11, color: '#d1d5db' }}>🕐 {plant.typicalDaysToHarvest}d</Text>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function LibraryScreen() {
    const { t, i18n } = useTranslation();
    const locale = i18n.language;
    const [search, setSearch] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<string | undefined>(undefined);
    const [selectedPlant, setSelectedPlant] = useState<any>(null);

    const { plants, isLoading } = usePlantLibrary(selectedGroup);
    const { groups } = usePlantGroups();

    const filtered = useMemo(() => {
        if (!search.trim()) return plants;
        const q = search.toLowerCase();
        return plants.filter((p) =>
            p.commonNames.some((n: { name: string }) => n.name.toLowerCase().includes(q)) ||
            p.scientificName?.toLowerCase().includes(q)
        );
    }, [plants, search]);

    return (
        <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
            {/* Header */}
            <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <BookOpen size={24} stroke="#16a34a" />
                    <Text style={{ fontSize: 30, fontWeight: '800', color: '#111827' }}>{t('library.title')}</Text>
                </View>
                <Text style={{ fontSize: 13, color: '#6b7280' }}>
                    {plants.length} {plants.length === 1 ? 'species' : 'species'} in database
                </Text>

                {/* Search */}
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 12, gap: 8, borderWidth: 1, borderColor: '#e5e7eb' }}>
                    <Search size={16} stroke="#9ca3af" />
                    <TextInput
                        style={{ flex: 1, paddingVertical: 12, fontSize: 15, color: '#111827' }}
                        placeholder={t('library.search_placeholder')}
                        placeholderTextColor="#9ca3af"
                        value={search}
                        onChangeText={setSearch}
                    />
                    {!!search && (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <X size={16} stroke="#9ca3af" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Group filter chips */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ paddingLeft: 16, marginBottom: 8 }}
                contentContainerStyle={{ gap: 8, paddingRight: 16 }}
            >
                <TouchableOpacity
                    onPress={() => setSelectedGroup(undefined)}
                    style={{
                        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                        backgroundColor: selectedGroup === undefined ? '#22c55e' : '#fff',
                        borderWidth: 1,
                        borderColor: selectedGroup === undefined ? '#22c55e' : '#e5e7eb',
                    }}
                >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: selectedGroup === undefined ? '#fff' : '#374151' }}>
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
                                backgroundColor: active ? '#22c55e' : '#fff',
                                borderWidth: 1,
                                borderColor: active ? '#22c55e' : '#e5e7eb',
                                flexDirection: 'row', alignItems: 'center', gap: 5,
                            }}
                        >
                            <Text style={{ fontSize: 14 }}>{GROUP_ICONS[g.key] ?? '🌱'}</Text>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : '#374151' }}>{label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {/* Content */}
            {isLoading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#22c55e" />
                </View>
            ) : filtered.length === 0 ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                    <BookOpen size={48} stroke="#d1d5db" />
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#9ca3af' }}>
                        {search ? t('library.no_results') : 'No plants in library'}
                    </Text>
                    {!!search && (
                        <Text style={{ fontSize: 13, color: '#d1d5db' }}>Try a different search term</Text>
                    )}
                </View>
            ) : (
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}>
                    {filtered.map((plant) => (
                        <PlantCard key={plant._id} plant={plant} onPress={() => setSelectedPlant(plant)} />
                    ))}
                </ScrollView>
            )}

            {/* Detail modal */}
            {selectedPlant && (
                <PlantDetailModal plant={selectedPlant} onClose={() => setSelectedPlant(null)} />
            )}
        </View>
    );
}
