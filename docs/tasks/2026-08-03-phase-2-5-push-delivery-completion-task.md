# Phase 2.5 — Push Delivery and Reminder Reliability Completion

Date: 2026-08-03
Status: **SOURCE FINDINGS CLOSED — PHYSICAL/STAGING DELIVERY GATES OPEN**
Depends on: Phase 2 care-plan/reminder domain

Implementation update — 2026-08-03: durable dispatch reservations, per-token
mixed-outcome retry isolation, Expo ticket/receipt handling, unknown-state
reconciliation, development trigger/status observability, explicit occurrence
policy, token rotation, same-account re-registration, and auth-scoped
warm/cold response routing are implemented and locally tested.
Physical-device, provider, staging, and Phase 1.5 operational evidence remain
open.

Phase 1.5 source verification is green for the new migration, outbox, guest
claim, and runtime-metrics tests, but its operational gate remains open. Push
verification must use the same account-scope, restart, tombstone, and
multi-device evidence requirements; a local push test does not close the Phase
1.5 release gate.

## Phase 2.5 handoff from Phase 2 review — 2026-08-03

The originating Phase 2 review is recorded in
`2026-08-03-phase-2-release-completion-task.md`. This file tracks only the
push-delivery subset. All five source findings are closed:

1. **CLOSED — P1 mixed multi-device outcomes.** Retry selection is independent
   of the global `lastNotifiedAt` summary and mixed receipt outcomes are tested.
2. **CLOSED — P1 same-account re-login registration.** Sign-out deactivates
   the current device token, while the root-mounted mobile registration hook
   now invalidates its prior cache on account/device scope teardown or change.
   A same-account login with the same token calls registration again; the
   logout/login regression test passes.
3. **CLOSED — P1 unknown reconciliation.** Provider ticket/receipt evidence or
   explicit operator retry/permanent-failure resolution is required, with
   redacted dispatch status evidence.
4. **CLOSED — P2 development observability.** Permission, registration result,
   error/retry state, device/platform, and masked token status are rendered by
   the development-only status surface and covered by tests.
5. **CLOSED — P2 stale occurrence policy.** Phase 2 reminders require the
   current key; legacy omission requires explicit `legacyCompatibility` at both
   sync and direct mutation boundaries.

## Objective

Make reminder push delivery observable, idempotent, routable, and verifiable
on a physical iPhone while preserving the Phase 1.5 sync contracts.

The current source has physical-device token registration, a Convex cron,
Expo ticket/receipt handling, foreground presentation, Garden/Bed batching,
and the complete source-level ticket, receipt, retry, token, reconciliation,
and notification-response lifecycle. Physical provider delivery is still not
proven until the signed-device matrix runs.

## Required implementation

### P0 — Development trigger independent of the app

- Add a development-only authenticated Convex command callable from the CLI
  while RichFarm is backgrounded or terminated.
- Reject production and deployments without the dedicated development gate.
- Accept a reminder ID or user-plant ID and validate account ownership.
- Advance the selected reminder through normal revisioned semantics.
- Optionally dispatch immediately without bypassing batching, recurrence,
  `lastNotifiedAt`, receipts, or idempotency.
- Return structured evidence: selected reminder, occurrence/batch key, active
  token count, attempted messages, accepted tickets, rejected tickets, and
  reasons.

### P0 — Correct dispatch idempotency and partial failure handling

- Define a stable server occurrence/dispatch identity shared by cron, trigger,
  all devices, and retries.
- Persist or otherwise durably observe dispatch attempts and Expo ticket IDs.
- Fetch Expo receipts after the required delay.
- Distinguish request acceptance, ticket acceptance, receipt success, and
  permanent provider failure.
- Advance `lastNotifiedAt` only for the reminders/tokens whose delivery state
  satisfies the selected policy. RichFarm's policy is that it is a summary of
  the latest successful occurrence delivery; token-specific dispatch rows are
  the retry cursor, so a successful token never suppresses another token's
  retryable or unknown row.
- Provide a safe reconciliation path for `unknown` dispatches using provider
  ticket/receipt evidence; never leave an occurrence permanently suppressed
  with no operator-visible next action.
- Do not mark every reminder for a user notified because one chunk returned
  HTTP 200.
- Handle partial success inside a batch and across 100-message chunks.
- Make repeated cron/trigger execution produce zero duplicate user-visible
  notifications for the same occurrence.
- Deactivate `DeviceNotRegistered` tokens and retain redacted failure evidence.

Source risk resolved: `sendDueReminders` now records each token-specific ticket
and receipt independently. Remaining risk is external provider/device evidence.

### P1 — Token lifecycle and observability

- Surface permission, registration, platform, device ID, last registration,
  registration error, and masked token status in development. The status must
  be visible through a development-only UI or export, not only held in an
  unused hook return value.
- Do not silently swallow registration failures.
- Retry on app start, permission transition, token rotation, and reconnect.
- Avoid duplicate active rows for the same device/token.
- Deactivate the token on sign-out before changing account scope, and verify
  account switch cannot deliver the previous account's reminder.
- Ensure sign-out and account switch cannot leave a token associated with the
  wrong active account.
- Verify multiple active devices for one account.

### P1 — Notification response routing

- Register warm/background response listeners.
- Read the last response during cold start.
- Route a single reminder to the correct Plant/Reminder context.
- Route a batch to Reminder with reminder IDs or batch identity available.
- Defer navigation until auth, scope, and router hydration are ready.
- Reject stale, deleted, tombstoned, and wrong-account payloads.
- Deduplicate repeated response delivery and repeated routes.

