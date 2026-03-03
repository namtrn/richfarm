import { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Pressable,
  PanResponder,
  Animated,
  StyleSheet,
} from 'react-native';
import { Bell, Check, Droplets, Scissors, Sprout, Plus, Pencil, Trash2, Power, X } from 'lucide-react-native';
import { useReminders } from '../../hooks/useReminders';
import { usePlants } from '../../hooks/usePlants';
import { useBeds } from '../../hooks/useBeds';
import { useAuth } from '../../lib/auth';
import { useTranslation } from 'react-i18next';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import { formatVolume, formatVolumeValue, getVolumeUnitLabel, parseVolumeInput } from '../../lib/units';
import { useTheme } from '../../lib/theme';

const REMINDER_ICONS: Record<string, any> = {
  watering: Droplets,
  pruning: Scissors,
  fertilizing: Sprout,
  harvest: Sprout,
  soil_refresh: Sprout,
  custom: Bell,
  default: Bell,
};

const REMINDER_TYPES = [
  { key: 'watering', labelKey: 'reminder.type_watering' },
  { key: 'fertilizing', labelKey: 'reminder.type_fertilizing' },
  { key: 'pruning', labelKey: 'reminder.type_pruning' },
  { key: 'harvest', labelKey: 'reminder.type_harvest' },
  { key: 'soil_refresh', labelKey: 'reminder.type_soil_refresh' },
  { key: 'custom', labelKey: 'reminder.type_custom' },
];

