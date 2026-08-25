// RichFarm — Pests and Diseases
import { query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
    normalizePestDiseaseLocale,
    projectPestDisease,
    selectPestDiseaseLocale,
    type PestDiseaseLocalizedRow,
} from "./lib/pestDiseaseProjection";

const sourceRefValidator = v.object({
    sourceSystem: v.optional(v.string()),
    sourceName: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sourceLocator: v.optional(v.string()),
});

const contentStatusValidator = v.union(
    v.literal("draft"),
    v.literal("published"),
    v.literal("needs_review"),
    v.literal("archived"),
    v.null(),
);

const reviewStatusValidator = v.union(
    v.literal("unreviewed"),
    v.literal("in_review"),
    v.literal("reviewed"),
    v.null(),
);

const contentOriginValidator = v.union(
    v.literal("authored"),
    v.literal("inherited"),
    v.literal("imported"),
    v.null(),
);

const pestDiseaseDetailValidator = v.object({
    key: v.string(),
    type: v.string(),
    name: v.string(),
    commonNameVi: v.union(v.string(), v.null()),
    scientificNames: v.array(v.string()),
    plantKeys: v.array(v.string()),
    imageUrl: v.union(v.string(), v.null()),
    identification: v.array(v.string()),
    damage: v.array(v.string()),
    prevention: v.array(v.string()),
    control: v.object({
        physical: v.array(v.string()),
        organic: v.array(v.string()),
        chemical: v.array(v.string()),
    }),
    plantsAffected: v.array(v.string()),
    sortOrder: v.number(),
    detailLocale: v.union(v.string(), v.null()),
    localizedName: v.string(),
    description: v.union(v.string(), v.null()),
    detailContent: v.union(v.string(), v.null()),
    contentVersion: v.union(v.number(), v.null()),
    contentStatus: contentStatusValidator,
    reviewStatus: reviewStatusValidator,
    contentOrigin: contentOriginValidator,
    contentHash: v.union(v.string(), v.null()),
    contentByteLength: v.union(v.number(), v.null()),
    sourceRefs: v.array(sourceRefValidator),
    reviewedAt: v.union(v.number(), v.null()),
    reviewedBy: v.union(v.string(), v.null()),
});

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

/**
 * Read one issue with its localized Markdown projection. The query is kept
 * separate from list() so opening one detail page does not make the library
 * list subscribe to every locale row.
 */
export const getDetail = query({
    args: {
        key: v.string(),
        locale: v.optional(v.string()),
    },
    returns: v.union(v.null(), pestDiseaseDetailValidator),
    handler: async (ctx, args) => {
        const key = args.key.trim();
        if (!key) return null;
        const baseRows = await ctx.db
            .query("pestsDiseases")
            .withIndex("by_key", (q) => q.eq("key", key))
            .take(2);
        if (baseRows.length === 0) return null;
        if (baseRows.length > 1) {
            throw new ConvexError({
                code: "PEST_DISEASE_KEY_DUPLICATE",
                message: `Pest/disease key ${key} is not unique`,
            });
        }

        const requestedLocale = normalizePestDiseaseLocale(args.locale ?? "en") || "en";
        const locales = new Set([requestedLocale, "en"]);
        const localizedRows: PestDiseaseLocalizedRow[] = [];
        for (const locale of locales) {
            const rows = await ctx.db
                .query("pestDiseaseI18n")
                .withIndex("by_key_locale", (q) => q.eq("pestDiseaseKey", key).eq("locale", locale))
                .take(2);
            if (rows.length > 1) {
                throw new ConvexError({
                    code: "PEST_DISEASE_LOCALE_DUPLICATE",
                    message: `Pest/disease locale ${key}/${locale} is not unique`,
                });
            }
            if (rows[0]) localizedRows.push(rows[0] as PestDiseaseLocalizedRow);
        }

        return projectPestDisease(
            baseRows[0],
            selectPestDiseaseLocale(localizedRows, requestedLocale),
        );
    },
});

/**
 * Return the lookup issues attached to a canonical plant key. Plant keys are
 * scientific-name slugs (for example `solanum-lycopersicum`), so localized
 * common names never participate in the relationship lookup.
 */
export const listForPlant = query({
    args: {
        plantKey: v.string(),
        type: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const rows = args.type
            ? await ctx.db
                .query("pestsDiseases")
                .withIndex("by_type_sort", (q) => q.eq("type", args.type!))
                .collect()
            : await ctx.db.query("pestsDiseases").collect();

        return rows
            .filter((row) => row.plantKeys?.includes(args.plantKey) ?? false)
            .sort((a, b) => a.sortOrder - b.sortOrder);
    },
});
