// Richfarm — Convex Plants
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByIdentityOrDevice, requireUser } from "./lib/user";
import { localizePlantRows } from "./lib/localizePlant";
import { getOwnedPlantOrThrow, resolveOwnedPlantLocation } from "./lib/ownership";
import { getPlantCareProfileByPlantId } from "./lib/plantCare";
import { appendPlantActivity } from "./lib/plantActivities";
import { writeTombstone } from "./lib/syncProtocol";

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTO_GROWING_WATERING_MARKER = "auto_growing_watering";
const plantStatus = v.union(
    v.literal("planning"),
    v.literal("planting"),
    v.literal("growing"),
    v.literal("dormant"),
    v.literal("harvested"),
    v.literal("archived"),
    v.literal("failed"),
    v.literal("paused")
);

function normalizeStatus(status: string) {
    if (status === "planting") return "planning";
    return status;
}

function normalizeIntervalDays(value?: number) {
    if (!value || !Number.isFinite(value)) return undefined;
    return Math.max(1, Math.round(value));
}

function buildNextRunAt(intervalDays: number) {
    const now = Date.now();
    const base = new Date(now + intervalDays * DAY_MS);
    base.setHours(8, 0, 0, 0);
    const ts = base.getTime();
    return ts > now ? ts : ts + DAY_MS;
}

function normalizeNickname(value?: string) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

async function syncAutoGrowingWateringReminder(
    ctx: any,
    user: any,
    plant: any,
    targetStatus: string
) {
    const reminders = await ctx.db
        .query("reminders")
        .withIndex("by_user_plant", (q: any) => q.eq("userPlantId", plant._id))
        .collect();

    const autoReminder = reminders.find(
        (r: any) =>
            r.type === "watering" &&
            Array.isArray(r.notificationMethods) &&
            r.notificationMethods.includes(AUTO_GROWING_WATERING_MARKER)
    );

    if (targetStatus !== "growing") {
        if (autoReminder?.enabled) {
            await ctx.db.patch(autoReminder._id, { enabled: false });
        }
        return;
    }

    if (autoReminder) {
        await ctx.db.patch(autoReminder._id, { enabled: true });
        return;
    }

    // Respect manual watering reminders: if user already has one, don't create auto duplicate.
    const hasManualWatering = reminders.some(
        (r: any) =>
            r.type === "watering" &&
            (!Array.isArray(r.notificationMethods) ||
                !r.notificationMethods.includes(AUTO_GROWING_WATERING_MARKER))
    );
    if (hasManualWatering) return;

    const masterPlant = plant.plantMasterId
        ? await ctx.db.get(plant.plantMasterId)
        : null;
    const careProfile = plant.plantMasterId
        ? await getPlantCareProfileByPlantId(ctx, plant.plantMasterId)
        : null;
    const intervalDays = normalizeIntervalDays(careProfile?.wateringFrequencyDays);
    if (!intervalDays) return;
    const plantName =
        normalizeNickname(plant?.nickname) ??
        ((masterPlant?.scientificName ?? "").trim() || undefined) ??
        "Plant";

    await ctx.db.insert("reminders", {
        userId: user._id,
        userPlantId: plant._id,
        type: "watering",
        title: `Check watering need: ${plantName}`,
        description: "Check soil moisture and plant condition before watering.",
        rrule: `FREQ=DAILY;INTERVAL=${intervalDays}`,
        nextRunAt: buildNextRunAt(intervalDays),
        enabled: true,
        priority: 3,
        notificationMethods: ["push", "in_app", AUTO_GROWING_WATERING_MARKER],
        completedCount: 0,
        skippedCount: 0,
    });
}

