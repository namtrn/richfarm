import { Image } from 'expo-image';
import { View } from 'react-native';
import { Leaf } from 'lucide-react-native';
import { useTheme } from '../../lib/theme';

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
    const theme = useTheme();

    if (!uri) {
        if (!showPlaceholder) return null;
        return (
            <View
                style={{
                    width: size,
                    height: size,
                    borderRadius,
                    backgroundColor: theme.accent,
                    justifyContent: 'center',
                    alignItems: 'center',
                }}
            >
                <Leaf size={size * 0.4} stroke={theme.primary} />
            </View>
        );
    }

    return (
        <Image
            source={{ uri }}
            style={{
                width: size,
                height: size,
                borderRadius,
                backgroundColor: theme.accent,
            }}
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
