// Richfarm — Convex Beds
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByIdentityOrDevice, requireUser } from "./lib/user";

// Lấy tất cả beds của user
export const getBeds = query({
    args: {
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getUserByIdentityOrDevice(ctx, args.deviceId);
        if (!user) return [];

        return await ctx.db
            .query("beds")
            .withIndex("by_user", (q: any) => q.eq("userId", user._id))
            .collect();
    },
});

// Tạo bed mới
export const createBed = mutation({
    args: {
        name: v.string(),
        gardenId: v.optional(v.id("gardens")),
        locationType: v.string(), // "indoor", "outdoor", "greenhouse", "balcony"
        areaM2: v.optional(v.number()),
        sunlightHours: v.optional(v.number()),
        soilType: v.optional(v.string()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);

        return await ctx.db.insert("beds", {
            userId: user._id,
            gardenId: args.gardenId,
            name: args.name,
            locationType: args.locationType,
            areaM2: args.areaM2,
            sunlightHours: args.sunlightHours,
            soilType: args.soilType,
        });
    },
});

// Cập nhật bed
export const updateBed = mutation({
    args: {
        bedId: v.id("beds"),
        name: v.optional(v.string()),
        gardenId: v.optional(v.id("gardens")),
        locationType: v.optional(v.string()),
        areaM2: v.optional(v.number()),
        sunlightHours: v.optional(v.number()),
        soilType: v.optional(v.string()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const bed = await ctx.db.get(args.bedId);

        if (!bed || bed.userId !== user._id) {
            throw new Error("Bed not found or unauthorized");
        }

        const { bedId, ...updates } = args;
        await ctx.db.patch(bedId, updates);
    },
});

// Xóa bed
export const deleteBed = mutation({
    args: {
        bedId: v.id("beds"),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const bed = await ctx.db.get(args.bedId);

        if (!bed || bed.userId !== user._id) {
            throw new Error("Bed not found or unauthorized");
        }

        await ctx.db.delete(args.bedId);
    },
});
