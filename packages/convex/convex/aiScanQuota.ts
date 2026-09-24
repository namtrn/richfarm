import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { getUserByIdentity } from "./lib/user";
import { getAiScanDailyLimit, getAiScanDateKey } from "./lib/aiScanLimit";

async function getSignedInUser(ctx: any) {
    const user = await getUserByIdentity(ctx);
    if (!user || user.isAnonymous === true) return null;
    return user;
}

async function getUsageRow(ctx: any, userId: string, dateKey: string) {
    return await ctx.db
        .query("aiScanUsage")
        .withIndex("by_user_date", (q: any) => q.eq("userId", userId).eq("dateKey", dateKey))
        .unique();
}

/** Remaining AI scans for today. `null` when the user is not signed in. */
export const getScanQuota = query({
    args: {},
    handler: async (ctx) => {
        const user = await getSignedInUser(ctx);
        if (!user) return null;
        const limit = getAiScanDailyLimit(user);
        const row = await getUsageRow(ctx, user._id, getAiScanDateKey());
        const used = row?.count ?? 0;
        return { used, limit, remaining: Math.max(limit - used, 0) };
    },
});

/** Consume one scan before calling the AI provider. */
export const reserveScan = internalMutation({
    args: {},
    handler: async (ctx) => {
        const user = await getSignedInUser(ctx);
        if (!user) {
            throw new ConvexError({ code: "AUTH_REQUIRED", message: "Sign in to use AI scan" });
        }
        const limit = getAiScanDailyLimit(user);
        const dateKey = getAiScanDateKey();
        const row = await getUsageRow(ctx, user._id, dateKey);
        const used = row?.count ?? 0;
        if (used >= limit) {
            throw new ConvexError({ code: "AI_SCAN_LIMIT_REACHED", message: "Daily AI scan limit reached", limit });
        }
        if (row) {
            await ctx.db.patch(row._id, { count: used + 1 });
        } else {
            await ctx.db.insert("aiScanUsage", { userId: user._id, dateKey, count: 1 });
        }
        return { dateKey };
    },
});

/** Give the scan back when the AI provider call failed. */
export const releaseScan = internalMutation({
    args: { dateKey: v.string() },
    handler: async (ctx, args) => {
        const user = await getSignedInUser(ctx);
        if (!user) return;
        const row = await getUsageRow(ctx, user._id, args.dateKey);
        if (!row || row.count <= 0) return;
        await ctx.db.patch(row._id, { count: row.count - 1 });
    },
});
