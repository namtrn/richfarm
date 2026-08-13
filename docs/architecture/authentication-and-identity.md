# Authentication and Identity Contract

## Purpose

RichFarm uses Better Auth for account sessions and Convex for authenticated application data. These systems form separate runtime boundaries. A client must never assume that a cached Better Auth session guarantees that Convex currently has a valid identity.

This contract applies to mobile and to any current or future client that combines a local/guest mode with authenticated remote operations.

## Core states

| Client state | Better Auth session | Convex identity | Allowed behavior |
| --- | --- | --- | --- |
| Guest | Absent | Absent | Local-only operations; do not call authenticated mutations. |
| Authenticated and healthy | Present | Valid | Local operations and authorized remote persistence. |
| Session transition/loading | Resolving | Unknown | Avoid identity-dependent writes until the transition resolves. |
| Stale or expired session | Present or cached | Absent/invalid | Keep safe local behavior, reject remote success, and offer re-authentication. |

## Required invariants

### Authentication is not authorization

- Better Auth answers whether an account session appears to exist.
- Convex independently authorizes each protected query, mutation, or action from its current identity.
- UI code must not treat `isAuthenticated` alone as proof that a Convex write will succeed.
- Server-side authorization remains authoritative. Client guards improve behavior but never replace backend checks.

### Guest behavior

- Guests may use explicitly supported local features without signing in.
- Guest flows must not call mutations that require a Convex identity.
- A guest-local result must not be presented as remotely synchronized.
- Data intended for later account claiming must remain scoped to the guest/device identity until the claim flow completes.

### Authenticated writes

- Report remote success only after the protected operation succeeds.
- Preserve the distinction between local application and remote persistence in return types and UI feedback.
- Non-auth remote failures must be contained and shown as retryable persistence failures where appropriate.
- Promise rejections from event handlers must be awaited or explicitly contained; native press handlers must not leak unhandled rejections.

### Stale or expired sessions

- Treat `UNAUTHORIZED`, missing identity, expired token, invalid token, or an equivalent session-required response as an authentication-recovery state.
- Do not show a generic success message for the remote operation.
- If the operation is safe locally, keep the local result usable.
- Show a clear sign-in-required action that returns the user to the interrupted flow when possible.
- Re-authentication is required before remote persistence can resume. It is not required merely to continue supported guest/local behavior.

### Account transitions

- Sign-in, sign-out, account switching, and guest claiming must reset or re-scope identity-bound clients, caches, queues, and subscriptions.
- Data and pending work from Account A, guest scope, and Account B must never cross ownership boundaries.
- Transitional loading states must not be interpreted as either a confirmed guest or a confirmed authenticated identity prematurely.

## Locale preference example

Language switching demonstrates the general contract:

1. Apply the selected locale locally so the interface remains usable.
2. If the user is a guest, stop without calling `users:updateProfile`.
3. If the user has a healthy authenticated identity, persist the locale remotely.
4. If Convex rejects the write because the session is stale, retain the local locale and offer sign-in.
5. Do not claim that the profile was synchronized when persistence failed.

The policy helper is `apps/mobile/lib/profileLanguage.ts`. Its regression tests are in `apps/mobile/lib/profileLanguage.test.ts`, and the Profile UI integration is in `apps/mobile/app/(tabs)/profile.tsx`.

## Implementation boundaries

- Better Auth client/session access: `apps/mobile/lib/auth-client.ts` and `apps/mobile/lib/auth.ts`.
- Better Auth-to-Convex token bridge: `apps/mobile/lib/convexAuth.tsx`.
- Runtime session coordination: `apps/mobile/lib/state/MobileRuntimeCoordinator.tsx` and `mobileRuntimeStore.ts`.
- Convex backend authorization: protected functions under `packages/convex/convex/` using `ctx.auth.getUserIdentity()` or the relevant shared authorization helper.

Screens should consume typed domain helpers for auth-sensitive behavior rather than repeatedly classifying raw backend errors themselves.

## Verification requirements

Auth-sensitive features must cover, in proportion to their risk:

- Guest behavior with proof that no authenticated mutation was called.
- Healthy authenticated success.
- Stale/expired identity and explicit recovery UX.
- Non-auth remote failure without misleading success.
- Local failure containment.
- Sign-out and account-switch isolation when identity-scoped state is involved.
- Type checking and focused regression tests for the affected client and backend boundary.

