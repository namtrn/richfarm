// Richfarm — Plant Images Management
// Quản lý ảnh cho plantsMaster library
// imageUrl trong plantsMaster là string URL — dễ swap sang R2/Cloudinary sau

import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/user";

// ==========================================
// Lấy danh sách plants có ảnh
// ==========================================
export const getPlantsWithImages = query({
    args: {
        group: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        let plants;
        if (args.group) {
            plants = await ctx.db
                .query("plantsMaster")
                .withIndex("by_group", (q) => q.eq("group", args.group!))
                .collect();
        } else {
            plants = await ctx.db.query("plantsMaster").collect();
        }

        return plants.map((p) => ({
            _id: p._id,
            commonNames: p.commonNames,
            group: p.group,
            imageUrl: p.imageUrl ?? null,
            hasImage: !!p.imageUrl,
        }));
    },
});

// ==========================================
// Cập nhật imageUrl cho plant (sau khi upload)
// ==========================================
export const updatePlantImage = mutation({
    args: {
        plantId: v.id("plantsMaster"),
        storageId: v.id("_storage"),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireUser(ctx, args.deviceId);
        const url = await ctx.storage.getUrl(args.storageId);
        if (!url) throw new Error("Failed to get storage URL");

        await ctx.db.patch(args.plantId, {
            imageUrl: url,
        });

        return url;
    },
});

// ==========================================
// Cập nhật imageUrl trực tiếp (dùng khi migrate sang R2)
// Chỉ cần gọi mutation này với URL mới từ R2
// ==========================================
export const setPlantImageUrl = internalMutation({
    args: {
        plantId: v.id("plantsMaster"),
        imageUrl: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.plantId, {
            imageUrl: args.imageUrl,
        });
    },
});

// ==========================================
// Xóa ảnh của plant
// ==========================================
export const removePlantImage = mutation({
    args: {
        plantId: v.id("plantsMaster"),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireUser(ctx, args.deviceId);
        await ctx.db.patch(args.plantId, {
            imageUrl: undefined,
        });
    },
});

// ==========================================
// Lấy plants chưa có ảnh (để biết cần upload gì)
// ==========================================
export const getPlantsWithoutImages = query({
    args: {},
    handler: async (ctx) => {
        const plants = await ctx.db.query("plantsMaster").collect();
        return plants
            .filter((p) => !p.imageUrl)
            .map((p) => ({
                _id: p._id,
                scientificName: p.scientificName,
                commonNames: p.commonNames,
                group: p.group,
            }));
    },
});
