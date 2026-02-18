import { Image } from 'expo-image';
import { YStack, Text } from 'tamagui';
import { Leaf } from '@tamagui/lucide-icons';
import { StyleSheet } from 'react-native';

interface PlantImageProps {
    uri?: string | null;
    size?: number;
    borderRadius?: number;
    showPlaceholder?: boolean;
}

const blurhash = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4'; // green-tinted placeholder

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
            style={[
                styles.image,
                { width: size, height: size, borderRadius },
            ]}
            placeholder={{ blurhash }}
            contentFit="cover"
            // disk + memory cache — load từ cache khi offline
            cachePolicy="disk"
            transition={200}
        />
    );
}

// Variant nhỏ cho danh sách
export function PlantImageSmall({ uri }: { uri?: string | null }) {
    return <PlantImage uri={uri} size={44} borderRadius={22} />;
}

// Variant lớn cho detail screen
export function PlantImageLarge({ uri }: { uri?: string | null }) {
    return <PlantImage uri={uri} size={200} borderRadius={16} />;
}

const styles = StyleSheet.create({
    image: {
        backgroundColor: '#e8f5e9',
    },
});
