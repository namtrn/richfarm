import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const identity = { subject: "direct-reminder-policy-user", tokenIdentifier: "test:direct-reminder-policy-user" };

function setup() {
  return convexTest(schema, modules);
}

describe("direct reminder action policy", () => {
  let t: ReturnType<typeof setup>;
  let userId: any;
  let plantId: any;
  let carePlanId: any;
  let reminderId: any;

  beforeEach(async () => {
    t = setup();
    userId = await t.run(async (ctx) => await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      isActive: true,
      timezone: "UTC",
    }));
    plantId = await t.run(async (ctx) => await ctx.db.insert("userPlants", {
      userId,
      entityUuid: "direct-policy-plant",
      status: "growing",
      version: 1,
      revision: 1,
      isDeleted: false,
    }));
    carePlanId = await t.run(async (ctx) => await ctx.db.insert("userPlantCarePlans", {
      userId,
      userPlantId: plantId,
      entityUuid: "direct-policy-plan",
      revision: 1,
      planVersion: 1,
      status: "active",
      tasks: [{ type: "watering", enabled: true, intervalDays: 3 }],
      sourceValues: { wateringFrequencyDays: 3 },
      activatedAt: 1,
      createdAt: 1,
    }));
    reminderId = await t.run(async (ctx) => await ctx.db.insert("reminders", {
      userId,
      userPlantId: plantId,
      carePlanId,
      carePlanVersion: 1,
      entityUuid: "direct-policy-reminder",
      revision: 1,
      taskType: "watering",
      timezone: "UTC",
      type: "watering",
      title: "Check soil",
      nextRunAt: 100,
      rrule: "FREQ=DAILY;INTERVAL=3",
      enabled: true,
      notificationMethods: ["push", "care_plan_v2"],
    }));
  });

  it("rejects stale, disabled, inactive-plan, and stopped-plant actions", async () => {
    const user = t.withIdentity(identity);
    const currentOccurrence = "direct-policy-reminder:100";

    await expect(user.mutation(api.reminders.completeReminder, {
      reminderId,
      occurrenceKey: "direct-policy-reminder:99",
    })).rejects.toThrow("Reminder occurrence is stale");

    await t.run(async (ctx) => await ctx.db.patch(reminderId, { enabled: false }));
    await expect(user.mutation(api.reminders.completeReminder, {
      reminderId,
      occurrenceKey: currentOccurrence,
    })).rejects.toThrow("Reminder is disabled");

    await t.run(async (ctx) => await ctx.db.patch(reminderId, { enabled: true }));
    await t.run(async (ctx) => await ctx.db.patch(carePlanId, { status: "superseded" }));
    await expect(user.mutation(api.reminders.snoozeReminder, {
      reminderId,
      snoozedUntil: 200,
      occurrenceKey: currentOccurrence,
    })).rejects.toThrow("Reminder care plan is inactive");

    await t.run(async (ctx) => {
      await ctx.db.patch(carePlanId, { status: "active" });
      await ctx.db.patch(plantId, { status: "harvested" });
    });
    await expect(user.mutation(api.reminders.skipReminder, {
      reminderId,
      occurrenceKey: currentOccurrence,
    })).rejects.toThrow("Reminder plant is inactive");

    const state: any = await t.run(async (ctx) => ({
      reminder: await ctx.db.get(reminderId),
      outcomes: await ctx.db.query("reminderOutcomes").collect(),
    }));
    expect(state.reminder?.lastRunAt).toBeUndefined();
    expect(state.outcomes).toHaveLength(0);
  });

  it("disables care-plan reminders when the plant is harvested or archived", async () => {
    const user = t.withIdentity(identity);
    await user.mutation(api.plants.updatePlantStatus, {
      plantId,
      status: "harvested",
    });
    expect((await t.run(async (ctx) => await ctx.db.get(reminderId)) as any)?.enabled).toBe(false);

    await t.run(async (ctx) => {
      await ctx.db.patch(plantId, { status: "growing" });
      await ctx.db.patch(reminderId, { enabled: true });
    });
    await user.mutation(api.plants.updatePlantStatus, {
      plantId,
      status: "archived",
    });
    expect((await t.run(async (ctx) => await ctx.db.get(reminderId)) as any)?.enabled).toBe(false);
  });

  it("allows direct cleanup deletion of disabled and inactive reminders while retaining occurrence protection", async () => {
    const user = t.withIdentity(identity);
    const currentOccurrence = "direct-policy-reminder:100";

    await t.run(async (ctx) => await ctx.db.patch(reminderId, { enabled: false }));
    await expect(user.mutation(api.reminders.deleteReminder, {
      reminderId,
      occurrenceKey: "direct-policy-reminder:99",
    })).rejects.toThrow("Reminder occurrence is stale");
    await user.mutation(api.reminders.deleteReminder, {
      reminderId,
      occurrenceKey: currentOccurrence,
    });
    const deletedState = await t.run(async (ctx) => ({
      reminder: await ctx.db.get(reminderId),
      tombstone: await ctx.db.query("entityTombstones")
        .withIndex("by_user_entity", (q) => q.eq("userId", userId).eq("entityType", "reminder").eq("entityUuid", "direct-policy-reminder")).unique(),
    }));
    expect(deletedState.reminder).toBeNull();
    expect(deletedState.tombstone).not.toBeNull();

    const replacementReminderId = await t.run(async (ctx) => await ctx.db.insert("reminders", {
      userId,
      userPlantId: plantId,
      carePlanId,
      carePlanVersion: 1,
      entityUuid: "direct-policy-reminder-inactive",
      revision: 1,
      taskType: "watering",
      timezone: "UTC",
      type: "watering",
      title: "Inactive plan cleanup",
      nextRunAt: 100,
      rrule: "FREQ=DAILY;INTERVAL=3",
      enabled: false,
      notificationMethods: ["push", "care_plan_v2"],
    }));
    await t.run(async (ctx) => await ctx.db.patch(carePlanId, { status: "superseded" }));
    await user.mutation(api.reminders.deleteReminder, {
      reminderId: replacementReminderId,
      occurrenceKey: "direct-policy-reminder-inactive:100",
    });
    expect(await t.run(async (ctx) => await ctx.db.get(replacementReminderId))).toBeNull();
  });
});
