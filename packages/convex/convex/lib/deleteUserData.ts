import type { Doc, Id } from "../_generated/dataModel";

export async function deleteAppUserData(ctx: any, user: Doc<"users">) {
  const userPlants = await ctx.db
    .query("userPlants")
    .withIndex("by_user", (q: any) => q.eq("userId", user._id))
    .collect();
  const userPlantIds = new Set(userPlants.map((p: any) => p._id));

  const plantPhotosToDelete: Array<{
    _id: Id<"plantPhotos">;
    storageId?: Id<"_storage">;
  }> = [];
  for (const plantId of userPlantIds) {
    const photos = await ctx.db
      .query("plantPhotos")
      .withIndex("by_user_plant", (q: any) => q.eq("userPlantId", plantId))
      .collect();
    for (const photo of photos) {
      plantPhotosToDelete.push({
        _id: photo._id,
        storageId: photo.storageId,
      });
    }
  }

  const photoIds = new Set(plantPhotosToDelete.map((p) => p._id));
  for (const photoId of photoIds) {
    const queueItems = await ctx.db
      .query("aiAnalysisQueue")
      .withIndex("by_photo", (q: any) => q.eq("photoId", photoId))
      .collect();
    for (const item of queueItems) {
      await ctx.db.delete(item._id);
    }
  }

  for (const photo of plantPhotosToDelete) {
    if (photo.storageId) {
      await ctx.storage.delete(photo.storageId);
    }
    await ctx.db.delete(photo._id);
  }

  for (const plantId of userPlantIds) {
    const logs = await ctx.db
      .query("logs")
      .withIndex("by_user_plant", (q: any) => q.eq("userPlantId", plantId))
      .collect();
    for (const row of logs) {
      await ctx.db.delete(row._id);
    }

    const harvestRecords = await ctx.db
      .query("harvestRecords")
      .withIndex("by_user_plant", (q: any) => q.eq("userPlantId", plantId))
      .collect();
    for (const row of harvestRecords) {
      await ctx.db.delete(row._id);
    }
  }

  const reminderOutcomes = await ctx.db
    .query("reminderOutcomes")
    .withIndex("by_user_entity_uuid", (q: any) => q.eq("userId", user._id))
    .collect();
  for (const row of reminderOutcomes) {
    await ctx.db.delete(row._id);
  }

  const reminders = await ctx.db
    .query("reminders")
    .withIndex("by_user", (q: any) => q.eq("userId", user._id))
    .collect();
  for (const row of reminders) {
    await ctx.db.delete(row._id);
  }

  const carePlans = await ctx.db
    .query("userPlantCarePlans")
    .withIndex("by_user_entity_uuid", (q: any) => q.eq("userId", user._id))
    .collect();
  for (const row of carePlans) {
    await ctx.db.delete(row._id);
  }

  const favorites = await ctx.db
    .query("userFavorites")
    .withIndex("by_user", (q: any) => q.eq("userId", user._id))
    .collect();
  for (const row of favorites) {
    await ctx.db.delete(row._id);
  }

  const beds = await ctx.db
    .query("beds")
    .withIndex("by_user", (q: any) => q.eq("userId", user._id))
    .collect();
  for (const row of beds) {
    await ctx.db.delete(row._id);
  }

  const gardens = await ctx.db
    .query("gardens")
    .withIndex("by_user", (q: any) => q.eq("userId", user._id))
    .collect();
  for (const row of gardens) {
    await ctx.db.delete(row._id);
  }

  for (const plant of userPlants) {
    await ctx.db.delete(plant._id);
  }

  const userSettings = await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q: any) => q.eq("userId", user._id))
    .collect();
  for (const row of userSettings) {
    await ctx.db.delete(row._id);
  }

  const deviceTokens = await ctx.db
    .query("deviceTokens")
    .withIndex("by_user", (q: any) => q.eq("userId", user._id))
    .collect();
  for (const row of deviceTokens) {
    await ctx.db.delete(row._id);
  }

  const notificationDispatches = await ctx.db
    .query("notificationDispatches")
    .withIndex("by_user", (q: any) => q.eq("userId", user._id))
    .collect();
  for (const row of notificationDispatches) {
    await ctx.db.delete(row._id);
  }

  const authoredRecipes = await ctx.db
    .query("preservationRecipes")
    .withIndex("by_author", (q: any) => q.eq("authorId", user._id))
    .collect();
  for (const recipe of authoredRecipes) {
    const recipeLocales = await ctx.db
      .query("recipeI18n")
      .withIndex("by_recipe_locale", (q: any) => q.eq("recipeId", recipe._id))
      .collect();
    for (const row of recipeLocales) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.delete(recipe._id);
  }

  const syncReceipts = await ctx.db.query("syncOperationReceipts")
    .withIndex("by_user_operation", (q: any) => q.eq("userId", user._id)).collect();
  for (const row of syncReceipts) await ctx.db.delete(row._id);

  const preferenceReceipts = await ctx.db.query("userPreferenceOperationReceipts")
    .withIndex("by_user_operation", (q: any) => q.eq("userId", user._id)).collect();
  for (const row of preferenceReceipts) await ctx.db.delete(row._id);

  const tombstones = await ctx.db.query("entityTombstones")
    .withIndex("by_user_entity", (q: any) => q.eq("userId", user._id)).collect();
  for (const row of tombstones) await ctx.db.delete(row._id);

  const accountStates = await ctx.db.query("syncAccountState")
    .withIndex("by_user", (q: any) => q.eq("userId", user._id)).collect();
  for (const row of accountStates) await ctx.db.delete(row._id);

  const uploadReservations = await ctx.db.query("syncUploadReservations")
    .withIndex("by_user_operation", (q: any) => q.eq("userId", user._id)).collect();
  for (const row of uploadReservations) {
    if (!row.committedAt) await ctx.storage.delete(row.storageId);
    await ctx.db.delete(row._id);
  }

  await ctx.db.delete(user._id);
}
