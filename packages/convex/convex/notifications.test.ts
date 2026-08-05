/// <reference types="vite/client" />

import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const identity = { subject: "notification-user", tokenIdentifier: "test:notification-user" };
const now = 1_800_000_000_000;

function setup() {
  return convexTest(schema, modules);
}

describe("reminder push delivery", () => {
  let t: ReturnType<typeof setup>;

  beforeEach(async () => {
    t = setup();
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: identity.tokenIdentifier,
        isActive: true,
        timezone: "UTC",
      });
      const plantId = await ctx.db.insert("userPlants", {
        userId,
        entityUuid: "push-plant",
        status: "growing",
        version: 1,
        revision: 1,
        plantedAt: now - 10 * 86_400_000,
        isDeleted: false,
      });
      const planId = await ctx.db.insert("userPlantCarePlans", {
        userId,
        userPlantId: plantId,
        entityUuid: "push-plan",
        revision: 1,
        planVersion: 1,
        status: "active",
        sourceValues: { wateringFrequencyDays: 3 },
        tasks: [{ type: "watering", enabled: true, intervalDays: 3 }],
        activatedAt: now - 10 * 86_400_000,
        createdAt: now - 10 * 86_400_000,
      });
      await ctx.db.insert("reminders", {
        userId,
        userPlantId: plantId,
        carePlanId: planId,
        carePlanVersion: 1,
        entityUuid: "push-reminder",
        revision: 1,
        taskType: "watering",
        timezone: "UTC",
        type: "watering",
        title: "Check soil moisture",
        description: "Check the soil before watering.",
        nextRunAt: now - 1_000,
        rrule: "FREQ=DAILY;INTERVAL=3",
        enabled: true,
        priority: 3,
        completedCount: 0,
        skippedCount: 0,
        notificationMethods: ["push", "in_app", "care_plan_v2"],
      });
      await ctx.db.insert("deviceTokens", {
        userId,
        deviceId: "device-a",
        platform: "ios",
        token: "ExponentPushToken[device-a]",
        isActive: true,
        lastUsedAt: now,
      });
    });
  });

  it("persists ticket and receipt state, then suppresses a duplicate occurrence", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (url.endsWith("/send")) {
        return new Response(JSON.stringify({
          data: body.map((_: unknown, index: number) => ({ status: "ok", id: `ticket-${index}` })),
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        data: { "ticket-0": { status: "ok" } },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await t.action(internal.notifications.sendDueReminders, { now });
    expect(first).toMatchObject({ attemptedMessages: 1, acceptedTickets: 1, receiptDelivered: 0 });

    const beforeReceipt = await t.run(async (ctx) => ({
      reminders: await ctx.db.query("reminders").collect(),
      dispatches: await ctx.db.query("notificationDispatches").collect(),
    }));
    expect(beforeReceipt.reminders[0]?.lastNotifiedAt).toBeUndefined();
    expect(beforeReceipt.dispatches[0]).toMatchObject({ status: "ticket_accepted", expoTicketId: "ticket-0" });

    const second = await t.action(internal.notifications.sendDueReminders, { now: now + 20_000 });
    expect(second).toMatchObject({ attemptedMessages: 0, acceptedTickets: 0, receiptDelivered: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const afterReceipt = await t.run(async (ctx) => ({
      reminder: (await ctx.db.query("reminders").collect())[0],
      dispatch: (await ctx.db.query("notificationDispatches").collect())[0],
    }));
    expect(afterReceipt.reminder?.lastNotifiedAt).toBe(now - 1_000);
    expect(afterReceipt.dispatch?.status).toBe("delivered");
  });

  it("deactivates only a token rejected as DeviceNotRegistered", async () => {
    await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").collect())[0]!;
      await ctx.db.insert("deviceTokens", {
        userId: user._id,
        deviceId: "device-b",
        platform: "ios",
        token: "ExponentPushToken[device-b]",
        isActive: true,
        lastUsedAt: now,
      });
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (url.endsWith("/send")) {
        return new Response(JSON.stringify({
          data: [
            { status: "ok", id: "ticket-good" },
            { status: "error", details: { error: "DeviceNotRegistered" } },
          ].slice(0, body.length),
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { "ticket-good": { status: "ok" } } }), { status: 200 });
    }));

    const result = await t.action(internal.notifications.sendDueReminders, { now });
    expect(result).toMatchObject({ attemptedMessages: 2, acceptedTickets: 1, rejectedTickets: 1 });
    const tokens = await t.run(async (ctx) => await ctx.db.query("deviceTokens").collect());
    expect(tokens.find((token) => token.deviceId === "device-a")?.isActive).toBe(true);
    expect(tokens.find((token) => token.deviceId === "device-b")?.isActive).toBe(false);
  });

  it("does not dispatch a reminder whose care plan was superseded", async () => {
    await t.run(async (ctx) => {
      const plan = (await ctx.db.query("userPlantCarePlans").collect())[0]!;
      await ctx.db.patch(plan._id, { status: "superseded" });
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await t.action(internal.notifications.sendDueReminders, { now });
    expect(result).toMatchObject({ dueReminderCount: 0, attemptedMessages: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await t.run(async (ctx) => await ctx.db.query("notificationDispatches").collect())).toHaveLength(0);
  });

  it("keeps retry independent when two devices receive mixed receipt outcomes", async () => {
    await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").collect())[0]!;
      await ctx.db.insert("deviceTokens", {
        userId: user._id,
        deviceId: "device-b",
        platform: "ios",
        token: "ExponentPushToken[device-b]",
        isActive: true,
        lastUsedAt: now,
      });
    });

    let sendCount = 0;
    let receiptCount = 0;
    const sendBodies: any[][] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (url.endsWith("/send")) {
        sendCount += 1;
        sendBodies.push(body);
        const ticketIds = body.length === 2
          ? ["ticket-device-a", "ticket-device-b"]
          : ["ticket-device-b-retry"];
        return new Response(JSON.stringify({
          data: ticketIds.slice(0, body.length).map((id: string) => ({ status: "ok", id })),
        }), { status: 200 });
      }
      receiptCount += 1;
      if (receiptCount === 1) {
        return new Response(JSON.stringify({
          data: {
            "ticket-device-a": { status: "ok" },
            "ticket-device-b": { status: "error", details: { error: "MessageRateExceeded" } },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        data: { "ticket-device-b-retry": { status: "ok" } },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await t.action(internal.notifications.sendDueReminders, { now });
    expect(first).toMatchObject({ attemptedMessages: 2, acceptedTickets: 2 });

    const mixed = await t.action(internal.notifications.sendDueReminders, { now: now + 20_000 });
    expect(mixed).toMatchObject({ attemptedMessages: 0, receiptDelivered: 1, receiptRejected: 1 });
    expect(sendCount).toBe(1);

    const retry = await t.action(internal.notifications.sendDueReminders, { now: now + 80_000 });
    expect(retry).toMatchObject({ attemptedMessages: 1, acceptedTickets: 1 });
    expect(sendBodies[1]?.[0]?.to).toBe("ExponentPushToken[device-b]");

    const resolved = await t.action(internal.notifications.sendDueReminders, { now: now + 100_000 });
    expect(resolved).toMatchObject({ attemptedMessages: 0, receiptDelivered: 1 });
    expect(receiptCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const state = await t.run(async (ctx) => ({
      reminder: (await ctx.db.query("reminders").collect())[0],
      dispatches: await ctx.db.query("notificationDispatches").collect(),
    }));
    expect(state.reminder?.lastNotifiedAt).toBe(now - 1_000);
    expect(state.dispatches.map((row) => row.status).sort()).toEqual(["delivered", "delivered"]);
  });

  it("deactivates the old account token before account switch rebinds it", async () => {
    const userA = t.withIdentity(identity);
    const deactivated = await userA.mutation(api.notifications.deactivateDeviceTokens, {
      deviceId: "device-a",
    });
    expect(deactivated).toEqual({ ok: true, deactivatedCount: 1 });

    const beforeSwitch = await t.run(async (ctx) => (await ctx.db.query("deviceTokens").collect())[0]);
    expect(beforeSwitch?.isActive).toBe(false);

    const identityB = { subject: "notification-user-b", tokenIdentifier: "test:notification-user-b" };
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        tokenIdentifier: identityB.tokenIdentifier,
        isActive: true,
        timezone: "UTC",
      });
    });
    const userB = t.withIdentity(identityB);
    await userB.mutation(api.notifications.registerDeviceToken, {
      token: "ExponentPushToken[device-a]",
      deviceId: "device-a",
      platform: "ios",
    });
    const afterSwitch = await t.run(async (ctx) => ({
      token: (await ctx.db.query("deviceTokens").collect())[0],
      user: await ctx.db.query("users").withIndex("by_token", (q) => q.eq("tokenIdentifier", identityB.tokenIdentifier)).unique(),
    }));
    expect(afterSwitch.token?.userId).toBe(afterSwitch.user?._id);
    expect(afterSwitch.token?.isActive).toBe(true);
  });

  it("does not deactivate a re-bound token from a late old-account receipt", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/send")) {
        return new Response(JSON.stringify({ data: [{ status: "ok", id: "late-ticket" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        data: { "late-ticket": { status: "error", details: { error: "DeviceNotRegistered" } } },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const userA = t.withIdentity(identity);
    await t.action(internal.notifications.sendDueReminders, { now });
    await userA.mutation(api.notifications.deactivateDeviceTokens, { deviceId: "device-a" });

    const identityB = { subject: "late-receipt-user-b", tokenIdentifier: "test:late-receipt-user-b" };
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        tokenIdentifier: identityB.tokenIdentifier,
        isActive: true,
        timezone: "UTC",
      });
    });
    const userB = t.withIdentity(identityB);
    await userB.mutation(api.notifications.registerDeviceToken, {
      token: "ExponentPushToken[device-a]",
      deviceId: "device-a",
      platform: "ios",
    });

    await t.action(internal.notifications.sendDueReminders, { now: now + 20_000 });
    const state = await t.run(async (ctx) => ({
      token: (await ctx.db.query("deviceTokens").collect())[0],
      dispatch: (await ctx.db.query("notificationDispatches").collect())[0],
    }));
    expect(state.token?.isActive).toBe(true);
    expect(state.dispatch?.status).toBe("permanent_failure");
  });

  it("does not resend an unknown request after a provider timeout", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network timeout");
    });
    vi.stubGlobal("fetch", fetchMock);
    const first = await t.action(internal.notifications.sendDueReminders, { now });
    const second = await t.action(internal.notifications.sendDueReminders, { now: now + 60_000 });
    expect(first).toMatchObject({ attemptedMessages: 1, unknownRequests: 1 });
    expect(second.attemptedMessages).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const dispatch = await t.run(async (ctx) => (await ctx.db.query("notificationDispatches").collect())[0]);
    expect(dispatch?.status).toBe("unknown");
  });

  it("does not retry a malformed accepted response", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/send")) return new Response(JSON.stringify({}), { status: 200 });
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await t.action(internal.notifications.sendDueReminders, { now });
    const second = await t.action(internal.notifications.sendDueReminders, { now: now + 60_000 });
    expect(first).toMatchObject({ attemptedMessages: 1, unknownRequests: 1 });
    expect(second.attemptedMessages).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const dispatch = await t.run(async (ctx) => (await ctx.db.query("notificationDispatches").collect())[0]);
    expect(dispatch?.status).toBe("unknown");
  });

  it("reconciles an unknown dispatch from provider receipt evidence and exposes redacted status", async () => {
    const previousEnvironment = process.env.RICHFARM_ENVIRONMENT;
    const previousGate = process.env.RICHFARM_DEV_REMINDER_TRIGGER_TOKEN;
    process.env.RICHFARM_ENVIRONMENT = "development";
    process.env.RICHFARM_DEV_REMINDER_TRIGGER_TOKEN = "local-gate";
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/send")) throw new Error("provider timeout");
      return new Response(JSON.stringify({ data: { "ticket-recovered": { status: "ok" } } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await t.action(internal.notifications.sendDueReminders, { now });
      const dispatchId = await t.run(async (ctx) => (await ctx.db.query("notificationDispatches").collect())[0]!._id);
      const user = t.withIdentity(identity);
      const resolved = await user.action(api.notifications.reconcileUnknownNotificationDispatch, {
        gate: "local-gate",
        dispatchId,
        expoTicketId: "ticket-recovered",
      });
      expect(resolved).toMatchObject({ status: "delivered", reconciliation: "provider_receipt" });

      const evidence = await user.query(api.notifications.getNotificationDispatchStatus, { dispatchId });
      expect(evidence[0]).toMatchObject({
        status: "delivered",
        expoTicketId: "ticket-recovered",
        token: { token: "Exponent…e-a]" },
      });
      const repeated = await user.action(api.notifications.reconcileUnknownNotificationDispatch, {
        gate: "local-gate",
        dispatchId,
        expoTicketId: "ticket-recovered",
      });
      expect(repeated).toMatchObject({ status: "delivered", reconciliation: "already_resolved" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      if (previousEnvironment === undefined) delete process.env.RICHFARM_ENVIRONMENT;
      else process.env.RICHFARM_ENVIRONMENT = previousEnvironment;
      if (previousGate === undefined) delete process.env.RICHFARM_DEV_REMINDER_TRIGGER_TOKEN;
      else process.env.RICHFARM_DEV_REMINDER_TRIGGER_TOKEN = previousGate;
    }
  });

  it("requires an explicit operator resolution when an unknown dispatch has no ticket", async () => {
    const previousEnvironment = process.env.RICHFARM_ENVIRONMENT;
    const previousGate = process.env.RICHFARM_DEV_REMINDER_TRIGGER_TOKEN;
    process.env.RICHFARM_ENVIRONMENT = "development";
    process.env.RICHFARM_DEV_REMINDER_TRIGGER_TOKEN = "local-gate";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("provider timeout"); }));
    try {
      await t.action(internal.notifications.sendDueReminders, { now });
      const dispatchId = await t.run(async (ctx) => (await ctx.db.query("notificationDispatches").collect())[0]!._id);
      const user = t.withIdentity(identity);
      await expect(user.action(api.notifications.reconcileUnknownNotificationDispatch, {
        gate: "local-gate",
        dispatchId,
      })).rejects.toThrow("Provider ticket or operator resolution is required");
      const resolved = await user.action(api.notifications.reconcileUnknownNotificationDispatch, {
        gate: "local-gate",
        dispatchId,
        resolution: "permanent_failure",
      });
      expect(resolved).toMatchObject({
        status: "permanent_failure",
        reconciliation: "operator_resolution",
        lastError: "operator_permanent_failure",
      });
    } finally {
      if (previousEnvironment === undefined) delete process.env.RICHFARM_ENVIRONMENT;
      else process.env.RICHFARM_ENVIRONMENT = previousEnvironment;
      if (previousGate === undefined) delete process.env.RICHFARM_DEV_REMINDER_TRIGGER_TOKEN;
      else process.env.RICHFARM_DEV_REMINDER_TRIGGER_TOKEN = previousGate;
    }
  });

  it("requires the development trigger gate and authenticated reminder scope", async () => {
    const previousEnvironment = process.env.RICHFARM_ENVIRONMENT;
    const previousGate = process.env.RICHFARM_DEV_REMINDER_TRIGGER_TOKEN;
    process.env.RICHFARM_ENVIRONMENT = "development";
    process.env.RICHFARM_DEV_REMINDER_TRIGGER_TOKEN = "local-gate";
    try {
      const user = t.withIdentity(identity);
      await expect(user.action(api.notifications.triggerCareReminderForDevelopment, {
        gate: "wrong-gate",
        dispatchNow: false,
      })).rejects.toThrow("test_reminder_trigger_gate_rejected");

      const result = await user.action(api.notifications.triggerCareReminderForDevelopment, {
        gate: "local-gate",
        userPlantId: (await t.run(async (ctx) => (await ctx.db.query("userPlants").collect())[0]!))._id,
        dispatchNow: false,
      });
      expect(result).toMatchObject({
        occurrenceKey: expect.stringContaining("push-reminder:"),
        attemptedMessages: 0,
      });
      const syncState = await t.run(async (ctx) => (await ctx.db.query("syncAccountState").collect())[0]);
      expect(syncState?.sequence).toBe(1);
    } finally {
      if (previousEnvironment === undefined) delete process.env.RICHFARM_ENVIRONMENT;
      else process.env.RICHFARM_ENVIRONMENT = previousEnvironment;
      if (previousGate === undefined) delete process.env.RICHFARM_DEV_REMINDER_TRIGGER_TOKEN;
      else process.env.RICHFARM_DEV_REMINDER_TRIGGER_TOKEN = previousGate;
    }
  });

  it("rejects the development trigger in production even with the gate token", async () => {
    const previousEnvironment = process.env.RICHFARM_ENVIRONMENT;
    const previousGate = process.env.RICHFARM_DEV_REMINDER_TRIGGER_TOKEN;
    const previousNodeEnvironment = process.env.NODE_ENV;
    process.env.RICHFARM_ENVIRONMENT = "development";
    process.env.RICHFARM_DEV_REMINDER_TRIGGER_TOKEN = "local-gate";
    process.env.NODE_ENV = "production";
    try {
      const user = t.withIdentity(identity);
      await expect(user.action(api.notifications.triggerCareReminderForDevelopment, {
        gate: "local-gate",
        dispatchNow: false,
      })).rejects.toThrow("test_reminder_trigger_not_available");
    } finally {
      if (previousEnvironment === undefined) delete process.env.RICHFARM_ENVIRONMENT;
      else process.env.RICHFARM_ENVIRONMENT = previousEnvironment;
      if (previousGate === undefined) delete process.env.RICHFARM_DEV_REMINDER_TRIGGER_TOKEN;
      else process.env.RICHFARM_DEV_REMINDER_TRIGGER_TOKEN = previousGate;
      if (previousNodeEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnvironment;
    }
  });
});
