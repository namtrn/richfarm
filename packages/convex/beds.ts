// Richfarm — Convex Beds
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByIdentityOrDevice, requireUser } from "./lib/user";
import { isPremiumActive } from "./lib/subscription";
import { getOwnedBedOrThrow, getOwnedGardenOrThrow } from "./lib/ownership";

const NAME_MAX = 40;
const FREE_BED_LIMIT = 3;

function assertNameLength(value: string) {
    if (value.trim().length > NAME_MAX) {
        throw new Error("NAME_TOO_LONG");
    }
}

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
        bedType: v.optional(v.string()),
        tiers: v.optional(v.number()),
        dimensions: v.optional(v.object({
            widthCm: v.number(),
            heightCm: v.number(),
        })),
        locationType: v.string(), // "indoor", "outdoor", "greenhouse", "balcony"
        areaM2: v.optional(v.number()),
        sunlightHours: v.optional(v.number()),
        soilType: v.optional(v.string()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        assertNameLength(args.name);
        if (args.gardenId) {
            await getOwnedGardenOrThrow(ctx, user._id, args.gardenId);
        }

        if (!isPremiumActive(user)) {
            const existingBeds = await ctx.db
                .query("beds")
                .withIndex("by_user", (q: any) => q.eq("userId", user._id))
                .collect();
            if (existingBeds.length >= FREE_BED_LIMIT) {
                throw new Error("BED_LIMIT_FREE");
            }
        }

        return await ctx.db.insert("beds", {
            userId: user._id,
            gardenId: args.gardenId,
            name: args.name,
            bedType: args.bedType,
            tiers: args.tiers,
            dimensions: args.dimensions,
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
        bedType: v.optional(v.string()),
        tiers: v.optional(v.number()),
        dimensions: v.optional(v.object({
            widthCm: v.number(),
            heightCm: v.number(),
        })),
        locationType: v.optional(v.string()),
        areaM2: v.optional(v.number()),
        sunlightHours: v.optional(v.number()),
        soilType: v.optional(v.string()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        await getOwnedBedOrThrow(ctx, user._id, args.bedId);

        if (args.name !== undefined) {
            assertNameLength(args.name);
        }
        if (args.gardenId !== undefined && args.gardenId) {
            await getOwnedGardenOrThrow(ctx, user._id, args.gardenId);
        }

        await ctx.db.patch(args.bedId, {
            ...(args.name !== undefined && { name: args.name }),
            ...(args.gardenId !== undefined && { gardenId: args.gardenId }),
            ...(args.bedType !== undefined && { bedType: args.bedType }),
            ...(args.tiers !== undefined && { tiers: args.tiers }),
            ...(args.dimensions !== undefined && { dimensions: args.dimensions }),
            ...(args.locationType !== undefined && { locationType: args.locationType }),
            ...(args.areaM2 !== undefined && { areaM2: args.areaM2 }),
            ...(args.sunlightHours !== undefined && { sunlightHours: args.sunlightHours }),
            ...(args.soilType !== undefined && { soilType: args.soilType }),
        });
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
        await getOwnedBedOrThrow(ctx, user._id, args.bedId);

        await ctx.db.delete(args.bedId);
    },
});