// Lấy tất cả cây của user (chưa bị xóa)
export const getUserPlants = query({
    args: {
        status: v.optional(plantStatus),
        deviceId: v.optional(v.string()),
        locale: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getUserByIdentityOrDevice(ctx, args.deviceId);
        if (!user) return [];

        let plantsQuery = ctx.db
            .query("userPlants")
            .withIndex("by_user", (q: any) => q.eq("userId", user._id));

        const plants = await plantsQuery.collect();

        const requestedStatus = args.status ? normalizeStatus(args.status) : undefined;

        const visiblePlants = plants.filter((p: any) => {
            if (p.isDeleted) return false;
            const plantStatus = normalizeStatus(p.status);
            if (requestedStatus && plantStatus !== requestedStatus) return false;
            return true;
        });

        const localizedPlants = await Promise.all(
            visiblePlants.map(async (plant: any) => {
                const nickname = normalizeNickname(plant.nickname);
                const normalizedPlant = {
                    ...plant,
                    status: normalizeStatus(plant.status),
                };
                if (!plant.plantMasterId) {
                    return nickname
                        ? {
                            ...normalizedPlant,
                            displayName: nickname,
                        }
                        : normalizedPlant;
                }
                const master: any = await ctx.db.get(plant.plantMasterId);
                if (!master) {
                    return nickname
                        ? {
                            ...normalizedPlant,
                            displayName: nickname,
                        }
                        : normalizedPlant;
                }

                const i18nRows = await ctx.db
                    .query("plantI18n")
                    .withIndex("by_plant_locale", (q: any) =>
                        q.eq("plantId", plant.plantMasterId)
                    )
                    .collect();

                const localized = localizePlantRows(
                    i18nRows.map((row: any) => ({
                        locale: row.locale,
                        commonName: row.commonName,
                        description: row.description,
                    })),
                    args.locale,
                    master.scientificName,
                    master.description
                );

                return {
                    ...normalizedPlant,
                    displayName: nickname ?? localized.displayName,
                    scientificName: localized.scientificName,
                    localeUsed: localized.localeUsed,
                };
            })
        );

        return localizedPlants;
    },
});

