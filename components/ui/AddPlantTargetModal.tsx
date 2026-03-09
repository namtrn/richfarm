import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../lib/theme';

export type AddPlantTargetMode = 'planning' | 'growing';

type BedOption = {
  _id: string;
  name: string;
};

type Props = {
  visible: boolean;
  beds: BedOption[];
  isGardener?: boolean;
  initialMode?: AddPlantTargetMode;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (selection: { mode: AddPlantTargetMode; bedId?: string }) => Promise<void> | void;
};

export function AddPlantTargetModal({
  visible,
  beds,
  isGardener = false,
  initialMode = 'planning',
  loading = false,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [mode, setMode] = useState<AddPlantTargetMode>(initialMode);
  const [selectedBedId, setSelectedBedId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!visible) return;
    setMode(initialMode);
    setSelectedBedId(undefined);
  }, [visible, initialMode]);

  const canConfirm = isGardener || mode === 'planning' || !!selectedBedId;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} />
      <View
        style={{
          backgroundColor: theme.card,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 40,
          gap: 20,
        }}
      >
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: 'center', marginBottom: -4 }} />
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>
            {t('library.add_target_title', { defaultValue: 'Add this plant to' })}
          </Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary }}>
            {isGardener
              ? t('library.add_target_subtitle_gardener', { defaultValue: 'Add it directly to My Plants.' })
              : t('library.add_target_subtitle', { defaultValue: 'Choose whether to save it for planning or place it directly in a growing bed.' })}
          </Text>
        </View>

        {!isGardener && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {([
              { key: 'planning', label: t('garden.tab_planning', { defaultValue: 'Planning' }) },
              { key: 'growing', label: t('garden.tab_growing', { defaultValue: 'Growing' }) },
            ] as const).map((option) => {
              const active = option.key === mode;
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => setMode(option.key)}
                  style={{
                    flex: 1,
                    borderRadius: 16,
                    paddingVertical: 14,
                    alignItems: 'center',
                    backgroundColor: active ? theme.primary : theme.accent,
                    borderWidth: 1,
                    borderColor: active ? theme.primary : theme.border,
                  }}
                >
                  <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '800', fontSize: 14 }}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {!isGardener && mode === 'growing' && (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('plant.bed_label', { defaultValue: 'Bed' })}
            </Text>
            {beds.length === 0 ? (
              <View style={{ backgroundColor: theme.warningBg, borderRadius: 14, borderWidth: 1, borderColor: theme.warning, padding: 14 }}>
                <Text style={{ fontSize: 13, color: theme.warning }}>
                  {t('library.add_target_no_beds', { defaultValue: 'No beds available yet. Choose Planning first, or create a bed before starting Growing.' })}
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {beds.map((bed) => {
                  const active = bed._id === selectedBedId;
                  return (
                    <TouchableOpacity
                      key={bed._id}
                      onPress={() => setSelectedBedId(bed._id)}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 20,
                        backgroundColor: active ? theme.primary : theme.background,
                        borderWidth: 1,
                        borderColor: active ? theme.primary : theme.border,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : theme.textSecondary }}>
                        {bed.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            onPress={onClose}
            style={{ flex: 1, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: theme.border }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textSecondary }}>
              {t('common.cancel')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={!canConfirm || loading}
            onPress={() => void onConfirm({ mode: isGardener ? 'planning' : mode, bedId: !isGardener && mode === 'growing' ? selectedBedId : undefined })}
            style={{
              flex: 1,
              backgroundColor: theme.primary,
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: 'center',
              opacity: !canConfirm || loading ? 0.6 : 1,
            }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                {t('library.add_target_confirm', { defaultValue: 'Add plant' })}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
