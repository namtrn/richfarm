import {
    action,
    internalAction,
    internalMutation,
    internalQuery,
    mutation,
    query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getUserByIdentity, requireUser } from "./lib/user";
import { resolveAppMode } from "./lib/appMode";
import { batchKey, reminderOccurrenceKey } from "./lib/carePlan";
import { markSyncDatasetChanged } from "./lib/syncProtocol";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const EXPO_BATCH_SIZE = 100;
const RECEIPT_DELAY_MS = 15_000;
const RECEIPT_RETRY_DELAY_MS = 60_000;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 15 * 60_000;
const UNRESOLVED_DISPATCH_STATUSES = new Set([
    "reserved", "ticket_accepted", "retryable", "unknown",
]);

type ExpoPushMessage = {
    to: string;
    title?: string;
    body?: string;
    sound?: "default";
    data?: Record<string, unknown>;
};

type DispatchItem = {
    reminderId: Id<"reminders">;
    occurrenceKey: string;
    scheduledAt: number;
};

type PreparedDispatch = {
    dispatchId: Id<"notificationDispatches">;
    dispatchKey: string;
    batchKey: string;
    tokenId: Id<"deviceTokens">;
    token: string;
    items: DispatchItem[];
    message: ExpoPushMessage;
};

type ExpoTicketResult = {
    status: "ok" | "error";
    id?: string;
    details?: { error?: string };
    message?: string;
};

function buildBedCountLabel(count: number) {
    if (!count) return "No plants";
    if (count === 1) return "1 plant";
    return `${count} plants`;
}

function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

function occurrenceKey(reminder: any) {
    return reminderOccurrenceKey(reminder);
}

function hasUnresolvedOccurrenceDispatch(dispatches: any[], reminder: any) {
    const key = occurrenceKey(reminder);
    return dispatches.some((row) =>
        UNRESOLVED_DISPATCH_STATUSES.has(row.status)
        && row.items.some((item: any) => item.occurrenceKey === key)
    );
}

function maskToken(token: string) {
    return token.length > 12 ? `${token.slice(0, 8)}…${token.slice(-4)}` : "masked";
}

function retryAt(now: number, attemptCount: number) {
    return now + Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(attemptCount, 5));
}

function isStoppedPlant(plant: any) {
    return !plant || plant.isDeleted || plant.status === "harvested" || plant.status === "archived";
}

function itemKey(item: { occurrenceKey: string }) {
    return item.occurrenceKey;
}

