import { query } from "./_generated/server";
import { v } from "convex/values";
import {
    DEFAULT_CULTIVAR_NORMALIZED,
    normalizeTaxonomyToken,
    parseTaxonomyFromScientificName,
} from "./lib/plantTaxonomy";

const normalize = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

const isBasePlant = (plant: any) =>
    (plant?.cultivarNormalized ?? DEFAULT_CULTIVAR_NORMALIZED) ===
    DEFAULT_CULTIVAR_NORMALIZED;

const pickPreferredPlant = (plants: any[]) => {
    if (!plants || plants.length === 0) return null;
    return plants.find((plant) => isBasePlant(plant)) ?? plants[0];
};

const speciesKeyOf = (plant: any) => {
    if (plant?.genusNormalized && plant?.speciesNormalized) {
        return `${plant.genusNormalized}:${plant.speciesNormalized}`;
    }
    return normalize(plant?.scientificName ?? "");
};

const resolveByScientificName = async (ctx: any, scientificName: string) => {
    const parsed = parseTaxonomyFromScientificName(scientificName);
    if (parsed.genus && parsed.species) {
        const genusNormalized = normalizeTaxonomyToken(parsed.genus);
        const speciesNormalized = normalizeTaxonomyToken(parsed.species);
        const sameSpecies = await ctx.db
            .query("plantsMaster")
            .withIndex("by_genus_species", (q: any) =>
                q
                    .eq("genusNormalized", genusNormalized)
                    .eq("speciesNormalized", speciesNormalized)
            )
            .collect();
        const preferred = pickPreferredPlant(sameSpecies);
        if (preferred) {
            return { plant: preferred, matchType: "scientific_species" as const };
        }
    }

    const exactScientific = await ctx.db
        .query("plantsMaster")
        .withIndex("by_scientific_name", (q: any) =>
            q.eq("scientificName", scientificName)
        )
        .collect();
    const exactPreferred = pickPreferredPlant(exactScientific);
    if (exactPreferred) {
        return { plant: exactPreferred, matchType: "scientific" as const };
    }

    return null;
};

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
            const byScientific = await resolveByScientificName(ctx, scientificName);
            if (byScientific) {
                return {
                    plantId: byScientific.plant._id,
                    matchType: byScientific.matchType,
                };
            }

            // Fallback for case/diacritic differences from AI output.
            const scientificQuery = normalize(scientificName);
            const allPlants = await ctx.db.query("plantsMaster").collect();
            const exactNormalized = allPlants.filter(
                (p) => normalize(p.scientificName) === scientificQuery
            );
            const fuzzyContains = allPlants.filter((p) =>
                normalize(p.scientificName).includes(scientificQuery)
            );
            const fuzzyScientific =
                pickPreferredPlant(exactNormalized) ??
                pickPreferredPlant(fuzzyContains);
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
                    const exactRows = await ctx.db
                        .query("plantI18n")
                        .withIndex("by_locale_common_name", (q) =>
                            q.eq("locale", targetLocale).eq("commonName", trimmedName),
                        )
                        .collect();

                    if (exactRows.length > 0) {
                        const candidates = await Promise.all(
                            exactRows.map((row) => ctx.db.get(row.plantId))
                        );
                        const preferred = pickPreferredPlant(
                            candidates.filter(Boolean)
                        );
                        if (!preferred) continue;
                        return {
                            plantId: preferred._id,
                            matchType: targetLocale === locale ? "common_name" : "common_name_en",
                        };
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
                    return {
                        plantId: fuzzyMatch.plantId,
                        matchType: targetLocale === locale ? "common_name_fuzzy" : "common_name_en_fuzzy",
                    };
                }
            }
        }

        return null;
    },
});

/**
 * Lists plants in the master library with filtering.
 */
export const list = query({
    args: {
        group: v.optional(v.string()),
        family: v.optional(v.string()),
        purpose: v.optional(v.string()),
        locale: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const locale = args.locale ?? "en";

        const plants = args.group
            ? await ctx.db.query("plantsMaster").withIndex("by_group", (q) => q.eq("group", args.group!)).collect()
            : await ctx.db.query("plantsMaster").collect();

        // Localize
        return await Promise.all(
            plants.slice(0, args.limit ?? 100).map(async (p) => {
                const i18n = await ctx.db
                    .query("plantI18n")
                    .withIndex("by_plant_locale", (q) => q.eq("plantId", p._id).eq("locale", locale))
                    .first();

                return {
                    ...p,
                    commonName: i18n?.commonName ?? p.scientificName,
                    description: i18n?.description,
                    speciesKey: speciesKeyOf(p),
                    isBaseVariant: isBasePlant(p),
                };
            }),
        );
    },
});

/**
 * Searches the library using a query string.
 */
export const search = query({
    args: {
        query: v.string(),
        locale: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const locale = args.locale ?? "en";
        const searchTerm = normalize(args.query);
        if (!searchTerm) return [];

        // Simple implementation: fetch all localized names for the locale and filter
        const allI18n = await ctx.db
            .query("plantI18n")
            .withIndex("by_locale_common_name", (q) => q.eq("locale", locale))
            .collect();

        const matches = allI18n
            .filter((row) => normalize(row.commonName).includes(searchTerm))
            .slice(0, args.limit ?? 20);

        const results: any[] = [];
        const seen = new Set<string>();
        for (const m of matches) {
            const plant = await ctx.db.get(m.plantId);
            if (!plant) continue;
            const key = String(plant._id);
            if (seen.has(key)) continue;
            seen.add(key);
            results.push({
                ...plant,
                commonName: m.commonName,
                description: m.description,
                speciesKey: speciesKeyOf(plant),
                isBaseVariant: isBasePlant(plant),
            });
        }

        return results;
    },
});
