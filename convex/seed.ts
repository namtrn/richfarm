// Richfarm — Seed Data
// Chạy: npx convex run seed:seedAll
// Hoặc từng function riêng lẻ qua Convex dashboard

import { internalMutation } from "./_generated/server";
import type { Doc, TableNames, Id } from "./_generated/dataModel";
import {
    plantGroupsSeed,
    plantsMasterSeed,
    plantI18nSeed,
    buildPlantSeedKey,
} from "./data/plantsMasterSeed";
import { pestsDiseasesSeed } from "./data/pestsDiseasesSeed";
import {
    buildTaxonomyFields,
    DEFAULT_CULTIVAR_NORMALIZED,
    isInfraspecificCultivar,
    requireTaxonomyIdentity,
} from "./lib/plantTaxonomy";

const DAY_MS = 24 * 60 * 60 * 1000;

type InsertDoc<TableName extends TableNames> = Omit<
    Doc<TableName>,
    "_id" | "_creationTime"
>;

function hashString(input: string) {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
        hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    return hash;
}

function formatYmd(timestamp: number) {
    const d = new Date(timestamp);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

async function seedPlantsAndI18n(ctx: any) {
    const plants = plantsMasterSeed;
    const idByPlantKey = new Map<string, Id<"plantsMaster">>();

    let plantsInserted = 0;
    for (const plant of plants) {
        const cultivar = (plant as any).cultivar;
        const plantKey = buildPlantSeedKey({
            scientificName: plant.scientificName,
            cultivar,
        });
        const taxonomy = buildTaxonomyFields({
            scientificName: plant.scientificName,
            cultivar,
        });
        const baseScientificTaxonomy = buildTaxonomyFields({
            scientificName: plant.scientificName,
        });
        const taxonomyIdentity = requireTaxonomyIdentity(
            taxonomy,
            `Seed plant ${plant.scientificName}${cultivar ? ` (${cultivar})` : ""}`
        );
        if (
            taxonomyIdentity.cultivarNormalized !== DEFAULT_CULTIVAR_NORMALIZED &&
            baseScientificTaxonomy.cultivarNormalized === DEFAULT_CULTIVAR_NORMALIZED &&
            !isInfraspecificCultivar(taxonomyIdentity.cultivarNormalized)
        ) {
            const baseRow = await ctx.db
                .query("plantsMaster")
                .withIndex("by_genus_species_cultivar", (q: any) =>
                    q
                        .eq("genusNormalized", taxonomyIdentity.genusNormalized)
                        .eq("speciesNormalized", taxonomyIdentity.speciesNormalized)
                        .eq("cultivarNormalized", DEFAULT_CULTIVAR_NORMALIZED)
                )
                .first();
            if (!baseRow) {
                throw new Error(
                    `Seed variant requires base species row first: ${plant.scientificName} (${cultivar})`
                );
            }
        }

        const existing = await ctx.db
            .query("plantsMaster")
            .withIndex("by_genus_species_cultivar", (q: any) =>
                q
                    .eq("genusNormalized", taxonomyIdentity.genusNormalized)
                    .eq("speciesNormalized", taxonomyIdentity.speciesNormalized)
                    .eq("cultivarNormalized", taxonomyIdentity.cultivarNormalized)
            )
            .first();

        if (!existing) {
            const basePlant: InsertDoc<"plantsMaster"> = {
                ...plant,
                companionPlants: undefined,
                avoidPlants: undefined,
                ...taxonomy,
            };
            const insertedId = await ctx.db.insert("plantsMaster", basePlant);
            idByPlantKey.set(plantKey, insertedId);
            plantsInserted++;
        } else {
            idByPlantKey.set(plantKey, existing._id);
        }
    }

    for (const plant of plants) {
        const plantId = idByPlantKey.get(
            buildPlantSeedKey({
                scientificName: plant.scientificName,
                cultivar: (plant as any).cultivar,
            })
        );
        if (!plantId) continue;
        const companionIds = (plant.companionPlants ?? [])
            .map((name) =>
                idByPlantKey.get(
                    buildPlantSeedKey({
                        scientificName: name,
                    })
                )
            )
            .filter((id): id is Id<"plantsMaster"> => Boolean(id));
        const avoidIds = (plant.avoidPlants ?? [])
            .map((name) =>
                idByPlantKey.get(
                    buildPlantSeedKey({
                        scientificName: name,
                    })
                )
            )
            .filter((id): id is Id<"plantsMaster"> => Boolean(id));

        if (companionIds.length === 0 && avoidIds.length === 0) continue;

        await ctx.db.patch(plantId, {
            ...(companionIds.length > 0 && { companionPlants: companionIds }),
            ...(avoidIds.length > 0 && { avoidPlants: avoidIds }),
        });
    }

    let i18nInserted = 0;
    let i18nUpdated = 0;
    let i18nSkipped = 0;
    for (const row of plantI18nSeed) {
        const plantId = idByPlantKey.get(
            buildPlantSeedKey({
                scientificName: row.scientificName,
                cultivar: row.cultivar,
            })
        );
        if (!plantId) continue;

        const existing = await ctx.db
            .query("plantI18n")
            .withIndex("by_plant_locale", (q: any) =>
                q.eq("plantId", plantId).eq("locale", row.locale)
            )
            .unique();

        if (!existing) {
            await ctx.db.insert("plantI18n", {
                plantId,
                locale: row.locale,
                commonName: row.commonName,
                description: row.description,
            });
            i18nInserted++;
            continue;
        }

        if (
            existing.commonName !== row.commonName ||
            existing.description !== row.description
        ) {
            await ctx.db.patch(existing._id, {
                commonName: row.commonName,
                description: row.description,
            });
            i18nUpdated++;
        } else {
            i18nSkipped++;
        }
    }

    return {
        plants: { inserted: plantsInserted, total: plants.length },
        plantI18n: {
            inserted: i18nInserted,
            updated: i18nUpdated,
            skipped: i18nSkipped,
            total: plantI18nSeed.length,
        },
    };
}

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
        return await seedPlantsAndI18n(ctx);
    },
});