### P1 — Delivery semantics

- Preserve friendly condition-check language.
- Preserve local-day and Garden/Bed batching.
- Keep in-app reminders individually actionable.
- Ensure push dismissal never records a performed outcome.
- Ensure completing an in-app reminder after a push remains atomic and
  idempotent.

### P1 — Staging domain contract

- Treat care plans, reminders, and reminder outcomes as additive Phase 2
  domains during staging rollout.
- Do not claim a Phase 1.5 migration/backfill PASS for these domains unless
  migration tooling has been extended and all existing rows have been audited.
- Verify push payloads resolve only against the authenticated account's
  authoritative reminder projection after restart/reconciliation.

## Verification matrix

Use a signed development build on a physical iPhone. Record device model, iOS
version, build commit, Expo project, and Convex deployment.

- Permission granted, denied, provisional, then enabled again.
- Foreground notification with banner/list/sound policy.
- Background notification and tap routing.
- Terminated app notification and cold-start routing.
- Locked-device notification and post-unlock routing.
- Multiple due reminders in the same local day/Garden/Bed produce one aggregate
  push with individually actionable in-app reminders.
- Repeated dispatch produces zero duplicates.
- Expo timeout after provider acceptance does not duplicate delivery.
- Partial ticket success deactivates only invalid tokens and retries the right
  occurrences.
- Two active devices with mixed receipt outcomes retry only the failed device
  without suppressing or duplicating the successful device.
- Sign-out/account-switch token cleanup prevents delivery to the previous
  account.
- `unknown` dispatch reconciliation records a provider-backed final outcome or
  an explicit operator resolution.
- Reminder completed, disabled, deleted, or snoozed before tap is handled safely.
- Two devices receive the intended account notification without cross-account
  leakage.

## Required automated coverage

- Development trigger authorization and production rejection.
- Stable occurrence/dispatch identity.
- Ticket mapping to token and reminder.
- Mixed multi-device receipt outcomes and retry independence from
  `lastNotifiedAt`.
- Receipt success, provider failure, timeout, and retry.
- Unknown dispatch reconciliation and operator-visible evidence.
- Partial batch/chunk success.
- Duplicate cron/trigger execution.
- `DeviceNotRegistered` deactivation.
- Cold/warm notification response routing and route deduplication.
- Wrong-account, deleted, and tombstoned payload rejection.
- Restart/reconciliation before tap does not route to another account or to a
  stale reminder.
- Sign-out/account-switch deactivates or safely rebinds the device token.
- Permission denial, provisional permission, provider configuration failure,
  and registration retry are visible in development.

## Verification commands

```sh
npm --prefix apps/mobile run typecheck
npx vitest run apps/mobile
npm run typecheck --workspace @richfarm/convex
npx vitest run packages/convex
npm run api:build
npm run dashboard:build
(cd apps/mobile && npx expo export --platform ios --output-dir /tmp/richfarm-phase-2-5-ios)
git diff --check
```

## Definition of done

- Convex can trigger a due reminder while the app is not running.
- Ticket and receipt evidence is available and redacted, including a safe
  resolution path for unknown provider state.
- Foreground, background, terminated, and locked-device push all pass on a
  physical iPhone.
- Warm and cold notification taps route safely and exactly once.
- Batching, retries, partial failure, and repeated cron execution do not create
  duplicates or incorrectly suppress reminders, including mixed outcomes
  across multiple active devices.
- Permission/token failures are visible and recoverable.
- Sign-out/account-switch cannot leave an active token attached to the prior
  account.
- Push dismissal never creates a performed outcome.
- Phase 1.5 revision, tombstone, restart, account-scope, and multi-device
  contracts remain intact.
- Phase 1.5 operational gate remains separately tracked and is not inferred
  from push delivery success.

## Explicit non-goals

- Production deployment or mutation.
- Enabling the legacy cutoff.
- Android PASS without a real Android verification environment.
- Claiming APNs/Expo delivery PASS without direct physical-device evidence.
- Phase 3 Plant Library expansion.

## Current source addendum — 2026-08-04

Local review additionally closed the permission-transition retry gap and the
client-side stale-occurrence routing gap. Cold-start notification responses now
wait for a complete authoritative projection and survive the null-to-account
scope transition; wrong-account decisions are still discarded only after that
authoritative route decision. Reminder deletion is cleanup: direct deletion
checks ownership/occurrence only, sync deletion writes a tombstone, and legacy
`deleted` outcomes remain compatible for disabled/inactive reminders. Direct
reminder mutations still enforce active care-plan/plant parents for actionable
outcomes, and plant status changes disable care-plan reminders. The shared
DST-aware scheduler is now used for initial mobile reminder creation, while
server sync validates and canonicalizes care-plan task snapshots and requires a
new plan version for task changes. The current local baseline is mobile 21 files
/ 85 tests and Convex 7 files / 62 tests. The README iOS Maestro suite passed all 9 default flows on
iPhone 17 / iOS 26.2; the simulator reported no Expo token and unsupported
notification permission, so physical push delivery remains unverified.

The exact remaining external execution steps are in the
[Phase 1.5–2.5 external validation runbook](2026-08-04-phase-1-5-to-2-5-external-validation-runbook.md).
Physical iOS/Android delivery, Expo/APNs/FCM receipts, staging migration and
schema evidence, two-client isolation, observation metrics, and independent
rollout approval remain OPEN.
