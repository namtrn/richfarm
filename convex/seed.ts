// Richfarm — Seed Data
// Chạy: npx convex run seed:seedAll
// Hoặc từng function riêng lẻ qua Convex dashboard

import { internalMutation } from "./_generated/server";
import { plantGroupsSeed, plantsMasterSeed } from "./data/plantsMasterSeed";

// ==========================================
// Seed Plant Groups
// ==========================================
export const seedPlantGroups = internalMutation({
    args: {},
    handler: async (ctx) => {
        const groups = plantGroupsSeed;

        let count = 0;
        for (const group of groups) {
            const existing = await ctx.db
                .query("plantGroups")
                .withIndex("by_key", (q) => q.eq("key", group.key))
                .unique();

            if (!existing) {
                await ctx.db.insert("plantGroups", group);
                count++;
            }
        }

        return { inserted: count, total: groups.length };
    },
});

// ==========================================
// Seed Plants Master (popular plants)
// ==========================================
export const seedPlantsMaster = internalMutation({
    args: {},
    handler: async (ctx) => {
        const plants = plantsMasterSeed;

        let count = 0;
        for (const plant of plants) {
            const existing = await ctx.db
                .query("plantsMaster")
                .withIndex("by_scientific_name", (q) =>
                    q.eq("scientificName", plant.scientificName)
                )
                .unique();

            if (!existing) {
                await ctx.db.insert("plantsMaster", plant as any);
                count++;
            }
        }

        return { inserted: count, total: plants.length };
    },
});

// Chạy tất cả seed functions — gọi: npx convex run seed:seedAll
export const seedAll = internalMutation({
    args: {},
    handler: async (ctx) => {
        // --- Seed Plant Groups ---
        const groupDefs = plantGroupsSeed;

        let groupsInserted = 0;
        for (const group of groupDefs) {
            const existing = await ctx.db
                .query("plantGroups")
                .withIndex("by_key", (q) => q.eq("key", group.key))
                .unique();
            if (!existing) {
                await ctx.db.insert("plantGroups", group);
                groupsInserted++;
            }
        }

        return {
            groups: { inserted: groupsInserted, total: groupDefs.length },
            message: "Seed completed! Run seedPlantsMaster separately to add plants.",
        };
    },
});
