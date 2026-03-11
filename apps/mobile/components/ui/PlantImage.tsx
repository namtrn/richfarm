import { Image } from 'expo-image';
import { View } from 'react-native';
import { Leaf } from 'lucide-react-native';
import { useTheme } from '../../lib/theme';

interface PlantImageProps {
    uri?: string | null;
    size?: number | string;
    borderRadius?: number;
    showPlaceholder?: boolean;
    style?: any;
}

// Blurhash xanh lá — placeholder trong khi ảnh load
const PLANT_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

export function PlantImage({
    uri,
    size = 80,
    borderRadius = 12,
    showPlaceholder = true,
    style,
}: PlantImageProps) {
    const theme = useTheme();

    if (!uri) {
        if (!showPlaceholder) return null;
        return (
            <View
                style={[
                    {
                        width: size,
                        height: size,
                        borderRadius,
                        backgroundColor: theme.accent,
                        justifyContent: 'center',
                        alignItems: 'center',
                    },
                    style,
                ]}
            >
                <Leaf size={typeof size === 'number' ? size * 0.4 : 32} stroke={theme.primary} />
            </View>
        );
    }

    return (
        <Image
            source={{ uri }}
            style={[
                {
                    width: size,
                    height: size,
                    borderRadius,
                    backgroundColor: theme.accent,
                },
                style,
            ]}
            placeholder={{ blurhash: PLANT_BLURHASH }}
            contentFit="cover"
            cachePolicy="disk"
            transition={200}
        />
    );
}

export function PlantImageSmall({ uri }: { uri?: string | null }) {
    return <PlantImage uri={uri} size={44} borderRadius={12} />;
}

export function PlantImageLarge({ uri }: { uri?: string | null }) {
    return <PlantImage uri={uri} size={200} borderRadius={12} />;
}
