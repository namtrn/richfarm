# Phase 2 — Local Release Evidence

Date: 2026-08-03
Related task: `2026-08-03-phase-2-release-completion-task.md`
Repository HEAD during verification: `d06cf469820cb2d3839b5b04fbdc58c822a3045c`
The implementation and evidence updates are uncommitted working-tree changes;
no commit, staging/production deployment, or production migration was created
by this task. A development-only Convex rehearsal is recorded in the current
verification addendum.

## Source implementation verified

- Care-plan interval normalization accepts only positive finite Library values
  and clamps valid sub-day values to a one-day schedule.
- Reminder outcomes reject disabled, inactive-plant, and stale-occurrence
  payloads before creating an Activity or outcome.
- Push dispatch has durable token-specific reservations, stable occurrence and
  dispatch keys, Expo ticket/receipt state, retryable versus unknown request
  handling, partial-ticket handling, `DeviceNotRegistered` deactivation, and
  mixed multi-device retry isolation independent of `lastNotifiedAt`.
- Successful receipt state advances only the matching reminder occurrence;
  the sync dataset-change signal is emitted for every affected account.
- Unknown dispatches have a development-gated provider-ticket/receipt
  reconciliation path plus explicit operator retry/permanent-failure
  resolution, and redacted dispatch evidence.
- Sign-out deactivates the authenticated device's token before auth scope
  changes; the root-mounted mobile hook invalidates its registration cache on
  account/device scope teardown or change, so same-account logout/login
  re-registers the token.
- A development-only authenticated trigger accepts a reminder or user-plant
  selector and returns selected occurrence, batch, token, ticket, and reason
  evidence. It rejects production and missing/wrong trigger gates.
- Mobile registration reports permission/provider failures, retries on app
  activation and reconnect, scopes registration by account, and handles token
  rotation.
- Development UI exposes permission, registration status/error, last attempt,
  device/platform, and masked token status.
- Phase 2 occurrence keys are mandatory at sync/direct outcome boundaries;
  legacy omission is accepted only with explicit `legacyCompatibility: true`.
- Warm and cold notification responses wait for auth-scoped projection hydration;
  single and batched payloads route to Reminder, while stale/deleted/
  wrong-account payloads are dropped. Routing and response-key deduplication
  have direct unit coverage.

## Local verification

| Check | Result | Command/context |
|---|---|---|
| Mobile typecheck | PASS | `npm --prefix apps/mobile run typecheck` |
| Mobile Vitest | PASS — 22 files, 85 tests | `npx vitest run apps/mobile` |
| Convex typecheck | PASS | `npm run typecheck --workspace @richfarm/convex` |
| Convex Vitest | PASS — 7 files, 62 tests | `npx vitest run packages/convex/convex` |
| API Vitest | PASS — 2 files, 16 tests | Node 24.13.0 / `better-sqlite3` ABI 137; ephemeral localhost socket permission granted for the run |
| API build | PASS | `npm run api:build` |
| Dashboard build | PASS | `npm run dashboard:build` |
| iOS export | PASS | `cd apps/mobile && npx expo export --platform ios --output-dir /tmp/richfarm-phase-2-ios-findings-fixed` |
| Diff whitespace check | PASS | `git diff --check` |

The API test must use the checked-in Node 24-compatible native
`better-sqlite3` binary; the default Node 26 runtime reports an ABI mismatch.
The iOS export must run from `apps/mobile` so Metro resolves the workspace
mobile dependencies. These source checks did not deploy or mutate staging or
production; the separate development-only migration rehearsal is recorded in
the current verification addendum.

## Source review findings — 5 closed, 0 open

All five Phase 2/2.5 source findings are fixed and covered by the mixed-device,
sign-out/rebind, same-account logout/login cache, unknown reconciliation,
development status, and occurrence-policy regression tests. External delivery
and release gates remain open as well.

## Gates still open

These source checks do not close the release gate:

- staging additive-schema deployment, migration audit, backup, interruption /
  resume, restore / rollback, and no-backfill verification;
- Phase 1.5 operational gate, 100-operation observation window, and
  independent audit;
- iOS and Android physical-device journeys, including background, terminated,
  and locked-device behavior;
- direct Expo/APNs provider delivery evidence, permission transitions, and
  multi-device delivery;
- two-client offline/restart/reconnect and Account A → guest → Account B
  isolation evidence;
- production rollout approval.

Until those records exist, repository source verification is PASS but staging,
native, provider, multi-client, and production release status remain OPEN.

## Current verification addendum — 2026-08-04

The 2026-08-04 source rerun is the current baseline for this working tree:

| Check | Result | Context |
|---|---|---|
| Mobile typecheck | PASS | Node 24.13.0 |
| Mobile Vitest | PASS — 22 files, 85 tests | includes hook-level warm/cold response, permission-transition, token-rotation, stale-occurrence, routing, and local-projection coverage |
| Convex typecheck | PASS | Node 24.13.0 |
| Convex Vitest | PASS — 7 files, 62 tests | includes server care-plan canonicalization/version guard, reminder lifecycle guards, and cleanup deletion |
| API Vitest | PASS — 2 files, 16 tests | Node 24.13.0 / `better-sqlite3` ABI 137; local socket permission |
| API build | PASS |  |
| Dashboard build | PASS |  |
| iOS export | PASS | `/tmp/richfarm-phase-2-5-local-20260804-final4` |
| README iOS Maestro suite | PASS — 9/9 default flows on iPhone 17 / iOS 26.2; simulator only | development env + E2E reminder mock |
| `git diff --check` | PASS |  |

Current source behavior now explicitly includes: server-derived canonical care
task snapshots with in-place task mutation rejected; DST-aware initial
recurrence scheduling on mobile; stale/disabled/inactive reminder-action
guards; lifecycle disabling on care-plan replacement and plant harvest/archive;
cleanup deletion for disabled/inactive reminders with occurrence protection and
sync tombstones; authoritative cold-start response gating across scope
hydration;
occurrence-key validation on notification tap when the provider supplies
occurrence keys; account-scoped plant/payload routing; Expo token rotation
retry; and an explicit permission-transition signal from Profile to the root
registration hook. The five prior Phase 2/2.5 source findings remain CLOSED.

The development-only Convex rehearsal on `fantastic-beagle-190` passed a
second zero-change backfill and clean audits for Garden, Bed, Plant, Activity,
Harvest, and Photo; it is not staging evidence. The [external validation
runbook](2026-08-04-phase-1-5-to-2-5-external-validation-runbook.md) is ready
for staging, two-client, physical iOS/Android, Expo/APNs/FCM, and rollout
evidence. Those external gates remain OPEN.

The current default API test environment uses Node 26 and reports the known
`better-sqlite3` ABI mismatch; the earlier API 2/16 PASS remains valid only when
rerun with Node 24.13.0/ABI 137 and local socket permission. This mobile-only
follow-up does not claim a new API PASS.
