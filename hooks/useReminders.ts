import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { useDeviceId } from '../lib/deviceId';
import { useNetworkStatus } from './useNetworkStatus';
import { useQueryCache } from '../lib/queryCache';

export function useReminders(userPlantId?: Id<'userPlants'>) {
    const { deviceId } = useDeviceId();
    const { isKnown, isOffline } = useNetworkStatus();
    const shouldBypassRemote = isKnown && isOffline;

    const remoteReminders = useQuery(api.reminders.getReminders, deviceId ? {
        userPlantId,
        enabledOnly: false,
        deviceId,
    } : 'skip');

    const remoteTodayReminders = useQuery(api.reminders.getTodayReminders, deviceId ? { deviceId } : 'skip');

    const remindersCacheKey = deviceId
        ? `rf_reminders_v1_${deviceId}${userPlantId ? `_${userPlantId}` : ''}`
        : null;
    const todayCacheKey = deviceId ? `rf_reminders_today_v1_${deviceId}` : null;

    const { cached: cachedReminders, cacheLoaded: remindersCacheLoaded } =
        useQueryCache(remindersCacheKey, remoteReminders);
    const { cached: cachedToday } =
        useQueryCache(todayCacheKey, remoteTodayReminders);

    const reminders = remoteReminders ?? cachedReminders;
    const todayReminders = remoteTodayReminders ?? cachedToday;

    const createReminderMutation = useMutation(api.reminders.createReminder);
    const toggleReminderMutation = useMutation(api.reminders.toggleReminder);
    const completeReminderMutation = useMutation(api.reminders.completeReminder);
    const updateReminderMutation = useMutation(api.reminders.updateReminder);
    const deleteReminderMutation = useMutation(api.reminders.deleteReminder);

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

    return {
        reminders: reminders ?? [],
        todayReminders: todayReminders ?? [],
        isLoading: reminders === undefined && !remindersCacheLoaded && !shouldBypassRemote,
        createReminder,
        toggleReminder,
        completeReminder,
        updateReminder,
        deleteReminder,
    };
}
