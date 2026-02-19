import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    Modal,
    Pressable,
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
    modalOpen: boolean;
    harvestQuantity: string;
    harvestUnit: string;
    harvestNote: string;
    harvestDate: string;
    onOpenModal: () => void;
    onCloseModal: () => void;
    onChangeQuantity: (v: string) => void;
    onChangeUnit: (v: string) => void;
    onChangeNote: (v: string) => void;
    onChangeDate: (v: string) => void;
    onSave: () => void;
    onRemove: (id: string) => void;
    formatDate: (value?: number) => string;
};

export function PlantHarvestSection({
    localData,
    localLoading,
    error,
    canEdit,
    localSaving,
    modalOpen,
    harvestQuantity,
    harvestUnit,
    harvestNote,
    harvestDate,
    onOpenModal,
    onCloseModal,
    onChangeQuantity,
    onChangeUnit,
    onChangeNote,
    onChangeDate,
    onSave,
    onRemove,
    formatDate,
}: Props) {
    const { t } = useTranslation();

    const confirmRemove = (id: string) => {
        Alert.alert(
            t('common.confirm'),
            t('common.confirm_delete'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.delete'), style: 'destructive', onPress: () => onRemove(id) },
            ]
        );
    };

    return (
        <>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <View>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.harvest_title')}</Text>
                        <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{t('plant.local_only')}</Text>
                    </View>
                    <TouchableOpacity
                        onPress={onOpenModal}
                        disabled={!canEdit || localSaving}
                        style={{ backgroundColor: '#16a34a', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, opacity: (!canEdit || localSaving) ? 0.6 : 1 }}
                    >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('plant.harvest_add')}</Text>
                    </TouchableOpacity>
                </View>
                {localLoading ? (
                    <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                        <ActivityIndicator size="small" color="#16a34a" />
                    </View>
                ) : localData.harvests.length === 0 ? (
                    <Text style={{ fontSize: 12, color: '#9ca3af' }}>{t('plant.harvest_empty')}</Text>
                ) : (
                    <View style={{ gap: 10 }}>
                        {localData.harvests.map((entry) => {
                            const quantityLine = [entry.quantity, entry.unit].filter(Boolean).join(' ');
                            return (
                                <View key={entry.id} style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: 10 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                                            {quantityLine || '--'}
                                        </Text>
                                        <Text style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(entry.date)}</Text>
                                    </View>
                                    {!!entry.note && (
                                        <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{entry.note}</Text>
                                    )}
                                    <TouchableOpacity onPress={() => confirmRemove(entry.id)}>
                                        <Text style={{ fontSize: 11, color: '#b91c1c', marginTop: 6 }}>{t('common.delete')}</Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </View>
                )}
                {error && (
                    <Text style={{ fontSize: 11, color: '#b91c1c', marginTop: 8 }}>{error}</Text>
                )}
            </View>

            <Modal
                visible={modalOpen}
                transparent
                animationType="slide"
                onRequestClose={onCloseModal}
            >
                <Pressable
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
                    onPress={onCloseModal}
                />
                <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 12 }}>
                    <View style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: '#e5e7eb', alignSelf: 'center' }} />
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>{t('plant.harvest_add')}</Text>

                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.harvest_date_label')}</Text>
                    <TextInput
                        value={harvestDate}
                        onChangeText={onChangeDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#9ca3af"
                        style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
                    />

                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.harvest_quantity_label')}</Text>
                    <TextInput
                        value={harvestQuantity}
                        onChangeText={onChangeQuantity}
                        placeholder={t('plant.harvest_quantity_placeholder')}
                        placeholderTextColor="#9ca3af"
                        style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
                    />

                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.harvest_unit_label')}</Text>
                    <TextInput
                        value={harvestUnit}
                        onChangeText={onChangeUnit}
                        placeholder={t('plant.harvest_unit_placeholder')}
                        placeholderTextColor="#9ca3af"
                        style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
                    />

                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.harvest_note_label')}</Text>
                    <TextInput
                        value={harvestNote}
                        onChangeText={onChangeNote}
                        placeholder={t('plant.harvest_note_placeholder')}
                        placeholderTextColor="#9ca3af"
                        style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
                    />

                    <TouchableOpacity
                        disabled={!canEdit || localSaving}
                        onPress={onSave}
                        style={{ backgroundColor: '#16a34a', borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: (!canEdit || localSaving) ? 0.6 : 1 }}
                    >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{t('plant.harvest_save')}</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        </>
    );
}
