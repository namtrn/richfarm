// Richfarm — Convex Users
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { deviceToken, getUserByIdentityOrDevice, requireUser } from "./lib/user";

// Lấy user hiện tại dựa trên tokenIdentifier
export const getCurrentUser = query({
    args: {
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        return await getUserByIdentityOrDevice(ctx, args.deviceId);
    },
});

// Tạo hoặc lấy user (gọi sau khi đăng nhập)
export const getOrCreateUser = mutation({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Not authenticated");

        const existing = await ctx.db
            .query("users")
            .withIndex("by_token", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (existing) {
            // Cập nhật thông tin nếu thay đổi
            await ctx.db.patch(existing._id, {
                name: identity.name ?? existing.name,
                email: identity.email ?? existing.email,
                lastSyncAt: Date.now(),
            });
            return existing._id;
        }

        // Tạo user mới
        return await ctx.db.insert("users", {
            tokenIdentifier: identity.tokenIdentifier,
            name: identity.name,
            email: identity.email,
            isActive: true,
            lastSyncAt: Date.now(),
        });
    },
});

// Tạo hoặc lấy user theo deviceId (anonymous per-device)
export const getOrCreateDeviceUser = mutation({
    args: {
        deviceId: v.string(),
    },
    handler: async (ctx, args) => {
        const tokenIdentifier = deviceToken(args.deviceId);

        const existing = await ctx.db
            .query("users")
            .withIndex("by_token", (q) =>
                q.eq("tokenIdentifier", tokenIdentifier)
            )
            .unique();

        if (existing) {
            await ctx.db.patch(existing._id, {
                lastSyncAt: Date.now(),
                deviceId: existing.deviceId ?? args.deviceId,
                isAnonymous: existing.isAnonymous ?? true,
            });
            return existing._id;
        }

        return await ctx.db.insert("users", {
            tokenIdentifier,
            deviceId: args.deviceId,
            isAnonymous: true,
            isActive: true,
            lastSyncAt: Date.now(),
        });
    },
});

// Cập nhật profile user
export const updateProfile = mutation({
    args: {
        deviceId: v.optional(v.string()),
        name: v.optional(v.string()),
        locale: v.optional(v.string()),
        timezone: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);

        await ctx.db.patch(user._id, {
            ...(args.name !== undefined && { name: args.name }),
            ...(args.locale !== undefined && { locale: args.locale }),
            ...(args.timezone !== undefined && { timezone: args.timezone }),
        });
    },
});
