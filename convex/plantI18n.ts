// Richfarm — Plant i18n
import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
    plantGroupsSeed,
    plantsMasterSeed,
    plantI18nSeed,
} from "./data/plantsMasterSeed";

export const upsertPlantI18n = mutation({
    args: {
        plantId: v.id("plantsMaster"),
        locale: v.string(),
        commonName: v.string(),
        description: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
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
            return { updated: true };
        }

        await ctx.db.insert("plantI18n", {
            plantId: args.plantId,
            locale: normalized,
            commonName: args.commonName,
            description: args.description,
        });

        return { updated: false };
    },
});

export const syncEnglishSeedContent = internalMutation({
    args: {
        dryRun: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const dryRun = args.dryRun ?? false;

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
            const existing = await ctx.db
                .query("plantsMaster")
                .withIndex("by_scientific_name", (q) =>
                    q.eq("scientificName", seed.scientificName)
                )
                .unique();

            let plantId = existing?._id;
            if (!existing) {
                if (!dryRun) {
                    plantId = await ctx.db.insert("plantsMaster", seed as any);
                }
                plantsInserted++;
            } else {
                const updates: Record<string, unknown> = {};
                for (const [key, value] of Object.entries(seed)) {
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
                    }
                    plantsUpdated++;
                }
            }

            if (!plantId) continue;
        }

        for (const row of plantI18nSeed) {
            const plant = await ctx.db
                .query("plantsMaster")
                .withIndex("by_scientific_name", (q) =>
                    q.eq("scientificName", row.scientificName)
                )
                .unique();
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

export const migratePlantsMasterToI18n = internalMutation({
    args: {
        dryRun: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const dryRun = args.dryRun ?? false;
        const plants = await ctx.db.query("plantsMaster").collect();

        let inserted = 0;
        let updated = 0;
        let skipped = 0;

        for (const plant of plants) {
            const commonNames = (plant as any).commonNames ?? [];
            if (commonNames.length === 0) {
                skipped++;
                continue;
            }

            const normalized = commonNames.map((n: any) => ({
                locale: String(n.locale ?? "").toLowerCase().trim(),
                commonName: n.name,
            }));

            const locales = normalized.map((n: any) => n.locale);
            const defaultLocale = locales.includes("en")
                ? "en"
                : locales.includes("vi")
                    ? "vi"
                    : locales[0];

            for (const row of normalized) {
                if (!row.locale) continue;
                const existing = await ctx.db
                    .query("plantI18n")
                    .withIndex("by_plant_locale", (q) =>
                        q.eq("plantId", plant._id).eq("locale", row.locale)
                    )
                    .unique();

                const legacyDescription = (plant as any).description;
                const description =
                    row.locale === defaultLocale ? legacyDescription : undefined;

                if (existing) {
                    const needsUpdate =
                        existing.commonName !== row.commonName ||
                        existing.description !== description;
                    if (needsUpdate) {
                        if (!dryRun) {
                            await ctx.db.patch(existing._id, {
                                commonName: row.commonName,
                                description,
                            });
                        }
                        updated++;
                    } else {
                        skipped++;
                    }
                } else {
                    if (!dryRun) {
                        await ctx.db.insert("plantI18n", {
                            plantId: plant._id,
                            locale: row.locale,
                            commonName: row.commonName,
                            description,
                        });
                    }
                    inserted++;
                }
            }
        }

        return { dryRun, inserted, updated, skipped };
    },
});
