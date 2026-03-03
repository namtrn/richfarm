import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getUserByIdentityOrDevice, requireUser } from './lib/user';

type AppMode = 'farmer' | 'gardener';

function normalizeAppMode(value?: string): AppMode | undefined {
    if (value === undefined) return undefined;
    if (value === 'farmer' || value === 'gardener') return value;
    throw new Error('Invalid appMode');
}

function deriveAppMode(onboarding: {
    goals?: string[];
    scaleEnvironment?: string[];
    experience?: string;
} | undefined): AppMode {
    if (!onboarding) return 'farmer';

    const farmGoals = ['food', 'business', 'offgrid'];
    const hasFarmGoal = (onboarding.goals ?? []).some((g) => farmGoals.includes(g));
    const isExperienced = ['intermediate', 'experienced'].includes(onboarding.experience ?? '');
    const isLargeScale = (onboarding.scaleEnvironment ?? []).some((s) =>
        ['mini_farm', 'large_farm', 'greenhouse'].includes(s)
    );

    if (hasFarmGoal || isLargeScale || isExperienced) return 'farmer';
    return 'gardener';
}

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

export const getAppMode = query({
    args: { deviceId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const user = await getUserByIdentityOrDevice(ctx, args.deviceId);
        if (!user) return 'farmer';
        const settings = await ctx.db
            .query('userSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .unique();
        if (settings?.appMode === 'farmer' || settings?.appMode === 'gardener') {
            return settings.appMode;
        }
        return deriveAppMode(settings?.onboarding);
    },
});

export const upsertUserSettings = mutation({
    args: {
        deviceId: v.optional(v.string()),
        appMode: v.optional(v.string()),
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

        const normalizedAppMode = normalizeAppMode(args.appMode);
        const shouldDerive = normalizedAppMode === undefined && !!args.onboarding && !existing?.appMode;
        const derivedAppMode = shouldDerive ? deriveAppMode(args.onboarding) : undefined;

        if (existing) {
            await ctx.db.patch(existing._id, {
                ...(normalizedAppMode !== undefined && { appMode: normalizedAppMode }),
                ...(derivedAppMode !== undefined && { appMode: derivedAppMode }),
                ...(args.unitSystem !== undefined && { unitSystem: args.unitSystem }),
                ...(args.theme !== undefined && { theme: args.theme }),
                ...(args.onboarding !== undefined && { onboarding: args.onboarding }),
            });
            return existing._id;
        }

        return await ctx.db.insert('userSettings', {
            userId: user._id,
            ...(normalizedAppMode !== undefined && { appMode: normalizedAppMode }),
            ...(derivedAppMode !== undefined && { appMode: derivedAppMode }),
            ...(args.unitSystem !== undefined && { unitSystem: args.unitSystem }),
            ...(args.theme !== undefined && { theme: args.theme }),
            ...(args.onboarding !== undefined && { onboarding: args.onboarding }),
        });
    },
});