function sameItemSet(items: Array<{ occurrenceKey: string }>, other: Array<{ occurrenceKey: string }>) {
    const left = items.map(itemKey).sort();
    const right = other.map(itemKey).sort();
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function readJson(response: Response) {
    try {
        return await response.json() as any;
    } catch {
        return null;
    }
}

async function reminderLocation(ctx: any, reminder: any) {
    const plant = reminder.userPlantId ? await ctx.db.get(reminder.userPlantId) : null;
    return {
        plant,
        gardenId: plant?.gardenId ? String(plant.gardenId) : undefined,
        bedId: reminder.bedId
            ? String(reminder.bedId)
            : plant?.bedId
                ? String(plant.bedId)
                : undefined,
    };
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

        // A device may rotate its Expo token. Keep only the current token
        // active for that device, while preserving other devices on the account.
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

/** Deactivates this device's tokens before the authenticated account signs out. */
export const deactivateDeviceTokens = mutation({
    args: { deviceId: v.string() },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const now = Date.now();
        const rows = await ctx.db.query("deviceTokens")
            .withIndex("by_device", (q) => q.eq("deviceId", args.deviceId))
            .collect();
        let deactivatedCount = 0;
        for (const row of rows) {
            if (row.userId !== user._id || !row.isActive) continue;
            await ctx.db.patch(row._id, { isActive: false, lastUsedAt: now });
            deactivatedCount += 1;
        }
        return { ok: true, deactivatedCount };
    },
});

export const getDeviceTokenStatus = query({
    args: {},
    handler: async (ctx) => {
        const user = await getUserByIdentity(ctx);
        if (!user || process.env.RICHFARM_ENVIRONMENT !== "development") return [];
        const rows = await ctx.db.query("deviceTokens")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect();
        return rows.map((row) => ({
            deviceId: row.deviceId,
            platform: row.platform,
            isActive: row.isActive,
            lastUsedAt: row.lastUsedAt,
            token: maskToken(row.token),
        }));
    },
});

/** Development-only redacted dispatch evidence, including unknown next actions. */
export const getNotificationDispatchStatus = query({
    args: { dispatchId: v.optional(v.id("notificationDispatches")) },
    handler: async (ctx, args) => {
        if (process.env.RICHFARM_ENVIRONMENT !== "development") return [];
        const user = await getUserByIdentity(ctx);
        if (!user) return [];
        const rows = args.dispatchId
            ? [await ctx.db.get(args.dispatchId)]
            : await ctx.db.query("notificationDispatches")
                .withIndex("by_user", (q) => q.eq("userId", user._id))
                .collect();
        return await Promise.all(rows
            .filter((row): row is NonNullable<typeof row> => !!row && row.userId === user._id)
            .map((row) => dispatchEvidence(ctx, row)));
    },
});

/**
 * Reserve one stable, token-specific message for each still-undelivered
 * reminder occurrence. This mutation is intentionally separate from the
 * provider request: Convex mutations remain deterministic and the durable row
 * prevents concurrent cron runs from sending the same message twice.
 */
export const prepareDueNotificationDispatches = internalMutation({
    args: {
        userId: v.optional(v.id("users")),
        now: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const now = args.now ?? Date.now();
        const due = await ctx.db
            .query("reminders")
            .withIndex("by_next_run", (q) => q.lte("nextRunAt", now))
            .collect();

        const dueCandidates: any[] = [];
        for (const reminder of due) {
            if (args.userId && reminder.userId !== args.userId) continue;
            const wantsPush = reminder.notificationMethods
                ? reminder.notificationMethods.includes("push")
                : true;
            const notSnoozed = !reminder.snoozedUntil || reminder.snoozedUntil <= now;
            if (!reminder.enabled || !wantsPush || !notSnoozed) continue;
            const location = await reminderLocation(ctx, reminder);
            if (reminder.userPlantId && isStoppedPlant(location.plant)) continue;
            dueCandidates.push({ ...reminder, _location: location });
        }

        // `lastNotifiedAt` is a user-facing summary, not a per-token retry
        // cursor. Load dispatch history before applying it so a successful
        // device cannot suppress a retryable/unknown occurrence on another
        // intended device.
        const dispatchesByUser = new Map<string, any[]>();
        const candidateUserIds = Array.from(new Set(dueCandidates.map((reminder) => String(reminder.userId))));
        await Promise.all(candidateUserIds.map(async (userId) => {
            const rows = await ctx.db.query("notificationDispatches")
                .withIndex("by_user", (q) => q.eq("userId", userId as Id<"users">))
                .collect();
            dispatchesByUser.set(userId, rows);
        }));
        const dueReminders = dueCandidates.filter((reminder) =>
            (reminder.lastNotifiedAt ?? 0) < reminder.nextRunAt
            || hasUnresolvedOccurrenceDispatch(dispatchesByUser.get(String(reminder.userId)) ?? [], reminder)
        );

        const remindersByUser = new Map<string, any[]>();
        for (const reminder of dueReminders) {
            const key = String(reminder.userId);
            const list = remindersByUser.get(key) ?? [];
            list.push(reminder);
            remindersByUser.set(key, list);
        }

        const reservations: PreparedDispatch[] = [];
        const activeTokenCountByUser: Record<string, number> = {};

        for (const reminders of remindersByUser.values()) {
            const userId = reminders[0].userId as Id<"users">;
            const settings = await ctx.db
                .query("userSettings")
                .withIndex("by_user", (q) => q.eq("userId", userId))
                .unique();
            if (settings?.pushNotifications === false) continue;
            const appMode = resolveAppMode(settings ?? undefined);

            const activeTokens = (await ctx.db
                .query("deviceTokens")
                .withIndex("by_user", (q) => q.eq("userId", userId))
                .collect()).filter((token) => token.isActive);
            activeTokenCountByUser[String(userId)] = activeTokens.length;
            if (activeTokens.length === 0) continue;

            const existingDispatches = dispatchesByUser.get(String(userId)) ?? [];

            const bedPlantCounts = new Map<string, number>();
            if (appMode === "gardener") {
                const bedIds = Array.from(new Set(
                    reminders.map((reminder) => reminder._location.bedId).filter(Boolean)
                ));
                const counts = await Promise.all(bedIds.map(async (bedId) => {
                    const plants = await ctx.db
                        .query("userPlants")
                        .withIndex("by_bed", (q) => q.eq("bedId", bedId as any))
                        .collect();
                    return [bedId, plants.filter((plant) => !plant.isDeleted).length] as const;
                }));
                for (const [bedId, count] of counts) bedPlantCounts.set(bedId, count);
            }

            const notificationGroups = new Map<string, any[]>();
            for (const reminder of reminders) {
                const isCarePlan = Array.isArray(reminder.notificationMethods)
                    && reminder.notificationMethods.includes("care_plan_v2");
                const key = isCarePlan
                    ? batchKey({
                        dueAt: reminder.nextRunAt,
                        timezone: reminder.timezone,
                        gardenId: reminder._location.gardenId,
                        bedId: reminder._location.bedId,
                    })
                    : `legacy:${reminder._id}`;
                const group = notificationGroups.get(key) ?? [];
                group.push(reminder);
                notificationGroups.set(key, group);
            }

            for (const [groupKey, group] of notificationGroups.entries()) {
                for (const token of activeTokens) {
                    const pending = group.filter((reminder) => {
                        const key = occurrenceKey(reminder);
                        const rows = existingDispatches.filter((row) => row.tokenId === token._id
                            && row.items.some((item: any) => item.occurrenceKey === key));
                        if (rows.some((row) => row.status === "delivered" || row.status === "permanent_failure")) return false;
                        if (rows.some((row) => row.status === "reserved" || row.status === "ticket_accepted" || row.status === "unknown")) return false;
                        return !rows.some((row) => row.status === "retryable"
                            && row.nextAttemptAt !== undefined
                            && row.nextAttemptAt > now);
                    });
                    if (pending.length === 0) continue;

                    const items: DispatchItem[] = pending.map((reminder) => ({
                        reminderId: reminder._id,
                        occurrenceKey: occurrenceKey(reminder),
                        scheduledAt: reminder.nextRunAt,
                    }));
                    const reusable = existingDispatches.find((row) => row.tokenId === token._id
                        && row.batchKey === groupKey
                        && row.status === "retryable"
                        && (!row.nextAttemptAt || row.nextAttemptAt <= now)
                        && sameItemSet(row.items, items));
                    const dispatchKey = reusable?.dispatchKey
                        ?? `${userId}:${token._id}:${groupKey}:${items.map(itemKey).sort().join(",")}`;
                    const first = pending[0];
                    const body = pending.length > 1
                        ? `${pending.length} plant care checks are ready. Open RichFarm to review each plant.`
                        : first.description ?? "A plant care check is ready.";
                    const displayBody = appMode === "gardener" && first._location.bedId && pending.length === 1
                        ? buildBedCountLabel(bedPlantCounts.get(first._location.bedId) ?? 0)
                        : body;
                    const message: ExpoPushMessage = {
                        to: token.token,
                        sound: "default",
                        title: pending.length > 1 ? "Plant care checks" : first.title,
                        body: displayBody,
                        data: {
                            version: "care-plan-v2",
                            batchKey: groupKey,
                            reminderId: pending.length === 1 ? first._id : undefined,
                            reminderIds: pending.map((reminder) => reminder._id),
                            occurrenceKeys: items.map((item) => item.occurrenceKey),
                            userPlantId: pending.length === 1 ? first.userPlantId : undefined,
                            bedId: first.bedId,
                            type: first.type,
                        },
                    };

                    let dispatchId: Id<"notificationDispatches">;
                    if (reusable) {
                        dispatchId = reusable._id;
                        await ctx.db.patch(reusable._id, {
                            status: "reserved",
                            attemptCount: reusable.attemptCount + 1,
                            lastAttemptAt: now,
                            nextAttemptAt: undefined,
                            lastError: undefined,
                            updatedAt: now,
                        });
                    } else {
                        dispatchId = await ctx.db.insert("notificationDispatches", {
                            userId,
                            dispatchKey,
                            batchKey: groupKey,
                            tokenId: token._id,
                            items,
                            status: "reserved",
                            attemptCount: 1,
                            lastAttemptAt: now,
                            createdAt: now,
                            updatedAt: now,
                        });
                    }
                    reservations.push({
                        dispatchId,
                        dispatchKey,
                        batchKey: groupKey,
                        tokenId: token._id,
                        token: token.token,
                        items,
                        message,
                    });
                }
            }
        }

        return {
            dueReminderCount: dueReminders.length,
            activeTokenCount: Object.values(activeTokenCountByUser).reduce((sum, count) => sum + count, 0),
            reservations,
        };
    },
});

export const listPendingNotificationReceipts = internalQuery({
    args: { now: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const now = args.now ?? Date.now();
        return await ctx.db
            .query("notificationDispatches")
            .withIndex("by_status_receipt", (q) => q.eq("status", "ticket_accepted").lte("receiptCheckAt", now))
            .collect();
    },
});

export const deferNotificationReceipts = internalMutation({
    args: {
        dispatchIds: v.array(v.id("notificationDispatches")),
        nextCheckAt: v.number(),
        reason: v.string(),
    },
    handler: async (ctx, args) => {
        for (const dispatchId of args.dispatchIds) {
            const row = await ctx.db.get(dispatchId);
            if (!row || row.status !== "ticket_accepted") continue;
            await ctx.db.patch(dispatchId, {
                receiptCheckAt: args.nextCheckAt,
                lastError: args.reason,
                updatedAt: Date.now(),
            });
        }
    },
});

async function dispatchEvidence(ctx: any, row: any) {
    const token = await ctx.db.get(row.tokenId);
    return {
        dispatchId: row._id,
        userId: row.userId,
        dispatchKey: row.dispatchKey,
        batchKey: row.batchKey,
        status: row.status,
        items: row.items,
        expoTicketId: row.expoTicketId,
        attemptCount: row.attemptCount,
        lastAttemptAt: row.lastAttemptAt,
        nextAttemptAt: row.nextAttemptAt,
        receiptCheckAt: row.receiptCheckAt,
        lastError: row.lastError,
        acceptedAt: row.acceptedAt,
        deliveredAt: row.deliveredAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        token: token ? {
            deviceId: token.deviceId,
            platform: token.platform,
            isActive: token.isActive,
            lastUsedAt: token.lastUsedAt,
            token: maskToken(token.token),
        } : undefined,
    };
}

async function markDispatchDelivered(ctx: any, row: any, now: number) {
    await ctx.db.patch(row._id, {
        status: "delivered",
        receiptCheckAt: undefined,
        deliveredAt: now,
        lastError: undefined,
        updatedAt: now,
    });

    const changedUsers = new Set<Id<"users">>();
    for (const item of row.items) {
        const reminder = await ctx.db.get(item.reminderId);
        if (!reminder || !reminder.enabled || reminder.userId !== row.userId) continue;
        if (reminder.nextRunAt !== item.scheduledAt) continue;
        if (reminder.snoozedUntil && reminder.snoozedUntil > now) continue;
        const nextLastNotifiedAt = Math.max(reminder.lastNotifiedAt ?? 0, item.scheduledAt);
        if (nextLastNotifiedAt !== reminder.lastNotifiedAt) {
            await ctx.db.patch(reminder._id, { lastNotifiedAt: nextLastNotifiedAt });
            changedUsers.add(row.userId);
        }
    }
    for (const userId of changedUsers) {
        await markSyncDatasetChanged(ctx, userId);
    }
}

export const recordExpoSendResults = internalMutation({
    args: {
        requestOutcome: v.union(v.literal("accepted"), v.literal("retryable"), v.literal("unknown")),
        results: v.array(v.object({
            dispatchId: v.id("notificationDispatches"),
            status: v.union(v.literal("ok"), v.literal("error"), v.literal("missing")),
            ticketId: v.optional(v.string()),
            error: v.optional(v.string()),
        })),
        now: v.number(),
    },
    handler: async (ctx, args) => {
        const resultById = new Map(args.results.map((result) => [String(result.dispatchId), result]));
        let acceptedTickets = 0;
        let rejectedTickets = 0;
        let unknownRequests = 0;
        const reasons: string[] = [];

        const rows = args.results.length > 0
            ? await Promise.all(args.results.map((result) => ctx.db.get(result.dispatchId)))
            : [];
        const rowIds = new Set(args.results.map((result) => String(result.dispatchId)));
        if (args.requestOutcome !== "accepted") {
            const allReserved = args.results.length > 0
                ? rows
                : await ctx.db.query("notificationDispatches").withIndex("by_status_receipt", (q) => q.eq("status", "reserved")).collect();
            for (const row of allReserved) {
                if (!row || row.status !== "reserved") continue;
                if (args.results.length > 0 && !rowIds.has(String(row._id))) continue;
                const status = args.requestOutcome === "unknown" ? "unknown" : "retryable";
                await ctx.db.patch(row._id, {
                    status,
                    nextAttemptAt: status === "retryable" ? retryAt(args.now, row.attemptCount) : undefined,
                    lastError: args.requestOutcome === "unknown" ? "expo_request_unknown" : "expo_http_retryable",
                    updatedAt: args.now,
                });
                if (status === "unknown") unknownRequests += 1;
                else {
                    rejectedTickets += 1;
                    reasons.push("expo_http_retryable");
                }
            }
            return { acceptedTickets, rejectedTickets, unknownRequests, reasons };
        }

        for (const row of rows) {
            if (!row || row.status !== "reserved") continue;
            const result = resultById.get(String(row._id));
            if (result?.status === "error") {
                const error = result.error ?? "expo_provider_error";
                const permanent = error === "DeviceNotRegistered";
                if (permanent) {
                    await ctx.db.patch(row.tokenId, { isActive: false, lastUsedAt: args.now });
                }
                await ctx.db.patch(row._id, {
                    status: permanent ? "permanent_failure" : "retryable",
                    nextAttemptAt: permanent ? undefined : retryAt(args.now, row.attemptCount),
                    lastError: error,
                    updatedAt: args.now,
                });
                rejectedTickets += 1;
                reasons.push(error);
                continue;
            }
            if (!result || result.status === "missing" || !result.ticketId) {
                await ctx.db.patch(row._id, {
                    status: "unknown",
                    nextAttemptAt: undefined,
                    lastError: "expo_ticket_missing",
                    updatedAt: args.now,
                });
                unknownRequests += 1;
                reasons.push("expo_ticket_missing");
                continue;
            }
            if (result.status === "ok") {
                await ctx.db.patch(row._id, {
                    status: "ticket_accepted",
                    expoTicketId: result.ticketId,
                    acceptedAt: args.now,
                    receiptCheckAt: args.now + RECEIPT_DELAY_MS,
                    lastError: undefined,
                    updatedAt: args.now,
                });
                acceptedTickets += 1;
                continue;
            }
        }

        return { acceptedTickets, rejectedTickets, unknownRequests, reasons };
    },
});

export const recordExpoReceiptResults = internalMutation({
    args: {
        results: v.array(v.object({
            dispatchId: v.id("notificationDispatches"),
            ticketId: v.string(),
            status: v.union(v.literal("ok"), v.literal("error")),
            error: v.optional(v.string()),
        })),
        now: v.number(),
    },
    handler: async (ctx, args) => {
        let delivered = 0;
        let rejected = 0;
        const reasons: string[] = [];

        for (const result of args.results) {
            const row = await ctx.db.get(result.dispatchId);
            if (!row || row.status !== "ticket_accepted" || row.expoTicketId !== result.ticketId) continue;

            if (result.status !== "ok") {
                const error = result.error ?? "expo_receipt_error";
                const permanent = error === "DeviceNotRegistered";
                if (permanent) {
                    await ctx.db.patch(row.tokenId, { isActive: false, lastUsedAt: args.now });
                }
                await ctx.db.patch(row._id, {
                    status: permanent ? "permanent_failure" : "retryable",
                    nextAttemptAt: permanent ? undefined : retryAt(args.now, row.attemptCount),
                    receiptCheckAt: undefined,
                    lastError: error,
                    updatedAt: args.now,
                });
                rejected += 1;
                reasons.push(error);
                continue;
            }

            await markDispatchDelivered(ctx, row, args.now);
            delivered += 1;
        }
        return { delivered, rejected, reasons };
    },
});

export const getNotificationDispatchForReconciliation = internalQuery({
    args: { dispatchId: v.id("notificationDispatches") },
    handler: async (ctx, args) => {
        const user = await getUserByIdentity(ctx);
        if (!user) return null;
        const row = await ctx.db.get(args.dispatchId);
        if (!row || row.userId !== user._id) return null;
        return await dispatchEvidence(ctx, row);
    },
});

export const applyUnknownNotificationDispatchResolution = internalMutation({
    args: {
        dispatchId: v.id("notificationDispatches"),
        now: v.number(),
        providerTicketId: v.optional(v.string()),
        providerStatus: v.optional(v.union(
            v.literal("pending"), v.literal("ok"), v.literal("error"),
        )),
        providerError: v.optional(v.string()),
        operatorResolution: v.optional(v.union(
            v.literal("retry"), v.literal("permanent_failure"),
        )),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        const row = await ctx.db.get(args.dispatchId);
        if (!row || row.userId !== user._id) throw new Error("Notification dispatch not found");
        if (row.status !== "unknown") return await dispatchEvidence(ctx, row);

        if (args.providerStatus === "pending") {
            if (!args.providerTicketId) throw new Error("Provider ticket is required");
            await ctx.db.patch(row._id, {
                status: "ticket_accepted",
                expoTicketId: args.providerTicketId,
                acceptedAt: row.acceptedAt ?? args.now,
                receiptCheckAt: args.now + RECEIPT_RETRY_DELAY_MS,
                lastError: args.providerError ?? "expo_receipt_pending",
                updatedAt: args.now,
            });
        } else if (args.providerStatus === "ok") {
            if (!args.providerTicketId) throw new Error("Provider ticket is required");
            const resolvedRow = { ...row, expoTicketId: args.providerTicketId };
            await ctx.db.patch(row._id, {
                expoTicketId: args.providerTicketId,
                acceptedAt: row.acceptedAt ?? args.now,
            });
            await markDispatchDelivered(ctx, resolvedRow, args.now);
        } else if (args.providerStatus === "error") {
            if (!args.providerTicketId) throw new Error("Provider ticket is required");
            const error = args.providerError ?? "expo_receipt_error";
            const permanent = error === "DeviceNotRegistered";
            if (permanent) await ctx.db.patch(row.tokenId, { isActive: false, lastUsedAt: args.now });
            await ctx.db.patch(row._id, {
                expoTicketId: args.providerTicketId,
                status: permanent ? "permanent_failure" : "retryable",
                nextAttemptAt: permanent ? undefined : retryAt(args.now, row.attemptCount),
                receiptCheckAt: undefined,
                lastError: error,
                updatedAt: args.now,
            });
        } else if (args.operatorResolution === "retry") {
            await ctx.db.patch(row._id, {
                status: "retryable",
                nextAttemptAt: args.now,
                receiptCheckAt: undefined,
                lastError: "operator_retry",
                updatedAt: args.now,
            });
        } else if (args.operatorResolution === "permanent_failure") {
            await ctx.db.patch(row._id, {
                status: "permanent_failure",
                nextAttemptAt: undefined,
                receiptCheckAt: undefined,
                lastError: "operator_permanent_failure",
                updatedAt: args.now,
            });
        } else {
            throw new Error("Unknown dispatch resolution is required");
        }

        const resolved = await ctx.db.get(row._id);
        if (!resolved) throw new Error("Notification dispatch disappeared");
        return await dispatchEvidence(ctx, resolved);
    },
});

/**
 * Cron action: receipt polling happens before new reservations, so a successful
 * receipt advances lastNotifiedAt and removes that occurrence from the next
 * due scan. Provider request failures are recorded as retryable; a thrown
 * request is recorded as unknown and is never blindly resent.
 */
export const sendDueReminders = internalAction({
    args: {
        userId: v.optional(v.id("users")),
        now: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<any> => {
        const now = args.now ?? Date.now();
        const pendingReceipts: any[] = await ctx.runQuery(internal.notifications.listPendingNotificationReceipts, { now });
        let receiptDelivered = 0;
        let receiptRejected = 0;
        const receiptReasons: string[] = [];

        for (const receiptChunk of chunk(pendingReceipts, EXPO_BATCH_SIZE)) {
            const ticketIds = receiptChunk
                .map((row) => row.expoTicketId)
                .filter((ticketId): ticketId is string => typeof ticketId === "string");
            if (ticketIds.length === 0) continue;
            let response: Response | null = null;
            try {
                response = await fetch(EXPO_RECEIPTS_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids: ticketIds }),
                });
            } catch {
                response = null;
            }
            if (!response || !response.ok) {
                await ctx.runMutation(internal.notifications.deferNotificationReceipts, {
                    dispatchIds: receiptChunk.map((row) => row._id),
                    nextCheckAt: now + RECEIPT_RETRY_DELAY_MS,
                    reason: "expo_receipt_request_retryable",
                });
                continue;
            }
            const payload = await readJson(response);
            const receiptResults = receiptChunk.flatMap((row) => {
                const ticketId = row.expoTicketId as string | undefined;
                const receipt = ticketId ? payload?.data?.[ticketId] : undefined;
                if (!ticketId || !receipt || (receipt.status !== "ok" && receipt.status !== "error")) return [];
                return [{
                    dispatchId: row._id,
                    ticketId,
                    status: receipt.status as "ok" | "error",
                    error: receipt.details?.error ?? receipt.message,
                }];
            });
            if (receiptResults.length === 0) {
                await ctx.runMutation(internal.notifications.deferNotificationReceipts, {
                    dispatchIds: receiptChunk.map((row) => row._id),
                    nextCheckAt: now + RECEIPT_RETRY_DELAY_MS,
                    reason: "expo_receipt_pending",
                });
                continue;
            }
            const receiptResult = await ctx.runMutation(internal.notifications.recordExpoReceiptResults, {
                results: receiptResults,
                now,
            });
            receiptDelivered += receiptResult.delivered;
            receiptRejected += receiptResult.rejected;
            receiptReasons.push(...receiptResult.reasons);
        }

        const prepared: { dueReminderCount: number; activeTokenCount: number; reservations: PreparedDispatch[] } = await ctx.runMutation(internal.notifications.prepareDueNotificationDispatches, {
            userId: args.userId,
            now,
        });
        let attemptedMessages = 0;
        let acceptedTickets = 0;
        let rejectedTickets = 0;
        let unknownRequests = 0;
        const reasons = [...receiptReasons];

        for (const messageChunk of chunk(prepared.reservations, EXPO_BATCH_SIZE)) {
            attemptedMessages += messageChunk.length;
            let response: Response | null = null;
            try {
                response = await fetch(EXPO_PUSH_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(messageChunk.map((reservation) => reservation.message)),
                });
            } catch {
                response = null;
            }

            if (!response) {
                const result = await ctx.runMutation(internal.notifications.recordExpoSendResults, {
                    requestOutcome: "unknown",
                    results: messageChunk.map((reservation) => ({ dispatchId: reservation.dispatchId, status: "missing" as const })),
                    now,
                });
                unknownRequests += result.unknownRequests;
                reasons.push(...result.reasons);
                continue;
            }

            if (!response.ok) {
                const result = await ctx.runMutation(internal.notifications.recordExpoSendResults, {
                    requestOutcome: "retryable",
                    results: messageChunk.map((reservation) => ({ dispatchId: reservation.dispatchId, status: "missing" as const })),
                    now,
                });
                rejectedTickets += result.rejectedTickets;
                unknownRequests += result.unknownRequests;
                reasons.push(...result.reasons);
                continue;
            }

            const payload = await readJson(response);
            if (!payload || !Array.isArray(payload.data)) {
                const result = await ctx.runMutation(internal.notifications.recordExpoSendResults, {
                    requestOutcome: "unknown",
                    results: messageChunk.map((reservation) => ({ dispatchId: reservation.dispatchId, status: "missing" as const })),
                    now,
                });
                unknownRequests += result.unknownRequests;
                reasons.push(...result.reasons);
                continue;
            }
            const ticketResults: Array<{
                dispatchId: Id<"notificationDispatches">;
                status: "ok" | "error" | "missing";
                ticketId?: string;
                error?: string;
            }> = messageChunk.map((reservation, index) => {
                const ticket = payload?.data?.[index] as ExpoTicketResult | undefined;
                if (!ticket) return { dispatchId: reservation.dispatchId, status: "missing" };
                if (ticket.status === "ok" && ticket.id) {
                    return { dispatchId: reservation.dispatchId, status: "ok", ticketId: ticket.id };
                }
                if (ticket.status === "ok") {
                    return { dispatchId: reservation.dispatchId, status: "missing" };
                }
                return {
                    dispatchId: reservation.dispatchId,
                    status: "error",
                    ticketId: ticket.id,
                    error: ticket.details?.error ?? ticket.message,
                };
            });
            const result = await ctx.runMutation(internal.notifications.recordExpoSendResults, {
                requestOutcome: "accepted",
                results: ticketResults,
                now,
            });
            acceptedTickets += result.acceptedTickets;
            rejectedTickets += result.rejectedTickets;
            unknownRequests += result.unknownRequests;
            reasons.push(...result.reasons);
        }

        return {
            dueReminderCount: prepared.dueReminderCount,
            activeTokenCount: prepared.activeTokenCount,
            attemptedMessages,
            acceptedTickets,
            rejectedTickets,
            receiptDelivered,
            receiptRejected,
            unknownRequests,
            reasons,
            reservations: prepared.reservations.map((reservation) => ({
                dispatchKey: reservation.dispatchKey,
                batchKey: reservation.batchKey,
                reminderIds: reservation.items.map((item) => item.reminderId),
                occurrenceKeys: reservation.items.map((item) => item.occurrenceKey),
            })),
        };
    },
});

