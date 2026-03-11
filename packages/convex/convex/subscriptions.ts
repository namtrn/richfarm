import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const upsertSubscriptionFromRevenueCat = internalMutation({
    args: {
        appUserId: v.string(),
        tier: v.union(v.literal("free"), v.literal("premium")),
        expiresAt: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const user = await ctx.db
            .query("users")
            .withIndex("by_revenuecat_app_user_id", (q) =>
                q.eq("revenueCatAppUserId", args.appUserId)
            )
            .unique();

        if (!user) {
            return { ok: false, reason: "user_not_found" as const };
        }

        await ctx.db.patch(user._id, {
            subscription: {
                tier: args.tier,
                ...(args.expiresAt !== undefined && { expiresAt: args.expiresAt }),
                source: "revenuecat",
            },
        });

        return { ok: true as const };
    },
});
