// Richfarm — Plant i18n
import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
    plantGroupsSeed,
    plantsMasterSeed,
    plantI18nSeed,
} from "./data/plantsMasterSeed";
import {
    buildTaxonomyFields,
    DEFAULT_CULTIVAR_NORMALIZED,
    isInfraspecificCultivar,
    matchesTaxonomyIdentity,
    requireTaxonomyIdentity,
    taxonomyFieldsForStorage,
    withComputedPlantTaxonomy,
} from "./lib/plantTaxonomy";
import { upsertPlantCareI18n, upsertPlantCareProfile } from "./lib/plantCare";
import { requireAdminAccess } from "./lib/admin";

export const upsertPlantI18n = mutation({
    args: {
        adminKey: v.string(),
        plantId: v.id("plantsMaster"),
        locale: v.string(),
        commonName: v.string(),
        description: v.optional(v.string()),
        careContent: v.optional(v.string()),
        contentVersion: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        requireAdminAccess(args.adminKey);
        const normalized = args.locale.toLowerCase().trim();
        if (!normalized) {
            throw new Error("Locale is required");
        }

        const existing = await ctx.db
            .query("plantI18n")
            .withIndex("by_plant_locale", (q) =>
                q.eq("plantId", args.plantId).eq("locale", normalized)
            )
            .unique();

        if (existing) {
            await ctx.db.patch(existing._id, {
                commonName: args.commonName,
                description: args.description,
            });
            if (args.careContent !== undefined || args.contentVersion !== undefined) {
                await upsertPlantCareI18n(
                    ctx,
                    args.plantId,
                    normalized,
                    args.careContent,
                    args.contentVersion,
                );
            }
            return { updated: true };
        }

        await ctx.db.insert("plantI18n", {
            plantId: args.plantId,
            locale: normalized,
            commonName: args.commonName,
            description: args.description,
        });
        if (args.careContent !== undefined || args.contentVersion !== undefined) {
            await upsertPlantCareI18n(
                ctx,
                args.plantId,
                normalized,
                args.careContent,
                args.contentVersion,
            );
        }

        return { updated: false };
    },
});

