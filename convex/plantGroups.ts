// Richfarm — Plant Groups Query
import { query } from "./_generated/server";
import { v } from "convex/values";

// Lấy tất cả plant groups, sắp xếp theo sortOrder
export const list = query({
    args: {},
    handler: async (ctx) => {
        const groups = await ctx.db
            .query("plantGroups")
            .withIndex("by_sort_order")
            .collect();
        return groups;
    },
});

// Lấy group theo key
export const getByKey = query({
    args: { key: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("plantGroups")
            .withIndex("by_key", (q) => q.eq("key", args.key))
            .unique();
    },
});
