// Richfarm — Convex Sync
// Batch sync from local queue to Convex tables
import { mutation } from "./_generated/server";
import { v } from "convex/values";
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

        const results = { activitiesSynced: 0, harvestsSynced: 0, errors: [] as string[] };

        // Sync activities → logs table
        for (const activity of args.activities) {
            try {
                // Check plant ownership
                const plant = await ctx.db.get(activity.plantId as any);
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
            } catch (e: any) {
                results.errors.push(`activity:${activity.localId}:${e.message}`);
            }
        }

        // Sync harvests → harvestRecords table
        for (const harvest of args.harvests) {
            try {
                const plant = await ctx.db.get(harvest.plantId as any);
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
            } catch (e: any) {
                results.errors.push(`harvest:${harvest.localId}:${e.message}`);
            }
        }

        return results;
    },
});
