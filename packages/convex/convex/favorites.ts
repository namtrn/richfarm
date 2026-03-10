// Richfarm — Favorites
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByIdentityOrDevice, requireUser } from "./lib/user";

export const list = query({
  args: {
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserByIdentityOrDevice(ctx, args.deviceId);
    if (!user) return [];
    return await ctx.db
      .query("userFavorites")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const toggle = mutation({
  args: {
    plantMasterId: v.id("plantsMaster"),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.deviceId);
    const existing = await ctx.db
      .query("userFavorites")
      .withIndex("by_user_plant", (q) =>
        q.eq("userId", user._id).eq("plantMasterId", args.plantMasterId)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { favorited: false };
    }

    await ctx.db.insert("userFavorites", {
      userId: user._id,
      plantMasterId: args.plantMasterId,
      createdAt: Date.now(),
    });

    return { favorited: true };
  },
});
