// Richfarm — Convex Users
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { deviceToken, getUserByIdentityOrDevice, requireUser } from "./lib/user";
import type { Id } from "./_generated/dataModel";

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
    args: {
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            if (!args.deviceId) throw new Error("Not authenticated");

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
        }

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

// Xóa tài khoản và toàn bộ dữ liệu người dùng trong app.
export const deleteAccount = mutation({
    args: {
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);

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

        await ctx.db.delete(user._id);

        return { ok: true };
    },
});
