// Richfarm — Recipe i18n
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const upsertRecipeI18n = mutation({
    args: {
        recipeId: v.id("preservationRecipes"),
        locale: v.string(),
        name: v.string(),
        steps: v.array(v.string()),
        safetyNotes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const normalized = args.locale.toLowerCase().trim();
        if (!normalized) {
            throw new Error("Locale is required");
        }

        const existing = await ctx.db
            .query("recipeI18n")
            .withIndex("by_recipe_locale", (q) =>
                q.eq("recipeId", args.recipeId).eq("locale", normalized)
            )
            .unique();

        if (existing) {
            await ctx.db.patch(existing._id, {
                name: args.name,
                steps: args.steps,
                safetyNotes: args.safetyNotes,
            });
            return { updated: true };
        }

        await ctx.db.insert("recipeI18n", {
            recipeId: args.recipeId,
            locale: normalized,
            name: args.name,
            steps: args.steps,
            safetyNotes: args.safetyNotes,
        });

        return { updated: false };
    },
});
