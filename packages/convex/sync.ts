// Richfarm — Convex Sync
// Batch sync from local queue to Convex tables
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/user";

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
                    .withIndex("by_user_plant", (q: any) => q.eq("userPlantId", plant._id))
                    .collect();
                const alreadySynced = existing.some(
                    (e: any) => e.value?.localId === activity.localId
                );
                if (alreadySynced) {
                    results.activitiesSynced++;
                    results.syncedActivityLocalIds.push(activity.localId);
                    continue;
                }

                await ctx.db.insert("logs", {
                    userId: user._id,
                    userPlantId: plant._id,
                    type: activity.type,
                    note: activity.note,
                    recordedAt: activity.occurredAt,
                    source: "manual",
                    value: { localId: activity.localId },
                });
                results.activitiesSynced++;
                results.syncedActivityLocalIds.push(activity.localId);
            } catch (e: any) {
                results.errors.push(`activity:${activity.localId}:${e.message}`);
            }
        }

        // Sync harvests → harvestRecords table
        for (const harvest of args.harvests) {
            try {
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
                    results.harvestsSynced++;
                    results.syncedHarvestLocalIds.push(harvest.localId);
                    continue;
                }

                await ctx.db.insert("harvestRecords", {
                    userId: user._id,
                    userPlantId: plant._id,
                    localId: harvest.localId,
                    harvestDate: harvest.harvestedAt,
                    quantity: harvest.quantity ? parseFloat(harvest.quantity) || undefined : undefined,
                    unit: harvest.unit,
                    notes: harvest.note,
                });
                results.harvestsSynced++;
                results.syncedHarvestLocalIds.push(harvest.localId);
            } catch (e: any) {
                results.errors.push(`harvest:${harvest.localId}:${e.message}`);
            }
        }

        return results;
    },
});
