import { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Pressable,
} from 'react-native';
import { Bell, Check, Droplets, Scissors, Sprout, Plus, Pencil, Trash2, Power } from 'lucide-react-native';
import { useReminders } from '../../hooks/useReminders';
import { usePlants } from '../../hooks/usePlants';
import { useBeds } from '../../hooks/useBeds';
import { useAuth } from '../../lib/auth';
import { useTranslation } from 'react-i18next';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import { formatVolume, formatVolumeValue, getVolumeUnitLabel, parseVolumeInput } from '../../lib/units';

const REMINDER_ICONS: Record<string, any> = {
  watering: Droplets,
  pruning: Scissors,
  fertilizing: Sprout,
  harvest: Sprout,
  custom: Bell,
  default: Bell,
};

const REMINDER_TYPES = [
  { key: 'watering', labelKey: 'reminder.type_watering' },
  { key: 'fertilizing', labelKey: 'reminder.type_fertilizing' },
  { key: 'pruning', labelKey: 'reminder.type_pruning' },
  { key: 'harvest', labelKey: 'reminder.type_harvest' },
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
  const unitSystem = useUnitSystem();
  const Icon = REMINDER_ICONS[reminder.type] ?? REMINDER_ICONS.default;
  const time = new Date(reminder.nextRunAt).toLocaleTimeString(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const amountLabel = reminder.waterLiters ? formatVolume(reminder.waterLiters, unitSystem) : '';

  return (
    <View className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 shadow-sm flex-row items-center gap-x-3">
      <View className="w-11 h-11 bg-green-100 rounded-full justify-center items-center">
        <Icon size={22} stroke="#16a34a" />
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900 dark:text-white">{reminder.title}</Text>
        {reminder.description && (
          <Text className="text-xs text-gray-400">{reminder.description}</Text>
        )}
        <Text className="text-xs text-gray-400">{amountLabel ? `${time} • ${amountLabel}` : time}</Text>
      </View>
      <TouchableOpacity
        className={`w-9 h-9 bg-green-500 rounded-full justify-center items-center ${!canEdit ? 'opacity-50' : ''}`}
        disabled={!canEdit}
        onPress={onComplete}
      >
        <Check size={18} color="white" />
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
  const unitSystem = useUnitSystem();
  const [title, setTitle] = useState(reminder?.title ?? '');
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
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}>
        <View style={{ width: 40, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, alignSelf: 'center', marginBottom: 12 }} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 10 }}>
          {reminder ? t('reminder.form_title_edit') : t('reminder.form_title_create')}
        </Text>

        {!canEdit && (
          <View style={{ backgroundColor: '#fef9c3', borderRadius: 12, padding: 10, marginBottom: 10 }}>
            <Text style={{ fontSize: 12, color: '#854d0e' }}>{t('reminder.auth_warning')}</Text>
          </View>
        )}

        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('reminder.form_title_label')}</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t('reminder.form_title_placeholder')}
            placeholderTextColor="#9ca3af"
            testID="e2e-reminder-form-title-input"
            style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827', marginBottom: 10 }}
          />

          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('reminder.form_desc_label')}</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t('reminder.form_desc_placeholder')}
            placeholderTextColor="#9ca3af"
            style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', marginBottom: 10 }}
          />

          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('reminder.form_type_label')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {REMINDER_TYPES.map((typeItem) => {
              const active = typeItem.key === type;
              return (
                <TouchableOpacity
                  key={typeItem.key}
                  onPress={() => setType(typeItem.key)}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? '#22c55e' : '#fff', borderWidth: 1, borderColor: active ? '#22c55e' : '#e5e7eb' }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#374151' }}>{t(typeItem.labelKey)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('reminder.form_date_label')}</Text>
              <TextInput
                value={dateStr}
                onChangeText={(value) => { setDateStr(value); setDateError(''); }}
                placeholder={t('reminder.form_date_placeholder')}
                placeholderTextColor="#9ca3af"
                testID="e2e-reminder-form-date-input"
                style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: dateError ? '#f87171' : '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
              />
              {!!dateError && (
                <Text style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{dateError}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('reminder.form_time_label')}</Text>
              <TextInput
                value={timeStr}
                onChangeText={(value) => { setTimeStr(value); setTimeError(''); }}
                placeholder={t('reminder.form_time_placeholder')}
                placeholderTextColor="#9ca3af"
                testID="e2e-reminder-form-time-input"
                style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: timeError ? '#f87171' : '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
              />
              {!!timeError && (
                <Text style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{timeError}</Text>
              )}
            </View>
          </View>

          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('reminder.form_repeat_label')}</Text>
          <TextInput
            value={repeatDays}
            onChangeText={setRepeatDays}
            placeholder={t('reminder.form_repeat_placeholder')}
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
            style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', marginBottom: 10 }}
          />

          {type === 'watering' && (
            <>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('reminder.form_amount_label')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <TextInput
                  value={waterAmount}
                  onChangeText={setWaterAmount}
                  placeholder={t('reminder.form_amount_placeholder', { unit: getVolumeUnitLabel(unitSystem) })}
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  style={{ flex: 1, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' }}
                />
                <Text style={{ fontSize: 12, color: '#6b7280' }}>{getVolumeUnitLabel(unitSystem)}</Text>
              </View>
            </>
          )}

          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{t('reminder.form_target_label')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            {['none', 'plant', 'bed'].map((key) => {
              const active = target === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => setTarget(key as any)}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? '#22c55e' : '#fff', borderWidth: 1, borderColor: active ? '#22c55e' : '#e5e7eb' }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#374151' }}>{t(`reminder.target_${key}`)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {target === 'plant' && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {plants.map((p) => {
                const active = selectedPlant === p._id;
                return (
                  <TouchableOpacity
                    key={p._id}
                    onPress={() => setSelectedPlant(p._id)}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? '#22c55e' : '#fff', borderWidth: 1, borderColor: active ? '#22c55e' : '#e5e7eb' }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#374151' }}>{p.nickname ?? t('reminder.unnamed_plant')}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {target === 'bed' && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {beds.map((b) => {
                const active = selectedBed === b._id;
                return (
                  <TouchableOpacity
                    key={b._id}
                    onPress={() => setSelectedBed(b._id)}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? '#22c55e' : '#fff', borderWidth: 1, borderColor: active ? '#22c55e' : '#e5e7eb' }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#374151' }}>{b.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <TouchableOpacity
            onPress={() => setEnabled((v: boolean) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}
          >
            <Power size={16} color={enabled ? '#16a34a' : '#9ca3af'} />
            <Text style={{ fontSize: 13, color: '#374151' }}>{enabled ? t('reminder.enabled') : t('reminder.disabled')}</Text>
          </TouchableOpacity>
        </ScrollView>

        <TouchableOpacity
          disabled={!canEdit || saving || !title.trim() || !!dateError || !!timeError}
          onPress={handleSave}
          testID="e2e-reminder-form-save"
          style={{ backgroundColor: '#22c55e', borderRadius: 16, paddingVertical: 14, alignItems: 'center', opacity: (!canEdit || saving || !title.trim() || !!dateError || !!timeError) ? 0.6 : 1 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{t('reminder.form_save')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export default function ReminderScreen() {
  const { t, i18n } = useTranslation();
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

  const allReminders = useMemo(() => {
    return [...reminders].sort((a, b) => a.nextRunAt - b.nextRunAt);
  }, [reminders]);

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
    <ScrollView className="flex-1 bg-gray-50 dark:bg-gray-950">
      <View className="p-4 gap-y-4">
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-3xl font-bold text-gray-900 dark:text-white">{t('reminder.title')}</Text>
            <Text className="text-sm text-gray-500">{t('reminder.subtitle')}</Text>
          </View>
          <TouchableOpacity
            className={`flex-row items-center gap-x-1 bg-green-500 rounded-xl px-3 py-2 ${!canEdit ? 'opacity-50' : ''}`}
            disabled={!canEdit}
            onPress={() => { setEditing(null); setFormOpen(true); }}
            testID="e2e-reminder-add-button"
          >
            <Plus size={16} color="white" />
            <Text className="text-white text-sm font-medium">{t('reminder.add_button')}</Text>
          </TouchableOpacity>
        </View>

        {!isAuthLoading && !isAuthenticated && (
          <View className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
            <Text className="text-yellow-800 text-sm">
              {t('reminder.auth_warning')}
            </Text>
          </View>
        )}

        {isLoading ? (
          <View className="py-16 items-center">
            <ActivityIndicator size="large" color="#16a34a" />
          </View>
        ) : todayReminders.length === 0 ? (
          <View className="py-10 items-center gap-y-3 bg-gray-100 dark:bg-gray-800 rounded-2xl">
            <Bell size={48} stroke="#9ca3af" />
            <Text className="text-lg font-semibold text-gray-500">{t('reminder.no_reminders')}</Text>
            <Text className="text-sm text-gray-400 text-center">
              {t('reminder.no_reminders_desc')}
            </Text>
          </View>
        ) : (
          <View className="gap-y-3">
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
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

        <View className="gap-y-3">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            {t('reminder.all_label')}
          </Text>
          {allReminders.length === 0 ? (
            <Text className="text-sm text-gray-400">{t('reminder.none_all')}</Text>
          ) : (
            allReminders.map((r) => {
              const Icon = REMINDER_ICONS[r.type] ?? REMINDER_ICONS.default;
              const time = new Date(r.nextRunAt).toLocaleString(i18n.language, {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
              });
              const amountLabel = r.waterLiters ? formatVolume(r.waterLiters, unitSystem) : '';
              const targetLabel = r.userPlantId
                ? plantMap.get(r.userPlantId)?.nickname ?? t('reminder.target_plant')
                : r.bedId
                  ? bedMap.get(r.bedId)?.name ?? t('reminder.target_bed')
                  : t('reminder.target_none');

              return (
                <View
                  key={r._id}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 shadow-sm flex-row items-center gap-x-3"
                >
                  <View className="w-10 h-10 bg-green-100 rounded-full justify-center items-center">
                    <Icon size={20} stroke="#16a34a" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-gray-900 dark:text-white">{r.title}</Text>
                    <Text className="text-xs text-gray-400">{amountLabel ? `${time} • ${amountLabel} • ${targetLabel}` : `${time} • ${targetLabel}`}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => toggleReminder(r._id)}
                    disabled={!canEdit}
                    className={`w-9 h-9 bg-gray-100 rounded-full justify-center items-center ${!canEdit ? 'opacity-50' : ''}`}
                  >
                    <Power size={16} color={r.enabled ? '#16a34a' : '#9ca3af'} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setEditing(r); setFormOpen(true); }}
                    disabled={!canEdit}
                    className={`w-9 h-9 bg-gray-100 rounded-full justify-center items-center ${!canEdit ? 'opacity-50' : ''}`}
                  >
                    <Pencil size={16} color="#6b7280" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setConfirmDelete(r)}
                    disabled={!canEdit}
                    className={`w-9 h-9 bg-red-100 rounded-full justify-center items-center ${!canEdit ? 'opacity-50' : ''}`}
                  >
                    <Trash2 size={16} color="#b91c1c" />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
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
        <View style={{ position: 'absolute', left: 24, right: 24, top: '40%', backgroundColor: '#fff', borderRadius: 16, padding: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 }}>
            {t('reminder.confirm_delete_title')}
          </Text>
          <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
            {t('reminder.confirm_delete_desc')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => setConfirmDelete(null)}
              style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}
            >
              <Text style={{ fontWeight: '600', color: '#374151' }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                const target = confirmDelete;
                setConfirmDelete(null);
                if (!target) return;
                await deleteReminder(target._id);
              }}
              style={{ flex: 1, backgroundColor: '#ef4444', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}
            >
              <Text style={{ fontWeight: '700', color: '#fff' }}>{t('common.delete')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
