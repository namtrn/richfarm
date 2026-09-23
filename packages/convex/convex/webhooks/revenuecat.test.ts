import { describe, expect, it } from "vitest";
import { buildSubscriptionUpdate } from "./revenuecat";

describe("RevenueCat subscription webhook projection", () => {
  it("keeps access through cancellation until the known expiry", () => {
    expect(buildSubscriptionUpdate({
      type: "CANCELLATION",
      app_user_id: "rc_user",
    })).toMatchObject({
      shouldUpdate: true,
      tier: "premium",
      preserveExistingExpiration: true,
    });
  });

  it("revokes access on expiration even when the event includes the entitlement", () => {
    expect(buildSubscriptionUpdate({
      type: "EXPIRATION",
      app_user_id: "rc_user",
      entitlement_ids: ["premium"],
      expiration_at_ms: 1_700_000_000_000,
    })).toMatchObject({
      shouldUpdate: true,
      tier: "free",
      expiresAt: 1_700_000_000_000,
      preserveExistingExpiration: false,
    });
  });

  it("ignores events unrelated to the configured entitlement", () => {
    expect(buildSubscriptionUpdate({
      type: "TRANSFER",
      app_user_id: "rc_user",
      entitlement_ids: ["other_entitlement"],
    })).toMatchObject({
      shouldUpdate: true,
      tier: "free",
    });
    expect(buildSubscriptionUpdate({ type: "TEST" })).toMatchObject({
      shouldUpdate: false,
      tier: "free",
    });
  });
});
