import { Image } from 'expo-image';
import { YStack } from 'tamagui';
import { Leaf } from '@tamagui/lucide-icons';
import { StyleSheet } from 'react-native';

interface PlantImageProps {
    uri?: string | null;
    size?: number;
    borderRadius?: number;
    showPlaceholder?: boolean;
}

// Blurhash xanh lá — placeholder trong khi ảnh load
const PLANT_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

export function PlantImage({
    uri,
    size = 80,
    borderRadius = 12,
    showPlaceholder = true,
}: PlantImageProps) {
    if (!uri) {
        if (!showPlaceholder) return null;
        return (
            <YStack
                width={size}
                height={size}
                borderRadius={borderRadius}
                backgroundColor="$accent3"
                justifyContent="center"
                alignItems="center"
            >
                <Leaf size={size * 0.4} color="$accent8" />
            </YStack>
        );
    }

    return (
        <Image
            source={{ uri }}
            style={[styles.image, { width: size, height: size, borderRadius }]}
            placeholder={{ blurhash: PLANT_BLURHASH }}
            contentFit="cover"
            cachePolicy="disk"
            transition={200}
        />
    );
}

export function PlantImageSmall({ uri }: { uri?: string | null }) {
    return <PlantImage uri={uri} size={44} borderRadius={22} />;
}

export function PlantImageLarge({ uri }: { uri?: string | null }) {
    return <PlantImage uri={uri} size={200} borderRadius={16} />;
}

const styles = StyleSheet.create({
    image: {
        backgroundColor: '#e8f5e9',
    },
});
