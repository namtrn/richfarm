import { useQuery, useMutation } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../packages/convex/convex/_generated/api';
import { Id } from '../../../packages/convex/convex/_generated/dataModel';
import { useDeviceId } from '../lib/deviceId';
import { useNetworkStatus } from './useNetworkStatus';
import { useQueryCache } from '../lib/queryCache';
import { useHasAuthSession, useSessionScopedCacheKey } from '../lib/sessionCache';

const E2E_REMINDER_MODE = process.env.EXPO_PUBLIC_E2E_REMINDER_MODE === 'mock';
const E2E_NOW = process.env.EXPO_PUBLIC_E2E_NOW;
const E2E_INITIAL_REMINDERS = E2E_REMINDER_MODE ? [{
    _id: 'e2e-reminder-overdue',
    enabled: true,
    createdAt: Date.now(),
    type: 'harvest',
    title: 'E2E overdue harvest',
    nextRunAt: new Date(E2E_NOW ? '2026-05-14T08:00:00+07:00' : Date.now() - 30 * 60 * 1000).getTime(),
}] : [];

export function useReminders(userPlantId?: Id<'userPlants'>) {
    const [e2eReminders, setE2EReminders] = useState<any[]>(E2E_INITIAL_REMINDERS);
    const { deviceId } = useDeviceId();
    const { isKnown, isOffline } = useNetworkStatus();
    const shouldBypassRemote = isKnown && isOffline;
    const hasSession = useHasAuthSession();

    const remoteReminders = useQuery(api.reminders.getReminders, deviceId ? {
        userPlantId,
        enabledOnly: false,
        deviceId,
    } : 'skip');

    const remoteTodayReminders = useQuery(api.reminders.getTodayReminders, deviceId ? { deviceId } : 'skip');

    const remindersCacheKey = useSessionScopedCacheKey(
        'rf_reminders_v2',
        userPlantId ? `_${userPlantId}` : ''
    );
    const todayCacheKey = useSessionScopedCacheKey('rf_reminders_today_v2');

    const { cached: cachedReminders, cacheLoaded: remindersCacheLoaded } =
        useQueryCache(remindersCacheKey, remoteReminders);
    const { cached: cachedToday } =
        useQueryCache(todayCacheKey, remoteTodayReminders);

    const reminders = E2E_REMINDER_MODE ? e2eReminders : !hasSession ? [] : remoteReminders ?? cachedReminders;
    const todayReminders = E2E_REMINDER_MODE
        ? e2eReminders.filter((reminder) => {
            const date = new Date(reminder.nextRunAt);
            const now = new Date();
            return date.getFullYear() === now.getFullYear()
                && date.getMonth() === now.getMonth()
                && date.getDate() === now.getDate();
        })
        : !hasSession ? [] : remoteTodayReminders ?? cachedToday;

    const createReminderMutation = useMutation(api.reminders.createReminder);
    const toggleReminderMutation = useMutation(api.reminders.toggleReminder);
    const completeReminderMutation = useMutation(api.reminders.completeReminder);
    const updateReminderMutation = useMutation(api.reminders.updateReminder);
    const deleteReminderMutation = useMutation(api.reminders.deleteReminder);
    const snoozeReminderMutation = useMutation(api.reminders.snoozeReminder);
    const skipReminderMutation = useMutation(api.reminders.skipReminder);

    const createReminder = async (args: {
        userPlantId?: Id<'userPlants'>;
        bedId?: Id<'beds'>;
        type: string;
        title: string;
        description?: string;
        nextRunAt: number;
        rrule?: string;
        priority?: number;
        waterLiters?: number;
    }) => {
        if (E2E_REMINDER_MODE) {
            const reminder = {
                _id: `e2e-reminder-${Date.now()}`,
                enabled: true,
                createdAt: Date.now(),
                ...args,
            };
            setE2EReminders((current) => [reminder, ...current]);
            return reminder._id;
        }
        return await createReminderMutation({ ...args, deviceId });
    };

    const toggleReminder = async (reminderId: Id<'reminders'>) => {
        if (E2E_REMINDER_MODE) {
            setE2EReminders((current) => current.map((reminder) => (
                reminder._id === reminderId ? { ...reminder, enabled: !reminder.enabled } : reminder
            )));
            return;
        }
        return await toggleReminderMutation({ reminderId, deviceId });
    };

    const completeReminder = async (reminderId: Id<'reminders'>) => {
        if (E2E_REMINDER_MODE) {
            setE2EReminders((current) => current.map((reminder) => (
                reminder._id === reminderId ? { ...reminder, enabled: false, lastRunAt: Date.now() } : reminder
            )));
            return;
        }
        return await completeReminderMutation({ reminderId, deviceId });
    };

    const updateReminder = async (
        reminderId: Id<'reminders'>,
        updates: {
            userPlantId?: Id<'userPlants'>;
            bedId?: Id<'beds'>;
            type?: string;
            title?: string;
            description?: string;
            nextRunAt?: number;
            rrule?: string;
            priority?: number;
            enabled?: boolean;
            waterLiters?: number;
        }
    ) => {
        if (E2E_REMINDER_MODE) {
            setE2EReminders((current) => current.map((reminder) => (
                reminder._id === reminderId ? { ...reminder, ...updates } : reminder
            )));
            return;
        }
        return await updateReminderMutation({ reminderId, ...updates, deviceId });
    };

    const deleteReminder = async (reminderId: Id<'reminders'>) => {
        if (E2E_REMINDER_MODE) {
            setE2EReminders((current) => current.filter((reminder) => reminder._id !== reminderId));
            return;
        }
        return await deleteReminderMutation({ reminderId, deviceId });
    };

    const snoozeReminder = async (reminderId: Id<'reminders'>, snoozedUntil: number) => {
        if (E2E_REMINDER_MODE) {
            setE2EReminders((current) => current.map((reminder) => (
                reminder._id === reminderId ? { ...reminder, nextRunAt: snoozedUntil } : reminder
            )));
            return;
        }
        return await snoozeReminderMutation({ reminderId, snoozedUntil, deviceId });
    };

    const skipReminder = async (reminderId: Id<'reminders'>) => {
        if (E2E_REMINDER_MODE) {
            setE2EReminders((current) => current.map((reminder) => (
                reminder._id === reminderId ? { ...reminder, enabled: false, lastRunAt: Date.now() } : reminder
            )));
            return;
        }
        return await skipReminderMutation({ reminderId, deviceId });
    };

    return {
        reminders: reminders ?? [],
        todayReminders: todayReminders ?? [],
        isLoading: reminders === undefined && !remindersCacheLoaded && !shouldBypassRemote,
        createReminder,
        toggleReminder,
        completeReminder,
        updateReminder,
        deleteReminder,
        snoozeReminder,
        skipReminder,
    };
}
