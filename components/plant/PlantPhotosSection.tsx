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
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <View>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.photos_title')}</Text>
                    <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{t('plant.local_only')}</Text>
                </View>
                <TouchableOpacity
                    onPress={onAddPhoto}
                    disabled={!canEdit || localSaving}
                    style={{ backgroundColor: '#16a34a', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, opacity: (!canEdit || localSaving) ? 0.6 : 1 }}
                >
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('plant.photos_add')}</Text>
                </TouchableOpacity>
            </View>
            {localLoading ? (
                <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#16a34a" />
                </View>
            ) : localData.photos.length === 0 ? (
                <Text style={{ fontSize: 12, color: '#9ca3af' }}>{t('plant.photos_empty')}</Text>
            ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row' }}>
                        {localData.photos.map((photo, index) => (
                            <View key={photo.id} style={{ marginRight: index === localData.photos.length - 1 ? 0 : 12 }}>
                                <Image
                                    source={{ uri: photo.uri }}
                                    style={{ width: 120, height: 120, borderRadius: 12, backgroundColor: '#f3f4f6' }}
                                />
                                <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
                                    {formatDate(photo.date)}
                                </Text>
                                <TouchableOpacity onPress={() => confirmRemove(photo.id)}>
                                    <Text style={{ fontSize: 10, color: '#b91c1c', marginTop: 2 }}>{t('plant.photos_remove')}</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                </ScrollView>
            )}
            {error && (
                <Text style={{ fontSize: 11, color: '#b91c1c', marginTop: 8 }}>{error}</Text>
            )}
        </View>
    );
}
