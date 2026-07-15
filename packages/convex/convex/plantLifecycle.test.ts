/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const identity = {
  subject: "phase-1-user",
  tokenIdentifier: "test:phase-1-user",
};

function setup() {
  return convexTest(schema, modules);
}

async function seedUser(t: ReturnType<typeof setup>) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      isActive: true,
    })
  );
}

describe("Phase 1 user plant lifecycle", () => {
  let t: ReturnType<typeof setup>;

  beforeEach(() => {
    t = setup();
  });

  it("keeps one user plant across Planning and Growing and records automatic events", async () => {
    await seedUser(t);
    const user = t.withIdentity(identity);
    const request = {
      status: "planning",
      clientRequestId: "add:tomato:1",
    } as const;

    const plantId = await user.mutation(api.plants.addPlant, request);
    const retryId = await user.mutation(api.plants.addPlant, request);
    expect(retryId).toEqual(plantId);

    await user.mutation(api.plants.updatePlantStatus, {
      plantId,
      status: "growing",
      bedId: null,
    });

    const state = await t.run(async (ctx) => ({
      plant: await ctx.db.get(plantId),
      plants: await ctx.db.query("userPlants").collect(),
      logs: await ctx.db
        .query("logs")
        .withIndex("by_user_plant", (q) => q.eq("userPlantId", plantId))
        .collect(),
    }));

    expect(state.plants).toHaveLength(1);
    expect(state.plant?.status).toBe("growing");
    expect(state.plant?.plantedAt).toBeTypeOf("number");
    expect(state.plant?.bedId).toBeUndefined();
    expect(state.logs.filter((log) => log.type === "plant_added")).toHaveLength(1);
    expect(state.logs.filter((log) => log.type === "status_changed")).toHaveLength(1);
  });

  it("records assignments and supports explicit unassignment", async () => {
    const userId = await seedUser(t);
    const user = t.withIdentity(identity);
    const { gardenId, bedId } = await t.run(async (ctx) => {
      const gardenId = await ctx.db.insert("gardens", {
        userId,
        name: "Garden A",
        locationType: "outdoor",
      });
      const bedId = await ctx.db.insert("beds", {
        userId,
        gardenId,
        name: "Bed 1",
        locationType: "outdoor",
      });
      return { gardenId, bedId };
    });
    const plantId = await user.mutation(api.plants.addPlant, { status: "planning" });

    await user.mutation(api.plants.updatePlantStatus, {
      plantId,
      status: "growing",
      bedId,
    });
    await user.mutation(api.plants.updatePlant, {
      plantId,
      bedId: null,
      gardenId: null,
    });

    const state = await t.run(async (ctx) => ({
      plant: await ctx.db.get(plantId),
      logs: await ctx.db
        .query("logs")
        .withIndex("by_user_plant", (q) => q.eq("userPlantId", plantId))
        .collect(),
    }));
    expect(state.plant?.gardenId).toBeUndefined();
    expect(state.plant?.bedId).toBeUndefined();
    expect(state.logs.filter((log) => log.type === "location_changed")).toHaveLength(2);
  });

  it("idempotently appends manual activities and synchronizes snapshots", async () => {
    await seedUser(t);
    const user = t.withIdentity(identity);
    const plantId = await user.mutation(api.plants.addPlant, { status: "growing" });
    const occurredAt = Date.now() - 86_400_000;
    const activity = {
      userPlantId: plantId,
      type: "watering" as const,
      occurredAt,
      localId: "watering:offline:1",
      note: "0.5 L",
    };

    const firstId = await user.mutation(api.logs.addActivity, activity);
    const retryId = await user.mutation(api.logs.addActivity, activity);
    expect(retryId).toEqual(firstId);

    const state = await t.run(async (ctx) => ({
      plant: await ctx.db.get(plantId),
      logs: await ctx.db
        .query("logs")
        .withIndex("by_user_plant_local", (q) =>
          q.eq("userPlantId", plantId).eq("localId", activity.localId)
        )
        .collect(),
    }));
    expect(state.logs).toHaveLength(1);
    expect(state.logs[0].occurredAt).toBe(occurredAt);
    expect(state.logs[0].recordedAt).toBeGreaterThan(occurredAt);
    expect(state.plant?.lastWateredAt).toBe(occurredAt);
  });

  it("keeps snapshots at the latest occurredAt when older activities are backdated", async () => {
    await seedUser(t);
    const user = t.withIdentity(identity);
    const plantId = await user.mutation(api.plants.addPlant, { status: "growing" });
    const latestAt = Date.now();
    const olderAt = latestAt - 7 * 86_400_000;

    await user.mutation(api.logs.addActivity, {
      userPlantId: plantId,
      type: "watering",
      occurredAt: latestAt,
      localId: "water:latest",
    });
    await user.mutation(api.logs.addActivity, {
      userPlantId: plantId,
      type: "watering",
      occurredAt: olderAt,
      localId: "water:older",
    });
    await user.mutation(api.logs.addActivity, {
      userPlantId: plantId,
      type: "fertilizing",
      occurredAt: latestAt,
      localId: "fertilize:latest",
    });
    await user.mutation(api.logs.addActivity, {
      userPlantId: plantId,
      type: "fertilizing",
      occurredAt: olderAt,
      localId: "fertilize:older",
    });

    const plant = await t.run(async (ctx) => await ctx.db.get(plantId));
    expect(plant?.lastWateredAt).toBe(latestAt);
    expect(plant?.lastFertilizedAt).toBe(latestAt);
  });

  it("rejects a bed that does not belong to the selected garden", async () => {
    const userId = await seedUser(t);
    const user = t.withIdentity(identity);
    const { gardenA, gardenB, bedA, bedB } = await t.run(async (ctx) => {
      const gardenA = await ctx.db.insert("gardens", { userId, name: "A", locationType: "outdoor" });
      const gardenB = await ctx.db.insert("gardens", { userId, name: "B", locationType: "outdoor" });
      const bedA = await ctx.db.insert("beds", {
        userId,
        gardenId: gardenA,
        name: "A1",
        locationType: "outdoor",
      });
      const bedB = await ctx.db.insert("beds", {
        userId,
        gardenId: gardenB,
        name: "Bed B",
        locationType: "outdoor",
      });
      return { gardenA, gardenB, bedA, bedB };
    });

    await expect(user.mutation(api.plants.addPlant, {
      status: "growing",
      gardenId: gardenB,
      bedId: bedA,
    })).rejects.toThrow("Selected bed does not belong to the selected garden");

    const plantId = await user.mutation(api.plants.addPlant, {
      status: "growing",
      gardenId: gardenA,
      bedId: bedA,
    });
    await expect(user.mutation(api.plants.updatePlant, {
      plantId,
      gardenId: gardenB,
    })).rejects.toThrow("Selected bed does not belong to the selected garden");

    await user.mutation(api.plants.updatePlant, {
      plantId,
      gardenId: gardenB,
      bedId: bedB,
    });
    const movedPlant = await t.run(async (ctx) => ctx.db.get(plantId));
    expect(movedPlant?.gardenId).toBe(gardenB);
    expect(movedPlant?.bedId).toBe(bedB);
  });

  it("keeps harvested separate from archived and never assigns archivedAt", async () => {
    await seedUser(t);
    const user = t.withIdentity(identity);
    const plantId = await user.mutation(api.plants.addPlant, { status: "growing" });
    await user.mutation(api.plants.updatePlantStatus, { plantId, status: "harvested" });
    const plant = await t.run(async (ctx) => await ctx.db.get(plantId));
    expect(plant?.status).toBe("harvested");
    expect(plant?.archivedAt).toBeUndefined();
    expect(plant?.actualHarvestDate).toBeTypeOf("number");
    expect(plant?.isDeleted).toBe(false);
  });

  it("deletes authoritative harvests atomically and recomputes both harvest snapshots", async () => {
    await seedUser(t);
    const user = t.withIdentity(identity);
    const plantId = await user.mutation(api.plants.addPlant, { status: "growing" });
    const olderAt = Date.now() - 5 * 86_400_000;
    const latestAt = Date.now();
    const olderId = await user.mutation(api.harvestRecords.addHarvest, {
      userPlantId: plantId,
      localId: "harvest:older",
      harvestDate: olderAt,
      quantity: 1,
      unit: "kg",
    });
    const latestId = await user.mutation(api.harvestRecords.addHarvest, {
      userPlantId: plantId,
      localId: "harvest:latest",
      harvestDate: latestAt,
      quantity: 2,
      unit: "kg",
    });

    await user.mutation(api.harvestRecords.deleteHarvest, { id: latestId });
    let plant = await t.run(async (ctx) => await ctx.db.get(plantId));
    expect(plant?.lastHarvestedAt).toBe(olderAt);
    expect(plant?.actualHarvestDate).toBe(olderAt);

    await user.mutation(api.harvestRecords.deleteHarvest, { id: olderId });
    plant = await t.run(async (ctx) => await ctx.db.get(plantId));
    expect(plant?.lastHarvestedAt).toBeUndefined();
    expect(plant?.actualHarvestDate).toBeUndefined();
    const remaining = await t.run(async (ctx) =>
      await ctx.db.query("harvestRecords").withIndex("by_user_plant", (q) => q.eq("userPlantId", plantId)).collect()
    );
    expect(remaining).toHaveLength(0);
  });

  it("prevents deletion of system lifecycle activities", async () => {
    await seedUser(t);
    const user = t.withIdentity(identity);
    const plantId = await user.mutation(api.plants.addPlant, { status: "planning" });
    const systemLog = await t.run(async (ctx) =>
      await ctx.db.query("logs").withIndex("by_user_plant", (q) => q.eq("userPlantId", plantId)).first()
    );
    expect(systemLog?.type).toBe("plant_added");
    await expect(user.mutation(api.logs.deleteLog, { id: systemLog!._id }))
      .rejects.toThrow("system activities cannot be deleted");
  });

  it("prevents a deleted offline activity from being recreated", async () => {
    await seedUser(t);
    const user = t.withIdentity(identity);
    const plantId = await user.mutation(api.plants.addPlant, { status: "growing" });
    const localId = "offline-watering-deleted";
    const logId = await user.mutation(api.logs.addActivity, {
      userPlantId: plantId,
      type: "watering",
      localId,
      occurredAt: 100,
    });
    await user.mutation(api.logs.deleteLog, { id: logId });

    const result = await user.mutation(api.sync.batchSync, {
      activities: [{ localId, plantId, type: "watering", occurredAt: 100 }],
      harvests: [],
    });
    expect(result.errors).toContain(`activity:${localId}:discarded_deleted`);
    const state = await t.run(async (ctx) => {
      const storedUser = (await ctx.db.query("users").first())!;
      return {
        log: await ctx.db.query("logs").withIndex("by_user_plant_local", (q) =>
          q.eq("userPlantId", plantId).eq("localId", localId)
        ).unique(),
        tombstone: await ctx.db.query("entityTombstones").withIndex("by_user_entity", (q) =>
          q.eq("userId", storedUser._id)
            .eq("entityType", "activity")
            .eq("entityUuid", localId)
        ).unique(),
      };
    });
    expect(state.log).toBeNull();
    expect(state.tombstone?.deletedRevision).toBe(2);
  });
});
