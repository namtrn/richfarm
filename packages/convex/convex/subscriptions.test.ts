/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

describe("RevenueCat subscription persistence", () => {
  it("preserves the current expiry for cancellation or billing issue events", async () => {
    const t = convexTest(schema, modules);
    const expiresAt = Date.now() + 60_000;
    const userId = await t.run(async (ctx) => await ctx.db.insert("users", {
      tokenIdentifier: "test:subscription-user",
      revenueCatAppUserId: "rc_subscription-user",
      isActive: true,
      subscription: { tier: "premium", source: "revenuecat", expiresAt },
    }));

    await t.mutation(internal.subscriptions.upsertSubscriptionFromRevenueCat, {
      appUserId: "rc_subscription-user",
      tier: "premium",
      preserveExistingExpiration: true,
    });

    await expect(t.run(async (ctx) => await ctx.db.get(userId))).resolves.toMatchObject({
      subscription: { tier: "premium", source: "revenuecat", expiresAt },
    });
  });

  it("clears a previous expiry when RevenueCat revokes access", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => await ctx.db.insert("users", {
      tokenIdentifier: "test:expired-subscription-user",
      revenueCatAppUserId: "rc_expired-user",
      isActive: true,
      subscription: { tier: "premium", source: "revenuecat", expiresAt: Date.now() + 60_000 },
    }));

    await t.mutation(internal.subscriptions.upsertSubscriptionFromRevenueCat, {
      appUserId: "rc_expired-user",
      tier: "free",
    });

    await expect(t.run(async (ctx) => await ctx.db.get(userId))).resolves.toMatchObject({
      subscription: { tier: "free", source: "revenuecat" },
    });
    await expect(t.run(async (ctx) => await ctx.db.get(userId))).resolves.not.toMatchObject({
      subscription: { expiresAt: expect.any(Number) },
    });
  });
});