export const syncEnglishSeedContent = internalMutation({
    args: {
        dryRun: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const dryRun = args.dryRun ?? false;
        const loadPlants = async () =>
            (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);

        let groupsInserted = 0;
        let groupsUpdated = 0;
        let plantsInserted = 0;
        let plantsUpdated = 0;
        let i18nInserted = 0;
        let i18nUpdated = 0;

        for (const group of plantGroupsSeed) {
            const existing = await ctx.db
                .query("plantGroups")
                .withIndex("by_key", (q) => q.eq("key", group.key))
                .unique();

            if (!existing) {
                if (!dryRun) {
                    await ctx.db.insert("plantGroups", group);
                }
                groupsInserted++;
                continue;
            }

            const needsUpdate =
                JSON.stringify(existing.displayName) !==
                JSON.stringify(group.displayName) ||
                existing.sortOrder !== group.sortOrder;
            if (needsUpdate) {
                if (!dryRun) {
                    await ctx.db.patch(existing._id, {
                        displayName: group.displayName,
                        sortOrder: group.sortOrder,
                    });
                }
                groupsUpdated++;
            }
        }

        for (const seed of plantsMasterSeed) {
            const cultivar = (seed as any).cultivar;
            const taxonomy = buildTaxonomyFields({
                scientificName: seed.scientificName,
                cultivar,
            });
            const taxonomyIdentity = requireTaxonomyIdentity(
                taxonomy,
                `Seed plant ${seed.scientificName}${cultivar ? ` (${cultivar})` : ""}`
            );
            if (
                taxonomyIdentity.cultivarNormalized !== DEFAULT_CULTIVAR_NORMALIZED &&
                !isInfraspecificCultivar(taxonomyIdentity.cultivarNormalized)
            ) {
                const baseRow = (await loadPlants()).find((plant) =>
                    matchesTaxonomyIdentity(plant, {
                        genusNormalized: taxonomyIdentity.genusNormalized,
                        speciesNormalized: taxonomyIdentity.speciesNormalized,
                        cultivarNormalized: DEFAULT_CULTIVAR_NORMALIZED,
                    })
                );
                if (!baseRow) {
                    throw new Error(
                        `Seed variant requires base species row first: ${seed.scientificName} (${cultivar})`
                    );
                }
            }
            const {
                typicalDaysToHarvest,
                germinationDays,
                lightRequirements,
                soilPref,
                spacingCm,
                maxPlantsPerM2,
                seedRatePerM2,
                waterLitersPerM2,
                yieldKgPerM2,
                wateringFrequencyDays,
                fertilizingFrequencyDays,
                ...seedWithoutCare
            } = seed as any;
            const careProfile = {
                typicalDaysToHarvest,
                germinationDays,
                lightRequirements,
                soilPref,
                spacingCm,
                maxPlantsPerM2,
                seedRatePerM2,
                waterLitersPerM2,
                yieldKgPerM2,
                wateringFrequencyDays,
                fertilizingFrequencyDays,
            };
            const seedWithTaxonomy = {
                ...seedWithoutCare,
                ...taxonomyFieldsForStorage(taxonomy),
            };
            const existing = (await loadPlants()).find((plant) =>
                matchesTaxonomyIdentity(plant, taxonomyIdentity)
            );

            let plantId = existing?._id;
            if (!existing) {
                if (!dryRun) {
                    plantId = await ctx.db.insert("plantsMaster", seedWithTaxonomy as any);
                    await upsertPlantCareProfile(ctx, plantId, careProfile);
                }
                plantsInserted++;
            } else {
                const updates: Record<string, unknown> = {};
                for (const [key, value] of Object.entries(seedWithTaxonomy)) {
                    const current = (existing as any)[key];
                    const same =
                        Array.isArray(value) || typeof value === "object"
                            ? JSON.stringify(current) === JSON.stringify(value)
                            : current === value;
                    if (!same) {
                        updates[key] = value;
                    }
                }
                if (Object.keys(updates).length > 0) {
                    if (!dryRun) {
                        await ctx.db.patch(existing._id, updates);
                        await upsertPlantCareProfile(ctx, existing._id, careProfile);
                    }
                    plantsUpdated++;
                } else if (!dryRun) {
                    await upsertPlantCareProfile(ctx, existing._id, careProfile);
                }
            }

            if (!plantId) continue;
        }

        for (const row of plantI18nSeed) {
            const rowTaxonomy = buildTaxonomyFields({
                scientificName: row.scientificName,
                cultivar: row.cultivar,
            });
            const taxonomyIdentity = requireTaxonomyIdentity(
                rowTaxonomy,
                `Seed i18n ${row.scientificName}${row.cultivar ? ` (${row.cultivar})` : ""}`
            );
            const plant = (await loadPlants()).find((candidate) =>
                matchesTaxonomyIdentity(candidate, taxonomyIdentity)
            );
            if (!plant) continue;

            const existingI18n = await ctx.db
                .query("plantI18n")
                .withIndex("by_plant_locale", (q) =>
                    q.eq("plantId", plant._id).eq("locale", row.locale)
                )
                .unique();

            if (existingI18n) {
                const needsUpdate =
                    existingI18n.commonName !== row.commonName ||
                    existingI18n.description !== row.description;
                if (needsUpdate) {
                    if (!dryRun) {
                        await ctx.db.patch(existingI18n._id, {
                            commonName: row.commonName,
                            description: row.description,
                        });
                    }
                    i18nUpdated++;
                }
            } else {
                if (!dryRun) {
                    await ctx.db.insert("plantI18n", {
                        plantId: plant._id,
                        locale: row.locale,
                        commonName: row.commonName,
                        description: row.description,
                    });
                }
                i18nInserted++;
            }
        }

        return {
            dryRun,
            groups: { inserted: groupsInserted, updated: groupsUpdated },
            plants: { inserted: plantsInserted, updated: plantsUpdated },
            plantI18n: { inserted: i18nInserted, updated: i18nUpdated },
        };
    },
});

export const migrateLegacyCareToPlantCareI18n = mutation({
    args: {
        adminKey: v.string(),
    },
    handler: async (ctx, args) => {
        requireAdminAccess(args.adminKey);
        const rows = await ctx.db.query("plantI18n").collect();
        let migrated = 0;
        let cleaned = 0;

        for (const row of rows as any[]) {
            const legacyCareContent = row.careContent;
            const legacyContentVersion = row.contentVersion;

            if (legacyCareContent !== undefined || legacyContentVersion !== undefined) {
                if (legacyCareContent) {
                    await upsertPlantCareI18n(
                        ctx,
                        row.plantId,
                        row.locale,
                        legacyCareContent,
                        legacyContentVersion,
                    );
                    migrated += 1;
                }

                await ctx.db.replace(row._id, {
                    plantId: row.plantId,
                    locale: row.locale,
                    commonName: row.commonName,
                    description: row.description ?? undefined,
                });
                cleaned += 1;
            }
        }

        return { migrated, cleaned };
    },
});
