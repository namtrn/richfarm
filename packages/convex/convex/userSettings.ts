import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import {
    getOrCreateUserFromIdentity,
    getUserByIdentityOrDevice,
} from './lib/user';
import { deriveAppModeFromOnboarding, requireAppMode } from './lib/appMode';

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
        appMode: v.optional(v.string()),
        unitSystem: v.optional(v.string()),
        temperatureUnit: v.optional(v.union(v.literal('C'), v.literal('F'))),
        theme: v.optional(v.string()),
        showWeatherCard: v.optional(v.boolean()),
        onboarding: v.optional(
            v.object({
                role: v.optional(v.string()),
                goals: v.array(v.string()),
                scaleEnvironment: v.array(v.string()),
                crops: v.array(v.string()),
                experience: v.string(),
                needs: v.array(v.string()),
                purposeWeights: v.optional(v.record(v.string(), v.number())),
                environmentWeights: v.optional(v.record(v.string(), v.number())),
                completedAt: v.number(),
                version: v.optional(v.number()),
            })
        ),
    },
    handler: async (ctx, args) => {
        const user = await getOrCreateUserFromIdentity(ctx, args.deviceId);
        if (!user) return null;
        const existing = await ctx.db
            .query('userSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .unique();

        const normalizedAppMode = requireAppMode(args.appMode);
        const shouldDerive = normalizedAppMode === undefined && !!args.onboarding && !existing?.appMode;
        const derivedAppMode = shouldDerive ? deriveAppModeFromOnboarding(args.onboarding) : undefined;

        if (existing) {
            const now = Date.now();
            await ctx.db.patch(existing._id, {
                ...(normalizedAppMode !== undefined && { appMode: normalizedAppMode }),
                ...(derivedAppMode !== undefined && { appMode: derivedAppMode }),
                ...(args.unitSystem !== undefined && { unitSystem: args.unitSystem }),
                ...(args.temperatureUnit !== undefined && { temperatureUnit: args.temperatureUnit }),
                ...(args.theme !== undefined && { theme: args.theme }),
                ...(args.showWeatherCard !== undefined && { showWeatherCard: args.showWeatherCard }),
                ...(args.onboarding !== undefined && { onboarding: args.onboarding }),
                revision: (existing.revision ?? 1) + 1,
                generation: existing.generation ?? `preferences:${user._id}`,
                updatedAt: now,
            });
            return existing._id;
        }

        return await ctx.db.insert('userSettings', {
            userId: user._id,
            revision: 1,
            generation: `preferences:${user._id}`,
            updatedAt: Date.now(),
            ...(normalizedAppMode !== undefined && { appMode: normalizedAppMode }),
            ...(derivedAppMode !== undefined && { appMode: derivedAppMode }),
            ...(args.unitSystem !== undefined && { unitSystem: args.unitSystem }),
            ...(args.temperatureUnit !== undefined && { temperatureUnit: args.temperatureUnit }),
            ...(args.theme !== undefined && { theme: args.theme }),
            ...(args.showWeatherCard !== undefined && { showWeatherCard: args.showWeatherCard }),
            ...(args.onboarding !== undefined && { onboarding: args.onboarding }),
        });
    },
});

const preferencePatch = v.object({
    appMode: v.optional(v.string()),
    unitSystem: v.optional(v.string()),
    temperatureUnit: v.optional(v.union(v.literal('C'), v.literal('F'))),
    theme: v.optional(v.string()),
    defaultView: v.optional(v.string()),
    showWeatherCard: v.optional(v.boolean()),
    emailNotifications: v.optional(v.boolean()),
    pushNotifications: v.optional(v.boolean()),
    shareAnonymousData: v.optional(v.boolean()),
});

function canonicalize(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

export const applyPreferencesPatch = mutation({
    args: {
        deviceId: v.optional(v.string()),
        operationId: v.string(),
        baseRevision: v.number(),
        generation: v.string(),
        patch: preferencePatch,
    },
    handler: async (ctx, args) => {
        const user = await getOrCreateUserFromIdentity(ctx, args.deviceId);
        if (!user) return { status: 'unauthorized' as const };

        const fingerprint = canonicalize({
            baseRevision: args.baseRevision,
            generation: args.generation,
            patch: args.patch,
        });
        const receipt = await ctx.db
            .query('userPreferenceOperationReceipts')
            .withIndex('by_user_operation', (q) =>
                q.eq('userId', user._id).eq('operationId', args.operationId)
            )
            .unique();
        if (receipt) {
            return receipt.fingerprint === fingerprint
                ? { status: 'already_applied' as const, revision: receipt.revision }
                : { status: 'operation_conflict' as const };
        }

        const existing = await ctx.db
            .query('userSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .unique();
        const currentRevision = existing?.revision ?? 0;
        const currentGeneration = existing?.generation ?? `preferences:${user._id}`;
        if (args.generation !== currentGeneration) {
            return { status: 'wrong_generation' as const };
        }
        if (args.baseRevision !== currentRevision) {
            return { status: 'revision_conflict' as const, revision: currentRevision };
        }

        const revision = currentRevision + 1;
        const updatedAt = Date.now();
        if (existing) {
            await ctx.db.patch(existing._id, { ...args.patch, revision, generation: currentGeneration, updatedAt });
        } else {
            await ctx.db.insert('userSettings', {
                userId: user._id,
                ...args.patch,
                revision,
                generation: currentGeneration,
                updatedAt,
            });
        }
        await ctx.db.insert('userPreferenceOperationReceipts', {
            userId: user._id,
            operationId: args.operationId,
            fingerprint,
            revision,
            appliedAt: updatedAt,
        });
        return { status: 'applied' as const, revision };
    },
});
