import { Image } from 'expo-image';
import { View } from 'react-native';
import { Leaf } from 'lucide-react-native';
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
            <View
                style={{ width: size, height: size, borderRadius }}
                className="bg-green-100 justify-center items-center"
            >
                <Leaf size={size * 0.4} stroke="#16a34a" />
            </View>
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
