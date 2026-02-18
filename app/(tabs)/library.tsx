import { useState, useMemo } from 'react';
import {
    YStack,
    XStack,
    Text,
    ScrollView,
    Card,
    Spinner,
    Input,
    Button,
} from 'tamagui';
import { Search, BookOpen } from '@tamagui/lucide-icons';
import { usePlantLibrary, usePlantGroups } from '../../hooks/usePlantLibrary';
import { PlantImage } from '../../components/ui/PlantImage';

const GROUP_LABELS: Record<string, string> = {
    herbs: 'Rau thơm',
    vegetables: 'Rau củ',
    fruits: 'Cây ăn quả',
    nightshades: 'Họ cà',
    alliums: 'Họ hành',
    leafy_greens: 'Rau lá xanh',
    roots: 'Củ rễ',
    legumes: 'Họ đậu',
    indoor: 'Cây trong nhà',
    flowers: 'Hoa',
};

export default function LibraryScreen() {
    const [search, setSearch] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<string | undefined>(undefined);

    const { plants, isLoading } = usePlantLibrary(selectedGroup);
    const { groups } = usePlantGroups();

    const filtered = useMemo(() => {
        if (!search.trim()) return plants;
        const q = search.toLowerCase();
        return plants.filter((p) =>
            p.commonNames.some((n: { name: string }) =>
                n.name.toLowerCase().includes(q)
            )
        );
    }, [plants, search]);

    return (
        <YStack flex={1} backgroundColor="$background">
            {/* Header */}
            <YStack paddingHorizontal="$4" paddingTop="$5" paddingBottom="$3" space="$3">
                <XStack alignItems="center" space="$2">
                    <BookOpen size={24} color="$accent9" />
                    <Text fontSize="$8" fontWeight="bold">
                        Thư viện cây
                    </Text>
                </XStack>
                <Text fontSize="$3" color="$gray10">
                    {plants.length} loài cây trong cơ sở dữ liệu
                </Text>

                {/* Search bar */}
                <XStack
                    backgroundColor="$gray3"
                    borderRadius="$4"
                    alignItems="center"
                    paddingHorizontal="$3"
                    space="$2"
                >
                    <Search size={16} color="$gray9" />
                    <Input
                        flex={1}
                        placeholder="Tìm cây..."
                        value={search}
                        onChangeText={setSearch}
                        backgroundColor="transparent"
                        borderWidth={0}
                        fontSize="$4"
                        placeholderTextColor="$gray9"
                    />
                </XStack>
            </YStack>

            {/* Group filter chips */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                paddingHorizontal="$4"
                paddingBottom="$3"
            >
                <XStack space="$2">
                    <Button
                        size="$2"
                        borderRadius="$10"
                        theme={selectedGroup === undefined ? 'accent' : undefined}
                        onPress={() => setSelectedGroup(undefined)}
                    >
                        Tất cả
                    </Button>
                    {groups.map((g) => (
                        <Button
                            key={g.key}
                            size="$2"
                            borderRadius="$10"
                            theme={selectedGroup === g.key ? 'accent' : undefined}
                            onPress={() =>
                                setSelectedGroup(selectedGroup === g.key ? undefined : g.key)
                            }
                        >
                            {GROUP_LABELS[g.key] ?? g.displayName?.vi ?? g.key}
                        </Button>
                    ))}
                </XStack>
            </ScrollView>

            {/* Content */}
            {isLoading ? (
                <YStack flex={1} justifyContent="center" alignItems="center">
                    <Spinner size="large" color="$accent8" />
                </YStack>
            ) : filtered.length === 0 ? (
                <YStack flex={1} justifyContent="center" alignItems="center" space="$3">
                    <BookOpen size={48} color="$gray7" />
                    <Text fontSize="$5" color="$gray9" fontWeight="600">
                        {search ? 'Không tìm thấy cây nào' : 'Chưa có cây trong thư viện'}
                    </Text>
                    {!!search && (
                        <Text fontSize="$3" color="$gray8">
                            Thử tìm với từ khóa khác
                        </Text>
                    )}
                </YStack>
            ) : (
                <ScrollView flex={1} showsVerticalScrollIndicator={false}>
                    <YStack padding="$4" space="$3">
                        {filtered.map((plant) => (
                            <PlantCard key={plant._id} plant={plant} />
                        ))}
                    </YStack>
                </ScrollView>
            )}
        </YStack>
    );
}

function PlantCard({ plant }: { plant: any }) {
    const viName = plant.commonNames?.find((n: any) => n.locale === 'vi')?.name;
    const enName = plant.commonNames?.find((n: any) => n.locale === 'en')?.name;

    return (
        <Card elevate bordered padding="$3" borderRadius="$4">
            <XStack space="$3" alignItems="center">
                <PlantImage uri={plant.imageUrl} size={56} borderRadius={12} />
                <YStack flex={1} space="$1">
                    <Text fontSize="$5" fontWeight="700" numberOfLines={1}>
                        {viName ?? enName ?? 'Chưa có tên'}
                    </Text>
                    {enName && viName && (
                        <Text fontSize="$2" color="$gray9" numberOfLines={1}>
                            {enName}
                        </Text>
                    )}
                    <XStack space="$2" alignItems="center">
                        <GroupBadge groupKey={plant.group} />
                        {!plant.imageUrl && (
                            <Text fontSize="$1" color="$gray8">
                                (chưa có ảnh)
                            </Text>
                        )}
                    </XStack>
                </YStack>
            </XStack>
        </Card>
    );
}

function GroupBadge({ groupKey }: { groupKey: string }) {
    return (
        <XStack
            backgroundColor="$accent3"
            paddingHorizontal="$2"
            paddingVertical="$1"
            borderRadius="$3"
        >
            <Text fontSize="$1" color="$accent10" fontWeight="600">
                {GROUP_LABELS[groupKey] ?? groupKey}
            </Text>
        </XStack>
    );
}
