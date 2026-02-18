// Richfarm — Convex Plants
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByIdentityOrDevice, requireUser } from "./lib/user";

// Lấy tất cả cây của user (chưa bị xóa)
export const getUserPlants = query({
    args: {
        status: v.optional(v.string()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getUserByIdentityOrDevice(ctx, args.deviceId);
        if (!user) return [];

        let plantsQuery = ctx.db
            .query("userPlants")
            .withIndex("by_user", (q: any) => q.eq("userId", user._id));

        const plants = await plantsQuery.collect();

        return plants.filter((p: any) => {
            if (p.isDeleted) return false;
            if (args.status && p.status !== args.status) return false;
            return true;
        });
    },
});

// Thêm cây mới
export const addPlant = mutation({
    args: {
        nickname: v.optional(v.string()),
        plantMasterId: v.optional(v.id("plantsMaster")),
        bedId: v.optional(v.id("beds")),
        plantedAt: v.optional(v.number()),
        notes: v.optional(v.string()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);

        return await ctx.db.insert("userPlants", {
            userId: user._id,
            plantMasterId: args.plantMasterId,
            nickname: args.nickname,
            bedId: args.bedId,
            plantedAt: args.plantedAt ?? Date.now(),
            notes: args.notes,
            status: "planting",
            version: 1,
            isDeleted: false,
        });
    },
});

// Cập nhật trạng thái cây
export const updatePlantStatus = mutation({
    args: {
        plantId: v.id("userPlants"),
        status: v.string(),
        notes: v.optional(v.string()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const plant = await ctx.db.get(args.plantId);

        if (!plant || plant.userId !== user._id) {
            throw new Error("Plant not found or unauthorized");
        }

        await ctx.db.patch(args.plantId, {
            status: args.status,
            ...(args.notes !== undefined && { notes: args.notes }),
            version: (plant.version ?? 1) + 1,
        });
    },
});

// Cập nhật thông tin cây
export const updatePlant = mutation({
    args: {
        plantId: v.id("userPlants"),
        nickname: v.optional(v.string()),
        notes: v.optional(v.string()),
        bedId: v.optional(v.id("beds")),
        expectedHarvestDate: v.optional(v.number()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const plant = await ctx.db.get(args.plantId);

        if (!plant || plant.userId !== user._id) {
            throw new Error("Plant not found or unauthorized");
        }

        const { plantId, ...updates } = args;
        await ctx.db.patch(plantId, {
            ...updates,
            version: (plant.version ?? 1) + 1,
        });
    },
});

// Xóa mềm cây
export const deletePlant = mutation({
    args: {
        plantId: v.id("userPlants"),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const plant = await ctx.db.get(args.plantId);

        if (!plant || plant.userId !== user._id) {
            throw new Error("Plant not found or unauthorized");
        }

        await ctx.db.patch(args.plantId, {
            isDeleted: true,
            version: (plant.version ?? 1) + 1,
        });
    },
});
