import { query } from "./_generated/server";
import { v } from "convex/values";

const normalize = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

/**
 * Searches for a plant in the master library by scientific name or common name.
 * Used for "Smart Link" after AI detection.
 */
export const matchPlantInLibrary = query({
    args: {
        scientificName: v.optional(v.string()),
        commonNames: v.optional(v.array(v.string())),
        locale: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const locale = (args.locale ?? "en").toLowerCase();

        // 1) Scientific name exact match via index
        if (args.scientificName) {
            const scientificName = args.scientificName.trim();
            const plant = await ctx.db
                .query("plantsMaster")
                .withIndex("by_scientific_name", (q) => q.eq("scientificName", scientificName))
                .first();

            if (plant) return { plantId: plant._id, matchType: "scientific" };

            // Fallback for case/diacritic differences from AI output.
            const scientificQuery = normalize(scientificName);
            const allPlants = await ctx.db.query("plantsMaster").collect();
            const fuzzyScientific =
                allPlants.find((p) => normalize(p.scientificName) === scientificQuery) ??
                allPlants.find((p) => normalize(p.scientificName).includes(scientificQuery));
            if (fuzzyScientific) return { plantId: fuzzyScientific._id, matchType: "scientific_fuzzy" };
        }

        // 2) Common name exact/fuzzy in active locale, then English fallback.
        if (args.commonNames && args.commonNames.length > 0) {
            const normalizedNames = args.commonNames.map((name) => normalize(name)).filter(Boolean);
            const locales = locale === "en" ? ["en"] : [locale, "en"];

            for (const targetLocale of locales) {
                for (const name of args.commonNames) {
                    const trimmedName = name.trim();
                    if (!trimmedName) continue;
                    const exactMatch = await ctx.db
                        .query("plantI18n")
                        .withIndex("by_locale_common_name", (q) => q.eq("locale", targetLocale).eq("commonName", trimmedName))
                        .first();

                    if (exactMatch) {
                        return { plantId: exactMatch.plantId, matchType: targetLocale === locale ? "common_name" : "common_name_en" };
                    }
                }

                const rows = await ctx.db
                    .query("plantI18n")
                    .withIndex("by_locale_common_name", (q) => q.eq("locale", targetLocale))
                    .collect();

                const fuzzyMatch =
                    rows.find((row) => normalizedNames.includes(normalize(row.commonName))) ??
                    rows.find((row) => normalizedNames.some((name) => normalize(row.commonName).includes(name)));

                if (fuzzyMatch) {
                    return { plantId: fuzzyMatch.plantId, matchType: targetLocale === locale ? "common_name_fuzzy" : "common_name_en_fuzzy" };
                }
            }
        }

        return null;
    },
});
