// Richfarm — Convex Storage Functions
// Quản lý upload/download ảnh qua Convex Storage
// Thiết kế để dễ migrate sang Cloudflare R2 sau này:
//   - Chỉ cần thay đổi getImageUrl() để trả về R2 URL thay vì Convex URL
//   - plantsMaster.imageUrl sẽ vẫn là string URL, không thay đổi schema

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/user";
import { getTombstone, writeTombstone } from "./lib/syncProtocol";

// ==========================================
// Generate Upload URL (dùng từ client để upload trực tiếp)
// ==========================================
export const generateUploadUrl = mutation({
    args: {
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireUser(ctx, args.deviceId);
        return await ctx.storage.generateUploadUrl();
    },
});

// ==========================================
// Lưu ảnh plant vào database sau khi upload
// ==========================================
export const savePhoto = mutation({
    args: {
        plantId: v.id("userPlants"),
        storageId: v.id("_storage"),
        capturedAt: v.number(),
        localId: v.optional(v.string()),
        source: v.optional(v.string()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const plant = await ctx.db.get(args.plantId);
        if (!plant || plant.userId !== user._id) {
            throw new Error("Plant not found or unauthorized");
        }
        if (args.localId && await getTombstone(ctx, user._id, "photo", args.localId)) {
            throw new Error("discarded_deleted");
        }

        if (args.localId) {
            const existing = await ctx.db
                .query("plantPhotos")
                .withIndex("by_user_plant_local", (q) =>
                    q.eq("userPlantId", plant._id).eq("localId", args.localId)
                )
                .unique();
            if (existing) {
                return {
                    photoId: existing._id,
                    photoUrl: existing.photoUrl,
                    isPrimary: existing.isPrimary,
                };
            }
        }

        const url = await ctx.storage.getUrl(args.storageId);
        if (!url) throw new Error("Failed to get storage URL");

        const existingPhotos = await ctx.db
            .query("plantPhotos")
            .withIndex("by_user_plant", (q) => q.eq("userPlantId", plant._id))
            .take(1);
        const isPrimary = existingPhotos.length === 0;
        const now = Date.now();

        const photoId = await ctx.db.insert("plantPhotos", {
            userPlantId: plant._id,
            userId: user._id,
            localId: args.localId,
            photoUrl: url,
            thumbnailUrl: undefined,
            storageId: args.storageId,
            takenAt: args.capturedAt,
            uploadedAt: now,
            isPrimary,
            source: args.source ?? "camera",
            analysisStatus: "pending",
            entityUuid: args.localId,
            revision: 1,
        });
        if (!args.localId) await ctx.db.patch(photoId, { entityUuid: `legacy:${photoId}` });

        if (isPrimary && !plant.photoUrl) {
            await ctx.db.patch(plant._id, { photoUrl: url });
        }

        return { photoId, photoUrl: url, isPrimary };
    },
});

export const deletePhoto = mutation({
    args: {
        photoId: v.id("plantPhotos"),
        deviceId: v.optional(v.string()),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const photo = await ctx.db.get(args.photoId);
        if (!photo || photo.userId !== user._id) throw new Error("unauthorized");
        await writeTombstone(ctx, {
            userId: user._id,
            entityType: "photo",
            entityUuid: photo.entityUuid ?? photo.localId ?? `legacy:${photo._id}`,
            deleteOperationId: `legacy-delete:${photo._id}`,
            previousRevision: photo.revision,
        });
        await ctx.db.delete(photo._id);
        if (photo.storageId) await ctx.storage.delete(photo.storageId);
        const plant = await ctx.db.get(photo.userPlantId);
        if (plant?.photoUrl === photo.photoUrl) {
            const replacement = await ctx.db.query("plantPhotos")
                .withIndex("by_user_plant", (q) => q.eq("userPlantId", photo.userPlantId))
                .first();
            await ctx.db.patch(plant._id, { photoUrl: replacement?.photoUrl });
        }
        return null;
    },
});

// ==========================================
// Lấy URL của file đã upload
// ==========================================
export const getStorageUrl = query({
    args: {
        storageId: v.id("_storage"),
    },
    handler: async (ctx, args) => {
        return await ctx.storage.getUrl(args.storageId);
    },
});

// ==========================================
// Xóa file khỏi storage
// ==========================================
export const deleteStorageFile = mutation({
    args: {
        storageId: v.id("_storage"),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireUser(ctx, args.deviceId);
        await ctx.storage.delete(args.storageId);
    },
});
