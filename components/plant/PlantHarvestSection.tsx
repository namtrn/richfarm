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
import { useTheme } from '../../lib/theme';

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
    const theme = useTheme();

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
            <View style={{ backgroundColor: theme.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <View>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('plant.harvest_title')}</Text>
                        <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2, fontWeight: '500' }}>{t('plant.local_only')}</Text>
                    </View>
                    <TouchableOpacity
                        onPress={onOpenModal}
                        disabled={!canEdit || localSaving}
                        style={{ backgroundColor: theme.primary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, opacity: (!canEdit || localSaving) ? 0.6 : 1 }}
                    >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{t('plant.harvest_add')}</Text>
                    </TouchableOpacity>
                </View>
                {localLoading ? (
                    <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                        <ActivityIndicator size="small" color={theme.primary} />
                    </View>
                ) : localData.harvests.length === 0 ? (
                    <Text style={{ fontSize: 13, color: theme.textMuted, fontStyle: 'italic' }}>{t('plant.harvest_empty')}</Text>
                ) : (
                    <View style={{ gap: 12 }}>
                        {localData.harvests.map((entry) => {
                            const quantityLine = [entry.quantity, entry.unit].filter(Boolean).join(' ');
                            return (
                                <View key={entry.id} style={{ backgroundColor: theme.background, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.border }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={{ fontSize: 15, fontWeight: '800', color: theme.text }}>
                                            {quantityLine || '--'}
                                        </Text>
                                        <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: '500' }}>{formatDate(entry.date)}</Text>
                                    </View>
                                    {!!entry.note && (
                                        <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 6, lineHeight: 18 }}>{entry.note}</Text>
                                    )}
                                    <TouchableOpacity onPress={() => confirmRemove(entry.id)} style={{ alignSelf: 'flex-end', marginTop: 10 }}>
                                        <Text style={{ fontSize: 12, color: theme.danger, fontWeight: '700' }}>{t('common.delete')}</Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </View>
                )}
                {error && (
                    <View style={{ marginTop: 12, padding: 8, backgroundColor: theme.dangerBg, borderRadius: 8 }}>
                        <Text style={{ fontSize: 11, color: theme.danger, fontWeight: '500' }}>{error}</Text>
                    </View>
                )}
            </View>

            <Modal
                visible={modalOpen}
                transparent
                animationType="slide"
                onRequestClose={onCloseModal}
            >
                <Pressable
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
                    onPress={onCloseModal}
                />
                <View style={{ backgroundColor: theme.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 20 }}>
                    <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: 'center', marginBottom: -4 }} />
                    <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>{t('plant.harvest_add')}</Text>

                    <View style={{ gap: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('plant.harvest_date_label')}</Text>
                        <TextInput
                            value={harvestDate}
                            onChangeText={onChangeDate}
                            placeholder={t('plant.expected_harvest_placeholder')}
                            placeholderTextColor={theme.textMuted}
                            style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                        />
                    </View>

                    <View style={{ flexDirection: 'row', gap: 12 }}>
                        <View style={{ flex: 1, gap: 8 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('plant.harvest_quantity_label')}</Text>
                            <TextInput
                                value={harvestQuantity}
                                onChangeText={onChangeQuantity}
                                placeholder={t('plant.harvest_quantity_placeholder')}
                                placeholderTextColor={theme.textMuted}
                                keyboardType="numeric"
                                style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                            />
                        </View>
                        <View style={{ flex: 1, gap: 8 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('plant.harvest_unit_label')}</Text>
                            <TextInput
                                value={harvestUnit}
                                onChangeText={onChangeUnit}
                                placeholder={t('plant.harvest_unit_placeholder')}
                                placeholderTextColor={theme.textMuted}
                                style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                            />
                        </View>
                    </View>

                    <View style={{ gap: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('plant.harvest_note_label')}</Text>
                        <TextInput
                            value={harvestNote}
                            onChangeText={onChangeNote}
                            placeholder={t('plant.harvest_note_placeholder')}
                            placeholderTextColor={theme.textMuted}
                            multiline
                            style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text, minHeight: 80, textAlignVertical: 'top' }}
                        />
                    </View>

                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                        <TouchableOpacity
                            onPress={onCloseModal}
                            style={{ flex: 1, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: theme.border }}
                        >
                            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textSecondary }}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            disabled={!canEdit || localSaving}
                            onPress={onSave}
                            style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: (!canEdit || localSaving) ? 0.6 : 1 }}
                        >
                            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{t('plant.harvest_save')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </>
    );
}
