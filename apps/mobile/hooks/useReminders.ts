import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../packages/convex/_generated/api';
import { Id } from '../../../packages/convex/_generated/dataModel';
import { useDeviceId } from '../lib/deviceId';
import { useNetworkStatus } from './useNetworkStatus';
import { useQueryCache } from '../lib/queryCache';
import { useHasAuthSession, useSessionScopedCacheKey } from '../lib/sessionCache';

export function useReminders(userPlantId?: Id<'userPlants'>) {
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

    const reminders = !hasSession ? [] : remoteReminders ?? cachedReminders;
    const todayReminders = !hasSession ? [] : remoteTodayReminders ?? cachedToday;

    const createReminderMutation = useMutation(api.reminders.createReminder);
    const toggleReminderMutation = useMutation(api.reminders.toggleReminder);
    const completeReminderMutation = useMutation(api.reminders.completeReminder);
    const updateReminderMutation = useMutation(api.reminders.updateReminder);
    const deleteReminderMutation = useMutation(api.reminders.deleteReminder);
    const snoozeReminderMutation = useMutation(api.reminders.snoozeReminder);

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
        return await createReminderMutation({ ...args, deviceId });
    };

    const toggleReminder = async (reminderId: Id<'reminders'>) => {
        return await toggleReminderMutation({ reminderId, deviceId });
    };

    const completeReminder = async (reminderId: Id<'reminders'>) => {
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
        return await updateReminderMutation({ reminderId, ...updates, deviceId });
    };

    const deleteReminder = async (reminderId: Id<'reminders'>) => {
        return await deleteReminderMutation({ reminderId, deviceId });
    };

    const snoozeReminder = async (reminderId: Id<'reminders'>, snoozedUntil: number) => {
        return await snoozeReminderMutation({ reminderId, snoozedUntil, deviceId });
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
    };
}
