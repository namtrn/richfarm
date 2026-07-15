// Richfarm — Convex Gardens
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByIdentityOrDevice, requireUser } from "./lib/user";
import { isPremiumActive } from "./lib/subscription";
import { getOwnedGardenOrThrow } from "./lib/ownership";
import { writeTombstone } from "./lib/syncProtocol";

const NAME_MAX = 40;
const FREE_GARDEN_LIMIT = 1;

function assertNameLength(value: string) {
    if (value.trim().length > NAME_MAX) {
        throw new Error("NAME_TOO_LONG");
    }
}

// Lấy tất cả gardens của user
export const getGardens = query({
    args: {
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getUserByIdentityOrDevice(ctx, args.deviceId);
        if (!user) return [];

        return await ctx.db
            .query("gardens")
            .withIndex("by_user", (q: any) => q.eq("userId", user._id))
            .filter((q: any) => q.neq(q.field("isDeleted"), true))
            .collect();
    },
});

// Tạo garden mới
export const createGarden = mutation({
    args: {
        name: v.string(),
        areaM2: v.optional(v.number()),
        locationType: v.string(),
        description: v.optional(v.string()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        assertNameLength(args.name);

        if (!isPremiumActive(user)) {
            const gardens = await ctx.db
                .query("gardens")
                .withIndex("by_user", (q: any) => q.eq("userId", user._id))
                .filter((q: any) => q.neq(q.field("isDeleted"), true))
                .collect();
            if (gardens.length >= FREE_GARDEN_LIMIT) {
                throw new Error("GARDEN_LIMIT_FREE");
            }
        }

        const gardenId = await ctx.db.insert("gardens", {
            userId: user._id,
            name: args.name,
            areaM2: args.areaM2,
            locationType: args.locationType,
            description: args.description,
            revision: 1,
        });
        await ctx.db.patch(gardenId, { entityUuid: `legacy:${gardenId}` });
        return gardenId;
    },
});

// Cập nhật garden
export const updateGarden = mutation({
    args: {
        gardenId: v.id("gardens"),
        name: v.optional(v.string()),
        areaM2: v.optional(v.number()),
        locationType: v.optional(v.string()),
        description: v.optional(v.string()),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const garden = await getOwnedGardenOrThrow(ctx, user._id, args.gardenId);

        if (args.name !== undefined) {
            assertNameLength(args.name);
        }

        const { gardenId, deviceId, ...updates } = args;
        await ctx.db.patch(gardenId, { ...updates, revision: (garden.revision ?? 1) + 1 });
    },
});

// Xóa garden (soft delete)
export const deleteGarden = mutation({
    args: {
        gardenId: v.id("gardens"),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);
        const garden = await getOwnedGardenOrThrow(ctx, user._id, args.gardenId);
        const operationId = `legacy-delete:${garden._id}`;
        await writeTombstone(ctx, {
            userId: user._id, entityType: "garden",
            entityUuid: garden.entityUuid ?? `legacy:${garden._id}`,
            deleteOperationId: operationId, previousRevision: garden.revision,
        });
        const beds = await ctx.db.query("beds").withIndex("by_garden", (q) => q.eq("gardenId", garden._id)).collect();
        for (const bed of beds) {
            await writeTombstone(ctx, {
                userId: user._id, entityType: "bed",
                entityUuid: bed.entityUuid ?? `legacy:${bed._id}`,
                deleteOperationId: operationId, previousRevision: bed.revision,
            });
            await ctx.db.delete(bed._id);
        }
        const plants = await ctx.db.query("userPlants").withIndex("by_garden", (q) => q.eq("gardenId", garden._id)).collect();
        for (const plant of plants) {
            await ctx.db.patch(plant._id, {
                gardenId: undefined, bedId: undefined,
                revision: (plant.revision ?? 1) + 1,
                version: (plant.version ?? 1) + 1,
            });
        }
        await ctx.db.patch(args.gardenId, { isDeleted: true, revision: (garden.revision ?? 1) + 1 });
    },
});

// Lấy beds thuộc một garden
export const getBedsInGarden = query({
    args: {
        gardenId: v.id("gardens"),
        deviceId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getUserByIdentityOrDevice(ctx, args.deviceId);
        if (!user) return [];
        await getOwnedGardenOrThrow(ctx, user._id, args.gardenId);

        return await ctx.db
            .query("beds")
            .withIndex("by_garden", (q: any) => q.eq("gardenId", args.gardenId))
            .filter((q: any) => q.eq(q.field("userId"), user._id))
            .collect();
    },
});
