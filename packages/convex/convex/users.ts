// Richfarm — Convex Users
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
    getUserByIdentity,
    requireUser,
    upsertUserFromIdentity,
} from "./lib/user";
import { authComponent, createAuth } from "./auth";
import type { Id } from "./_generated/dataModel";

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

        // ── Xóa data theo cascade ─────────────────────────────────────────
        const userPlants = await ctx.db
            .query("userPlants")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect();
        const userPlantIds = new Set(userPlants.map((p) => p._id));

        const plantPhotosToDelete: Array<{
            _id: Id<"plantPhotos">;
            storageId?: Id<"_storage">;
        }> = [];
        for (const plantId of userPlantIds) {
            const photos = await ctx.db
                .query("plantPhotos")
                .withIndex("by_user_plant", (q) => q.eq("userPlantId", plantId))
                .collect();
            for (const photo of photos) {
                plantPhotosToDelete.push({
                    _id: photo._id,
                    storageId: photo.storageId,
                });
            }
        }

        const photoIds = new Set(plantPhotosToDelete.map((p) => p._id));
        for (const photoId of photoIds) {
            const queueItems = await ctx.db
                .query("aiAnalysisQueue")
                .withIndex("by_photo", (q) => q.eq("photoId", photoId))
                .collect();
            for (const item of queueItems) {
                await ctx.db.delete(item._id);
            }
        }

        for (const photo of plantPhotosToDelete) {
            if (photo.storageId) {
                await ctx.storage.delete(photo.storageId);
            }
            await ctx.db.delete(photo._id);
        }

        for (const plantId of userPlantIds) {
            const logs = await ctx.db
                .query("logs")
                .withIndex("by_user_plant", (q) => q.eq("userPlantId", plantId))
                .collect();
            for (const row of logs) {
                await ctx.db.delete(row._id);
            }

            const harvestRecords = await ctx.db
                .query("harvestRecords")
                .withIndex("by_user_plant", (q) => q.eq("userPlantId", plantId))
                .collect();
            for (const row of harvestRecords) {
                await ctx.db.delete(row._id);
            }
        }

        const reminders = await ctx.db
            .query("reminders")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect();
        for (const row of reminders) {
            await ctx.db.delete(row._id);
        }

        const favorites = await ctx.db
            .query("userFavorites")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect();
        for (const row of favorites) {
            await ctx.db.delete(row._id);
        }

        const beds = await ctx.db
            .query("beds")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect();
        for (const row of beds) {
            await ctx.db.delete(row._id);
        }

        const gardens = await ctx.db
            .query("gardens")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect();
        for (const row of gardens) {
            await ctx.db.delete(row._id);
        }

        for (const plant of userPlants) {
            await ctx.db.delete(plant._id);
        }

        const userSettings = await ctx.db
            .query("userSettings")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect();
        for (const row of userSettings) {
            await ctx.db.delete(row._id);
        }

        const deviceTokens = await ctx.db
            .query("deviceTokens")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect();
        for (const row of deviceTokens) {
            await ctx.db.delete(row._id);
        }

        const authoredRecipes = await ctx.db
            .query("preservationRecipes")
            .withIndex("by_author", (q) => q.eq("authorId", user._id))
            .collect();
        for (const recipe of authoredRecipes) {
            const recipeLocales = await ctx.db
                .query("recipeI18n")
                .withIndex("by_recipe_locale", (q) => q.eq("recipeId", recipe._id))
                .collect();
            for (const row of recipeLocales) {
                await ctx.db.delete(row._id);
            }
            await ctx.db.delete(recipe._id);
        }

        // ── Xóa Convex user record ────────────────────────────────────────
        await ctx.db.delete(user._id);

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
