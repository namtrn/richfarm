import { query } from "./_generated/server";
import { v } from "convex/values";
import {
    DEFAULT_CULTIVAR_NORMALIZED,
    normalizeTaxonomyToken,
    parseTaxonomyFromScientificName,
    withComputedPlantTaxonomy,
} from "./lib/plantTaxonomy";
import { isDisplayBasePlant } from "../../shared/src/plantBase";
import { formatPlantFamilyDisplayName } from "../../shared/src/plantFamily";

const normalize = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

const normalizeFamily = (value?: string | null) =>
    (value ?? "").trim();

const isBasePlant = (plant: any) => isDisplayBasePlant(plant);

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

const localizedDisplayNameOf = async (ctx: any, plant: any, locale: string) => {
    const i18n = await ctx.db
        .query("plantI18n")
        .withIndex("by_plant_locale", (q: any) =>
            q.eq("plantId", plant._id).eq("locale", locale)
        )
        .first();

    return {
        commonName: i18n?.commonName ?? plant.scientificName,
        description: i18n?.description,
    };
};

const localizePlant = async (ctx: any, plant: any, locale: string) => {
    const localized = await localizedDisplayNameOf(ctx, plant, locale);
    return {
        ...plant,
        commonName: localized.commonName,
        description: localized.description,
        commonNameGroupKey: (plant as any).commonNameGroupKey ?? undefined,
        commonNameGroupVi: (plant as any).commonNameGroupVi ?? undefined,
        commonNameGroupEn: (plant as any).commonNameGroupEn ?? undefined,
        speciesKey: speciesKeyOf(plant),
        isBaseVariant: isBasePlant(plant),
    };
};

const loadPlantsForTaxonomyPath = async (ctx: any, args: {
    family?: string;
    genusNormalized?: string;
    speciesNormalized?: string;
}) => {
    const family = normalizeFamily(args.family);
    const allPlants = (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);

    if (family && args.genusNormalized && args.speciesNormalized) {
        return allPlants.filter((plant: any) =>
            normalizeFamily(plant.family) === family &&
            plant.genusNormalized === args.genusNormalized &&
            plant.speciesNormalized === args.speciesNormalized
        );
    }

    if (family && args.genusNormalized) {
        return allPlants.filter((plant: any) =>
            normalizeFamily(plant.family) === family &&
            plant.genusNormalized === args.genusNormalized
        );
    }

    if (family) {
        return allPlants.filter((plant: any) => normalizeFamily(plant.family) === family);
    }

    if (args.genusNormalized && args.speciesNormalized) {
        return allPlants.filter((plant: any) =>
            plant.genusNormalized === args.genusNormalized &&
            plant.speciesNormalized === args.speciesNormalized
        );
    }

    return allPlants;
};

const resolveByScientificName = async (ctx: any, scientificName: string) => {
    const parsed = parseTaxonomyFromScientificName(scientificName);
    if (parsed.genus && parsed.species) {
        const genusNormalized = normalizeTaxonomyToken(parsed.genus);
        const speciesNormalized = normalizeTaxonomyToken(parsed.species);
        const sameSpecies = (await ctx.db.query("plantsMaster").collect())
            .map(withComputedPlantTaxonomy)
            .filter((plant: any) =>
                plant.genusNormalized === genusNormalized &&
                plant.speciesNormalized === speciesNormalized
            );
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
            const allPlants = (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);
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
        let plants = args.group
            ? await ctx.db
                .query("plantsMaster")
                .withIndex("by_group", (q) => q.eq("group", args.group!))
                .collect()
            : await loadPlantsForTaxonomyPath(ctx, {
                family: args.family,
            });

        if (args.group && args.family) {
            const family = normalizeFamily(args.family);
            plants = plants.filter((plant: any) => normalizeFamily(plant.family) === family);
        }

        return await Promise.all(
            plants.slice(0, args.limit ?? 100).map((plant: any) =>
                localizePlant(ctx, plant, locale)
            )
        );
    },
});

