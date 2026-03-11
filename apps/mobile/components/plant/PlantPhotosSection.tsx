import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Image,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PlantLocalData } from '../../lib/plantLocalData';
import { useTheme } from '../../lib/theme';

type Props = {
    localData: PlantLocalData;
    localLoading: boolean;
    error: string | null;
    canEdit: boolean;
    localSaving: boolean;
    onAddPhoto: () => void;
    onRemovePhoto: (id: string) => void;
    formatDate: (value?: number) => string;
};

export function PlantPhotosSection({
    localData,
    localLoading,
    error,
    canEdit,
    localSaving,
    onAddPhoto,
    onRemovePhoto,
    formatDate,
}: Props) {
    const { t } = useTranslation();
    const theme = useTheme();

    const confirmRemove = (id: string) => {
        Alert.alert(
            t('common.confirm'),
            t('common.confirm_delete'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.delete'), style: 'destructive', onPress: () => onRemovePhoto(id) },
            ]
        );
    };

    return (
        <View style={{ backgroundColor: theme.card, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <View>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 }}>{t('plant.photos_title')}</Text>
                    <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2, fontWeight: '500' }}>{t('plant.local_only')}</Text>
                </View>
                <TouchableOpacity
                    onPress={onAddPhoto}
                    disabled={!canEdit || localSaving}
                    style={{ backgroundColor: theme.primary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, opacity: (!canEdit || localSaving) ? 0.6 : 1 }}
                >
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '500' }}>{t('plant.photos_add')}</Text>
                </TouchableOpacity>
            </View>
            {localLoading ? (
                <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={theme.primary} />
                </View>
            ) : localData.photos.length === 0 ? (
                <Text style={{ fontSize: 13, color: theme.textMuted, fontStyle: 'italic' }}>{t('plant.photos_empty')}</Text>
            ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row' }}>
                        {localData.photos.map((photo, index) => (
                            <View key={photo.id} style={{ marginRight: index === localData.photos.length - 1 ? 0 : 16 }}>
                                <Image
                                    source={{ uri: photo.uri }}
                                    style={{ width: 140, height: 140, borderRadius: 10, backgroundColor: theme.accent, borderWidth: 1, borderColor: theme.border }}
                                />
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                    <Text style={{ fontSize: 11, color: theme.textSecondary, fontWeight: '500' }}>
                                        {formatDate(photo.date)}
                                    </Text>
                                    <TouchableOpacity onPress={() => confirmRemove(photo.id)} style={{ padding: 4 }}>
                                        <Text style={{ fontSize: 11, color: theme.danger, fontWeight: '500' }}>{t('plant.photos_remove')}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                </ScrollView>
            )}
            {error && (
                <View style={{ marginTop: 12, padding: 8, backgroundColor: theme.dangerBg, borderRadius: 8 }}>
                    <Text style={{ fontSize: 11, color: theme.danger, fontWeight: '500' }}>{error}</Text>
                </View>
            )}
        </View>
    );
}
