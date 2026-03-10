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