/**
 * Development-only reconciliation for a provider request whose response was
 * unknown. A supplied Expo ticket is resolved through the receipt endpoint;
 * without a ticket an operator must explicitly choose retry or permanent
 * failure. Unknown rows never disappear silently or get blindly resent.
 */
export const reconcileUnknownNotificationDispatch = action({
    args: {
        gate: v.string(),
        dispatchId: v.id("notificationDispatches"),
        expoTicketId: v.optional(v.string()),
        resolution: v.optional(v.union(
            v.literal("retry"), v.literal("permanent_failure"),
        )),
    },
    handler: async (ctx, args): Promise<any> => {
        assertDevelopmentTriggerGate(args.gate);
        if (args.expoTicketId && args.resolution) {
            throw new Error("Provider ticket and operator resolution are mutually exclusive");
        }

        const current: any = await ctx.runQuery(
            internal.notifications.getNotificationDispatchForReconciliation,
            { dispatchId: args.dispatchId },
        );
        if (!current) throw new Error("Notification dispatch not found");
        if (current.status !== "unknown") {
            return { ...current, reconciliation: "already_resolved" };
        }

        const now = Date.now();
        if (args.resolution) {
            const resolved: any = await ctx.runMutation(
                internal.notifications.applyUnknownNotificationDispatchResolution,
                { dispatchId: args.dispatchId, now, operatorResolution: args.resolution },
            );
            return { ...resolved, reconciliation: "operator_resolution" };
        }
        if (!args.expoTicketId) throw new Error("Provider ticket or operator resolution is required");

        let response: Response | null = null;
        try {
            response = await fetch(EXPO_RECEIPTS_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: [args.expoTicketId] }),
            });
        } catch {
            response = null;
        }

        let providerStatus: "pending" | "ok" | "error" = "pending";
        let providerError = "expo_receipt_pending";
        if (response?.ok) {
            const payload = await readJson(response);
            const receipt = payload?.data?.[args.expoTicketId];
            if (receipt?.status === "ok") {
                providerStatus = "ok";
                providerError = "";
            } else if (receipt?.status === "error") {
                providerStatus = "error";
                providerError = receipt.details?.error ?? receipt.message ?? "expo_receipt_error";
            }
        } else if (response) {
            providerError = "expo_receipt_request_retryable";
        } else {
            providerError = "expo_receipt_request_unknown";
        }

        const resolved: any = await ctx.runMutation(
            internal.notifications.applyUnknownNotificationDispatchResolution,
            {
                dispatchId: args.dispatchId,
                now,
                providerTicketId: args.expoTicketId,
                providerStatus,
                providerError: providerError || undefined,
            },
        );
        return {
            ...resolved,
            reconciliation: providerStatus === "pending" ? "provider_receipt_pending" : "provider_receipt",
            providerEvidence: {
                ticketId: args.expoTicketId,
                request: response ? (response.ok ? "accepted" : "retryable") : "unknown",
                status: providerStatus,
                error: providerError || undefined,
            },
        };
    },
});

