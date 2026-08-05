// RichFarm — Convex Reminders
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByIdentityOrDevice, requireUser } from "./lib/user";
import { getOwnedBedOrThrow, getOwnedPlantOrThrow } from "./lib/ownership";
import { isCarePlanReminder, validateReminderOccurrence } from "./lib/carePlan";
import { markSyncDatasetChanged, writeTombstone } from "./lib/syncProtocol";

const DAY_MS = 24 * 60 * 60 * 1000;

function getDailyIntervalDays(rrule?: string) {
    if (!rrule) return null;
    const freqMatch = rrule.match(/FREQ=DAILY/i);
    if (!freqMatch) return 1;
    const intervalMatch = rrule.match(/INTERVAL=(\d+)/i);
    const interval = intervalMatch ? Number(intervalMatch[1]) : 1;
    if (!Number.isFinite(interval) || interval < 1) return 1;
    return Math.round(interval);
}

function buildNextRunAtFromRule(rrule: string | undefined, from = Date.now()) {
    const intervalDays = getDailyIntervalDays(rrule);
    if (!intervalDays) return undefined;
    return from + intervalDays * DAY_MS;
}

function assertReminderOccurrence(
    reminder: any,
    occurrenceKey: string | undefined,
    legacyCompatibility: boolean | undefined,
) {
    const error = validateReminderOccurrence(reminder, occurrenceKey, legacyCompatibility);
    if (error === "stale_reminder_occurrence") throw new Error("Reminder occurrence is stale");
    if (error === "occurrence_key_required") throw new Error("Reminder occurrence key is required");
    if (error === "legacy_occurrence_exemption_required") {
        throw new Error("Legacy reminder compatibility must be explicit");
    }
}

function isStoppedPlant(plant: any, userId: any) {
    return !plant
        || plant.userId !== userId
        || plant.isDeleted
        || plant.status === "harvested"
        || plant.status === "archived";
}

async function assertReminderParentActive(ctx: any, user: any, reminder: any) {
    if (reminder.userPlantId) {
        const plant = await ctx.db.get(reminder.userPlantId);
        if (isStoppedPlant(plant, user._id)) throw new Error("Reminder plant is inactive");

        if (isCarePlanReminder(reminder)) {
            if (!reminder.carePlanId) throw new Error("Reminder care plan is inactive");
            const carePlan = await ctx.db.get(reminder.carePlanId);
            if (
                !carePlan
                || carePlan.userId !== user._id
                || carePlan.userPlantId !== plant._id
                || carePlan.status !== "active"
            ) {
                throw new Error("Reminder care plan is inactive");
            }
        }
        return;
    }

    // A marker without a plant/plan is malformed Phase 2 data. Legacy custom
    // reminders without a plant remain valid only through explicit legacy
    // compatibility at the caller boundary.
    if (isCarePlanReminder(reminder)) throw new Error("Reminder care plan is inactive");
}

async function assertReminderActionable(ctx: any, user: any, reminder: any) {
    if (!reminder.enabled) throw new Error("Reminder is disabled");
    await assertReminderParentActive(ctx, user, reminder);
}

function assertReminderDeletable(
    reminder: any,
    occurrenceKey: string | undefined,
    legacyCompatibility: boolean | undefined,
) {
    // Deletion is cleanup, not a reminder outcome. Ownership is checked by the
    // mutation before this helper; only the targeted occurrence is protected.
    assertReminderOccurrence(reminder, occurrenceKey, legacyCompatibility);
}

