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
            });
            return existing._id;
        }

        return await ctx.db.insert('userSettings', {
            userId: user._id,
            ...(args.unitSystem !== undefined && { unitSystem: args.unitSystem }),
        });
    },
});
