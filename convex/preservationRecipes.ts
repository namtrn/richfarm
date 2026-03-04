import { v } from "convex/values";
import { query } from "./_generated/server";

export const listByPlant = query({
    args: {
        plantId: v.id("plantsMaster"),
        locale: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const locale = args.locale ?? "en";

        // Search for recipes where plantId is in suitablePlants array
        // Since we can't easily query arrays with withIndex in Convex for now (unless specialized), 
        // we'll fetch and filter if collection is small, or use a better approach if available.

        const allRecipes = await ctx.db.query("preservationRecipes").collect();
        const suitable = allRecipes.filter(r => r.suitablePlants.includes(args.plantId));

        return await Promise.all(
            suitable.map(async (r) => {
                const i18n = await ctx.db
                    .query("recipeI18n")
                    .withIndex("by_recipe_locale", (q) => q.eq("recipeId", r._id).eq("locale", locale))
                    .first();

                return {
                    ...r,
                    displayName: i18n?.name ?? r.name,
                    localizedSteps: i18n?.steps ?? r.steps,
                    localizedSafetyNotes: i18n?.safetyNotes ?? r.safetyNotes,
                };
            })
        );
    },
});

export const getRecipe = query({
    args: {
        id: v.id("preservationRecipes"),
        locale: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const locale = args.locale ?? "en";
        const recipe = await ctx.db.get(args.id);
        if (!recipe) return null;

        const i18n = await ctx.db
            .query("recipeI18n")
            .withIndex("by_recipe_locale", (q) => q.eq("recipeId", args.id).eq("locale", locale))
            .first();

        return {
            ...recipe,
            displayName: i18n?.name ?? recipe.name,
            localizedSteps: i18n?.steps ?? recipe.steps,
            localizedSafetyNotes: i18n?.safetyNotes ?? recipe.safetyNotes,
        };
    },
});