// ==========================================
// Seed Pests and Diseases
// ==========================================
export const seedPestsDiseases = internalMutation({
    args: {},
    handler: async (ctx) => {
        const entries: Array<InsertDoc<"pestsDiseases">> = pestsDiseasesSeed;

        let inserted = 0;
        let updated = 0;
        for (const entry of entries) {
            const existing = await ctx.db
                .query("pestsDiseases")
                .withIndex("by_key", (q) => q.eq("key", entry.key))
                .unique();

            if (!existing) {
                await ctx.db.insert("pestsDiseases", entry);
                inserted++;
            } else {
                await ctx.db.patch(existing._id, entry);
                updated++;
            }
        }

        return { inserted, updated, total: entries.length };
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

        // --- Seed Plants + Plant I18n ---
        const plantsStats = await seedPlantsAndI18n(ctx);

        // --- Seed Pests and Diseases ---
        const pestsDiseasesDefs: Array<InsertDoc<"pestsDiseases">> = pestsDiseasesSeed;
        let pestsDiseasesInserted = 0;
        let pestsDiseasesUpdated = 0;
        for (const entry of pestsDiseasesDefs) {
            const existing = await ctx.db
                .query("pestsDiseases")
                .withIndex("by_key", (q) => q.eq("key", entry.key))
                .unique();
            if (!existing) {
                await ctx.db.insert("pestsDiseases", entry);
                pestsDiseasesInserted++;
            } else {
                await ctx.db.patch(existing._id, entry);
                pestsDiseasesUpdated++;
            }
        }

        return {
            groups: { inserted: groupsInserted, total: groupDefs.length },
            ...plantsStats,
            pestsDiseases: {
                inserted: pestsDiseasesInserted,
                updated: pestsDiseasesUpdated,
                total: pestsDiseasesDefs.length,
            },
            message: "Seed completed: groups, plants, plantI18n, pestsDiseases.",
        };
    },
});

