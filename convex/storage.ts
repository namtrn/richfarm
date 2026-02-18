// Richfarm — Convex Storage Functions
// Quản lý upload/download ảnh qua Convex Storage
// Thiết kế để dễ migrate sang Cloudflare R2 sau này:
//   - Chỉ cần thay đổi getImageUrl() để trả về R2 URL thay vì Convex URL
//   - plantsMaster.imageUrl sẽ vẫn là string URL, không thay đổi schema

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/user";

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
