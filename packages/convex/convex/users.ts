// Richfarm — Convex Users
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
    getUserByIdentity,
    requireUser,
    upsertUserFromIdentity,
} from "./lib/user";
import { deleteAppUserData } from "./lib/deleteUserData";
import { authComponent, createAuth } from "./auth";

/**
 * Lấy user hiện tại theo session identity.
 * Auth-first: không nhận deviceId từ client (tránh client tự khai báo identity).
 * Trả null nếu chưa có session hoặc user chưa được tạo.
 */
export const getCurrentUser = query({
    args: {},
    handler: async (ctx) => {
        return await getUserByIdentity(ctx);
    },
});

/**
 * Bootstrap mutation — gọi sau khi Better Auth session được thiết lập.
 * Tạo hoặc upsert Convex user record từ identity.
 *
 * Auth-first: yêu cầu có session. Anonymous session vẫn được tính.
 * Edge case: user row bị xóa khỏi DB → auto-recreate từ identity.
 */
export const getOrCreateUser = mutation({
    args: {
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new ConvexError({
                code: 'UNAUTHORIZED',
                message: 'Session required — call getOrCreateUser only after Better Auth session is ready',
            });
        }
        const user = await upsertUserFromIdentity(ctx, args.deviceId);
        return user?._id ?? null;
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

/**
 * Xóa tài khoản và toàn bộ dữ liệu người dùng trong app.
 *
 * Thứ tự thực hiện (quan trọng):
 * 1. Lấy thông tin BA user (cần trước khi xóa Convex record)
 * 2. Xóa toàn bộ data Convex theo cascade
 * 3. Xóa Convex user record
 * 4. Xóa Better Auth account (nếu có BA record)
 *
 * Edge case: nếu step 4 fail (BA account đã xóa trước đó, session hết hạn),
 * Convex data đã được xóa thành công — không rollback.
 * Client phải gọi signOut() manually sau mutation này.
 */
export const deleteAccount = mutation({
    args: {
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);

        // Lấy BA user trước khi xóa Convex record
        const authUser = await authComponent.safeGetAuthUser(ctx);
        await deleteAppUserData(ctx, user);

        // ── Xóa Better Auth account ───────────────────────────────────────
        // authUser?._id là Convex BA user id (field đúng theo schema)
        // Chỉ xóa nếu có BA user record — anonymous device-only users không có
        if (authUser?._id) {
            try {
                const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
                await auth.api.deleteUser({
                    headers,
                    body: {},
                });
            } catch (e) {
                // BA account xóa thất bại (đã xóa trước đó, session hết hạn)
                // Convex data đã được xóa thành công — không rollback.
                console.warn('[deleteAccount] Failed to delete Better Auth account:', e);
            }
        }

        return { ok: true };
    },
});
