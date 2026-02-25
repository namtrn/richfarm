# RevenueCat Integration Plan

## Plan
- Add RevenueCat SDK and configure with iOS/Android API keys.
- Sync RevenueCat `appUserId` with Better Auth / Convex user identifier.
- Track subscription state in a shared hook and expose `isPremium` gating state.
- Integrate RevenueCat paywall UI and purchase flows.
- Sync subscription state to backend for server-side gating.
- QA on iOS/Android sandbox before release.

## Tasks
- [x] Add SDK dependency.
- [x] Configure RevenueCat on app startup and sync user IDs.
- [x] Provide subscription state hook (`isPremium`, `customerInfo`, `refresh`).
- [ ] Install packages and update lockfile.
- [ ] Add RevenueCat paywall screen and purchase flow.
- [ ] Wire offerings (monthly/yearly) and error handling.
- [ ] QA sandbox (purchase/restore/upgrade/downgrade).

## Done
- Added `lib/revenuecat.ts` helpers and entitlement constant.
- Added `SubscriptionProvider` + `useSubscription` for gating state.
- Wrapped app root with `SubscriptionProvider`.
- Synced subscription tier to backend and enforced free limits server-side.

## Not Finished
- RevenueCat product/entitlement setup in dashboard (monthly/yearly, `premium`, `default` offering).
- Add paywall UI (RevenueCat Paywalls).
- Set `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` in environment.
- Run package install to update `package-lock.json`.
- Configure RevenueCat webhook and secret.

## Identity Strategy
- `appUserId` = `tokenIdentifier` when logged in; fallback to `device:{deviceId}` for anonymous users.
- On login, call `Purchases.logIn(newUserId)` to merge anonymous and account histories.
- Provide a "Restore Purchases" action for device changes.

## Backend Enforcement
- Free users: max 1 garden.
- Free users: max 3 beds.
- Limits are enforced in Convex mutations in addition to client checks.

## RevenueCat Webhook
- Endpoint: `POST /webhooks/revenuecat` (Convex HTTP action).
- Set `REVENUECAT_WEBHOOK_SECRET` in Convex env and in RevenueCat webhook Authorization header.
- Webhook updates `users.subscription` with `source: "revenuecat"` for server-side gating.

## QA Checklist
- Purchase monthly/yearly in sandbox and confirm `isPremium` flips to true.
- Restore purchases on a second device.
- Cancel subscription and verify downgrade after expiration.
- Exceed free garden/bed limits and verify server error is handled.
- Delete account and confirm data removal across tables.