export const listFamilies = query({
    args: {
        locale: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const plants = (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);
        const families = new Map<string, {
            name: string;
            genusSet: Set<string>;
            speciesSet: Set<string>;
            plantCount: number;
            samplePlant: any | null;
        }>();

        for (const plant of plants) {
            const family = normalizeFamily((plant as any).family);
            if (!family) continue;
            const entry = families.get(family) ?? {
                name: family,
                genusSet: new Set<string>(),
                speciesSet: new Set<string>(),
                plantCount: 0,
                samplePlant: null,
            };

            if ((plant as any).genusNormalized) {
                entry.genusSet.add(String((plant as any).genusNormalized));
            }
            if ((plant as any).genusNormalized && (plant as any).speciesNormalized) {
                entry.speciesSet.add(
                    `${(plant as any).genusNormalized}:${(plant as any).speciesNormalized}`
                );
            }
            entry.plantCount += 1;
            if (!entry.samplePlant || (isBasePlant(plant) && !isBasePlant(entry.samplePlant))) {
                entry.samplePlant = plant;
            }
            families.set(family, entry);
        }

        const rows = Array.from(families.values())
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(0, args.limit ?? 200);

        const locale = args.locale ?? "en";
        return await Promise.all(
            rows.map(async (row) => {
                const samplePlant = row.samplePlant
                    ? await localizePlant(ctx, row.samplePlant, locale)
                    : null;
                return {
                    key: row.name,
                    family: row.name,
                    familyDisplayName: formatPlantFamilyDisplayName(row.name, locale),
                    genusCount: row.genusSet.size,
                    speciesCount: row.speciesSet.size,
                    plantCount: row.plantCount,
                    samplePlant,
                };
            })
        );
    },
});

export const listGeneraByFamily = query({
    args: {
        family: v.string(),
        locale: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const family = normalizeFamily(args.family);
        if (!family) return [];

        const plants = await loadPlantsForTaxonomyPath(ctx, { family });
        const genera = new Map<string, {
            genusNormalized: string;
            genus: string;
            speciesSet: Set<string>;
            plantCount: number;
            samplePlant: any | null;
        }>();

        for (const plant of plants) {
            const genusNormalized = String((plant as any).genusNormalized ?? "").trim();
            if (!genusNormalized) continue;
            const genus = String((plant as any).genus ?? "").trim() || genusNormalized;
            const entry = genera.get(genusNormalized) ?? {
                genusNormalized,
                genus,
                speciesSet: new Set<string>(),
                plantCount: 0,
                samplePlant: null,
            };

            if ((plant as any).speciesNormalized) {
                entry.speciesSet.add(
                    `${genusNormalized}:${String((plant as any).speciesNormalized)}`
                );
            }
            entry.plantCount += 1;
            if (!entry.samplePlant || (isBasePlant(plant) && !isBasePlant(entry.samplePlant))) {
                entry.samplePlant = plant;
            }
            genera.set(genusNormalized, entry);
        }

        const locale = args.locale ?? "en";
        return await Promise.all(
            Array.from(genera.values())
                .sort((a, b) => a.genus.localeCompare(b.genus))
                .slice(0, args.limit ?? 200)
                .map(async (entry) => ({
                    key: entry.genusNormalized,
                    family,
                    familyDisplayName: formatPlantFamilyDisplayName(family, locale),
                    genus: entry.genus,
                    genusNormalized: entry.genusNormalized,
                    speciesCount: entry.speciesSet.size,
                    plantCount: entry.plantCount,
                    samplePlant: entry.samplePlant
                        ? await localizePlant(ctx, entry.samplePlant, locale)
                        : null,
                }))
        );
    },
});

