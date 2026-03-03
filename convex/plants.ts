// Richfarm — Convex Plants
import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserByIdentityOrDevice, requireUser } from "./lib/user";
import { localizePlantRows } from "./lib/localizePlant";

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTO_GROWING_WATERING_MARKER = "auto_growing_watering";
const ARCHIVED_STATUSES = new Set(["archived", "harvested"]);

function normalizeStatus(status: string) {
    if (status === "planting") return "planning";
    if (status === "harvested") return "archived";
    return status;
}

function isArchivedStatus(status: string) {
    return ARCHIVED_STATUSES.has(status);
}

function normalizeIntervalDays(value?: number) {
    if (!value || !Number.isFinite(value)) return 2;
    return Math.max(1, Math.round(value));
}

function buildNextRunAt(intervalDays: number) {
    const now = Date.now();
    const base = new Date(now + intervalDays * DAY_MS);
    base.setHours(8, 0, 0, 0);
    const ts = base.getTime();
    return ts > now ? ts : ts + DAY_MS;
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
    const intervalDays = normalizeIntervalDays(masterPlant?.wateringFrequencyDays);
    const plantName = (masterPlant?.scientificName ?? "").trim() || "Plant";

    await ctx.db.insert("reminders", {
        userId: user._id,
        userPlantId: plant._id,
        type: "watering",
        title: `Watering: ${plantName}`,
        description: "Auto reminder while plant is in growing stage.",
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
        status: v.optional(v.string()),
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
                const normalizedPlant = {
                    ...plant,
                    status: normalizeStatus(plant.status),
                };
                if (!plant.plantMasterId) return normalizedPlant;
                const master: any = await ctx.db.get(plant.plantMasterId);
                if (!master) return normalizedPlant;

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
                    displayName: localized.displayName,
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
        bedId: v.optional(v.id("beds")),
        positionInBed: v.optional(v.object({
            x: v.number(),
            y: v.number(),
            width: v.number(),
            height: v.number(),
        })),
        plantedAt: v.optional(v.number()),
        notes: v.optional(v.string()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        if (args.notes !== undefined) {
            throw new Error("Notes are only allowed for plants in growing status");
        }

        const hasBed = !!args.bedId || !!args.positionInBed;
        const initialStatus = hasBed ? "growing" : "planning";
        const plantedAt = hasBed ? (args.plantedAt ?? Date.now()) : args.plantedAt;

        const plantId = await ctx.db.insert("userPlants", {
            userId: user._id,
            plantMasterId: args.plantMasterId,
            bedId: args.bedId,
            positionInBed: args.positionInBed,
            plantedAt,
            notes: args.notes,
            status: initialStatus,
            version: 1,
            isDeleted: false,
        });

        if (initialStatus === "growing") {
            await syncAutoGrowingWateringReminder(
                ctx,
                user,
                { _id: plantId, plantMasterId: args.plantMasterId },
                "growing"
            );
        }

        return plantId;
    },
});

// Cập nhật trạng thái cây
export const updatePlantStatus = mutation({
    args: {
        plantId: v.id("userPlants"),
        status: v.string(),
        notes: v.optional(v.string()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const plant = await ctx.db.get(args.plantId);

        if (!plant || plant.userId !== user._id) {
            throw new Error("Plant not found or unauthorized");
        }
        const normalizedStatus = normalizeStatus(args.status);

        if (args.notes !== undefined && normalizedStatus !== "growing") {
            throw new Error("Notes are only allowed for plants in growing status");
        }

        const now = Date.now();
        const updates: Record<string, any> = {
            status: normalizedStatus,
            ...(args.notes !== undefined && { notes: args.notes }),
            ...(normalizedStatus !== "growing" && { notes: undefined }),
            version: (plant.version ?? 1) + 1,
        };

        if (normalizedStatus === "growing" && !plant.plantedAt) {
            updates.plantedAt = now;
        }

        if (isArchivedStatus(normalizedStatus)) {
            if (!plant.archivedAt) updates.archivedAt = now;
            if (!plant.actualHarvestDate) updates.actualHarvestDate = now;
        } else if (plant.archivedAt) {
            updates.archivedAt = undefined;
        }

        await ctx.db.patch(args.plantId, updates);

        await syncAutoGrowingWateringReminder(ctx, user, plant, normalizedStatus);
    },
});

// Cập nhật thông tin cây
export const updatePlant = mutation({
    args: {
        plantId: v.id("userPlants"),
        plantMasterId: v.optional(v.id("plantsMaster")),
        notes: v.optional(v.string()),
        bedId: v.optional(v.id("beds")),
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
        const plant = await ctx.db.get(args.plantId);

        if (!plant || plant.userId !== user._id) {
            throw new Error("Plant not found or unauthorized");
        }
        if (args.notes !== undefined && plant.status !== "growing") {
            throw new Error("Notes are only allowed for plants in growing status");
        }

        await ctx.db.patch(args.plantId, {
            ...(args.plantMasterId !== undefined && { plantMasterId: args.plantMasterId }),
            ...(args.notes !== undefined && { notes: args.notes }),
            ...(args.bedId !== undefined && { bedId: args.bedId }),
            ...(args.positionInBed !== undefined && { positionInBed: args.positionInBed }),
            ...(args.expectedHarvestDate !== undefined && { expectedHarvestDate: args.expectedHarvestDate }),
            version: (plant.version ?? 1) + 1,
        });
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
        const plant = await ctx.db.get(args.plantId);

        if (!plant || plant.userId !== user._id) {
            throw new Error("Plant not found or unauthorized");
        }

        await ctx.db.patch(args.plantId, {
            isDeleted: true,
            version: (plant.version ?? 1) + 1,
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

// Cleanup archived plants older than a threshold (default: 90 days).
export const cleanupArchivedPlants = internalMutation({
    args: {
        maxAgeDays: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const maxAgeDays = args.maxAgeDays ?? 90;
        const cutoff = Date.now() - maxAgeDays * DAY_MS;
        const plants = await ctx.db.query("userPlants").collect();
        let deletedCount = 0;

        for (const plant of plants) {
            if (plant.isDeleted) continue;
            const normalized = normalizeStatus(plant.status);
            if (!isArchivedStatus(normalized)) continue;
            const archivedAt = plant.archivedAt ?? plant.actualHarvestDate;
            if (!archivedAt || archivedAt > cutoff) continue;

            await ctx.db.patch(plant._id, {
                isDeleted: true,
                version: (plant.version ?? 1) + 1,
            });

            const reminders = await ctx.db
                .query("reminders")
                .withIndex("by_user_plant", (q: any) => q.eq("userPlantId", plant._id))
                .collect();
            for (const reminder of reminders) {
                if (reminder.enabled) {
                    await ctx.db.patch(reminder._id, { enabled: false });
                }
            }

            deletedCount += 1;
        }

        return { deletedCount };
    },
});
