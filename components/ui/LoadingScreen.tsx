import { YStack, Spinner, Text } from 'tamagui';
import { Leaf } from '@tamagui/lucide-icons';

interface LoadingScreenProps {
    message?: string;
}

export function LoadingScreen({ message = 'Đang tải...' }: LoadingScreenProps) {
    return (
        <YStack
            flex={1}
            justifyContent="center"
            alignItems="center"
            backgroundColor="$background"
            space="$4"
        >
            <YStack
                width={80}
                height={80}
                backgroundColor="$accent5"
                borderRadius={40}
                justifyContent="center"
                alignItems="center"
            >
                <Leaf size={40} color="white" />
            </YStack>

            <Text fontSize="$6" fontWeight="bold" color="$accent10">
                Richfarm
            </Text>

            <Spinner size="large" color="$accent8" />

            <Text fontSize="$3" color="$gray10">
                {message}
            </Text>
        </YStack>
    );
}
