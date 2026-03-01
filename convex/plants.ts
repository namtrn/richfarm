// Richfarm — Convex Plants
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByIdentityOrDevice, requireUser } from "./lib/user";

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTO_GROWING_WATERING_MARKER = "auto_growing_watering";

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
    const plantName =
        (plant.nickname ?? "").trim() ||
        (masterPlant?.scientificName ?? "").trim() ||
        "Plant";

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
    },
    handler: async (ctx, args) => {
        const user = await getUserByIdentityOrDevice(ctx, args.deviceId);
        if (!user) return [];

        let plantsQuery = ctx.db
            .query("userPlants")
            .withIndex("by_user", (q: any) => q.eq("userId", user._id));

        const plants = await plantsQuery.collect();

        return plants.filter((p: any) => {
            if (p.isDeleted) return false;
            if (args.status && p.status !== args.status) return false;
            return true;
        });
    },
});

// Thêm cây mới
export const addPlant = mutation({
    args: {
        nickname: v.optional(v.string()),
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

        const plantId = await ctx.db.insert("userPlants", {
            userId: user._id,
            plantMasterId: args.plantMasterId,
            nickname: args.nickname,
            bedId: args.bedId,
            positionInBed: args.positionInBed,
            plantedAt: args.plantedAt ?? Date.now(),
            notes: args.notes,
            status: "planting",
            version: 1,
            isDeleted: false,
        });

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
        if (args.notes !== undefined && args.status !== "growing") {
            throw new Error("Notes are only allowed for plants in growing status");
        }

        await ctx.db.patch(args.plantId, {
            status: args.status,
            ...(args.notes !== undefined && { notes: args.notes }),
            ...(args.status !== "growing" && { notes: undefined }),
            version: (plant.version ?? 1) + 1,
        });

        await syncAutoGrowingWateringReminder(ctx, user, plant, args.status);
    },
});

// Cập nhật thông tin cây
export const updatePlant = mutation({
    args: {
        plantId: v.id("userPlants"),
        plantMasterId: v.optional(v.id("plantsMaster")),
        nickname: v.optional(v.string()),
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
            ...(args.nickname !== undefined && { nickname: args.nickname }),
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
