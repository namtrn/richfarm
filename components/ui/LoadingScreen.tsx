import { View, Text, ActivityIndicator } from 'react-native';
import { Leaf } from 'lucide-react-native';

interface LoadingScreenProps {
    message?: string;
}

export function LoadingScreen({ message = 'Đang tải...' }: LoadingScreenProps) {
    return (
        <View className="flex-1 justify-center items-center bg-white dark:bg-gray-950 gap-y-4">
            <View className="w-20 h-20 bg-green-500 rounded-full justify-center items-center">
                <Leaf size={40} stroke="white" />
            </View>
            <Text className="text-2xl font-bold text-green-900 dark:text-green-100">Richfarm</Text>
            <ActivityIndicator size="large" color="#16a34a" />
            <Text className="text-sm text-gray-400">{message}</Text>
        </View>
    );
}
