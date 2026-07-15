import type { Id } from "../_generated/dataModel";

export type ActivitySource = "system" | "manual" | "reminder" | "scanner" | "import";

export async function appendPlantActivity(
  ctx: any,
  args: {
    userId: Id<"users">;
    userPlantId: Id<"userPlants">;
    type: string;
    occurredAt?: number;
    source: ActivitySource;
    localId?: string;
    entityUuid?: string;
    revision?: number;
    reminderId?: Id<"reminders">;
    harvestRecordId?: Id<"harvestRecords">;
    title?: string;
    note?: string;
    value?: Record<string, unknown>;
  }
) {
  const recordedAt = Date.now();
  return await ctx.db.insert("logs", {
    userId: args.userId,
    userPlantId: args.userPlantId,
    type: args.type,
    occurredAt: args.occurredAt ?? recordedAt,
    recordedAt,
    source: args.source,
    localId: args.localId,
    entityUuid: args.entityUuid,
    revision: args.revision,
    reminderId: args.reminderId,
    harvestRecordId: args.harvestRecordId,
    title: args.title,
    note: args.note,
    value: args.value,
  });
}

export async function recomputeActivitySnapshot(
  ctx: any,
  userPlantId: Id<"userPlants">,
  type: string
) {
  const field =
    type === "watering"
      ? "lastWateredAt"
      : type === "fertilizing"
        ? "lastFertilizedAt"
        : type === "harvest"
          ? "lastHarvestedAt"
          : null;
  if (!field) return {};

  const latest = await ctx.db
    .query("logs")
    .withIndex("by_user_plant_type_occurred", (q: any) =>
      q.eq("userPlantId", userPlantId).eq("type", type)
    )
    .order("desc")
    .first();
  const latestAt = latest ? (latest.occurredAt ?? latest.recordedAt) : undefined;
  return type === "harvest"
    ? { lastHarvestedAt: latestAt, actualHarvestDate: latestAt }
    : { [field]: latestAt };
}
