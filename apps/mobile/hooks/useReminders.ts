import { useQuery, useMutation } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../packages/convex/convex/_generated/api';
import { Id } from '../../../packages/convex/convex/_generated/dataModel';
import { useDeviceId } from '../lib/deviceId';
import { useNetworkStatus } from './useNetworkStatus';
import { useQueryCache } from '../lib/queryCache';
import { useHasAuthSession, useSessionScopedCacheKey } from '../lib/sessionCache';
import { useSyncProjectionEntities } from './useSyncProjection';
import { useEntitySync } from './useEntitySync';
import {
    getTestDueAt,
    selectTestTriggerableCareReminder,
} from '../lib/testReminderTrigger';

const E2E_REMINDER_MODE = process.env.EXPO_PUBLIC_E2E_REMINDER_MODE === 'mock';
const TEST_REMINDER_TRIGGER_ENABLED =
    __DEV__ && process.env.EXPO_PUBLIC_ENABLE_TEST_TRIGGERS === 'true';
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
    const projectedReminders = useSyncProjectionEntities('reminder') as any[];
    const { queueOperation } = useEntitySync();

    const remoteReminders = useQuery(api.reminders.getReminders, hasSession && deviceId ? {
        userPlantId,
        enabledOnly: false,
        deviceId,
    } : 'skip');

    const remoteTodayReminders = useQuery(api.reminders.getTodayReminders, hasSession && deviceId ? { deviceId } : 'skip');

    const remindersCacheKey = useSessionScopedCacheKey(
        'rf_reminders_v2',
        userPlantId ? `_${userPlantId}` : ''
    );
    const todayCacheKey = useSessionScopedCacheKey('rf_reminders_today_v2');

    const { cached: cachedReminders, cacheLoaded: remindersCacheLoaded } =
        useQueryCache(remindersCacheKey, remoteReminders);
    const { cached: cachedToday } =
        useQueryCache(todayCacheKey, remoteTodayReminders);

    const projectedForPlant = projectedReminders.filter((reminder) =>
        !userPlantId || String(reminder.userPlantId) === String(userPlantId)
    );
    const reminders = E2E_REMINDER_MODE
        ? e2eReminders
        : projectedForPlant.length > 0
          ? projectedForPlant
          : !hasSession ? [] : remoteReminders ?? cachedReminders;
    const todayReminders = E2E_REMINDER_MODE
        ? e2eReminders.filter((reminder) => {
            const date = new Date(reminder.nextRunAt);
            const now = new Date();
            return date.getFullYear() === now.getFullYear()
                && date.getMonth() === now.getMonth()
                && date.getDate() === now.getDate();
        })
        : projectedReminders.length > 0
          ? projectedReminders.filter((reminder) =>
              reminder.enabled
              && !reminder._pendingOutcome
              && reminder.nextRunAt <= new Date().setHours(23, 59, 59, 999)
            )
          : !hasSession ? [] : remoteTodayReminders ?? cachedToday;

    const queueOutcome = async (
        reminder: any,
        outcome: 'performed' | 'checked_not_needed' | 'snoozed' | 'skipped' | 'edited' | 'disabled' | 'deleted',
        extra: Record<string, unknown> = {},
    ) => {
        if (!reminder?.entityUuid) return false;
        await queueOperation({
            entityType: 'reminderOutcome',
            operationType: 'create',
            parentRefs: { reminderUuid: reminder.entityUuid },
            payload: { outcome, occurredAt: Date.now(), ...extra },
        });
        return true;
    };

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
        const reminder = (reminders ?? []).find((row: any) => String(row._id) === String(reminderId));
        if (reminder?.entityUuid) {
            await queueOperation({
                entityType: 'reminder', entityUuid: reminder.entityUuid,
                operationType: 'update', baseRevision: reminder.revision ?? 1,
                payload: { enabled: !reminder.enabled },
            });
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
        const reminder = (reminders ?? []).find((row: any) => String(row._id) === String(reminderId));
        if (await queueOutcome(reminder, 'performed')) return;
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
        const reminder = (reminders ?? []).find((row: any) => String(row._id) === String(reminderId));
        if (reminder?.entityUuid) {
            await queueOperation({
                entityType: 'reminder', entityUuid: reminder.entityUuid,
                operationType: 'update', baseRevision: reminder.revision ?? 1,
                payload: updates,
            });
            return;
        }
        return await updateReminderMutation({ reminderId, ...updates, deviceId });
    };

    const deleteReminder = async (reminderId: Id<'reminders'>) => {
        if (E2E_REMINDER_MODE) {
            setE2EReminders((current) => current.filter((reminder) => reminder._id !== reminderId));
            return;
        }
        const reminder = (reminders ?? []).find((row: any) => String(row._id) === String(reminderId));
        if (await queueOutcome(reminder, 'deleted')) return;
        return await deleteReminderMutation({ reminderId, deviceId });
    };

    const snoozeReminder = async (reminderId: Id<'reminders'>, snoozedUntil: number) => {
        if (E2E_REMINDER_MODE) {
            setE2EReminders((current) => current.map((reminder) => (
                reminder._id === reminderId ? { ...reminder, nextRunAt: snoozedUntil } : reminder
            )));
            return;
        }
        const reminder = (reminders ?? []).find((row: any) => String(row._id) === String(reminderId));
        if (await queueOutcome(reminder, 'snoozed', { snoozedUntil })) return;
        return await snoozeReminderMutation({ reminderId, snoozedUntil, deviceId });
    };

    const skipReminder = async (reminderId: Id<'reminders'>) => {
        if (E2E_REMINDER_MODE) {
            setE2EReminders((current) => current.map((reminder) => (
                reminder._id === reminderId ? { ...reminder, enabled: false, lastRunAt: Date.now() } : reminder
            )));
            return;
        }
        const reminder = (reminders ?? []).find((row: any) => String(row._id) === String(reminderId));
        if (await queueOutcome(reminder, 'skipped')) return;
        return await skipReminderMutation({ reminderId, deviceId });
    };

    const resolveReminderOutcome = async (
        reminderId: Id<'reminders'>,
        outcome: 'performed' | 'checked_not_needed',
    ) => {
        const reminder = (reminders ?? []).find((row: any) => String(row._id) === String(reminderId));
        if (await queueOutcome(reminder, outcome)) return;
        if (outcome === 'performed') return await completeReminderMutation({ reminderId, deviceId });
        throw new Error('This legacy reminder does not support a check-only outcome.');
    };

    const triggerCareReminderForTesting = async (reminderId?: string) => {
        if (!TEST_REMINDER_TRIGGER_ENABLED) {
            throw new Error('test_reminder_trigger_disabled');
        }
        const reminder = selectTestTriggerableCareReminder(reminders ?? [], reminderId);
        if (!reminder) {
            throw new Error('test_care_reminder_not_found');
        }
        await updateReminder(
            reminder._id as Id<'reminders'>,
            { nextRunAt: getTestDueAt(Date.now()) },
        );
        return reminder._id;
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
        resolveReminderOutcome,
        triggerCareReminderForTesting,
    };
}
