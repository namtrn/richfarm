// Richfarm — Convex Gardens
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByIdentityOrDevice, requireUser } from "./lib/user";

// Lấy tất cả gardens của user
export const getGardens = query({
    args: {
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getUserByIdentityOrDevice(ctx, args.deviceId);
        if (!user) return [];

        return await ctx.db
            .query("gardens")
            .withIndex("by_user", (q: any) => q.eq("userId", user._id))
            .filter((q: any) => q.neq(q.field("isDeleted"), true))
            .collect();
    },
});

// Tạo garden mới
export const createGarden = mutation({
    args: {
        name: v.string(),
        areaM2: v.optional(v.number()),
        locationType: v.string(),
        description: v.optional(v.string()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);

        return await ctx.db.insert("gardens", {
            userId: user._id,
            name: args.name,
            areaM2: args.areaM2,
            locationType: args.locationType,
            description: args.description,
        });
    },
});

// Cập nhật garden
export const updateGarden = mutation({
    args: {
        gardenId: v.id("gardens"),
        name: v.optional(v.string()),
        areaM2: v.optional(v.number()),
        locationType: v.optional(v.string()),
        description: v.optional(v.string()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const garden = await ctx.db.get(args.gardenId);

        if (!garden || garden.userId !== user._id) {
            throw new Error("Garden not found or unauthorized");
        }

        const { gardenId, deviceId, ...updates } = args;
        await ctx.db.patch(gardenId, updates);
    },
});

// Xóa garden (soft delete)
export const deleteGarden = mutation({
    args: {
        gardenId: v.id("gardens"),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const garden = await ctx.db.get(args.gardenId);

        if (!garden || garden.userId !== user._id) {
            throw new Error("Garden not found or unauthorized");
        }

        await ctx.db.patch(args.gardenId, { isDeleted: true });
    },
});

// Lấy beds thuộc một garden
export const getBedsInGarden = query({
    args: {
        gardenId: v.id("gardens"),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getUserByIdentityOrDevice(ctx, args.deviceId);
        if (!user) return [];

        return await ctx.db
            .query("beds")
            .withIndex("by_garden", (q: any) => q.eq("gardenId", args.gardenId))
            .collect();
    },
});
