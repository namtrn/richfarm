import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const identity = { subject: "care-plan-policy-user", tokenIdentifier: "test:care-plan-policy-user" };

function setup() {
  return convexTest(schema, modules);
}

describe("care-plan reminder occurrence policy", () => {
  let t: ReturnType<typeof setup>;

  beforeEach(() => {
    t = setup();
  });

  it("requires a current key for Phase 2 and allows legacy omission only explicitly", async () => {
    const userId = await t.run(async (ctx) => await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      isActive: true,
      timezone: "UTC",
    }));
    const user = t.withIdentity(identity);
    const plantId = await user.mutation(api.plants.addPlant, { status: "growing" });
    const carePlanId = await t.run(async (ctx) => await ctx.db.insert("userPlantCarePlans", {
      userId,
      userPlantId: plantId,
      entityUuid: "policy-plan",
      revision: 1,
      planVersion: 1,
      status: "active",
      sourceValues: { wateringFrequencyDays: 3 },
      tasks: [{ type: "watering", enabled: true, intervalDays: 3 }],
      activatedAt: 1,
      createdAt: 1,
    }));
    const phaseReminderId = await t.run(async (ctx) => await ctx.db.insert("reminders", {
      userId,
      userPlantId: plantId,
      carePlanId,
      carePlanVersion: 1,
      entityUuid: "policy-reminder",
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

    await expect(user.mutation(api.carePlans.resolveReminder, {
      reminderId: phaseReminderId,
      operationId: "phase-missing",
      outcome: "performed",
      occurredAt: 101,
    })).rejects.toThrow("occurrence key is required");
    await expect(user.mutation(api.carePlans.resolveReminder, {
      reminderId: phaseReminderId,
      operationId: "phase-stale",
      outcome: "performed",
      occurredAt: 101,
      occurrenceKey: "policy-reminder:99",
    })).rejects.toThrow("occurrence is stale");

    const legacyReminderId = await t.run(async (ctx) => await ctx.db.insert("reminders", {
      userId,
      entityUuid: "legacy-reminder",
      userPlantId: plantId,
      type: "custom",
      title: "Legacy check",
      nextRunAt: 200,
      enabled: true,
    }));
    await expect(user.mutation(api.carePlans.resolveReminder, {
      reminderId: legacyReminderId,
      operationId: "legacy-implicit",
      outcome: "disabled",
    })).rejects.toThrow("compatibility must be explicit");
    const legacyOutcome = await user.mutation(api.carePlans.resolveReminder, {
      reminderId: legacyReminderId,
      operationId: "legacy-explicit",
      outcome: "disabled",
      legacyCompatibility: true,
    });
    expect(legacyOutcome?.outcome).toBe("disabled");
  });

  it("superseding a plan disables its reminders and blocks old outcomes", async () => {
    const userId = await t.run(async (ctx) => await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      isActive: true,
      timezone: "UTC",
    }));
    const user = t.withIdentity(identity);
    const plantId = await user.mutation(api.plants.addPlant, { status: "growing" });
    const oldPlanId = await t.run(async (ctx) => await ctx.db.insert("userPlantCarePlans", {
      userId,
      userPlantId: plantId,
      entityUuid: "old-plan",
      revision: 1,
      planVersion: 1,
      status: "active",
      sourceValues: { wateringFrequencyDays: 3 },
      tasks: [{ type: "watering", enabled: true, intervalDays: 3 }],
      activatedAt: 1,
      createdAt: 1,
    }));
    const oldReminderId = await t.run(async (ctx) => await ctx.db.insert("reminders", {
      userId,
      userPlantId: plantId,
      carePlanId: oldPlanId,
      carePlanVersion: 1,
      entityUuid: "old-reminder",
      revision: 1,
      taskType: "watering",
      timezone: "UTC",
      type: "watering",
      title: "Old care check",
      nextRunAt: 100,
      rrule: "FREQ=DAILY;INTERVAL=3",
      enabled: true,
      notificationMethods: ["push", "care_plan_v2"],
    }));

    await user.mutation(api.carePlans.materializePlan, {
      userPlantId: plantId,
      operationId: "new-plan-version",
    });

    const state = await t.run(async (ctx) => ({
      plan: await ctx.db.get(oldPlanId),
      reminder: await ctx.db.get(oldReminderId),
    }));
    expect(state.plan?.status).toBe("superseded");
    expect(state.reminder?.enabled).toBe(false);
    await expect(user.mutation(api.carePlans.resolveReminder, {
      reminderId: oldReminderId,
      operationId: "old-plan-outcome",
      outcome: "performed",
      occurrenceKey: "old-reminder:100",
    })).rejects.toThrow("Reminder is disabled");
  });
});
