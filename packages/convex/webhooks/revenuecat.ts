import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { REVENUECAT_ENTITLEMENT_ID } from "../lib/revenuecat";

type RevenueCatEvent = {
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  entitlement_ids?: string[];
  entitlement_id?: string;
  entitlements?: Record<string, unknown>;
  expiration_at_ms?: number;
  type?: string;
};

function extractEntitlementIds(event: RevenueCatEvent): string[] {
  const ids: string[] = [];
  if (Array.isArray(event.entitlement_ids)) {
    ids.push(...event.entitlement_ids.filter((id): id is string => typeof id === "string"));
  }
  if (typeof event.entitlement_id === "string") {
    ids.push(event.entitlement_id);
  }
  if (event.entitlements && typeof event.entitlements === "object") {
    ids.push(...Object.keys(event.entitlements));
  }
  return Array.from(new Set(ids));
}

function extractAppUserIds(event: RevenueCatEvent): string[] {
  const ids = new Set<string>();
  if (typeof event.app_user_id === "string" && event.app_user_id.length > 0) {
    ids.add(event.app_user_id);
  }
  if (typeof event.original_app_user_id === "string" && event.original_app_user_id.length > 0) {
    ids.add(event.original_app_user_id);
  }
  if (Array.isArray(event.aliases)) {
    for (const alias of event.aliases) {
      if (typeof alias === "string" && alias.length > 0) {
        ids.add(alias);
      }
    }
  }
  return Array.from(ids);
}

function isAuthorized(request: Request) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (!header) return false;

  return header === secret || header === `Bearer ${secret}`;
}

export const revenuecatWebhook = httpAction(async (ctx, request) => {
  if (!process.env.REVENUECAT_WEBHOOK_SECRET) {
    return new Response("Webhook not configured", { status: 500 });
  }

  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: { event?: RevenueCatEvent } | RevenueCatEvent | null = null;
  try {
    payload = (await request.json()) as { event?: RevenueCatEvent } | RevenueCatEvent;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const event = "event" in (payload ?? {}) ? (payload as { event?: RevenueCatEvent }).event : (payload as RevenueCatEvent | null);
  if (!event) {
    return new Response("Missing event", { status: 400 });
  }

  if (event.type === "TEST") {
    return new Response("OK", { status: 200 });
  }

  const entitlementIds = extractEntitlementIds(event);
  const hasPremium = entitlementIds.includes(REVENUECAT_ENTITLEMENT_ID);
  const expirationAtMs = typeof event.expiration_at_ms === "number" ? event.expiration_at_ms : undefined;

  const shouldUpdate =
    entitlementIds.length > 0 ||
    event.type === "EXPIRATION" ||
    event.type === "CANCELLATION" ||
    event.type === "REFUND";

  if (!shouldUpdate) {
    return new Response("Ignored", { status: 200 });
  }

  const appUserIds = extractAppUserIds(event);
  if (appUserIds.length === 0) {
    return new Response("Missing app_user_id", { status: 400 });
  }

  const tier = hasPremium ? "premium" : "free";
  let updated = 0;
  for (const appUserId of appUserIds) {
    const result = await ctx.runMutation(
      internal.subscriptions.upsertSubscriptionFromRevenueCat,
      {
        appUserId,
        tier,
        expiresAt: expirationAtMs,
      }
    );
    if (result.ok) {
      updated += 1;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, updated }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
});