export const prepareDevelopmentReminderTrigger = internalMutation({
    args: {
        reminderId: v.optional(v.id("reminders")),
        userPlantId: v.optional(v.id("userPlants")),
        now: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        if (!args.reminderId && !args.userPlantId) throw new Error("test_reminder_selector_required");
        let selected: any = args.reminderId ? await ctx.db.get(args.reminderId) : null;
        if (!selected && args.reminderId) throw new Error("test_reminder_not_found");
        if (!selected && args.userPlantId) {
            const candidates = await ctx.db.query("reminders")
                .withIndex("by_user_plant", (q) => q.eq("userPlantId", args.userPlantId))
                .collect();
            selected = candidates.find((reminder) => reminder.userId === user._id);
        }
        if (!selected || selected.userId !== user._id) throw new Error("test_reminder_not_found");
        if (!selected.enabled) throw new Error("test_reminder_disabled");
        if (!selected.carePlanId && !selected.taskType) throw new Error("test_care_reminder_required");
        const plant = selected.userPlantId ? await ctx.db.get(selected.userPlantId) : null;
        if (selected.userPlantId && isStoppedPlant(plant)) throw new Error("test_reminder_plant_inactive");

        const now = args.now ?? Date.now();
        const triggerAt = now - 60_000;
        await ctx.db.patch(selected._id, {
            nextRunAt: triggerAt,
            lastNotifiedAt: undefined,
            snoozedUntil: undefined,
            revision: (selected.revision ?? 1) + 1,
        });
        const location = await reminderLocation(ctx, { ...selected, nextRunAt: triggerAt });
        const activeTokens = (await ctx.db.query("deviceTokens")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect()).filter((token) => token.isActive);
        return {
            userId: user._id,
            reminderId: selected._id,
            occurrenceKey: `${selected.entityUuid ?? selected._id}:${triggerAt}`,
            batchKey: batchKey({
                dueAt: triggerAt,
                timezone: selected.timezone,
                gardenId: location.gardenId,
                bedId: location.bedId,
            }),
            activeTokenCount: activeTokens.length,
            triggeredAt: triggerAt,
        };
    },
});

