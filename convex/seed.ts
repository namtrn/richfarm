// Richfarm — Seed Data
// Chạy: npx convex run seed:seedAll
// Hoặc từng function riêng lẻ qua Convex dashboard

import { internalMutation } from "./_generated/server";
import { plantGroupsSeed, plantsMasterSeed } from "./data/plantsMasterSeed";
import { pestsDiseasesSeed } from "./data/pestsDiseasesSeed";

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

// ==========================================
// Seed Pests and Diseases
// ==========================================
export const seedPestsDiseases = internalMutation({
    args: {},
    handler: async (ctx) => {
        const entries = pestsDiseasesSeed;

        let count = 0;
        for (const entry of entries) {
            const existing = await ctx.db
                .query("pestsDiseases")
                .withIndex("by_key", (q) => q.eq("key", entry.key))
                .unique();

            if (!existing) {
                await ctx.db.insert("pestsDiseases", entry as any);
                count++;
            }
        }

        return { inserted: count, total: entries.length };
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

        // --- Seed Pests and Diseases ---
        const pestsDiseasesDefs = pestsDiseasesSeed;
        let pestsDiseasesInserted = 0;
        for (const entry of pestsDiseasesDefs) {
            const existing = await ctx.db
                .query("pestsDiseases")
                .withIndex("by_key", (q) => q.eq("key", entry.key))
                .unique();
            if (!existing) {
                await ctx.db.insert("pestsDiseases", entry as any);
                pestsDiseasesInserted++;
            }
        }

        return {
            groups: { inserted: groupsInserted, total: groupDefs.length },
            pestsDiseases: {
                inserted: pestsDiseasesInserted,
                total: pestsDiseasesDefs.length,
            },
            message: "Seed completed! Run seedPlantsMaster separately to add plants.",
        };
    },
});
