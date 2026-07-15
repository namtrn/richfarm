// Richfarm — Convex Sync
// Batch sync from local queue to Convex tables
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/user";
import { appendPlantActivity, recomputeActivitySnapshot } from "./lib/plantActivities";
import { canonicalize, checkReceipt, getTombstone, recordReceipt } from "./lib/syncProtocol";

export const batchSync = mutation({
    args: {
        deviceId: v.optional(v.string()),
        activities: v.array(
            v.object({
                localId: v.string(),
                plantId: v.string(),
                type: v.string(),
                note: v.optional(v.string()),
                occurredAt: v.number(),
            })
        ),
        harvests: v.array(
            v.object({
                localId: v.string(),
                plantId: v.string(),
                quantity: v.optional(v.string()),
                unit: v.optional(v.string()),
                note: v.optional(v.string()),
                harvestedAt: v.number(),
            })
        ),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx, args.deviceId);

        const results = {
            activitiesSynced: 0,
            harvestsSynced: 0,
            errors: [] as string[],
            syncedActivityLocalIds: [] as string[],
            syncedHarvestLocalIds: [] as string[],
        };

        // Sync activities → logs table
        for (const activity of args.activities) {
            try {
                const operationId = `activity:create:${activity.localId}`;
                const fingerprint = canonicalize(activity);
                const receipt = await checkReceipt(ctx, user._id, operationId, fingerprint);
                if (receipt.status === "operation_conflict") {
                    results.errors.push(`activity:${activity.localId}:operation_conflict`);
                    continue;
                }
                if (receipt.status === "matched") {
                    results.activitiesSynced++;
                    results.syncedActivityLocalIds.push(activity.localId);
                    continue;
                }
                if (await getTombstone(ctx, user._id, "activity", activity.localId)) {
                    results.errors.push(`activity:${activity.localId}:discarded_deleted`);
                    continue;
                }
                // Check plant ownership
                const plantId = activity.plantId as Id<"userPlants">;
                const plant = await ctx.db.get(plantId);
                if (!plant || plant.userId !== user._id) {
                    results.errors.push(`activity:${activity.localId}:unauthorized`);
                    continue;
                }

                // Idempotency: skip if localId already exists in logs
                const existing = await ctx.db
                    .query("logs")
                    .withIndex("by_user_plant_local", (q: any) =>
                        q.eq("userPlantId", plant._id).eq("localId", activity.localId)
                    )
                    .unique();
                const alreadySynced = !!existing;
                if (alreadySynced) {
                    await recordReceipt(ctx, {
                        userId: user._id, operationId, entityType: "activity",
                        entityUuid: activity.localId, operationType: "create",
                        fingerprint, status: "already_applied", revision: existing?.revision ?? 1,
                    });
                    results.activitiesSynced++;
                    results.syncedActivityLocalIds.push(activity.localId);
                    continue;
                }

                await appendPlantActivity(ctx, {
                    userId: user._id,
                    userPlantId: plant._id,
                    type: activity.type,
                    note: activity.note,
                    occurredAt: activity.occurredAt,
                    source: "manual",
                    localId: activity.localId,
                    entityUuid: activity.localId,
                    revision: 1,
                });
                const snapshot = await recomputeActivitySnapshot(ctx, plant._id, activity.type);
                if (Object.keys(snapshot).length > 0) {
                    await ctx.db.patch(plant._id, {
                        ...snapshot,
                        version: (plant.version ?? 1) + 1,
                    });
                }
                results.activitiesSynced++;
                results.syncedActivityLocalIds.push(activity.localId);
                await recordReceipt(ctx, {
                    userId: user._id, operationId, entityType: "activity",
                    entityUuid: activity.localId, operationType: "create",
                    fingerprint, status: "applied", revision: 1,
                });
            } catch (e: any) {
                results.errors.push(`activity:${activity.localId}:${e.message}`);
            }
        }

        // Sync harvests → harvestRecords table
        for (const harvest of args.harvests) {
            try {
                const operationId = `harvest:create:${harvest.localId}`;
                const fingerprint = canonicalize(harvest);
                const receipt = await checkReceipt(ctx, user._id, operationId, fingerprint);
                if (receipt.status === "operation_conflict") {
                    results.errors.push(`harvest:${harvest.localId}:operation_conflict`);
                    continue;
                }
                if (receipt.status === "matched") {
                    results.harvestsSynced++;
                    results.syncedHarvestLocalIds.push(harvest.localId);
                    continue;
                }
                if (await getTombstone(ctx, user._id, "harvest", harvest.localId)) {
                    results.errors.push(`harvest:${harvest.localId}:discarded_deleted`);
                    continue;
                }
                const plantId = harvest.plantId as Id<"userPlants">;
                const plant = await ctx.db.get(plantId);
                if (!plant || plant.userId !== user._id) {
                    results.errors.push(`harvest:${harvest.localId}:unauthorized`);
                    continue;
                }

                const alreadySynced = await ctx.db
                    .query("harvestRecords")
                    .withIndex("by_user_plant_local", (q: any) =>
                        q.eq("userPlantId", plant._id).eq("localId", harvest.localId)
                    )
                    .unique();
                if (alreadySynced) {
                    await recordReceipt(ctx, {
                        userId: user._id, operationId, entityType: "harvest",
                        entityUuid: harvest.localId, operationType: "create",
                        fingerprint, status: "already_applied", revision: alreadySynced.revision ?? 1,
                    });
                    results.harvestsSynced++;
                    results.syncedHarvestLocalIds.push(harvest.localId);
                    continue;
                }

                const harvestRecordId = await ctx.db.insert("harvestRecords", {
                    userId: user._id,
                    userPlantId: plant._id,
                    localId: harvest.localId,
                    entityUuid: harvest.localId,
                    revision: 1,
                    harvestDate: harvest.harvestedAt,
                    quantity: harvest.quantity ? parseFloat(harvest.quantity) || undefined : undefined,
                    unit: harvest.unit,
                    notes: harvest.note,
                });
                await appendPlantActivity(ctx, {
                    userId: user._id,
                    userPlantId: plant._id,
                    type: "harvest",
                    note: harvest.note,
                    occurredAt: harvest.harvestedAt,
                    source: "manual",
                    localId: `harvest:${harvest.localId}`,
                    harvestRecordId,
                    value: { quantity: harvest.quantity, unit: harvest.unit },
                });
                const snapshot = await recomputeActivitySnapshot(ctx, plant._id, "harvest");
                await ctx.db.patch(plant._id, {
                    ...snapshot,
                    version: (plant.version ?? 1) + 1,
                });
                results.harvestsSynced++;
                results.syncedHarvestLocalIds.push(harvest.localId);
                await recordReceipt(ctx, {
                    userId: user._id, operationId, entityType: "harvest",
                    entityUuid: harvest.localId, operationType: "create",
                    fingerprint, status: "applied", revision: 1,
                });
            } catch (e: any) {
                results.errors.push(`harvest:${harvest.localId}:${e.message}`);
            }
        }

        return results;
    },
});
