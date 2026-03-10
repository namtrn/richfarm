import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/user";

export const addLog = mutation({
    args: {
        userPlantId: v.id("userPlants"),
        type: v.string(), // "watering", "fertilizing", "pruning", "pest_spotted", "treatment", "harvest", "note", "photo", "status_change"
        note: v.optional(v.string()),
        recordedAt: v.optional(v.number()),
        source: v.optional(v.string()), // "manual", "sensor", "auto", "reminder"
        value: v.optional(v.any()),
        photoUrl: v.optional(v.string()),
        reminderId: v.optional(v.id("reminders")),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);

        // Auth check
        const plant = await ctx.db.get(args.userPlantId);
        if (!plant || plant.userId !== user._id) {
            throw new Error("unauthorized");
        }

        const logId = await ctx.db.insert("logs", {
            userId: user._id,
            userPlantId: args.userPlantId,
            type: args.type,
            note: args.note,
            recordedAt: args.recordedAt ?? Date.now(),
            source: args.source ?? "manual",
            value: args.value,
            photoUrl: args.photoUrl,
            reminderId: args.reminderId,
        });

        return logId;
    },
});

export const getLogsForPlant = query({
    args: {
        userPlantId: v.id("userPlants"),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);

        // Auth check
        const plant = await ctx.db.get(args.userPlantId);
        if (!plant || plant.userId !== user._id) {
            return [];
        }

        return await ctx.db
            .query("logs")
            .withIndex("by_user_plant", (q) => q.eq("userPlantId", args.userPlantId))
            .order("desc")
            .take(args.limit ?? 50);
    },
});

export const deleteLog = mutation({
    args: {
        id: v.id("logs"),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        const log = await ctx.db.get(args.id);

        if (!log || log.userId !== user._id) {
            throw new Error("unauthorized");
        }

        await ctx.db.delete(args.id);
    },
});
