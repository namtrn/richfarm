export async function getOwnedGardenOrThrow(ctx: any, userId: any, gardenId: any) {
  const garden = await ctx.db.get(gardenId);
  if (!garden || garden.userId !== userId || garden.isDeleted) {
    throw new Error("Garden not found or unauthorized");
  }
  return garden;
}

export async function getOwnedBedOrThrow(ctx: any, userId: any, bedId: any) {
  const bed = await ctx.db.get(bedId);
  if (!bed || bed.userId !== userId) {
    throw new Error("Bed not found or unauthorized");
  }
  return bed;
}

export async function getOwnedPlantOrThrow(ctx: any, userId: any, plantId: any) {
  const plant = await ctx.db.get(plantId);
  if (!plant || plant.userId !== userId || plant.isDeleted) {
    throw new Error("Plant not found or unauthorized");
  }
  return plant;
}

export async function resolveOwnedPlantLocation(
  ctx: any,
  userId: any,
  args: {
    gardenId?: any | null;
    bedId?: any | null;
    currentGardenId?: any;
    currentBedId?: any;
  }
) {
  const hasGardenInput = args.gardenId !== undefined;
  const hasBedInput = args.bedId !== undefined;
  const nextBedId = hasBedInput ? (args.bedId ?? undefined) : args.currentBedId;
  const nextGardenId = hasGardenInput ? (args.gardenId ?? undefined) : args.currentGardenId;

  const garden = nextGardenId
    ? await getOwnedGardenOrThrow(ctx, userId, nextGardenId)
    : null;
  const bed = nextBedId
    ? await getOwnedBedOrThrow(ctx, userId, nextBedId)
    : null;

  if (bed) {
    if (hasGardenInput && bed.gardenId !== nextGardenId) {
      throw new Error("Selected bed does not belong to the selected garden");
    }
    return { gardenId: bed.gardenId, bedId: bed._id, garden, bed };
  }

  return { gardenId: nextGardenId, bedId: undefined, garden, bed: null };
}
