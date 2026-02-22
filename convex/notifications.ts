import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/user";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

type ExpoPushMessage = {
    to: string;
    title?: string;
    body?: string;
    sound?: "default";
    data?: Record<string, unknown>;
};

function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

export const registerDeviceToken = mutation({
    args: {
        token: v.string(),
        deviceId: v.string(),
        platform: v.string(),
        deviceIdForAuth: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceIdForAuth ?? args.deviceId);
        const now = Date.now();

        const existing = await ctx.db
            .query("deviceTokens")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .unique();

        if (existing) {
            await ctx.db.patch(existing._id, {
                userId: user._id,
                deviceId: args.deviceId,
                platform: args.platform,
                isActive: true,
                lastUsedAt: now,
            });
        } else {
            await ctx.db.insert("deviceTokens", {
                userId: user._id,
                deviceId: args.deviceId,
                platform: args.platform,
                token: args.token,
                isActive: true,
                lastUsedAt: now,
            });
        }

        const tokensForDevice = await ctx.db
            .query("deviceTokens")
            .withIndex("by_device", (q) => q.eq("deviceId", args.deviceId))
            .collect();

        for (const row of tokensForDevice) {
            if (row.token !== args.token && row.isActive) {
                await ctx.db.patch(row._id, {
                    isActive: false,
                    lastUsedAt: now,
                });
            }
        }

        return { ok: true };
    },
});

export const sendDueReminders = internalMutation({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();
        const due = await ctx.db
            .query("reminders")
            .withIndex("by_next_run", (q) => q.lte("nextRunAt", now))
            .collect();

        const dueReminders = due.filter((r: any) => {
            const wantsPush = r.notificationMethods
                ? r.notificationMethods.includes("push")
                : true;
            const notSnoozed = !r.snoozedUntil || r.snoozedUntil <= now;
            const notNotified = (r.lastNotifiedAt ?? 0) < r.nextRunAt;
            return r.enabled && wantsPush && notSnoozed && notNotified;
        });

        if (dueReminders.length === 0) {
            return { sent: 0 };
        }

        const remindersByUser = new Map<string, any[]>();
        for (const reminder of dueReminders) {
            const key = reminder.userId.toString();
            const list = remindersByUser.get(key) ?? [];
            list.push(reminder);
            remindersByUser.set(key, list);
        }

        let sentCount = 0;

        for (const reminders of remindersByUser.values()) {
            const userId = reminders[0].userId;
            const tokens = await ctx.db
                .query("deviceTokens")
                .withIndex("by_user", (q) => q.eq("userId", userId))
                .collect();

            const activeTokens = tokens.filter((t: any) => t.isActive);
            if (activeTokens.length === 0) continue;

            const messages: ExpoPushMessage[] = [];
            const tokenRefs: any[] = [];

            for (const reminder of reminders) {
                for (const token of activeTokens) {
                    messages.push({
                        to: token.token,
                        sound: "default",
                        title: reminder.title,
                        body: reminder.description ?? "Reminder due",
                        data: {
                            reminderId: reminder._id,
                            userPlantId: reminder.userPlantId,
                            bedId: reminder.bedId,
                            type: reminder.type,
                        },
                    });
                    tokenRefs.push(token);
                }
            }

            const messageChunks = chunk(messages, EXPO_BATCH_SIZE);
            const tokenChunks = chunk(tokenRefs, EXPO_BATCH_SIZE);
            let sentForUser = false;

            for (let i = 0; i < messageChunks.length; i += 1) {
                const messageChunk = messageChunks[i];
                const tokenChunk = tokenChunks[i] ?? [];

                const response = await fetch(EXPO_PUSH_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(messageChunk),
                });

                if (!response.ok) {
                    continue;
                }

                const payload = await response.json();
                const results = Array.isArray(payload?.data) ? payload.data : [];
                sentForUser = true;

                for (let j = 0; j < results.length; j += 1) {
                    const result = results[j];
                    const tokenRow = tokenChunk[j];
                    if (
                        result?.status === "error" &&
                        result?.details?.error === "DeviceNotRegistered" &&
                        tokenRow
                    ) {
                        await ctx.db.patch(tokenRow._id, {
                            isActive: false,
                            lastUsedAt: now,
                        });
                    }
                }

                sentCount += messageChunk.length;
            }

            if (sentForUser) {
                for (const token of activeTokens) {
                    await ctx.db.patch(token._id, { lastUsedAt: now });
                }

                for (const reminder of reminders) {
                    await ctx.db.patch(reminder._id, { lastNotifiedAt: now });
                }
            }
        }

        return { sent: sentCount };
    },
});
