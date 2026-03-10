// Richfarm — Pests and Diseases
import { query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
    args: {
        type: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        if (args.type) {
            return await ctx.db
                .query("pestsDiseases")
                .withIndex("by_type_sort", (q) => q.eq("type", args.type!))
                .collect();
        }

        const rows = await ctx.db.query("pestsDiseases").collect();
        return rows.sort((a, b) => {
            if (a.type !== b.type) return a.type.localeCompare(b.type);
            return a.sortOrder - b.sortOrder;
        });
    },
});

export const getByKey = query({
    args: {
        key: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("pestsDiseases")
            .withIndex("by_key", (q) => q.eq("key", args.key))
            .unique();
    },
});
