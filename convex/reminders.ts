// Richfarm — Convex Reminders
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByIdentityOrDevice, requireUser } from "./lib/user";

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

        return reminders;
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

        return reminders.filter(
            (r: any) =>
                r.enabled && (!r.snoozedUntil || r.snoozedUntil <= now)
        );
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

        const { reminderId, deviceId, ...updates } = args;
        await ctx.db.patch(reminderId, updates);
    },
});

// Đánh dấu reminder đã hoàn thành + tính nextRunAt tiếp theo
export const completeReminder = mutation({
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

        const now = Date.now();
        // Nếu có rrule thì tính nextRunAt tiếp theo (đơn giản: +1 ngày nếu daily)
        // TODO: dùng rrule library để parse đúng
        const nextRunAt = reminder.rrule
            ? now + 24 * 60 * 60 * 1000
            : reminder.nextRunAt;

        await ctx.db.patch(args.reminderId, {
            lastRunAt: now,
            nextRunAt,
            completedCount: (reminder.completedCount ?? 0) + 1,
        });
    },
});

// Xóa reminder
export const deleteReminder = mutation({
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

        await ctx.db.delete(args.reminderId);
    },
});
