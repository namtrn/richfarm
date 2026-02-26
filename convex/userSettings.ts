import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getUserByIdentityOrDevice, requireUser } from './lib/user';

export const getUserSettings = query({
    args: {
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getUserByIdentityOrDevice(ctx, args.deviceId);
        if (!user) return null;

        return await ctx.db
            .query('userSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .unique();
    },
});

export const upsertUserSettings = mutation({
    args: {
        deviceId: v.optional(v.string()),
        unitSystem: v.optional(v.string()),
        theme: v.optional(v.string()),
        onboarding: v.optional(
            v.object({
                goals: v.array(v.string()),
                scaleEnvironment: v.array(v.string()),
                crops: v.array(v.string()),
                experience: v.string(),
                needs: v.array(v.string()),
                completedAt: v.number(),
                version: v.optional(v.number()),
            })
        ),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const existing = await ctx.db
            .query('userSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .unique();

        if (existing) {
            await ctx.db.patch(existing._id, {
                ...(args.unitSystem !== undefined && { unitSystem: args.unitSystem }),
                ...(args.theme !== undefined && { theme: args.theme }),
                ...(args.onboarding !== undefined && { onboarding: args.onboarding }),
            });
            return existing._id;
        }

        return await ctx.db.insert('userSettings', {
            userId: user._id,
            ...(args.unitSystem !== undefined && { unitSystem: args.unitSystem }),
            ...(args.theme !== undefined && { theme: args.theme }),
            ...(args.onboarding !== undefined && { onboarding: args.onboarding }),
        });
    },
});