// Seed mock timeline + reminders cho cây đang growing
// Chạy: npx convex run seed:seedGrowingPlantReminders
export const seedGrowingPlantReminders = internalMutation({
    args: {},
    handler: async (ctx) => {
        const plants = await ctx.db.query("userPlants").collect();
        const activePlants = plants.filter(
            (p: any) => p.status === "growing" && !p.isDeleted
        );

        let plantsUpdated = 0;
        let remindersInserted = 0;
        let remindersUpdated = 0;

        for (const plant of activePlants) {
            const key = String(plant._id);
            const hash = hashString(key);
            const masterPlant = plant.plantMasterId
                ? await ctx.db.get(plant.plantMasterId)
                : null;

            let plantedAt = plant.plantedAt;
            if (!plantedAt || plantedAt > Date.now()) {
                const mockAgoDays = 10 + (hash % 25); // 10-34 days ago
                plantedAt = Date.now() - (mockAgoDays * DAY_MS);
            }

            let expectedHarvestDate = plant.expectedHarvestDate;
            if (!expectedHarvestDate || expectedHarvestDate <= plantedAt) {
                let daysToHarvest: number | undefined;
                daysToHarvest = masterPlant?.typicalDaysToHarvest;
                if (!daysToHarvest || daysToHarvest < 7) {
                    daysToHarvest = 45 + (hash % 35); // 45-79 days after planted
                }
                expectedHarvestDate = plantedAt + (daysToHarvest * DAY_MS);
            }

            const needsPatch =
                plant.plantedAt !== plantedAt ||
                plant.expectedHarvestDate !== expectedHarvestDate;

            if (needsPatch) {
                await ctx.db.patch(plant._id, {
                    plantedAt,
                    expectedHarvestDate,
                    version: (plant.version ?? 1) + 1,
                });
                plantsUpdated += 1;
            }

            const plantName = masterPlant?.scientificName ?? "Plant";
            const reminders = await ctx.db
                .query("reminders")
                .withIndex("by_user_plant", (q: any) => q.eq("userPlantId", plant._id))
                .collect();

            const plantedTitle = `Planted: ${plantName}`;
            const plantedDescription = `Planted on ${formatYmd(plantedAt)} (mock if previously missing).`;
            const plantedReminder = reminders.find(
                (r: any) => r.type === "custom" && r.title === plantedTitle
            );

            if (!plantedReminder) {
                await ctx.db.insert("reminders", {
                    userId: plant.userId,
                    userPlantId: plant._id,
                    type: "custom",
                    title: plantedTitle,
                    description: plantedDescription,
                    nextRunAt: plantedAt,
                    enabled: false,
                    priority: 5,
                    completedCount: 0,
                    skippedCount: 0,
                });
                remindersInserted += 1;
            } else {
                await ctx.db.patch(plantedReminder._id, {
                    description: plantedDescription,
                    nextRunAt: plantedAt,
                    enabled: false,
                });
                remindersUpdated += 1;
            }

            const harvestTitle = `Harvest: ${plantName}`;
            const harvestDescription = `Expected harvest date ${formatYmd(expectedHarvestDate)}.`;
            const harvestReminder = reminders.find(
                (r: any) => r.type === "harvest"
            );

            if (!harvestReminder) {
                await ctx.db.insert("reminders", {
                    userId: plant.userId,
                    userPlantId: plant._id,
                    type: "harvest",
                    title: harvestTitle,
                    description: harvestDescription,
                    nextRunAt: expectedHarvestDate,
                    enabled: true,
                    priority: 2,
                    completedCount: 0,
                    skippedCount: 0,
                });
                remindersInserted += 1;
            } else {
                await ctx.db.patch(harvestReminder._id, {
                    title: harvestTitle,
                    description: harvestDescription,
                    nextRunAt: expectedHarvestDate,
                    enabled: true,
                });
                remindersUpdated += 1;
            }
        }

        return {
            activePlants: activePlants.length,
            plantsUpdated,
            remindersInserted,
            remindersUpdated,
        };
    },
});
