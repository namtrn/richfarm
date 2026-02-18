import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { useDeviceId } from '../lib/deviceId';

export function useReminders(userPlantId?: Id<'userPlants'>) {
    const { deviceId } = useDeviceId();
    const reminders = useQuery(api.reminders.getReminders, {
        userPlantId,
        enabledOnly: false,
        deviceId,
    });

    const todayReminders = useQuery(api.reminders.getTodayReminders, { deviceId });

    const createReminderMutation = useMutation(api.reminders.createReminder);
    const toggleReminderMutation = useMutation(api.reminders.toggleReminder);
    const completeReminderMutation = useMutation(api.reminders.completeReminder);
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
    }) => {
        return await createReminderMutation({ ...args, deviceId });
    };

    const toggleReminder = async (reminderId: Id<'reminders'>) => {
        return await toggleReminderMutation({ reminderId, deviceId });
    };

    const completeReminder = async (reminderId: Id<'reminders'>) => {
        return await completeReminderMutation({ reminderId, deviceId });
    };

    const deleteReminder = async (reminderId: Id<'reminders'>) => {
        return await deleteReminderMutation({ reminderId, deviceId });
    };

    return {
        reminders: reminders ?? [],
        todayReminders: todayReminders ?? [],
        isLoading: reminders === undefined,
        createReminder,
        toggleReminder,
        completeReminder,
        deleteReminder,
    };
}
