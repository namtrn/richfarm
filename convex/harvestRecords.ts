import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./auth";

export const addHarvest = mutation({
    args: {
        userPlantId: v.id("userPlants"),
        quantity: v.optional(v.number()),
        unit: v.optional(v.string()), // "g", "kg", "piece", "bunch"
        quality: v.optional(v.string()), // "excellent", "good", "average", "poor"
        notes: v.optional(v.string()),
        harvestDate: v.optional(v.number()),
        localId: v.optional(v.string()),
        photoUrl: v.optional(v.string()),
        preservationRecipeId: v.optional(v.id("preservationRecipes")),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);

        const plant = await ctx.db.get(args.userPlantId);
        if (!plant || plant.userId !== user._id) {
            throw new Error("unauthorized");
        }

        const harvestId = await ctx.db.insert("harvestRecords", {
            userId: user._id,
            userPlantId: args.userPlantId,
            quantity: args.quantity,
            unit: args.unit,
            quality: args.quality,
            notes: args.notes,
            harvestDate: args.harvestDate ?? Date.now(),
            localId: args.localId,
            photoUrl: args.photoUrl,
            preservationRecipeId: args.preservationRecipeId,
        });

        // Also add to logs automatically
        await ctx.db.insert("logs", {
            userId: user._id,
            userPlantId: args.userPlantId,
            type: "harvest",
            note: `Harvested ${args.quantity ?? ""} ${args.unit ?? ""}. ${args.notes ?? ""}`,
            recordedAt: args.harvestDate ?? Date.now(),
            source: "manual",
        });

        return harvestId;
    },
});

export const getHarvests = query({
    args: {
        userPlantId: v.optional(v.id("userPlants")),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);

        const results = args.userPlantId
            ? await ctx.db.query("harvestRecords").withIndex("by_user_plant", (q) => q.eq("userPlantId", args.userPlantId!)).collect()
            : await ctx.db.query("harvestRecords").collect();

        return results.filter(r => r.userId === user._id).sort((a, b) => b.harvestDate - a.harvestDate);
    },
});

export const getHarvestStats = query({
    handler: async (ctx) => {
        const user = await requireUser(ctx);

        const all = await ctx.db.query("harvestRecords").collect();
        const harvests = all.filter(h => h.userId === user._id);

        const totalByUnit: Record<string, number> = {};
        harvests.forEach(h => {
            if (h.unit && h.quantity) {
                totalByUnit[h.unit] = (totalByUnit[h.unit] || 0) + h.quantity;
            }
        });

        return {
            totalCount: harvests.length,
            totalByUnit,
        };
    },
});
