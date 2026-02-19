import { useMemo } from 'react';
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
import type { PlantLocalData, PlantActivityType } from '../../lib/plantLocalData';

type Props = {
    localData: PlantLocalData;
    localLoading: boolean;
    error: string | null;
    canEdit: boolean;
    localSaving: boolean;
    modalOpen: boolean;
    activityType: PlantActivityType;
    activityNote: string;
    activityDate: string;
    onOpenModal: () => void;
    onCloseModal: () => void;
    onChangeType: (type: PlantActivityType) => void;
    onChangeNote: (note: string) => void;
    onChangeDate: (date: string) => void;
    onSave: () => void;
    onRemove: (id: string) => void;
    formatDate: (value?: number) => string;
};

export function PlantActivitySection({
    localData,
    localLoading,
    error,
    canEdit,
    localSaving,
    modalOpen,
    activityType,
    activityNote,
    activityDate,
    onOpenModal,
    onCloseModal,
    onChangeType,
    onChangeNote,
    onChangeDate,
    onSave,
    onRemove,
    formatDate,
}: Props) {
    const { t } = useTranslation();

    const activityLabels = useMemo(
        () => ({
            watering: t('plant.activity_type_watering'),
            fertilizing: t('plant.activity_type_fertilizing'),
            pruning: t('plant.activity_type_pruning'),
            custom: t('plant.activity_type_custom'),
        }),
        [t]
    );

    const activityOptions: { key: PlantActivityType; label: string }[] = [
        { key: 'watering', label: activityLabels.watering },
        { key: 'fertilizing', label: activityLabels.fertilizing },
        { key: 'pruning', label: activityLabels.pruning },
        { key: 'custom', label: activityLabels.custom },
    ];

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
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.activity_title')}</Text>
                        <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{t('plant.local_only')}</Text>
                    </View>
                    <TouchableOpacity
                        onPress={onOpenModal}
                        disabled={!canEdit || localSaving}
                        style={{ backgroundColor: '#16a34a', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, opacity: (!canEdit || localSaving) ? 0.6 : 1 }}
                    >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('plant.activity_add')}</Text>
                    </TouchableOpacity>
                </View>
                {localLoading ? (
                    <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                        <ActivityIndicator size="small" color="#16a34a" />
                    </View>
                ) : localData.activities.length === 0 ? (
                    <Text style={{ fontSize: 12, color: '#9ca3af' }}>{t('plant.activity_empty')}</Text>
                ) : (
                    <View style={{ gap: 10 }}>
                        {localData.activities.map((entry) => (
                            <View key={entry.id} style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: 10 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                                        {activityLabels[entry.type] ?? activityLabels.custom}
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
                        ))}
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
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>{t('plant.activity_add')}</Text>

                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.activity_type_label')}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {activityOptions.map((option) => {
                            const active = option.key === activityType;
                            return (
                                <TouchableOpacity
                                    key={option.key}
                                    onPress={() => onChangeType(option.key)}
                                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? '#16a34a' : '#f3f4f6' }}
                                >
                                    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#374151' }}>{option.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.activity_date_label')}</Text>
                    <TextInput
                        value={activityDate}
                        onChangeText={onChangeDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#9ca3af"
                        style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
                    />

                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{t('plant.activity_note_label')}</Text>
                    <TextInput
                        value={activityNote}
                        onChangeText={onChangeNote}
                        placeholder={t('plant.activity_note_placeholder')}
                        placeholderTextColor="#9ca3af"
                        style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
                    />

                    <TouchableOpacity
                        disabled={!canEdit || localSaving}
                        onPress={onSave}
                        style={{ backgroundColor: '#16a34a', borderRadius: 14, paddingVertical: 12, alignItems: 'center', opacity: (!canEdit || localSaving) ? 0.6 : 1 }}
                    >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{t('plant.activity_save')}</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        </>
    );
}