// Lấy tất cả reminders của user
export const getReminders = query({
    args: {
        userPlantId: v.optional(v.id("userPlants")),
        enabledOnly: v.optional(v.boolean()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getUserByIdentityOrDevice(ctx, args.deviceId);
        if (!user) return [];

        let reminders = await ctx.db
            .query("reminders")
            .withIndex("by_user", (q: any) => q.eq("userId", user._id))
            .collect();

        if (args.userPlantId) {
            reminders = reminders.filter(
                (r: any) => r.userPlantId === args.userPlantId
            );
        }

        if (args.enabledOnly) {
            reminders = reminders.filter((r: any) => r.enabled);
        }

        const visibilityByPlantId = new Map<string, boolean>();
        const visibleReminders: any[] = [];
        for (const reminder of reminders) {
            if (!reminder.userPlantId) {
                visibleReminders.push(reminder);
                continue;
            }

            const plantId = String(reminder.userPlantId);
            let isVisible = visibilityByPlantId.get(plantId);
            if (isVisible === undefined) {
                const plant = await ctx.db.get(reminder.userPlantId);
                isVisible = !!plant && !plant.isDeleted;
                visibilityByPlantId.set(plantId, isVisible);
            }

            if (isVisible) visibleReminders.push(reminder);
        }

        return visibleReminders;
    },
});

// Lấy reminders cần làm hôm nay
export const getTodayReminders = query({
    args: {
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getUserByIdentityOrDevice(ctx, args.deviceId);
        if (!user) return [];

        const now = Date.now();
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const reminders = await ctx.db
            .query("reminders")
            .withIndex("by_user_next_run", (q: any) =>
                q.eq("userId", user._id).lte("nextRunAt", endOfDay.getTime())
            )
            .collect();

        const dueReminders = reminders.filter(
            (r: any) =>
                r.enabled && (!r.snoozedUntil || r.snoozedUntil <= now)
        );

        const visibilityByPlantId = new Map<string, boolean>();
        const visibleDueReminders: any[] = [];
        for (const reminder of dueReminders) {
            if (!reminder.userPlantId) {
                visibleDueReminders.push(reminder);
                continue;
            }

            const plantId = String(reminder.userPlantId);
            let isVisible = visibilityByPlantId.get(plantId);
            if (isVisible === undefined) {
                const plant = await ctx.db.get(reminder.userPlantId);
                isVisible = !!plant && !plant.isDeleted;
                visibilityByPlantId.set(plantId, isVisible);
            }

            if (isVisible) visibleDueReminders.push(reminder);
        }

        return visibleDueReminders;
    },
});

// Tạo reminder mới
export const createReminder = mutation({
    args: {
        userPlantId: v.optional(v.id("userPlants")),
        bedId: v.optional(v.id("beds")),
        type: v.string(),
        title: v.string(),
        description: v.optional(v.string()),
        nextRunAt: v.number(),
        rrule: v.optional(v.string()),
        priority: v.optional(v.number()),
        waterLiters: v.optional(v.number()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        if (args.userPlantId) {
            await getOwnedPlantOrThrow(ctx, user._id, args.userPlantId);
        }
        if (args.bedId) {
            await getOwnedBedOrThrow(ctx, user._id, args.bedId);
        }

        return await ctx.db.insert("reminders", {
            userId: user._id,
            userPlantId: args.userPlantId,
            bedId: args.bedId,
            type: args.type,
            title: args.title,
            description: args.description,
            nextRunAt: args.nextRunAt,
            rrule: args.rrule,
            waterLiters: args.waterLiters,
            enabled: true,
            priority: args.priority ?? 3,
            completedCount: 0,
            skippedCount: 0,
        });
    },
});

// Bật/tắt reminder
export const toggleReminder = mutation({
    args: {
        reminderId: v.id("reminders"),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const reminder = await ctx.db.get(args.reminderId);

        if (!reminder || reminder.userId !== user._id) {
            throw new Error("Reminder not found or unauthorized");
        }

        if (!reminder.enabled) {
            await assertReminderParentActive(ctx, user, reminder);
        }

        await ctx.db.patch(args.reminderId, {
            enabled: !reminder.enabled,
        });
    },
});

// Cập nhật reminder
export const updateReminder = mutation({
    args: {
        reminderId: v.id("reminders"),
        userPlantId: v.optional(v.id("userPlants")),
        bedId: v.optional(v.id("beds")),
        type: v.optional(v.string()),
        title: v.optional(v.string()),
        description: v.optional(v.string()),
        nextRunAt: v.optional(v.number()),
        rrule: v.optional(v.string()),
        priority: v.optional(v.number()),
        waterLiters: v.optional(v.number()),
        enabled: v.optional(v.boolean()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const reminder = await ctx.db.get(args.reminderId);

        if (!reminder || reminder.userId !== user._id) {
            throw new Error("Reminder not found or unauthorized");
        }
        if (args.enabled === true) await assertReminderParentActive(ctx, user, reminder);
        if (args.userPlantId) {
            await getOwnedPlantOrThrow(ctx, user._id, args.userPlantId);
        }
        if (args.bedId) {
            await getOwnedBedOrThrow(ctx, user._id, args.bedId);
        }

        const { reminderId, deviceId, ...updates } = args;
        await ctx.db.patch(reminderId, updates);
    },
});

export const snoozeReminder = mutation({
    args: {
        reminderId: v.id("reminders"),
        snoozedUntil: v.number(),
        occurrenceKey: v.optional(v.string()),
        legacyCompatibility: v.optional(v.boolean()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const reminder = await ctx.db.get(args.reminderId);

        if (!reminder || reminder.userId !== user._id) {
            throw new Error("Reminder not found or unauthorized");
        }
        assertReminderOccurrence(reminder, args.occurrenceKey, args.legacyCompatibility);
        await assertReminderActionable(ctx, user, reminder);

        await ctx.db.patch(args.reminderId, {
            snoozedUntil: args.snoozedUntil,
        });
    },
});

export const skipReminder = mutation({
    args: {
        reminderId: v.id("reminders"),
        occurrenceKey: v.optional(v.string()),
        legacyCompatibility: v.optional(v.boolean()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const reminder = await ctx.db.get(args.reminderId);

        if (!reminder || reminder.userId !== user._id) {
            throw new Error("Reminder not found or unauthorized");
        }
        assertReminderOccurrence(reminder, args.occurrenceKey, args.legacyCompatibility);
        await assertReminderActionable(ctx, user, reminder);

        const now = Date.now();
        const nextRunAt = buildNextRunAtFromRule(reminder.rrule, now);

        await ctx.db.patch(args.reminderId, {
            lastRunAt: now,
            snoozedUntil: undefined,
            skippedCount: (reminder.skippedCount ?? 0) + 1,
            ...(nextRunAt ? { nextRunAt } : { enabled: false }),
        });
    },
});

// Đánh dấu reminder đã hoàn thành + tính nextRunAt tiếp theo
export const completeReminder = mutation({
    args: {
        reminderId: v.id("reminders"),
        occurrenceKey: v.optional(v.string()),
        legacyCompatibility: v.optional(v.boolean()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const reminder = await ctx.db.get(args.reminderId);

        if (!reminder || reminder.userId !== user._id) {
            throw new Error("Reminder not found or unauthorized");
        }
        assertReminderOccurrence(reminder, args.occurrenceKey, args.legacyCompatibility);
        await assertReminderActionable(ctx, user, reminder);

        const now = Date.now();
        const nextRunAt = buildNextRunAtFromRule(reminder.rrule, now);

        await ctx.db.patch(args.reminderId, {
            lastRunAt: now,
            snoozedUntil: undefined,
            ...(nextRunAt ? { nextRunAt } : { enabled: false }),
            completedCount: (reminder.completedCount ?? 0) + 1,
        });
    },
});

// Xóa reminder
export const deleteReminder = mutation({
    args: {
        reminderId: v.id("reminders"),
        occurrenceKey: v.optional(v.string()),
        legacyCompatibility: v.optional(v.boolean()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const reminder = await ctx.db.get(args.reminderId);

        if (!reminder || reminder.userId !== user._id) {
            throw new Error("Reminder not found or unauthorized");
        }
        assertReminderDeletable(reminder, args.occurrenceKey, args.legacyCompatibility);

        if (reminder.entityUuid) {
            await writeTombstone(ctx, {
                userId: user._id,
                entityType: "reminder",
                entityUuid: reminder.entityUuid,
                deleteOperationId: `direct-reminder-delete:${String(args.reminderId)}`,
                previousRevision: reminder.revision,
            });
        }
        await ctx.db.delete(args.reminderId);
        await markSyncDatasetChanged(ctx, user._id);
    },
});
