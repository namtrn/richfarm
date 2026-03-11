import { View, Text, ActivityIndicator } from 'react-native';
import { Leaf } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../lib/theme';

interface LoadingScreenProps {
    message?: string;
}

export function LoadingScreen({ message }: LoadingScreenProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const loadingMessage = message ?? t('common.loading');

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background, gap: 16 }}>
            <View style={{ width: 80, height: 80, backgroundColor: theme.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}>
                <Leaf size={40} stroke="white" />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '500', color: theme.text }}>Richfarm</Text>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={{ fontSize: 14, color: theme.textSecondary }}>{loadingMessage}</Text>
        </View>
    );
}
