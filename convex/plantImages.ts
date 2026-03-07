// Richfarm — Plant Images Management
// Quản lý ảnh cho plantsMaster library
// imageUrl trong plantsMaster là string URL — dễ swap sang R2/Cloudinary sau

import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/user";
import { localizePlantRows, PlantI18nRow } from "./lib/localizePlant";
import { plantI18nSeed } from "./data/plantsMasterSeed";
import { DEFAULT_CULTIVAR_NORMALIZED } from "./lib/plantTaxonomy";

function normalizeScientificName(value: string) {
    return value
        .toLowerCase()
        .replaceAll("×", "x")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeCultivar(value?: string | null) {
    const normalized = (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    return normalized || DEFAULT_CULTIVAR_NORMALIZED;
}

function buildSeedLocaleKey(args: {
    locale: string;
    scientificName: string;
    cultivar?: string | null;
}) {
    return `${args.locale}|${normalizeScientificName(args.scientificName)}|${normalizeCultivar(
        args.cultivar
    )}`;
}

const seedI18nByLocaleAndScientific = new Map<
    string,
    { commonName: string; description?: string }
>();
for (const row of plantI18nSeed) {
    const key = buildSeedLocaleKey({
        locale: row.locale.toLowerCase(),
        scientificName: row.scientificName,
        cultivar: row.cultivar,
    });
    seedI18nByLocaleAndScientific.set(key, {
        commonName: row.commonName,
        description: row.description ?? undefined,
    });
}

function withSeedLocaleFallback(
    rows: PlantI18nRow[] | undefined,
    scientificName: string,
    locale: string | undefined,
    cultivar?: string | null
): PlantI18nRow[] | undefined {
    const normalizedLocale = (locale ?? "en").split("-")[0].toLowerCase();
    const base = rows ?? [];
    const fallback =
        seedI18nByLocaleAndScientific.get(
            buildSeedLocaleKey({
                locale: normalizedLocale,
                scientificName,
                cultivar,
            })
        ) ??
        (cultivar
            ? seedI18nByLocaleAndScientific.get(
                buildSeedLocaleKey({
                    locale: normalizedLocale,
                    scientificName,
                })
            )
            : undefined);
    if (!fallback) {
        return base.length > 0 ? base : undefined;
    }

    return [
        // Force seed locale content to win for current locale to avoid stale English rows in DB.
        ...base.filter((r) => r.locale !== normalizedLocale),
        {
            locale: normalizedLocale,
            commonName: fallback.commonName,
            description: fallback.description ?? undefined,
        },
    ];
}

// ==========================================
// Lấy danh sách plants có ảnh
// ==========================================
export const getPlantsWithImages = query({
    args: {
        group: v.optional(v.string()),
        locale: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        let plants;
        if (args.group) {
            plants = await ctx.db
                .query("plantsMaster")
                .withIndex("by_group", (q) => q.eq("group", args.group!))
                .collect();
        } else {
            plants = await ctx.db.query("plantsMaster").collect();
        }

        const i18nRows = await ctx.db.query("plantI18n").collect();
        const i18nByPlantId = new Map<string, PlantI18nRow[]>();
        for (const row of i18nRows) {
            const key = row.plantId.toString();
            const list = i18nByPlantId.get(key) ?? [];
            list.push({
                locale: row.locale,
                commonName: row.commonName,
                description: row.description ?? undefined,
                careContent: row.careContent ?? undefined,
                contentVersion: row.contentVersion ?? undefined,
            });
            i18nByPlantId.set(key, list);
        }

        return plants.map((p) => {
            const i18nForPlant = i18nByPlantId.get(p._id.toString());
            const rows = withSeedLocaleFallback(
                i18nForPlant && i18nForPlant.length > 0
                    ? i18nForPlant
                    : undefined,
                p.scientificName,
                args.locale,
                (p as any).cultivar
            );
            const localized = localizePlantRows(
                rows,
                args.locale,
                p.scientificName
            );

            return {
                _id: p._id,
                scientificName: p.scientificName,
                displayName: localized.displayName,
                cultivar: (p as any).cultivar ?? null,
                cultivarNormalized:
                    (p as any).cultivarNormalized ?? DEFAULT_CULTIVAR_NORMALIZED,
                isBaseVariant:
                    ((p as any).cultivarNormalized ?? DEFAULT_CULTIVAR_NORMALIZED) ===
                    DEFAULT_CULTIVAR_NORMALIZED,
                speciesKey:
                    (p as any).genusNormalized && (p as any).speciesNormalized
                        ? `${(p as any).genusNormalized}:${(p as any).speciesNormalized}`
                        : normalizeScientificName(p.scientificName),
                description: localized.description,
                localeUsed: localized.localeUsed,
                careContent: localized.careContent,
                contentVersion: localized.contentVersion,
                i18nRows: rows ?? [],
                group: p.group,
                imageUrl: p.imageUrl ?? null,
                hasImage: !!p.imageUrl,
                typicalDaysToHarvest: p.typicalDaysToHarvest,
                wateringFrequencyDays: p.wateringFrequencyDays,
                lightRequirements: p.lightRequirements,
                germinationDays: p.germinationDays,
                spacingCm: p.spacingCm,
                source: p.source,
                purposes: p.purposes,
                maxPlantsPerM2: p.maxPlantsPerM2,
                seedRatePerM2: p.seedRatePerM2,
                waterLitersPerM2: p.waterLitersPerM2,
                yieldKgPerM2: p.yieldKgPerM2,
            };
        });
    },
});

// ==========================================
// Cập nhật imageUrl cho plant (sau khi upload)
// ==========================================
export const updatePlantImage = mutation({
    args: {
        plantId: v.id("plantsMaster"),
        storageId: v.id("_storage"),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireUser(ctx, args.deviceId);
        const url = await ctx.storage.getUrl(args.storageId);
        if (!url) throw new Error("Failed to get storage URL");

        await ctx.db.patch(args.plantId, {
            imageUrl: url,
        });

        return url;
    },
});

// ==========================================
// Cập nhật imageUrl trực tiếp (dùng khi migrate sang R2)
// Chỉ cần gọi mutation này với URL mới từ R2
// ==========================================
export const setPlantImageUrl = internalMutation({
    args: {
        plantId: v.id("plantsMaster"),
        imageUrl: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.plantId, {
            imageUrl: args.imageUrl,
        });
    },
});

// ==========================================
// Xóa ảnh của plant
// ==========================================
export const removePlantImage = mutation({
    args: {
        plantId: v.id("plantsMaster"),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireUser(ctx, args.deviceId);
        await ctx.db.patch(args.plantId, {
            imageUrl: undefined,
        });
    },
});

// ==========================================
// Lấy plants chưa có ảnh (để biết cần upload gì)
// ==========================================
export const getPlantsWithoutImages = query({
    args: {
        locale: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const plants = await ctx.db.query("plantsMaster").collect();
        const i18nRows = await ctx.db.query("plantI18n").collect();
        const i18nByPlantId = new Map<string, PlantI18nRow[]>();
        for (const row of i18nRows) {
            const key = row.plantId.toString();
            const list = i18nByPlantId.get(key) ?? [];
            list.push({
                locale: row.locale,
                commonName: row.commonName,
                description: row.description ?? undefined,
            });
            i18nByPlantId.set(key, list);
        }

        return plants
            .filter((p) => !p.imageUrl)
            .map((p) => {
                const i18nForPlant = i18nByPlantId.get(p._id.toString());
                const rows = withSeedLocaleFallback(
                    i18nForPlant && i18nForPlant.length > 0
                        ? i18nForPlant
                        : undefined,
                    p.scientificName,
                    args.locale,
                    (p as any).cultivar
                );
                const localized = localizePlantRows(
                    rows,
                    args.locale,
                    p.scientificName
                );

                return {
                    _id: p._id,
                    scientificName: p.scientificName,
                    displayName: localized.displayName,
                    cultivar: (p as any).cultivar ?? null,
                    cultivarNormalized:
                        (p as any).cultivarNormalized ?? DEFAULT_CULTIVAR_NORMALIZED,
                    isBaseVariant:
                        ((p as any).cultivarNormalized ?? DEFAULT_CULTIVAR_NORMALIZED) ===
                        DEFAULT_CULTIVAR_NORMALIZED,
                    speciesKey:
                        (p as any).genusNormalized && (p as any).speciesNormalized
                            ? `${(p as any).genusNormalized}:${(p as any).speciesNormalized}`
                            : normalizeScientificName(p.scientificName),
                    description: localized.description,
                    localeUsed: localized.localeUsed,
                    i18nRows: rows ?? [],
                    group: p.group,
                    typicalDaysToHarvest: p.typicalDaysToHarvest,
                    wateringFrequencyDays: p.wateringFrequencyDays,
                    lightRequirements: p.lightRequirements,
                    germinationDays: p.germinationDays,
                    spacingCm: p.spacingCm,
                    source: p.source,
                    purposes: p.purposes,
                    maxPlantsPerM2: p.maxPlantsPerM2,
                    seedRatePerM2: p.seedRatePerM2,
                    waterLitersPerM2: p.waterLitersPerM2,
                    yieldKgPerM2: p.yieldKgPerM2,
                };
            });
    },
});

// ==========================================
// Lấy chi tiết 1 plant từ plantsMaster
// ==========================================
export const getPlantById = query({
    args: {
        plantId: v.id("plantsMaster"),
        locale: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const plant = await ctx.db.get(args.plantId);
        if (!plant) return null;
        const i18nRows = await ctx.db
            .query("plantI18n")
            .withIndex("by_plant_locale", (q) => q.eq("plantId", plant._id))
            .collect();
        const rows = i18nRows.map((row) => ({
            locale: row.locale,
            commonName: row.commonName,
            description: row.description ?? undefined,
            careContent: row.careContent ?? undefined,
            contentVersion: row.contentVersion ?? undefined,
        }));
        const localizedRows = withSeedLocaleFallback(
            rows.length > 0 ? rows : undefined,
            plant.scientificName,
            args.locale,
            (plant as any).cultivar
        );
        const localized = localizePlantRows(
            localizedRows,
            args.locale,
            plant.scientificName
        );

        return {
            ...plant,
            displayName: localized.displayName,
            description: localized.description,
            localeUsed: localized.localeUsed,
            careContent: localized.careContent,
            contentVersion: localized.contentVersion,
            i18nRows: localizedRows ?? [],
        };
    },
});

// ==========================================
// Lấy variants cùng species cho 1 plant
// ==========================================
export const getPlantVariants = query({
    args: {
        plantId: v.id("plantsMaster"),
        locale: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const selected = await ctx.db.get(args.plantId);
        if (!selected) return [];

        let siblings: any[] = [];
        if ((selected as any).genusNormalized && (selected as any).speciesNormalized) {
            siblings = await ctx.db
                .query("plantsMaster")
                .withIndex("by_genus_species", (q) =>
                    q
                        .eq("genusNormalized", (selected as any).genusNormalized)
                        .eq("speciesNormalized", (selected as any).speciesNormalized)
                )
                .collect();
        } else {
            siblings = await ctx.db
                .query("plantsMaster")
                .withIndex("by_scientific_name", (q) =>
                    q.eq("scientificName", selected.scientificName)
                )
                .collect();
        }

        const rows = await Promise.all(
            siblings.map(async (plant) => {
                const i18nRows = await ctx.db
                    .query("plantI18n")
                    .withIndex("by_plant_locale", (q) => q.eq("plantId", plant._id))
                    .collect();
                const localizedRows = withSeedLocaleFallback(
                    i18nRows.map((row) => ({
                        locale: row.locale,
                        commonName: row.commonName,
                        description: row.description ?? undefined,
                    })),
                    plant.scientificName,
                    args.locale,
                    (plant as any).cultivar
                );
                const localized = localizePlantRows(
                    localizedRows,
                    args.locale,
                    plant.scientificName
                );
                const isBaseVariant =
                    ((plant as any).cultivarNormalized ??
                        DEFAULT_CULTIVAR_NORMALIZED) ===
                    DEFAULT_CULTIVAR_NORMALIZED;

                return {
                    _id: plant._id,
                    scientificName: plant.scientificName,
                    displayName: localized.displayName,
                    cultivar: (plant as any).cultivar ?? null,
                    cultivarNormalized:
                        (plant as any).cultivarNormalized ??
                        DEFAULT_CULTIVAR_NORMALIZED,
                    isBaseVariant,
                    speciesKey:
                        (plant as any).genusNormalized &&
                            (plant as any).speciesNormalized
                            ? `${(plant as any).genusNormalized}:${(plant as any).speciesNormalized}`
                            : normalizeScientificName(plant.scientificName),
                };
            })
        );

        return rows.sort((a, b) => {
            if (a.isBaseVariant !== b.isBaseVariant) {
                return a.isBaseVariant ? -1 : 1;
            }
            return String(a.displayName).localeCompare(String(b.displayName));
        });
    },
});
