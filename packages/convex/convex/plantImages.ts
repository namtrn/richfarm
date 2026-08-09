// Compatibility surface for image-related consumers.
// All read paths intentionally delegate to the canonical Library projection.
import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/user";
import { loadCanonicalPlantLibrary, getCanonicalPlantById } from "./lib/canonicalPlantLibrary";

export const getPlantsWithImages = query({
  args: {
    group: v.optional(v.string()),
    locale: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const plants = await loadCanonicalPlantLibrary(ctx, {
      group: args.group,
      locale: args.locale,
      limit: 10000,
    });
    return plants.filter((plant: any) => Boolean(plant.imageUrl));
  },
});

export const getPlantsWithoutImages = query({
  args: {
    locale: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const plants = await loadCanonicalPlantLibrary(ctx, {
      locale: args.locale,
      limit: 10000,
    });
    return plants.filter((plant: any) => !plant.imageUrl);
  },
});

export const getPlantById = query({
  args: {
    plantId: v.id("plantsMaster"),
    locale: v.optional(v.string()),
  },
  handler: async (ctx, args) => getCanonicalPlantById(ctx, args.plantId, args.locale),
});

export const getPlantVariants = query({
  args: {
    plantId: v.id("plantsMaster"),
    locale: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const plants = await loadCanonicalPlantLibrary(ctx, {
      locale: args.locale,
      limit: 10000,
    });
    const selected = plants.find((plant: any) => String(plant._id) === String(args.plantId));
    if (!selected) return [];
    const siblings = plants.filter((plant: any) => {
      if (selected.basePlantId) {
        return String(plant.basePlantId ?? plant._id) === String(selected.basePlantId);
      }
      return plant.speciesKey === selected.speciesKey;
    });
    return siblings.sort((left: any, right: any) => {
      if (left.isBaseVariant !== right.isBaseVariant) return left.isBaseVariant ? -1 : 1;
      return String(left.displayName).localeCompare(String(right.displayName));
    });
  },
});

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
    await ctx.db.patch(args.plantId, { imageUrl: url });
    return url;
  },
});

export const setPlantImageUrl = internalMutation({
  args: {
    plantId: v.id("plantsMaster"),
    imageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.plantId, { imageUrl: args.imageUrl });
  },
});

export const removePlantImage = mutation({
  args: {
    plantId: v.id("plantsMaster"),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.deviceId);
    await ctx.db.patch(args.plantId, { imageUrl: undefined });
  },
});