// Thêm cây mới
export const addPlant = mutation({
    args: {
        plantMasterId: v.optional(v.id("plantsMaster")),
        nickname: v.optional(v.string()),
        gardenId: v.optional(v.union(v.id("gardens"), v.null())),
        bedId: v.optional(v.union(v.id("beds"), v.null())),
        positionInBed: v.optional(v.object({
            x: v.number(),
            y: v.number(),
            width: v.number(),
            height: v.number(),
        })),
        plantedAt: v.optional(v.number()),
        expectedHarvestDate: v.optional(v.number()),
        status: v.optional(v.string()),
        notes: v.optional(v.string()),
        clientRequestId: v.optional(v.string()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        if (args.clientRequestId) {
            const existing = await ctx.db
                .query("userPlants")
                .withIndex("by_user_request", (q: any) =>
                    q.eq("userId", user._id).eq("clientRequestId", args.clientRequestId)
                )
                .unique();
            if (existing && !existing.isDeleted) return existing._id;
        }
        const hasBed = !!args.bedId || !!args.positionInBed;
        const requestedStatus = args.status ? normalizeStatus(args.status) : undefined;
        const initialStatus = hasBed ? "growing" : (requestedStatus ?? "planning");

        if (args.notes !== undefined && initialStatus !== "growing") {
            throw new Error("Notes are only allowed for plants in growing status");
        }
        if (args.positionInBed && !args.bedId) {
            throw new Error("Bed is required when setting a plant position");
        }
        const location = await resolveOwnedPlantLocation(ctx, user._id, {
            gardenId: args.gardenId,
            bedId: args.bedId,
        });

        const plantedAt = initialStatus === "growing" ? (args.plantedAt ?? Date.now()) : args.plantedAt;
        const nickname = normalizeNickname(args.nickname);
        let expectedHarvestDate = args.expectedHarvestDate;

        if (!expectedHarvestDate && args.plantMasterId && plantedAt) {
            const careProfile = await getPlantCareProfileByPlantId(ctx, args.plantMasterId);
            const daysToHarvest = careProfile?.typicalDaysToHarvest;
            if (typeof daysToHarvest === "number" && Number.isFinite(daysToHarvest) && daysToHarvest > 0) {
                expectedHarvestDate = plantedAt + daysToHarvest * DAY_MS;
            }
        }

        const plantId = await ctx.db.insert("userPlants", {
            userId: user._id,
            plantMasterId: args.plantMasterId,
            nickname,
            gardenId: location.gardenId,
            bedId: location.bedId,
            positionInBed: args.positionInBed,
            plantedAt,
            expectedHarvestDate,
            notes: args.notes,
            status: initialStatus,
            clientRequestId: args.clientRequestId,
            version: 1,
            revision: 1,
            isDeleted: false,
        });
        await ctx.db.patch(plantId, {
            entityUuid: args.clientRequestId ? `request:${args.clientRequestId}` : `legacy:${plantId}`,
        });

        if (initialStatus === "growing") {
            await syncAutoGrowingWateringReminder(
                ctx,
                user,
                { _id: plantId, plantMasterId: args.plantMasterId, nickname },
                "growing"
            );
        }

        const now = Date.now();
        await appendPlantActivity(ctx, {
            userId: user._id,
            userPlantId: plantId,
            type: "plant_added",
            occurredAt: now,
            source: "system",
            value: { initialStatus, plantMasterId: args.plantMasterId },
        });
        if (initialStatus === "growing") {
            await appendPlantActivity(ctx, {
                userId: user._id,
                userPlantId: plantId,
                type: "status_changed",
                occurredAt: now,
                source: "system",
                value: { fromStatus: null, toStatus: "growing" },
            });
        }

        return plantId;
    },
});

// Cập nhật trạng thái cây
export const updatePlantStatus = mutation({
    args: {
        plantId: v.id("userPlants"),
        status: plantStatus,
        notes: v.optional(v.string()),
        gardenId: v.optional(v.union(v.id("gardens"), v.null())),
        bedId: v.optional(v.union(v.id("beds"), v.null())),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const plant = await getOwnedPlantOrThrow(ctx, user._id, args.plantId);
        const normalizedStatus = normalizeStatus(args.status);

        const location =
            args.gardenId !== undefined || args.bedId !== undefined
                ? await resolveOwnedPlantLocation(ctx, user._id, {
                    gardenId: args.gardenId,
                    bedId: args.bedId,
                    currentGardenId: plant.gardenId,
                    currentBedId: plant.bedId,
                })
                : { gardenId: plant.gardenId, bedId: plant.bedId };

        if (args.notes !== undefined && normalizedStatus !== "growing") {
            throw new Error("Notes are only allowed for plants in growing status");
        }

        const now = Date.now();
        const updates: Record<string, any> = {
            status: normalizedStatus,
            ...(args.notes !== undefined && { notes: args.notes }),
            ...(normalizedStatus !== "growing" && { notes: undefined }),
            version: (plant.version ?? 1) + 1,
            revision: (plant.revision ?? 1) + 1,
        };

        if (normalizedStatus === "growing" && !plant.plantedAt) {
            updates.plantedAt = now;
            if (!plant.expectedHarvestDate && plant.plantMasterId) {
                const careProfile = await getPlantCareProfileByPlantId(ctx, plant.plantMasterId);
                const days = careProfile?.typicalDaysToHarvest;
                if (typeof days === "number" && Number.isFinite(days) && days > 0) {
                    updates.expectedHarvestDate = now + days * DAY_MS;
                }
            }
        }

        let nextGardenId = plant.gardenId;
        let nextBedId = plant.bedId;
        if (args.bedId !== undefined) {
            nextBedId = location.bedId;
            updates.bedId = nextBedId;
            updates.positionInBed = undefined;
            nextGardenId = location.gardenId;
            updates.gardenId = nextGardenId;
        } else if (args.gardenId !== undefined) {
            nextGardenId = location.gardenId;
            updates.gardenId = nextGardenId;
        }

        if (normalizedStatus === "archived" && !plant.archivedAt) updates.archivedAt = now;
        if (normalizedStatus === "harvested") {
            if (!plant.actualHarvestDate) updates.actualHarvestDate = now;
            if (!plant.lastHarvestedAt) updates.lastHarvestedAt = now;
        }

        await ctx.db.patch(args.plantId, updates);

        if (plant.status !== normalizedStatus) {
            await appendPlantActivity(ctx, {
                userId: user._id,
                userPlantId: plant._id,
                type: "status_changed",
                occurredAt: now,
                source: "system",
                value: { fromStatus: normalizeStatus(plant.status), toStatus: normalizedStatus },
            });
        }
        if (plant.gardenId !== nextGardenId || plant.bedId !== nextBedId) {
            await appendPlantActivity(ctx, {
                userId: user._id,
                userPlantId: plant._id,
                type: "location_changed",
                occurredAt: now,
                source: "system",
                value: {
                    fromGardenId: plant.gardenId,
                    fromBedId: plant.bedId,
                    gardenId: nextGardenId,
                    bedId: nextBedId,
                },
            });
        }

        await syncAutoGrowingWateringReminder(ctx, user, plant, normalizedStatus);
    },
});

// Cập nhật thông tin cây
export const updatePlant = mutation({
    args: {
        plantId: v.id("userPlants"),
        plantMasterId: v.optional(v.id("plantsMaster")),
        nickname: v.optional(v.string()),
        notes: v.optional(v.string()),
        gardenId: v.optional(v.union(v.id("gardens"), v.null())),
        bedId: v.optional(v.union(v.id("beds"), v.null())),
        positionInBed: v.optional(v.object({
            x: v.number(),
            y: v.number(),
            width: v.number(),
            height: v.number(),
        })),
        expectedHarvestDate: v.optional(v.number()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const plant = await getOwnedPlantOrThrow(ctx, user._id, args.plantId);
        if (args.notes !== undefined && plant.status !== "growing") {
            throw new Error("Notes are only allowed for plants in growing status");
        }
        if (args.positionInBed !== undefined && !args.bedId && !plant.bedId) {
            throw new Error("Bed is required when setting a plant position");
        }

        const location =
            args.gardenId !== undefined || args.bedId !== undefined
                ? await resolveOwnedPlantLocation(ctx, user._id, {
                    gardenId: args.gardenId,
                    bedId: args.bedId,
                    currentGardenId: plant.gardenId,
                    currentBedId: plant.bedId,
                })
                : { gardenId: plant.gardenId, bedId: plant.bedId };
        const requestedGardenId = location.gardenId;
        const nextBedId = location.bedId;
        const locationChanged =
            (args.gardenId !== undefined || args.bedId !== undefined) &&
            (plant.gardenId !== requestedGardenId || plant.bedId !== nextBedId);

        await ctx.db.patch(args.plantId, {
            ...(args.plantMasterId !== undefined && { plantMasterId: args.plantMasterId }),
            ...(args.nickname !== undefined && { nickname: normalizeNickname(args.nickname) }),
            ...(args.notes !== undefined && { notes: args.notes }),
            ...((args.gardenId !== undefined || args.bedId !== undefined) && { gardenId: requestedGardenId }),
            ...(args.bedId !== undefined && { bedId: args.bedId ?? undefined }),
            ...(args.positionInBed !== undefined
                ? { positionInBed: args.positionInBed }
                : args.bedId === null
                    ? { positionInBed: undefined }
                    : {}),
            ...(args.expectedHarvestDate !== undefined && { expectedHarvestDate: args.expectedHarvestDate }),
            version: (plant.version ?? 1) + 1,
            revision: (plant.revision ?? 1) + 1,
        });
        if (locationChanged) {
            await appendPlantActivity(ctx, {
                userId: user._id,
                userPlantId: plant._id,
                type: "location_changed",
                source: "system",
                value: {
                    fromGardenId: plant.gardenId,
                    fromBedId: plant.bedId,
                    gardenId: requestedGardenId,
                    bedId: nextBedId,
                },
            });
        }
    },
});

// Xóa mềm cây
export const deletePlant = mutation({
    args: {
        plantId: v.id("userPlants"),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const plant = await getOwnedPlantOrThrow(ctx, user._id, args.plantId);

        await writeTombstone(ctx, {
            userId: user._id, entityType: "plant",
            entityUuid: plant.entityUuid ?? `legacy:${plant._id}`,
            deleteOperationId: `legacy-delete:${plant._id}`,
            previousRevision: plant.revision,
        });

        await ctx.db.patch(args.plantId, {
            isDeleted: true,
            version: (plant.version ?? 1) + 1,
            revision: (plant.revision ?? 1) + 1,
        });

        // Disable reminders linked to this soft-deleted plant to avoid orphan reminders in UI.
        const reminders = await ctx.db
            .query("reminders")
            .withIndex("by_user_plant", (q: any) => q.eq("userPlantId", args.plantId))
            .collect();
        for (const reminder of reminders) {
            if (reminder.userId !== user._id) continue;
            if (reminder.enabled) {
                await ctx.db.patch(reminder._id, { enabled: false });
            }
        }
    },
});