function assertDevelopmentTriggerGate(gate: string) {
    const environment = process.env.RICHFARM_ENVIRONMENT;
    const expectedGate = process.env.RICHFARM_DEV_REMINDER_TRIGGER_TOKEN;
    if (process.env.NODE_ENV === "production" || environment !== "development") {
        throw new Error("test_reminder_trigger_not_available");
    }
    if (!expectedGate || gate !== expectedGate) {
        throw new Error("test_reminder_trigger_gate_rejected");
    }
}

/** Authenticated, development-only command callable with `convex run`. */
export const triggerCareReminderForDevelopment = action({
    args: {
        gate: v.string(),
        reminderId: v.optional(v.id("reminders")),
        userPlantId: v.optional(v.id("userPlants")),
        dispatchNow: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<any> => {
        assertDevelopmentTriggerGate(args.gate);
        const selected: any = await ctx.runMutation(internal.notifications.prepareDevelopmentReminderTrigger, {
            reminderId: args.reminderId,
            userPlantId: args.userPlantId,
        });
        if (args.dispatchNow === false) {
            return {
                selectedReminder: selected,
                occurrenceKey: selected.occurrenceKey,
                batchKey: selected.batchKey,
                activeTokenCount: selected.activeTokenCount,
                attemptedMessages: 0,
                acceptedTickets: 0,
                rejectedTickets: 0,
                reasons: [],
            };
        }
        const delivery: any = await ctx.runAction(internal.notifications.sendDueReminders, {
            userId: selected.userId,
        });
        return {
            selectedReminder: selected,
            occurrenceKey: selected.occurrenceKey,
            batchKey: selected.batchKey,
            activeTokenCount: selected.activeTokenCount,
            attemptedMessages: delivery.attemptedMessages,
            acceptedTickets: delivery.acceptedTickets,
            rejectedTickets: delivery.rejectedTickets,
            reasons: delivery.reasons,
            delivery,
        };
    },
});
