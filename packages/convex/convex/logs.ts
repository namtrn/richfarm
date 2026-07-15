import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/user";
import { appendPlantActivity, recomputeActivitySnapshot } from "./lib/plantActivities";
import { getTombstone, markSyncDatasetChanged, writeTombstone } from "./lib/syncProtocol";
import { assertLegacyWriteAllowed } from "./syncRuntime";

const activityType = v.union(
    v.literal("watering"),
    v.literal("fertilizing"),
    v.literal("pruning"),
    v.literal("pest_spotted"),
    v.literal("treatment"),
    v.literal("photo"),
    v.literal("note"),
    v.literal("transplanted"),
    v.literal("harvest"),
    v.literal("custom")
);

export const addActivity = mutation({
    args: {
        userPlantId: v.id("userPlants"),
        type: activityType,
        occurredAt: v.optional(v.number()),
        localId: v.optional(v.string()),
        note: v.optional(v.string()),
        title: v.optional(v.string()),
        value: v.optional(v.any()),
        reminderId: v.optional(v.id("reminders")),
        deviceId: v.optional(v.string()),
        clientVersion: v.optional(v.string()),
    },
    returns: v.id("logs"),
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        await assertLegacyWriteAllowed(ctx, args.clientVersion);
        const plant = await ctx.db.get(args.userPlantId);
        if (!plant || plant.userId !== user._id || plant.isDeleted) throw new Error("unauthorized");

        if (args.localId && await getTombstone(ctx, user._id, "activity", args.localId)) {
            throw new Error("discarded_deleted");
        }

        if (args.localId) {
            const existing = await ctx.db
                .query("logs")
                .withIndex("by_user_plant_local", (q) =>
                    q.eq("userPlantId", args.userPlantId).eq("localId", args.localId)
                )
                .unique();
            if (existing) return existing._id;
        }

        const occurredAt = args.occurredAt ?? Date.now();
        const id = await appendPlantActivity(ctx, {
            userId: user._id,
            userPlantId: args.userPlantId,
            type: args.type,
            occurredAt,
            source: args.reminderId ? "reminder" : "manual",
            localId: args.localId,
            reminderId: args.reminderId,
            title: args.title,
            note: args.note,
            value: args.value,
            entityUuid: args.localId,
            revision: 1,
        });
        if (!args.localId) await ctx.db.patch(id, { entityUuid: `legacy:${id}` });
        const snapshot = await recomputeActivitySnapshot(ctx, args.userPlantId, args.type);
        if (Object.keys(snapshot).length > 0) {
            await ctx.db.patch(args.userPlantId, {
                ...snapshot,
                version: (plant.version ?? 1) + 1,
            });
        }
        await markSyncDatasetChanged(ctx, user._id);
        return id;
    },
});

export const addLog = mutation({
    args: {
        userPlantId: v.id("userPlants"),
        type: activityType,
        note: v.optional(v.string()),
        recordedAt: v.optional(v.number()),
        source: v.optional(v.string()), // "manual", "sensor", "auto", "reminder"
        value: v.optional(v.any()),
        photoUrl: v.optional(v.string()),
        reminderId: v.optional(v.id("reminders")),
        clientVersion: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        await assertLegacyWriteAllowed(ctx, args.clientVersion);

        // Auth check
        const plant = await ctx.db.get(args.userPlantId);
        if (!plant || plant.userId !== user._id || plant.isDeleted) {
            throw new Error("unauthorized");
        }

        const occurredAt = args.recordedAt ?? Date.now();
        const logId = await appendPlantActivity(ctx, {
            userId: user._id,
            userPlantId: args.userPlantId,
            type: args.type,
            note: args.note,
            occurredAt,
            source: args.source === "reminder" ? "reminder" : "manual",
            value: args.value,
            reminderId: args.reminderId,
        });
        const snapshot = await recomputeActivitySnapshot(ctx, args.userPlantId, args.type);
        if (Object.keys(snapshot).length > 0) await ctx.db.patch(args.userPlantId, snapshot);

        await markSyncDatasetChanged(ctx, user._id);
        return logId;
    },
});

export const getLogsForPlant = query({
    args: {
        userPlantId: v.id("userPlants"),
        limit: v.optional(v.number()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);

        // Auth check
        const plant = await ctx.db.get(args.userPlantId);
        if (!plant || plant.userId !== user._id) {
            return [];
        }

        return await ctx.db
            .query("logs")
            .withIndex("by_user_plant_occurred", (q) => q.eq("userPlantId", args.userPlantId))
            .order("desc")
            .take(args.limit ?? 50);
    },
});

export const deleteLog = mutation({
    args: {
        id: v.id("logs"),
        deviceId: v.optional(v.string()),
        clientVersion: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        await assertLegacyWriteAllowed(ctx, args.clientVersion);
        const log = await ctx.db.get(args.id);

        if (!log || log.userId !== user._id) {
            throw new Error("unauthorized");
        }
        if (log.source !== "manual") throw new Error("system activities cannot be deleted");

        const entityUuid = log.entityUuid ?? log.localId ?? `legacy:${log._id}`;
        await writeTombstone(ctx, {
            userId: user._id,
            entityType: "activity",
            entityUuid,
            deleteOperationId: `legacy-delete:${log._id}`,
            previousRevision: log.revision,
        });
        await ctx.db.delete(args.id);
        if (log.harvestRecordId) {
            const harvest = await ctx.db.get(log.harvestRecordId);
            if (harvest && harvest.userId === user._id) {
                await writeTombstone(ctx, {
                    userId: user._id,
                    entityType: "harvest",
                    entityUuid: harvest.entityUuid ?? harvest.localId ?? `legacy:${harvest._id}`,
                    deleteOperationId: `legacy-delete:${harvest._id}`,
                    previousRevision: harvest.revision,
                });
                await ctx.db.delete(log.harvestRecordId);
            }
        }
        if (["watering", "fertilizing", "harvest"].includes(log.type)) {
            const snapshot = await recomputeActivitySnapshot(ctx, log.userPlantId, log.type);
            await ctx.db.patch(log.userPlantId, snapshot);
        }
        await markSyncDatasetChanged(ctx, user._id);
    },
});