function formatDateInput(value?: number) {
  if (!value) return '';
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTimeInput(value?: number) {
  if (!value) return '08:00';
  const d = new Date(value);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function parseDateTime(dateStr: string, timeStr: string) {
  const dParts = dateStr.split('-').map((v) => Number(v));
  const tParts = timeStr.split(':').map((v) => Number(v));
  if (dParts.length !== 3 || tParts.length !== 2) return undefined;
  const [y, m, d] = dParts;
  const [hh, mm] = tParts;
  if (!y || !m || !d) return undefined;
  const date = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.getTime();
}

function isValidDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map((v) => Number(v));
  if (!y || !m || !d) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function isValidTimeString(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hh, mm] = value.split(':').map((v) => Number(v));
  if (hh < 0 || hh > 23) return false;
  if (mm < 0 || mm > 59) return false;
  return true;
}

function ReminderCard({
  reminder,
  onComplete,
  canEdit,
}: {
  reminder: any;
  onComplete: () => void;
  canEdit: boolean;
}) {
  const { i18n } = useTranslation();
  const { t } = useTranslation();
  const theme = useTheme();
  const unitSystem = useUnitSystem();
  const Icon = REMINDER_ICONS[reminder.type] ?? REMINDER_ICONS.default;
  const time = new Date(reminder.nextRunAt).toLocaleTimeString(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const amountLabel = reminder.waterLiters ? formatVolume(reminder.waterLiters, unitSystem) : '';
  const displayTitle = useMemo(() => {
    const title = reminder.title ?? '';
    if (/^planted:\s*/i.test(title)) {
      return t('reminder.seed_title_planted', { name: title.replace(/^planted:\s*/i, '') });
    }
    if (/^harvest:\s*/i.test(title)) {
      return t('reminder.seed_title_harvest', { name: title.replace(/^harvest:\s*/i, '') });
    }
    if (/^watering:\s*/i.test(title)) {
      return t('reminder.auto_title_watering');
    }
    return title;
  }, [reminder.title, t]);
  const displayDescription = useMemo(() => {
    const description = reminder.description ?? '';
    const plantedMatch = description.match(/^Planted on (\d{4}-\d{2}-\d{2})/);
    if (plantedMatch) {
      return t('reminder.seed_desc_planted', { date: plantedMatch[1] });
    }
    const harvestMatch = description.match(/^Expected harvest date (\d{4}-\d{2}-\d{2})/);
    if (harvestMatch) {
      return t('reminder.seed_desc_harvest', { date: harvestMatch[1] });
    }
    if (/^Auto reminder while plant is in growing stage\./i.test(description)) {
      return t('reminder.auto_desc_watering_growing');
    }
    return description;
  }, [reminder.description, t]);

  return (
    <View style={{
      backgroundColor: theme.card,
      borderRadius: 18,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#1a1a18',
      shadowOpacity: 0.05,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    }}>
      <View style={{ width: 44, height: 44, backgroundColor: theme.successBg, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }}>
        <Icon size={22} color={theme.success} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{displayTitle}</Text>
        {displayDescription && (
          <Text style={{ fontSize: 12, color: theme.textSecondary }}>{displayDescription}</Text>
        )}
        <Text style={{ fontSize: 12, color: theme.textMuted }}>{amountLabel ? `${time} • ${amountLabel}` : time}</Text>
      </View>
      <TouchableOpacity
        disabled={!canEdit}
        onPress={onComplete}
        style={{
          width: 38,
          height: 38,
          backgroundColor: theme.success,
          borderRadius: 999,
          justifyContent: 'center',
          alignItems: 'center',
          opacity: !canEdit ? 0.5 : 1
        }}
      >
        <Check size={20} color="white" />
      </TouchableOpacity>
    </View>
  );
}

function ReminderFormModal({
  visible,
  reminder,
  plants,
  beds,
  canEdit,
  onClose,
  onSave,
}: {
  visible: boolean;
  reminder: any | null;
  plants: any[];
  beds: any[];
  canEdit: boolean;
  onClose: () => void;
  onSave: (payload: {
    reminderId?: string;
    userPlantId?: string;
    bedId?: string;
    type: string;
    title: string;
    description?: string;
    nextRunAt: number;
    rrule?: string;
    enabled?: boolean;
    waterLiters?: number;
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const unitSystem = useUnitSystem();
  const [title, setTitle] = useState(reminder?.title ?? '');
  // ... rest of state initialization
  const [description, setDescription] = useState(reminder?.description ?? '');
  const [type, setType] = useState(reminder?.type ?? 'watering');
  const [dateStr, setDateStr] = useState(formatDateInput(reminder?.nextRunAt));
  const [timeStr, setTimeStr] = useState(formatTimeInput(reminder?.nextRunAt));
  const [repeatDays, setRepeatDays] = useState(() => {
    if (!reminder?.rrule) return '';
    const match = reminder.rrule.match(/INTERVAL=(\d+)/);
    return match?.[1] ?? '';
  });
  const [target, setTarget] = useState<'none' | 'plant' | 'bed'>(() => {
    if (reminder?.userPlantId) return 'plant';
    if (reminder?.bedId) return 'bed';
    return 'none';
  });
  const [selectedPlant, setSelectedPlant] = useState<string | undefined>(reminder?.userPlantId);
  const [selectedBed, setSelectedBed] = useState<string | undefined>(reminder?.bedId);
  const [enabled, setEnabled] = useState(reminder?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [dateError, setDateError] = useState('');
  const [timeError, setTimeError] = useState('');
  const [waterAmount, setWaterAmount] = useState(
    reminder?.waterLiters ? formatVolumeValue(reminder.waterLiters, unitSystem) : ''
  );

  useEffect(() => {
    setTitle(reminder?.title ?? '');
    setDescription(reminder?.description ?? '');
    setType(reminder?.type ?? 'watering');
    setDateStr(formatDateInput(reminder?.nextRunAt));
    setTimeStr(formatTimeInput(reminder?.nextRunAt));
    setRepeatDays(() => {
      if (!reminder?.rrule) return '';
      const match = reminder.rrule.match(/INTERVAL=(\d+)/);
      return match?.[1] ?? '';
    });
    setTarget(() => {
      if (reminder?.userPlantId) return 'plant';
      if (reminder?.bedId) return 'bed';
      return 'none';
    });
    setSelectedPlant(reminder?.userPlantId);
    setSelectedBed(reminder?.bedId);
    setEnabled(reminder?.enabled ?? true);
    setDateError('');
    setTimeError('');
    setWaterAmount(reminder?.waterLiters ? formatVolumeValue(reminder.waterLiters, unitSystem) : '');
  }, [reminder, unitSystem]);

  const pan = useRef(new Animated.ValueXY()).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          pan.setValue({ x: 0, y: gestureState.dy });
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 120 || gestureState.vy > 0.5) {
          onClose();
          Animated.timing(pan, { toValue: { x: 0, y: 500 }, duration: 200, useNativeDriver: false }).start();
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      pan.setValue({ x: 0, y: 0 });
    }
  }, [visible, pan]);

  const handleSave = async () => {
    if (!canEdit || !title.trim()) return;
    const dateValid = isValidDateString(dateStr);
    const timeValid = isValidTimeString(timeStr);
    if (!dateValid || !timeValid) {
      setDateError(dateValid ? '' : t('reminder.error_date'));
      setTimeError(timeValid ? '' : t('reminder.error_time'));
      return;
    }
    const nextRunAt = parseDateTime(dateStr, timeStr);
    if (!nextRunAt) return;
    const interval = Number(repeatDays);
    const rrule = interval && interval > 0 ? `FREQ=DAILY;INTERVAL=${interval}` : undefined;
    const waterLiters = type === 'watering' ? parseVolumeInput(waterAmount, unitSystem) : undefined;

    setSaving(true);
    try {
      await onSave({
        reminderId: reminder?._id,
        userPlantId: target === 'plant' ? selectedPlant : undefined,
        bedId: target === 'bed' ? selectedBed : undefined,
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        nextRunAt,
        rrule,
        enabled,
        waterLiters,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          {...panResponder.panHandlers}
          style={{
            backgroundColor: theme.card,
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 40,
            transform: [{ translateY: pan.y }],
          }}
        >
          <View style={{ width: 40, height: 5, backgroundColor: theme.border, borderRadius: 2.5, alignSelf: 'center', marginBottom: 20 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>
              {reminder ? t('reminder.form_title_edit') : t('reminder.form_title_create')}
            </Text>
            <TouchableOpacity onPress={onClose} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} stroke={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {!canEdit && (
            <View style={{ backgroundColor: theme.warningBg, borderRadius: 14, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: theme.warning }}>
              <Text style={{ fontSize: 13, color: theme.warning }}>{t('reminder.auth_warning')}</Text>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }} contentContainerStyle={{ gap: 16, paddingBottom: 20 }}>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('reminder.form_title_label')}</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={t('reminder.form_title_placeholder')}
                placeholderTextColor={theme.textMuted}
                testID="e2e-reminder-form-title-input"
                style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('reminder.form_desc_label')}</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder={t('reminder.form_desc_placeholder')}
                placeholderTextColor={theme.textMuted}
                style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('reminder.form_type_label')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {REMINDER_TYPES.map((typeItem) => {
                  const active = typeItem.key === type;
                  return (
                    <TouchableOpacity
                      key={typeItem.key}
                      onPress={() => setType(typeItem.key)}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? theme.primary : theme.accent, borderWidth: 1, borderColor: active ? theme.primary : theme.border }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : theme.textSecondary }}>{t(typeItem.labelKey)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('reminder.form_date_label')}</Text>
                <TextInput
                  value={dateStr}
                  onChangeText={(value) => { setDateStr(value); setDateError(''); }}
                  placeholder={t('reminder.form_date_placeholder')}
                  placeholderTextColor={theme.textMuted}
                  testID="e2e-reminder-form-date-input"
                  style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: dateError ? theme.danger : theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                />
                {!!dateError && (
                  <Text style={{ fontSize: 11, color: theme.danger }}>{dateError}</Text>
                )}
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('reminder.form_time_label')}</Text>
                <TextInput
                  value={timeStr}
                  onChangeText={(value) => { setTimeStr(value); setTimeError(''); }}
                  placeholder={t('reminder.form_time_placeholder')}
                  placeholderTextColor={theme.textMuted}
                  testID="e2e-reminder-form-time-input"
                  style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: timeError ? theme.danger : theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                />
                {!!timeError && (
                  <Text style={{ fontSize: 11, color: theme.danger }}>{timeError}</Text>
                )}
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('reminder.form_repeat_label')}</Text>
              <TextInput
                value={repeatDays}
                onChangeText={setRepeatDays}
                placeholder={t('reminder.form_repeat_placeholder')}
                placeholderTextColor={theme.textMuted}
                keyboardType="numeric"
                style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
              />
            </View>

            {type === 'watering' && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('reminder.form_amount_label')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TextInput
                    value={waterAmount}
                    onChangeText={setWaterAmount}
                    placeholder={t('reminder.form_amount_placeholder', { unit: getVolumeUnitLabel(unitSystem) })}
                    placeholderTextColor={theme.textMuted}
                    keyboardType="numeric"
                    style={{ flex: 1, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                  />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textSecondary }}>{getVolumeUnitLabel(unitSystem)}</Text>
                </View>
              </View>
            )}

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('reminder.form_target_label')}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                {['none', 'plant', 'bed'].map((key) => {
                  const active = target === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setTarget(key as any)}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? theme.primary : theme.accent, borderWidth: 1, borderColor: active ? theme.primary : theme.border }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : theme.textSecondary }}>{t(`reminder.target_${key}`)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {target === 'plant' && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {plants.map((p) => {
                    const active = selectedPlant === p._id;
                    return (
                      <TouchableOpacity
                        key={p._id}
                        onPress={() => setSelectedPlant(p._id)}
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? theme.primary : theme.accent, borderWidth: 1, borderColor: active ? theme.primary : theme.border }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : theme.textSecondary }}>{p.displayName ?? p.scientificName ?? t('reminder.unnamed_plant')}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {target === 'bed' && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {beds.map((b) => {
                    const active = selectedBed === b._id;
                    return (
                      <TouchableOpacity
                        key={b._id}
                        onPress={() => setSelectedBed(b._id)}
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? theme.primary : theme.accent, borderWidth: 1, borderColor: active ? theme.primary : theme.border }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : theme.textSecondary }}>{b.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            <TouchableOpacity
              onPress={() => setEnabled((v: boolean) => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: enabled ? theme.successBg : theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Power size={16} color={enabled ? theme.success : theme.textMuted} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{enabled ? t('reminder.enabled') : t('reminder.disabled')}</Text>
            </TouchableOpacity>
          </ScrollView>

          <TouchableOpacity
            disabled={!canEdit || saving || !title.trim() || !!dateError || !!timeError}
            onPress={handleSave}
            testID="e2e-reminder-form-save"
            style={{ backgroundColor: theme.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: (!canEdit || saving || !title.trim() || !!dateError || !!timeError) ? 0.5 : 1, marginTop: 8 }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 }}>{t('reminder.form_save')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default function ReminderScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const unitSystem = useUnitSystem();
  const { reminders, todayReminders, isLoading, completeReminder, createReminder, updateReminder, deleteReminder, toggleReminder } = useReminders();
  const { plants } = usePlants();
  const { beds } = useBeds();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const canEdit = !isAuthLoading && isAuthenticated;
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);

  const plantMap = useMemo(() => new Map(plants.map((p) => [p._id, p])), [plants]);
  const bedMap = useMemo(() => new Map(beds.map((b) => [b._id, b])), [beds]);

  const sortedReminders = useMemo(() => {
    return [...reminders].sort((a, b) => a.nextRunAt - b.nextRunAt);
  }, [reminders]);

  const normalizeText = (value?: string) =>
    (value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const isPlantedReminder = (reminder: any) => {
    const title = normalizeText(reminder?.title);
    const description = normalizeText(reminder?.description);
    return (
      title.includes('planted:') ||
      description.includes('planted on') ||
      title.includes('da trong:') ||
      description.includes('da trong vao')
    );
  };

  const historyReminders = useMemo(() => {
    return sortedReminders.filter((r: any) => isPlantedReminder(r));
  }, [sortedReminders]);

  const upcomingReminders = useMemo(() => {
    return sortedReminders.filter((r: any) => !isPlantedReminder(r));
  }, [sortedReminders]);

  const getStage = (reminder: any): 'planning' | 'growing' | null => {
    if (!reminder?.userPlantId) return null;
    const linkedPlant = plantMap.get(reminder.userPlantId);
    if (!linkedPlant) return null;
    if (linkedPlant.status === 'planning' || linkedPlant.status === 'planting') return 'planning';
    if (linkedPlant.status === 'growing') return 'growing';
    return null;
  };

  const getDisplayTitle = (reminder: any) => {
    const title = reminder?.title ?? '';
    if (/^planted:\s*/i.test(title)) {
      return t('reminder.seed_title_planted', { name: title.replace(/^planted:\s*/i, '') });
    }
    if (/^harvest:\s*/i.test(title)) {
      return t('reminder.seed_title_harvest', { name: title.replace(/^harvest:\s*/i, '') });
    }
    if (/^watering:\s*/i.test(title)) {
      return t('reminder.auto_title_watering');
    }
    return title;
  };

  const getDisplayDescription = (reminder: any) => {
    const description = reminder?.description ?? '';
    const plantedMatch = description.match(/^Planted on (\d{4}-\d{2}-\d{2})/i);
    if (plantedMatch) {
      return t('reminder.seed_desc_planted', { date: plantedMatch[1] });
    }
    const harvestMatch = description.match(/^Expected harvest date (\d{4}-\d{2}-\d{2})/i);
    if (harvestMatch) {
      return t('reminder.seed_desc_harvest', { date: harvestMatch[1] });
    }
    if (/^Auto reminder while plant is in growing stage\./i.test(description)) {
      return t('reminder.auto_desc_watering_growing');
    }
    return description;
  };

  const handleSave = async (payload: any) => {
    if (payload.reminderId) {
      await updateReminder(payload.reminderId, {
        userPlantId: payload.userPlantId,
        bedId: payload.bedId,
        type: payload.type,
        title: payload.title,
        description: payload.description,
        nextRunAt: payload.nextRunAt,
        rrule: payload.rrule,
        enabled: payload.enabled,
        waterLiters: payload.waterLiters,
      });
      return;
    }
    await createReminder({
      userPlantId: payload.userPlantId,
      bedId: payload.bedId,
      type: payload.type,
      title: payload.title,
      description: payload.description,
      nextRunAt: payload.nextRunAt,
      rrule: payload.rrule,
      waterLiters: payload.waterLiters,
    });
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 0, gap: 16, paddingBottom: 100 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>
            {t('reminder.title')}
          </Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary }}>
            {t('reminder.subtitle')}
          </Text>
        </View>
        <TouchableOpacity
          disabled={!canEdit}
          onPress={() => { setEditing(null); setFormOpen(true); }}
          testID="e2e-reminder-add-button"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: theme.primary,
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 8,
            opacity: !canEdit ? 0.5 : 1
          }}
        >
          <Plus size={16} color="white" />
          <Text style={{ color: 'white', fontSize: 13, fontWeight: '700' }}>
            {t('reminder.add_button')}
          </Text>
        </TouchableOpacity>
      </View>

      {!isAuthLoading && !isAuthenticated && (
        <View style={{ backgroundColor: theme.warningBg, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: theme.warning }}>
          <Text style={{ fontSize: 13, color: theme.warning, fontWeight: '500' }}>
            {t('reminder.auth_warning')}
          </Text>
        </View>
      )}

      {isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={theme.primary} />
        </View>
      ) : todayReminders.length === 0 ? (
        <View style={{
          backgroundColor: theme.card,
          borderRadius: 20,
          padding: 32,
          borderWidth: 1,
          borderColor: theme.border,
          alignItems: 'center',
          gap: 12,
          shadowColor: '#1a1a18',
          shadowOpacity: 0.04,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 2 },
        }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Bell size={26} color={theme.textMuted} />
          </View>
          <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text }}>
            {t('reminder.no_reminders')}
          </Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 }}>
            {t('reminder.no_reminders_desc')}
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 }}>
            {t('reminder.today_label', { count: todayReminders.length })}
          </Text>
          {todayReminders.map((reminder: any) => (
            <ReminderCard
              key={reminder._id}
              reminder={reminder}
              onComplete={() => completeReminder(reminder._id)}
              canEdit={canEdit}
            />
          ))}
        </View>
      )}

      <View style={{ gap: 10, marginTop: 4 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 }}>
          {t('reminder.all_label')}
        </Text>
        {upcomingReminders.length === 0 ? (
          <Text style={{ fontSize: 13, color: theme.textMuted, fontStyle: 'italic', paddingLeft: 4 }}>
            {t('reminder.none_all')}
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {upcomingReminders.map((r) => {
              const Icon = REMINDER_ICONS[r.type] ?? REMINDER_ICONS.default;
              const time = new Date(r.nextRunAt).toLocaleString(i18n.language, {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
              });
              const amountLabel = r.waterLiters ? formatVolume(r.waterLiters, unitSystem) : '';
              const targetLabel = r.userPlantId
                ? plantMap.get(r.userPlantId)?.displayName ?? plantMap.get(r.userPlantId)?.scientificName ?? t('reminder.target_plant')
                : r.bedId
                  ? bedMap.get(r.bedId)?.name ?? t('reminder.target_bed')
                  : t('reminder.target_none');
              const stage = getStage(r);
              const stageLabel = stage === 'planning'
                ? t('garden.tab_planning')
                : stage === 'growing'
                  ? t('garden.tab_growing')
                  : null;
              const stageColor = stage === 'planning' ? theme.warning : theme.success;
              const stageBg = stage === 'planning' ? theme.warningBg : theme.successBg;

              return (
                <View
                  key={r._id}
                  style={{
                    backgroundColor: theme.card,
                    borderRadius: 18,
                    padding: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderWidth: 1,
                    borderColor: theme.border,
                    shadowColor: '#1a1a18',
                    shadowOpacity: 0.05,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 2 },
                  }}
                >
                  <View style={{ width: 44, height: 44, backgroundColor: theme.successBg, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }}>
                    <Icon size={20} color={theme.success} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }} numberOfLines={1}>
                      {getDisplayTitle(r)}
                    </Text>
                    {!!stageLabel && (
                      <View style={{ marginTop: 2, alignSelf: 'flex-start', backgroundColor: stageBg, borderRadius: 999, borderWidth: 1, borderColor: stageColor, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: stageColor, letterSpacing: 0.3, textTransform: 'uppercase' }}>
                          {stageLabel}
                        </Text>
                      </View>
                    )}
                    <Text style={{ fontSize: 12, color: theme.textSecondary }} numberOfLines={1}>
                      {amountLabel ? `${time} • ${amountLabel} • ${targetLabel}` : `${time} • ${targetLabel}`}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity
                      onPress={() => toggleReminder(r._id)}
                      disabled={!canEdit}
                      style={{ width: 34, height: 34, backgroundColor: theme.accent, borderRadius: 10, justifyContent: 'center', alignItems: 'center', opacity: !canEdit ? 0.5 : 1 }}
                    >
                      <Power size={16} color={r.enabled ? theme.success : theme.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setEditing(r); setFormOpen(true); }}
                      disabled={!canEdit}
                      style={{ width: 34, height: 34, backgroundColor: theme.accent, borderRadius: 10, justifyContent: 'center', alignItems: 'center', opacity: !canEdit ? 0.5 : 1 }}
                    >
                      <Pencil size={16} color={theme.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setConfirmDelete(r)}
                      disabled={!canEdit}
                      style={{ width: 34, height: 34, backgroundColor: theme.dangerBg, borderRadius: 10, justifyContent: 'center', alignItems: 'center', opacity: !canEdit ? 0.5 : 1 }}
                    >
                      <Trash2 size={16} color={theme.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={{ gap: 10, marginTop: 4 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 }}>
          {t('reminder.history_label')}
        </Text>
        {historyReminders.length === 0 ? (
          <Text style={{ fontSize: 13, color: theme.textMuted, fontStyle: 'italic', paddingLeft: 4 }}>
            {t('reminder.none_history')}
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {historyReminders.map((r) => {
              const Icon = REMINDER_ICONS[r.type] ?? REMINDER_ICONS.default;
              const completedOrScheduledAt = r.lastRunAt ?? r.nextRunAt;
              const time = completedOrScheduledAt
                ? new Date(completedOrScheduledAt).toLocaleString(i18n.language, {
                  hour: '2-digit',
                  minute: '2-digit',
                  day: '2-digit',
                  month: '2-digit',
                })
                : '—';
              const amountLabel = r.waterLiters ? formatVolume(r.waterLiters, unitSystem) : '';
              const targetLabel = r.userPlantId
                ? plantMap.get(r.userPlantId)?.displayName ?? plantMap.get(r.userPlantId)?.scientificName ?? t('reminder.target_plant')
                : r.bedId
                  ? bedMap.get(r.bedId)?.name ?? t('reminder.target_bed')
                  : t('reminder.target_none');
              const statusLabel = r.lastRunAt
                ? t('reminder.status_completed')
                : t('reminder.status_scheduled');
              const description = getDisplayDescription(r).trim();
              return (
                <View
                  key={`history-${r._id}`}
                  style={{
                    backgroundColor: theme.card,
                    borderRadius: 18,
                    padding: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderWidth: 1,
                    borderColor: theme.border,
                    opacity: 0.85,
                  }}
                >
                  <View style={{ width: 44, height: 44, backgroundColor: theme.accent, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }}>
                    <Icon size={20} color={theme.textMuted} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }} numberOfLines={1}>
                      {getDisplayTitle(r)}
                    </Text>
                    {!!description && (
                      <Text style={{ fontSize: 12, color: theme.textSecondary }} numberOfLines={2}>
                        {description}
                      </Text>
                    )}
                    <Text style={{ fontSize: 12, color: theme.textSecondary }} numberOfLines={1}>
                      {amountLabel
                        ? `${statusLabel}: ${time} • ${amountLabel} • ${targetLabel}`
                        : `${statusLabel}: ${time} • ${targetLabel}`}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <ReminderFormModal
        visible={formOpen}
        reminder={editing}
        plants={plants}
        beds={beds}
        canEdit={canEdit}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />

      <Modal visible={!!confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setConfirmDelete(null)} />
        <View style={{ position: 'absolute', left: 32, right: 32, top: '40%', backgroundColor: theme.card, borderRadius: 24, padding: 24, shadowColor: '#1a1a18', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 4 } }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text, marginBottom: 8, letterSpacing: -0.4 }}>
            {t('reminder.confirm_delete_title')}
          </Text>
          <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 24, lineHeight: 20 }}>
            {t('reminder.confirm_delete_desc')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => setConfirmDelete(null)}
              style={{ flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: theme.textSecondary }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                const target = confirmDelete;
                setConfirmDelete(null);
                if (!target) return;
                await deleteReminder(target._id);
              }}
              style={{ flex: 1, backgroundColor: theme.danger, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{t('common.delete')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
