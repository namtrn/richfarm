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
  Alert,
} from 'react-native';
import { Bell, Check, Clock3, Droplets, Scissors, Sprout, Plus, Pencil, Trash2, Power, X } from 'lucide-react-native';
import { usePathname, useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { useReminders } from '../../hooks/useReminders';
import { usePlants } from '../../hooks/usePlants';
import { useBeds } from '../../hooks/useBeds';
import { useAuth } from '../../lib/auth';
import { useTranslation } from 'react-i18next';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import { formatVolume, formatVolumeValue, getVolumeUnitLabel, parseVolumeInput } from '../../lib/units';
import { useTheme } from '../../lib/theme';
import { useAppMode } from '../../hooks/useAppMode';
import { useDeviceId } from '../../lib/deviceId';
import { api } from '../../../../packages/convex/convex/_generated/api';
import { getE2ENow } from '../../lib/e2eTime';

const E2E_REMINDER_MODE = process.env.EXPO_PUBLIC_E2E_REMINDER_MODE === 'mock';

const REMINDER_ICONS: Record<string, any> = {
  watering: Droplets,
  pruning: Scissors,
  fertilizing: Sprout,
  harvest: Sprout,
  soil_refresh: Sprout,
  garden_check: Bell,
  custom: Bell,
  default: Bell,
};

const REMINDER_TYPES = [
  { key: 'watering', labelKey: 'reminder.type_watering' },
  { key: 'fertilizing', labelKey: 'reminder.type_fertilizing' },
  { key: 'pruning', labelKey: 'reminder.type_pruning' },
  { key: 'harvest', labelKey: 'reminder.type_harvest' },
  { key: 'soil_refresh', labelKey: 'reminder.type_soil_refresh' },
  { key: 'garden_check', labelKey: 'reminder.type_garden_check' },
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

type ReminderFilter = 'all' | 'overdue' | 'today' | 'upcoming' | 'completed';

type ReminderBatch = {
  key: string;
  title: string;
  subtitle: string;
  reminders: any[];
  overdueCount: number;
  nextRunAt: number;
};

function getDayBounds(reference = getE2ENow()) {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  const end = new Date(reference);
  end.setHours(23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
}

function buildTomorrowMorning(reference = getE2ENow()) {
  const next = new Date(reference);
  next.setDate(next.getDate() + 1);
  next.setHours(8, 0, 0, 0);
  return next.getTime();
}

function ReminderCard({
  reminder,
  onComplete,
  onSnooze,
  onSkip,
  canEdit,
  isOverdue,
}: {
  reminder: any;
  onComplete: () => void;
  onSnooze: () => void;
  onSkip: () => void;
  canEdit: boolean;
  isOverdue: boolean;
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
        {isOverdue && (
          <Text style={{ fontSize: 11, color: theme.warning, fontWeight: '700' }}>
            {t('reminder.filter_overdue', { defaultValue: 'Overdue' })}
          </Text>
        )}
        <Text style={{ fontSize: 12, color: theme.textMuted }}>{amountLabel ? `${time} • ${amountLabel}` : time}</Text>
      </View>
      <View style={{ gap: 8 }}>
        <TouchableOpacity
          disabled={!canEdit}
          onPress={onSnooze}
          style={{
            width: 38,
            height: 38,
            backgroundColor: theme.accent,
            borderRadius: 999,
            justifyContent: 'center',
            alignItems: 'center',
            opacity: !canEdit ? 0.5 : 1,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Clock3 size={18} color={theme.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          disabled={!canEdit}
          onPress={onSkip}
          style={{
            width: 38,
            height: 38,
            backgroundColor: theme.warningBg,
            borderRadius: 999,
            justifyContent: 'center',
            alignItems: 'center',
            opacity: !canEdit ? 0.5 : 1,
            borderWidth: 1,
            borderColor: theme.warning,
          }}
        >
          <X size={18} color={theme.warning} />
        </TouchableOpacity>
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
    </View>
  );
}

function ReminderBatchCard({
  batch,
  canEdit,
  onComplete,
  onSnooze,
  onSkip,
}: {
  batch: ReminderBatch;
  canEdit: boolean;
  onComplete: () => void;
  onSnooze: () => void;
  onSkip: () => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const primaryReminder = batch.reminders[0];
  const Icon = REMINDER_ICONS[primaryReminder?.type] ?? REMINDER_ICONS.default;
  const dueTime = new Date(batch.nextRunAt).toLocaleTimeString(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const previewNames = batch.reminders
    .map((reminder) => reminder.displayTarget)
    .filter(Boolean)
    .slice(0, 3);
  const remainingCount = Math.max(batch.reminders.length - previewNames.length, 0);

  return (
    <View
      style={{
        backgroundColor: theme.card,
        borderRadius: 18,
        padding: 14,
        gap: 12,
        borderWidth: 1,
        borderColor: batch.overdueCount > 0 ? theme.warning : theme.border,
        shadowColor: '#1a1a18',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, backgroundColor: theme.successBg, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }}>
          <Icon size={20} color={theme.success} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: theme.text }} numberOfLines={1}>
            {batch.title}
          </Text>
          <Text style={{ fontSize: 12, color: theme.textSecondary }} numberOfLines={2}>
            {batch.subtitle} • {dueTime}
          </Text>
          {batch.overdueCount > 0 && (
            <Text style={{ fontSize: 11, color: theme.warning, fontWeight: '700' }}>
              {t('reminder.batch_overdue_count', { count: batch.overdueCount })}
            </Text>
          )}
        </View>
      </View>

      {previewNames.length > 0 && (
        <Text style={{ fontSize: 12, color: theme.textMuted, lineHeight: 18 }}>
          {remainingCount > 0
            ? `${previewNames.join(', ')} +${remainingCount}`
            : previewNames.join(', ')}
        </Text>
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          disabled={!canEdit}
          onPress={onSnooze}
          style={{ flex: 1, minHeight: 40, borderRadius: 12, backgroundColor: theme.accent, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, opacity: !canEdit ? 0.5 : 1 }}
        >
          <Clock3 size={15} color={theme.textSecondary} />
          <Text style={{ fontSize: 12, fontWeight: '800', color: theme.textSecondary }}>
            {t('reminder.action_snooze')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={!canEdit}
          onPress={onSkip}
          style={{ flex: 1, minHeight: 40, borderRadius: 12, backgroundColor: theme.warningBg, borderWidth: 1, borderColor: theme.warning, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, opacity: !canEdit ? 0.5 : 1 }}
        >
          <X size={15} color={theme.warning} />
          <Text style={{ fontSize: 12, fontWeight: '800', color: theme.warning }}>
            {t('reminder.action_skip')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={!canEdit}
          onPress={onComplete}
          style={{ flex: 1, minHeight: 40, borderRadius: 12, backgroundColor: theme.success, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, opacity: !canEdit ? 0.5 : 1 }}
        >
          <Check size={16} color="#fff" />
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>
            {t('reminder.action_done')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ReminderFormModal({
  visible,
  reminder,
  plants,
  beds,
  canEdit,
  isGardener,
  onClose,
  onSave,
}: {
  visible: boolean;
  reminder: any | null;
  plants: any[];
  beds: any[];
  canEdit: boolean;
  isGardener: boolean;
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
  const [dateStr, setDateStr] = useState(formatDateInput(reminder?.nextRunAt ?? getE2ENow()));
  const [timeStr, setTimeStr] = useState(formatTimeInput(reminder?.nextRunAt ?? getE2ENow()));
  const [repeatDays, setRepeatDays] = useState(() => {
    if (!reminder?.rrule) return '';
    const match = reminder.rrule.match(/INTERVAL=(\d+)/);
    return match?.[1] ?? '';
  });
  const [target, setTarget] = useState<'none' | 'plant' | 'bed'>(() => {
    if (isGardener) {
      if (reminder?.bedId) return 'bed';
      if (reminder?.userPlantId) return 'plant';
      return 'plant';
    }
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
      if (isGardener) {
        if (reminder?.bedId) return 'bed';
        if (reminder?.userPlantId) return 'plant';
        return 'plant';
      }
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
  }, [reminder, unitSystem, isGardener]);

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
    const cleanTitle = title.trim() || (E2E_REMINDER_MODE ? 'E2E overdue harvest' : '');
    if (!canEdit || !cleanTitle) return;
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
        title: cleanTitle,
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
              {isGardener ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    { key: '', label: t('reminder.preset_once') },
                    { key: '1', label: t('reminder.preset_daily') },
                    { key: '2', label: t('reminder.preset_every_2_days') },
                    { key: '7', label: t('reminder.preset_weekly') },
                  ].map((preset) => {
                    const active = repeatDays === preset.key;
                    return (
                      <TouchableOpacity
                        key={preset.key || 'once'}
                        onPress={() => setRepeatDays(preset.key)}
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? theme.primary : theme.accent, borderWidth: 1, borderColor: active ? theme.primary : theme.border }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : theme.textSecondary }}>{preset.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <TextInput
                  value={repeatDays}
                  onChangeText={setRepeatDays}
                  placeholder={t('reminder.form_repeat_placeholder')}
                  placeholderTextColor={theme.textMuted}
                  keyboardType="numeric"
                  style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                />
              )}
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
              {!isGardener && (
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
              )}

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

              {!isGardener && target === 'bed' && (
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
            disabled={!canEdit || saving || (!title.trim() && !E2E_REMINDER_MODE) || !!dateError || !!timeError}
            onPress={handleSave}
            testID="e2e-reminder-form-save"
            style={{ backgroundColor: theme.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: (!canEdit || saving || (!title.trim() && !E2E_REMINDER_MODE) || !!dateError || !!timeError) ? 0.5 : 1, marginTop: 8 }}
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
  const { appMode } = useAppMode();
  const isGardener = appMode === 'gardener';
  const router = useRouter();
  const pathname = usePathname();
  const { reminders, todayReminders, isLoading, completeReminder, createReminder, updateReminder, deleteReminder, toggleReminder, snoozeReminder, skipReminder } = useReminders();
  const { plants } = usePlants();
  const { beds } = useBeds();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { deviceId } = useDeviceId();
  const gardens = useQuery(api.gardens.getGardens, deviceId ? { deviceId } : 'skip') ?? [];
  const canEdit = !isAuthLoading && (isAuthenticated || !!deviceId);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [filter, setFilter] = useState<ReminderFilter>('all');
  const [feedback, setFeedback] = useState<string | null>(null);

  const plantMap = useMemo(() => new Map(plants.map((p) => [String(p._id), p])), [plants]);
  const bedMap = useMemo(() => new Map(beds.map((b) => [String(b._id), b])), [beds]);
  const gardenMap = useMemo(() => new Map(gardens.map((garden: any) => [String(garden._id), garden])), [gardens]);
  const plantsByBed = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const plant of plants) {
      if (!plant?.bedId) continue;
      const key = String(plant.bedId);
      const list = map.get(key) ?? [];
      list.push(plant);
      map.set(key, list);
    }
    return map;
  }, [plants]);

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

  const completedReminders = useMemo(() => {
    return sortedReminders.filter((r: any) => isPlantedReminder(r) || (!!r.lastRunAt && !r.enabled));
  }, [sortedReminders]);

  const activeReminders = useMemo(() => {
    return sortedReminders.filter((r: any) => !isPlantedReminder(r) && r.enabled);
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

  const buildBedLabelForGardener = (bedId: string) => {
    const plantsInBed = plantsByBed.get(String(bedId)) ?? [];
    const names = plantsInBed
      .map((p) => p.displayName ?? p.scientificName)
      .filter(Boolean) as string[];
    if (names.length === 0) return t('reminder.target_bed_empty');
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  };

  const getTargetLabel = (reminder: any) => {
    if (reminder.userPlantId) {
      return plantMap.get(reminder.userPlantId)?.displayName
        ?? plantMap.get(reminder.userPlantId)?.scientificName
        ?? t('reminder.target_plant');
    }
    if (reminder.bedId) {
      if (isGardener) {
        return buildBedLabelForGardener(reminder.bedId);
      }
      return bedMap.get(reminder.bedId)?.name ?? t('reminder.target_bed');
    }
    return t('reminder.target_none');
  };

  const getReminderTypeLabel = (type?: string) => {
    const typeItem = REMINDER_TYPES.find((item) => item.key === type);
    return typeItem ? t(typeItem.labelKey) : t('reminder.type_custom');
  };

  const getBatchTarget = (reminder: any) => {
    const plant = reminder.userPlantId ? plantMap.get(reminder.userPlantId) : null;
    const plantGardenId = plant?.gardenId ? String(plant.gardenId) : undefined;
    if (plantGardenId) {
      return {
        key: `garden:${plantGardenId}`,
        label: gardenMap.get(plantGardenId)?.name ?? t('tabs.garden'),
      };
    }

    const directBedId = reminder.bedId ? String(reminder.bedId) : undefined;
    const plantBedId = plant?.bedId ? String(plant.bedId) : undefined;
    const bedId = directBedId ?? plantBedId;
    if (bedId) {
      const bed = bedMap.get(bedId);
      const bedGardenId = bed?.gardenId ? String(bed.gardenId) : undefined;
      if (bedGardenId && gardenMap.has(bedGardenId)) {
        return {
          key: `garden:${bedGardenId}:bed:${bedId}`,
          label: `${gardenMap.get(bedGardenId)?.name} • ${bed?.name ?? t('reminder.target_bed')}`,
        };
      }
      return {
        key: `bed:${bedId}`,
        label: bed?.name ?? t('reminder.target_bed'),
      };
    }

    if (plant) {
      return {
        key: `plant:${String(plant._id)}`,
        label: plant.nickname ?? plant.displayName ?? plant.scientificName ?? t('reminder.target_plant'),
      };
    }

    return { key: 'general', label: t('reminder.target_none') };
  };

  const buildReminderBatches = (sourceReminders: any[]) => {
    const map = new Map<string, ReminderBatch>();
    for (const reminder of sourceReminders) {
      if (isPlantedReminder(reminder)) continue;
      const day = formatDateInput(reminder.nextRunAt);
      const target = getBatchTarget(reminder);
      const typeLabel = getReminderTypeLabel(reminder.type);
      const key = `${day}:${target.key}:${reminder.type ?? 'custom'}`;
      const existing = map.get(key);
      const displayTarget = getTargetLabel(reminder);
      const nextReminder = { ...reminder, displayTarget };
      if (existing) {
        existing.reminders.push(nextReminder);
        existing.overdueCount += reminder.nextRunAt < now ? 1 : 0;
        existing.nextRunAt = Math.min(existing.nextRunAt, reminder.nextRunAt);
        continue;
      }
      map.set(key, {
        key,
        title: `${typeLabel} • ${target.label}`,
        subtitle: t('reminder.batch_subtitle_one', { date: day }),
        reminders: [nextReminder],
        overdueCount: reminder.nextRunAt < now ? 1 : 0,
        nextRunAt: reminder.nextRunAt,
      });
    }

    return [...map.values()]
      .map((batch) => ({
        ...batch,
        subtitle: batch.reminders.length === 1
          ? t('reminder.batch_subtitle_one', { date: formatDateInput(batch.nextRunAt) })
          : t('reminder.batch_subtitle_many', {
              count: batch.reminders.length,
              date: formatDateInput(batch.nextRunAt),
            }),
      }))
      .sort((a, b) => a.nextRunAt - b.nextRunAt);
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
      setFeedback(t('reminder.feedback_saved'));
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
    setFeedback(t('reminder.feedback_saved'));
  };

  const handleAuthRequired = () => {
    if (canEdit) return true;
    Alert.alert(
      t('profile.auth_sign_in'),
      t('reminder.auth_warning'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.auth_sign_in'), onPress: () => router.push({ pathname: '/auth', params: { returnTo: pathname } }) },
      ]
    );
    return false;
  };

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 2600);
    return () => clearTimeout(timer);
  }, [feedback]);

  const runReminderAction = async (action: () => Promise<unknown>, successMessage: string) => {
    try {
      await action();
      setFeedback(successMessage);
    } catch (error) {
      Alert.alert(t('common.error', { defaultValue: 'Error' }), error instanceof Error ? error.message : String(error));
    }
  };

  const now = getE2ENow();
  const { start: startOfDay, end: endOfDay } = getDayBounds(now);
  const overdueReminders = useMemo(
    () => activeReminders.filter((r: any) => r.enabled && r.nextRunAt < now),
    [activeReminders, now]
  );
  const todayActiveReminders = useMemo(
    () => activeReminders.filter((r: any) => r.enabled && r.nextRunAt >= startOfDay && r.nextRunAt <= endOfDay),
    [activeReminders, startOfDay, endOfDay]
  );
  const upcomingReminders = useMemo(
    () => activeReminders.filter((r: any) => r.enabled && r.nextRunAt > endOfDay),
    [activeReminders, endOfDay]
  );
  const filteredReminders = useMemo(() => {
    switch (filter) {
      case 'overdue':
        return overdueReminders;
      case 'today':
        return todayActiveReminders;
      case 'upcoming':
        return upcomingReminders;
      case 'completed':
        return completedReminders;
      default:
        return activeReminders;
    }
  }, [activeReminders, completedReminders, filter, overdueReminders, todayActiveReminders, upcomingReminders]);
  const todayReminderBatches = useMemo(
    () => buildReminderBatches(todayReminders),
    [todayReminders, plants, beds, gardens, t, now]
  );
  const hasGardenCheckReminder = useMemo(
    () => activeReminders.some((reminder: any) => reminder.type === 'garden_check'),
    [activeReminders]
  );
  const hasAnyReminder = activeReminders.length > 0 || completedReminders.length > 0;

  const handleSnooze = (reminder: any) => {
    if (!handleAuthRequired()) return;
    Alert.alert(
      t('reminder.snooze_title', { defaultValue: 'Snooze reminder' }),
      getDisplayTitle(reminder),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('reminder.snooze_4h', { defaultValue: '4 hours' }),
          onPress: () => void runReminderAction(
            () => snoozeReminder(reminder._id, getE2ENow() + 4 * 60 * 60 * 1000),
            t('reminder.feedback_snoozed')
          ),
        },
        {
          text: t('reminder.snooze_tomorrow', { defaultValue: 'Tomorrow 8:00' }),
          onPress: () => void runReminderAction(
            () => snoozeReminder(reminder._id, buildTomorrowMorning()),
            t('reminder.feedback_snoozed')
          ),
        },
      ]
    );
  };

  const handleSkip = (reminder: any) => {
    if (!handleAuthRequired()) return;
    Alert.alert(
      t('reminder.skip_title', { defaultValue: 'Skip reminder' }),
      getDisplayTitle(reminder),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('reminder.skip_confirm', { defaultValue: 'Skip' }),
          style: 'destructive',
          onPress: () => void runReminderAction(
            () => skipReminder(reminder._id),
            t('reminder.feedback_skipped')
          ),
        },
      ]
    );
  };

  const handleComplete = (reminder: any) => {
    if (!handleAuthRequired()) return;
    void runReminderAction(
      () => completeReminder(reminder._id),
      t('reminder.feedback_completed')
    );
  };

  const handleCompleteBatch = (batch: ReminderBatch) => {
    if (!handleAuthRequired()) return;
    void runReminderAction(
      () => Promise.all(batch.reminders.map((reminder) => completeReminder(reminder._id))),
      t('reminder.feedback_batch_completed', { count: batch.reminders.length })
    );
  };

  const handleSnoozeBatch = (batch: ReminderBatch) => {
    if (!handleAuthRequired()) return;
    Alert.alert(
      t('reminder.snooze_title', { defaultValue: 'Snooze reminder' }),
      batch.title,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('reminder.snooze_4h', { defaultValue: '4 hours' }),
          onPress: () => void runReminderAction(
            () => Promise.all(batch.reminders.map((reminder) => snoozeReminder(reminder._id, getE2ENow() + 4 * 60 * 60 * 1000))),
            t('reminder.feedback_batch_snoozed', { count: batch.reminders.length })
          ),
        },
        {
          text: t('reminder.snooze_tomorrow', { defaultValue: 'Tomorrow 8:00' }),
          onPress: () => void runReminderAction(
            () => Promise.all(batch.reminders.map((reminder) => snoozeReminder(reminder._id, buildTomorrowMorning()))),
            t('reminder.feedback_batch_snoozed', { count: batch.reminders.length })
          ),
        },
      ]
    );
  };

  const handleSkipBatch = (batch: ReminderBatch) => {
    if (!handleAuthRequired()) return;
    Alert.alert(
      t('reminder.skip_title', { defaultValue: 'Skip reminder' }),
      batch.title,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('reminder.skip_confirm', { defaultValue: 'Skip' }),
          style: 'destructive',
          onPress: () => void runReminderAction(
            () => Promise.all(batch.reminders.map((reminder) => skipReminder(reminder._id))),
            t('reminder.feedback_batch_skipped', { count: batch.reminders.length })
          ),
        },
      ]
    );
  };

  const handleCreateGardenCheck = (intervalDays: number) => {
    if (!handleAuthRequired()) return;
    void runReminderAction(
      () => createReminder({
        type: 'garden_check',
        title: t('reminder.garden_check_title'),
        description: t('reminder.garden_check_desc'),
        nextRunAt: buildTomorrowMorning(),
        rrule: `FREQ=DAILY;INTERVAL=${intervalDays}`,
      }),
      t('reminder.feedback_garden_check_created')
    );
  };

  const renderActiveReminderRow = (r: any) => {
    const Icon = REMINDER_ICONS[r.type] ?? REMINDER_ICONS.default;
    const time = new Date(r.nextRunAt).toLocaleString(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });
    const amountLabel = r.waterLiters ? formatVolume(r.waterLiters, unitSystem) : '';
    const targetLabel = getTargetLabel(r);
    const stage = getStage(r);
    const stageLabel = stage === 'planning'
      ? t('garden.tab_planning')
      : stage === 'growing'
        ? t('garden.tab_growing')
        : null;
    const stageColor = stage === 'planning' ? theme.warning : theme.success;
    const stageBg = stage === 'planning' ? theme.warningBg : theme.successBg;
    const isOverdue = r.nextRunAt < now;

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
          borderColor: isOverdue ? theme.warning : theme.border,
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
          {isOverdue && (
            <Text style={{ fontSize: 11, color: theme.warning, fontWeight: '700' }}>
              {t('reminder.filter_overdue', { defaultValue: 'Overdue' })}
            </Text>
          )}
          {!!r.snoozedUntil && r.snoozedUntil > now && (
            <Text style={{ fontSize: 11, color: theme.textMuted }}>
              {t('reminder.snoozed_until', { defaultValue: 'Snoozed until {{time}}', time: new Date(r.snoozedUntil).toLocaleString(i18n.language, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) })}
            </Text>
          )}
          <Text style={{ fontSize: 12, color: theme.textSecondary }} numberOfLines={1}>
            {amountLabel ? `${time} • ${amountLabel} • ${targetLabel}` : `${time} • ${targetLabel}`}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            onPress={() => handleSnooze(r)}
            style={{ width: 34, height: 34, backgroundColor: theme.accent, borderRadius: 10, justifyContent: 'center', alignItems: 'center', opacity: !canEdit ? 0.5 : 1 }}
          >
            <Clock3 size={16} color={theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleSkip(r)}
            style={{ width: 34, height: 34, backgroundColor: theme.warningBg, borderRadius: 10, justifyContent: 'center', alignItems: 'center', opacity: !canEdit ? 0.5 : 1 }}
          >
            <X size={16} color={theme.warning} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (!handleAuthRequired()) return;
              void runReminderAction(
                () => toggleReminder(r._id),
                r.enabled ? t('reminder.feedback_disabled') : t('reminder.feedback_enabled')
              );
            }}
            style={{ width: 34, height: 34, backgroundColor: theme.accent, borderRadius: 10, justifyContent: 'center', alignItems: 'center', opacity: !canEdit ? 0.5 : 1 }}
          >
            <Power size={16} color={r.enabled ? theme.success : theme.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (!handleAuthRequired()) return;
              setEditing(r);
              setFormOpen(true);
            }}
            style={{ width: 34, height: 34, backgroundColor: theme.accent, borderRadius: 10, justifyContent: 'center', alignItems: 'center', opacity: !canEdit ? 0.5 : 1 }}
          >
            <Pencil size={16} color={theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (!handleAuthRequired()) return;
              setConfirmDelete(r);
            }}
            style={{ width: 34, height: 34, backgroundColor: theme.dangerBg, borderRadius: 10, justifyContent: 'center', alignItems: 'center', opacity: !canEdit ? 0.5 : 1 }}
          >
            <Trash2 size={16} color={theme.danger} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderCompletedReminderRow = (r: any) => {
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
    const targetLabel = getTargetLabel(r);
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
          onPress={() => {
            if (!handleAuthRequired()) return;
            setEditing(null);
            setFormOpen(true);
          }}
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

      {!canEdit && (
        <View style={{ backgroundColor: theme.warningBg, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: theme.warning }}>
          <Text style={{ fontSize: 13, color: theme.warning, fontWeight: '500' }}>
            {t('reminder.auth_warning')}
          </Text>
        </View>
      )}

      {!!feedback && (
        <View style={{ backgroundColor: theme.successBg, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: theme.success, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Check size={18} color={theme.success} />
          <Text style={{ flex: 1, fontSize: 13, color: theme.success, fontWeight: '700' }}>
            {feedback}
          </Text>
        </View>
      )}

      <View style={{ backgroundColor: theme.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.border, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: theme.successBg, alignItems: 'center', justifyContent: 'center' }}>
            <Bell size={18} color={theme.success} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: theme.text }}>
              {t('reminder.ritual_title')}
            </Text>
            <Text style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 18 }}>
              {hasGardenCheckReminder ? t('reminder.ritual_active') : t('reminder.ritual_desc')}
            </Text>
          </View>
        </View>
        {!hasGardenCheckReminder && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              disabled={!canEdit}
              onPress={() => handleCreateGardenCheck(1)}
              style={{ flex: 1, minHeight: 40, backgroundColor: theme.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center', opacity: !canEdit ? 0.5 : 1 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>
                {t('reminder.ritual_daily')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!canEdit}
              onPress={() => handleCreateGardenCheck(7)}
              style={{ flex: 1, minHeight: 40, backgroundColor: theme.accent, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border, opacity: !canEdit ? 0.5 : 1 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '800', color: theme.textSecondary }}>
                {t('reminder.ritual_weekly')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
        {([
          ['all', t('common.all', { defaultValue: 'All' })],
          ['overdue', t('reminder.filter_overdue', { defaultValue: 'Overdue' })],
          ['today', t('reminder.today', { defaultValue: 'Today' })],
          ['upcoming', t('reminder.filter_upcoming', { defaultValue: 'Upcoming' })],
          ['completed', t('reminder.filter_completed', { defaultValue: 'Completed' })],
        ] as Array<[ReminderFilter, string]>).map(([value, label]) => {
          const active = filter === value;
          return (
            <TouchableOpacity
              key={value}
              onPress={() => setFilter(value)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 20,
                backgroundColor: active ? theme.primary : theme.card,
                borderWidth: 1,
                borderColor: active ? theme.primary : theme.border,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : theme.textSecondary }}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={theme.primary} />
        </View>
      ) : filter !== 'all' ? (
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 }}>
            {filter === 'completed'
              ? t('reminder.filter_completed', { defaultValue: 'Completed' })
              : filter === 'overdue'
                ? t('reminder.filter_overdue', { defaultValue: 'Overdue' })
                : filter === 'today'
                  ? t('reminder.today', { defaultValue: 'Today' })
                  : t('reminder.filter_upcoming', { defaultValue: 'Upcoming' })}
          </Text>
          {filteredReminders.length === 0 ? (
            <View style={{
              backgroundColor: theme.card,
              borderRadius: 20,
              padding: 24,
              borderWidth: 1,
              borderColor: theme.border,
              alignItems: 'center',
              gap: 10,
            }}>
              <Bell size={24} color={theme.textMuted} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>
                {t('reminder.filter_empty', { defaultValue: 'Nothing here yet.' })}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {filter === 'completed'
                ? filteredReminders.map((r: any) => renderCompletedReminderRow(r))
                : filteredReminders.map((r: any) => renderActiveReminderRow(r))}
            </View>
          )}
        </View>
      ) : !hasAnyReminder ? (
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
      ) : todayReminderBatches.length === 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 }}>
            {t('reminder.today_label', { count: 0 })}
          </Text>
          <View style={{ backgroundColor: theme.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.border }}>
            <Text style={{ fontSize: 13, color: theme.textMuted }}>
              {t('reminder.today_empty', { defaultValue: 'Nothing due today. Check upcoming reminders below.' })}
            </Text>
          </View>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 }}>
            {t('reminder.today_label', { count: todayReminders.length })}
          </Text>
          {todayReminderBatches.map((batch) => (
            <ReminderBatchCard
              key={batch.key}
              batch={batch}
              onComplete={() => handleCompleteBatch(batch)}
              onSnooze={() => handleSnoozeBatch(batch)}
              onSkip={() => handleSkipBatch(batch)}
              canEdit={canEdit}
            />
          ))}
        </View>
      )}

      <View style={{ gap: 10, marginTop: 4 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 }}>
          {t('reminder.all_label')}
        </Text>
        {activeReminders.length === 0 ? (
          <Text style={{ fontSize: 13, color: theme.textMuted, fontStyle: 'italic', paddingLeft: 4 }}>
            {t('reminder.none_all')}
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {activeReminders.map((r) => renderActiveReminderRow(r))}
          </View>
        )}
      </View>

      <View style={{ gap: 10, marginTop: 4 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 }}>
          {t('reminder.history_label')}
        </Text>
        {completedReminders.length === 0 ? (
          <Text style={{ fontSize: 13, color: theme.textMuted, fontStyle: 'italic', paddingLeft: 4 }}>
            {t('reminder.none_history')}
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {completedReminders.map((r) => renderCompletedReminderRow(r))}
          </View>
        )}
      </View>

      <ReminderFormModal
        visible={formOpen}
        reminder={editing}
        plants={plants}
        beds={beds}
        canEdit={canEdit}
        isGardener={isGardener}
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
                await runReminderAction(
                  () => deleteReminder(target._id),
                  t('reminder.feedback_deleted')
                );
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
