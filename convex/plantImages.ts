// Richfarm — Plant Images Management
// Quản lý ảnh cho plantsMaster library
// imageUrl trong plantsMaster là string URL — dễ swap sang R2/Cloudinary sau

import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/user";
import { localizePlantRows, PlantI18nRow } from "./lib/localizePlant";

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
            });
            i18nByPlantId.set(key, list);
        }

        return plants.map((p) => {
            const i18nForPlant = i18nByPlantId.get(p._id.toString());
            const localized = localizePlantRows(
                i18nForPlant && i18nForPlant.length > 0
                    ? i18nForPlant
                    : undefined,
                args.locale,
                p.scientificName
            );

            return {
                _id: p._id,
                scientificName: p.scientificName,
                displayName: localized.displayName,
                description: localized.description,
                localeUsed: localized.localeUsed,
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
                const localized = localizePlantRows(
                    i18nForPlant && i18nForPlant.length > 0
                        ? i18nForPlant
                        : undefined,
                    args.locale,
                    p.scientificName
                );

                return {
                    _id: p._id,
                    scientificName: p.scientificName,
                    displayName: localized.displayName,
                    description: localized.description,
                    localeUsed: localized.localeUsed,
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
        }));
        const localized = localizePlantRows(
            rows.length > 0 ? rows : undefined,
            args.locale,
            plant.scientificName
        );

        return {
            ...plant,
            displayName: localized.displayName,
            description: localized.description,
            localeUsed: localized.localeUsed,
        };
    },
});