export const listSpeciesByFamilyGenus = query({
    args: {
        family: v.string(),
        genusNormalized: v.string(),
        locale: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const family = normalizeFamily(args.family);
        const genusNormalized = normalizeTaxonomyToken(args.genusNormalized);
        if (!family || !genusNormalized) return [];

        const plants = await loadPlantsForTaxonomyPath(ctx, {
            family,
            genusNormalized,
        });

        const speciesMap = new Map<string, {
            speciesNormalized: string;
            species: string;
            speciesKey: string;
            scientificName: string;
            plantCount: number;
            basePlant: any | null;
        }>();

        for (const plant of plants) {
            const speciesNormalized = String((plant as any).speciesNormalized ?? "").trim();
            if (!speciesNormalized) continue;
            const speciesKey = `${genusNormalized}:${speciesNormalized}`;
            const species = String((plant as any).species ?? "").trim() || speciesNormalized;
            const entry = speciesMap.get(speciesKey) ?? {
                speciesNormalized,
                species,
                speciesKey,
                scientificName: String(plant.scientificName ?? "").trim(),
                plantCount: 0,
                basePlant: null,
            };

            entry.plantCount += 1;
            if (!entry.basePlant || (isBasePlant(plant) && !isBasePlant(entry.basePlant))) {
                entry.basePlant = plant;
                entry.scientificName = String(plant.scientificName ?? entry.scientificName).trim();
            }
            speciesMap.set(speciesKey, entry);
        }

        const locale = args.locale ?? "en";
        return await Promise.all(
            Array.from(speciesMap.values())
                .sort((a, b) => a.scientificName.localeCompare(b.scientificName))
                .slice(0, args.limit ?? 200)
                .map(async (entry) => {
                    const localizedBase = entry.basePlant
                        ? await localizePlant(ctx, entry.basePlant, locale)
                        : null;
                    return {
                        key: entry.speciesKey,
                        family,
                        familyDisplayName: formatPlantFamilyDisplayName(family, locale),
                        genusNormalized,
                        species: entry.species,
                        speciesNormalized: entry.speciesNormalized,
                        speciesKey: entry.speciesKey,
                        scientificName: entry.scientificName,
                        commonName: localizedBase?.commonName ?? entry.scientificName,
                        description: localizedBase?.description,
                        plantCount: entry.plantCount,
                        basePlantId: entry.basePlant?._id ?? null,
                        samplePlant: localizedBase,
                    };
                })
        );
    },
});

export const listPlantsBySpecies = query({
    args: {
        family: v.optional(v.string()),
        genusNormalized: v.string(),
        speciesNormalized: v.string(),
        locale: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const genusNormalized = normalizeTaxonomyToken(args.genusNormalized);
        const speciesNormalized = normalizeTaxonomyToken(args.speciesNormalized);
        if (!genusNormalized || !speciesNormalized) return [];

        const plants = await loadPlantsForTaxonomyPath(ctx, {
            family: args.family,
            genusNormalized,
            speciesNormalized,
        });

        const sorted = [...plants].sort((a: any, b: any) => {
            if (isBasePlant(a) !== isBasePlant(b)) {
                return isBasePlant(a) ? -1 : 1;
            }
            const aCultivar = String(a.cultivarNormalized ?? DEFAULT_CULTIVAR_NORMALIZED);
            const bCultivar = String(b.cultivarNormalized ?? DEFAULT_CULTIVAR_NORMALIZED);
            return aCultivar.localeCompare(bCultivar);
        });

        const locale = args.locale ?? "en";
        return await Promise.all(
            sorted.slice(0, args.limit ?? 200).map((plant) =>
                localizePlant(ctx, plant, locale)
            )
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
                commonNameGroupKey: (plant as any).commonNameGroupKey ?? undefined,
                commonNameGroupVi: (plant as any).commonNameGroupVi ?? undefined,
                commonNameGroupEn: (plant as any).commonNameGroupEn ?? undefined,
                speciesKey: speciesKeyOf(plant),
                isBaseVariant: isBasePlant(plant),
            });
        }

        return results;
    },
});
