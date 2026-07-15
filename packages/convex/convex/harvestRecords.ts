import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/user";
import { appendPlantActivity, recomputeActivitySnapshot } from "./lib/plantActivities";
import { getTombstone, writeTombstone } from "./lib/syncProtocol";

export const addHarvest = mutation({
    args: {
        userPlantId: v.id("userPlants"),
        quantity: v.optional(v.number()),
        unit: v.optional(v.string()),
        quality: v.optional(v.string()),
        notes: v.optional(v.string()),
        harvestDate: v.optional(v.number()),
        localId: v.optional(v.string()),
        photoUrl: v.optional(v.string()),
        preservationRecipeId: v.optional(v.id("preservationRecipes")),
        deviceId: v.optional(v.string()),
    },
    returns: v.id("harvestRecords"),
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const plant = await ctx.db.get(args.userPlantId);
        if (!plant || plant.userId !== user._id || plant.isDeleted) throw new Error("unauthorized");

        if (args.localId && await getTombstone(ctx, user._id, "harvest", args.localId)) {
            throw new Error("discarded_deleted");
        }

        if (args.localId) {
            const existing = await ctx.db
                .query("harvestRecords")
                .withIndex("by_user_plant_local", (q) =>
                    q.eq("userPlantId", args.userPlantId).eq("localId", args.localId)
                )
                .unique();
            if (existing) return existing._id;
        }

        const harvestDate = args.harvestDate ?? Date.now();
        const harvestId = await ctx.db.insert("harvestRecords", {
            userId: user._id,
            userPlantId: args.userPlantId,
            quantity: args.quantity,
            unit: args.unit,
            quality: args.quality,
            notes: args.notes,
            harvestDate,
            localId: args.localId,
            photoUrl: args.photoUrl,
            preservationRecipeId: args.preservationRecipeId,
            entityUuid: args.localId,
            revision: 1,
        });
        if (!args.localId) await ctx.db.patch(harvestId, { entityUuid: `legacy:${harvestId}` });
        await appendPlantActivity(ctx, {
            userId: user._id,
            userPlantId: args.userPlantId,
            type: "harvest",
            occurredAt: harvestDate,
            source: "manual",
            localId: args.localId ? `harvest:${args.localId}` : undefined,
            harvestRecordId: harvestId,
            note: args.notes,
            value: { quantity: args.quantity, unit: args.unit },
        });
        const snapshot = await recomputeActivitySnapshot(ctx, args.userPlantId, "harvest");
        await ctx.db.patch(args.userPlantId, {
            ...snapshot,
            version: (plant.version ?? 1) + 1,
        });
        return harvestId;
    },
});

export const getHarvests = query({
    args: {
        userPlantId: v.optional(v.id("userPlants")),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        if (args.userPlantId) {
            const plant = await ctx.db.get(args.userPlantId);
            if (!plant || plant.userId !== user._id) return [];
            return await ctx.db
                .query("harvestRecords")
                .withIndex("by_user_plant_date", (q) => q.eq("userPlantId", args.userPlantId!))
                .order("desc")
                .collect();
        }
        const results = await ctx.db.query("harvestRecords").collect();
        return results.filter((row) => row.userId === user._id).sort((a, b) => b.harvestDate - a.harvestDate);
    },
});

export const deleteHarvest = mutation({
    args: {
        id: v.id("harvestRecords"),
        deviceId: v.optional(v.string()),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const harvest = await ctx.db.get(args.id);
        if (!harvest || harvest.userId !== user._id) throw new Error("unauthorized");

        await writeTombstone(ctx, {
            userId: user._id,
            entityType: "harvest",
            entityUuid: harvest.entityUuid ?? harvest.localId ?? `legacy:${harvest._id}`,
            deleteOperationId: `legacy-delete:${harvest._id}`,
            previousRevision: harvest.revision,
        });

        let logs = await ctx.db
            .query("logs")
            .withIndex("by_harvest_record", (q) => q.eq("harvestRecordId", args.id))
            .collect();
        // Records created before harvestRecordId was introduced used a deterministic
        // activity localId. Keep deletion correct for those already-synced clients.
        if (logs.length === 0 && harvest.localId) {
            const legacyLog = await ctx.db
                .query("logs")
                .withIndex("by_user_plant_local", (q) =>
                    q.eq("userPlantId", harvest.userPlantId).eq("localId", `harvest:${harvest.localId}`)
                )
                .unique();
            logs = legacyLog ? [legacyLog] : [];
        }
        for (const log of logs) await ctx.db.delete(log._id);
        await ctx.db.delete(args.id);

        const plant = await ctx.db.get(harvest.userPlantId);
        if (plant) {
            const snapshot = await recomputeActivitySnapshot(ctx, harvest.userPlantId, "harvest");
            await ctx.db.patch(harvest.userPlantId, {
                ...snapshot,
                version: (plant.version ?? 1) + 1,
            });
        }
        return null;
    },
});

export const getHarvestStats = query({
    args: {},
    handler: async (ctx) => {
        const user = await requireUser(ctx);
        const all = await ctx.db.query("harvestRecords").collect();
        const harvests = all.filter((h) => h.userId === user._id);
        const totalByUnit: Record<string, number> = {};
        for (const harvest of harvests) {
            if (harvest.unit && harvest.quantity) {
                totalByUnit[harvest.unit] = (totalByUnit[harvest.unit] || 0) + harvest.quantity;
            }
        }
        return { totalCount: harvests.length, totalByUnit };
    },
});
