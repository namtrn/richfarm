# RichFarm Phase 1.5–2.5 External Validation Runbook

**Date:** 2026-08-04
**Status:** LOCAL BASELINE VERIFIED — EXTERNAL GATES OPEN
**Scope:** staging schema/migration, operational sync evidence, native-device push delivery, multi-client isolation, rollout approval

This packet is the handoff from source verification to the remaining external release gates. It does not authorize a deploy, migration, provider send, or production rollout. Record command output, timestamps, deployment names, build identifiers, screenshots, and device logs in the matching evidence files before changing any gate to PASS.

## Current source baseline

- Mobile typecheck: PASS.
- Mobile Vitest: PASS, 22 files / 85 tests.
- Convex typecheck: PASS.
- Convex Vitest: PASS, 7 files / 62 tests.
- API Vitest: PASS, 2 files / 16 tests, when run with Node 24.13.0 and the Node 24 better-sqlite3 ABI; the test server requires local socket permission.
- API build, dashboard build, iOS export, and git diff --check: PASS in the final local sweep; retain the exact output in the current evidence file.
- README iOS smoke suite: PASS, all 9 default Maestro flows on iPhone 17 / iOS 26.2 using the development Convex environment and E2E reminder mock flags. This is simulator/UI evidence only; it does not prove physical push delivery.
- No staging deployment, production mutation, provider send, physical-device journey, or rollout was executed for this packet. A separate development-only Convex rehearsal is recorded below and is not a staging gate.

## 1. Release candidate and prerequisites

Record all values before starting:

| Item | Required evidence |
| --- | --- |
| Git source | branch, commit SHA, clean/intentional worktree diff, and source evidence sign-off |
| Convex staging | deployment name/ref, schema generation result, migration owner, rollback owner |
| API staging | URL, build SHA, database backup ID, migration version |
| Identity fixtures | two accounts, one guest/device identity, one wrong-account identity, and disposable test data IDs |
| Native artifacts | iOS device build/profile, Android device build/signing, app version/build number, install timestamps |
| Push provider | Expo project ID, provider access, ticket/receipt retention location, and provider incident contact |
| Evidence | timestamped command output, screenshots/video, device logs, dispatch IDs, ticket IDs, and reviewer initials |

Required operators: one release operator, one independent reviewer, a staging database/backup owner, and an Expo/APNs/FCM owner available during the device window.

## 2. Local baseline immediately before staging

Run from the repository root and retain the complete output:

```sh
PATH=/Users/n/.nvm/versions/node/v24.13.0/bin:/opt/homebrew/bin:/usr/bin:/bin npm --prefix apps/mobile run typecheck
PATH=/Users/n/.nvm/versions/node/v24.13.0/bin:/opt/homebrew/bin:/usr/bin:/bin npx vitest run apps/mobile
PATH=/Users/n/.nvm/versions/node/v24.13.0/bin:/opt/homebrew/bin:/usr/bin:/bin npm --prefix packages/convex run typecheck
PATH=/Users/n/.nvm/versions/node/v24.13.0/bin:/opt/homebrew/bin:/usr/bin:/bin npm --prefix packages/convex run test
cd apps/api
PATH=/Users/n/.nvm/versions/node/v24.13.0/bin:/opt/homebrew/bin:/usr/bin:/bin npm rebuild better-sqlite3
PATH=/Users/n/.nvm/versions/node/v24.13.0/bin:/opt/homebrew/bin:/usr/bin:/bin npx vitest run
cd ../..
npm run api:build
npm run dashboard:build
cd apps/mobile
npx expo export --platform ios --output-dir <fresh-temporary-output>
cd ../..
git diff --check
```

For API tests, rebuild better-sqlite3 for the same Node major used to run Vitest and allow the test server to bind its local socket. Do not point these commands at staging or production.

Expected source result: mobile 22/85, Convex 7/62, API 2/16, both builds PASS, iOS export PASS, and no diff-check errors. Any difference requires an evidence note and release-owner decision.

### Local iOS simulator evidence — 2026-08-04

The README command `npm run test:smoke:ios` was run with the mobile development
environment loaded and `EXPO_PUBLIC_E2E_REMINDER_MODE=mock` plus
`EXPO_PUBLIC_E2E_NOW=2026-05-14T08:30:00+07:00`. All nine default flows passed:

`smoke-all-buttons`, `smoke-home-library-health`, `smoke-library-deeplink`,
`smoke-garden-create-bed`, `smoke-library-real-use`, `smoke-reminder-create`,
`smoke-reminder-fake-time`, `smoke-auth-e2e`, and `smoke-scan-tab`.

The development status panel reported `hook=unsupported`,
`permission=unsupported`, `platform=ios`, and `token=none` on the simulator.
Therefore this evidence does not close iOS physical-device, Android, or
Expo/APNs/FCM delivery gates.

A later rerun in the same worktree was not counted as a second PASS: the
launcher did not load the mobile `.env.local`, so the app could not initialize
Convex/Auth and the first Maestro flow failed at `e2e-tab-home`. This is a
local runner/configuration issue, not physical-device or provider evidence.

### Development-only migration rehearsal — 2026-08-04

On the configured Convex development deployment `fantastic-beagle-190`, after
capturing `/tmp/richfarm-fantastic-beagle-pre-backfill-20260804.zip`, the
read-only migration dry run found two missing revisions and two missing UUIDs.
The ordered backfill changed two Activity rows; Garden, Bed, Plant, Harvest,
and Photo changed zero. A second backfill changed zero rows for every domain.
The post-backfill dry run and paginated audits for all six original domains
reported `isDone: true` with no issue rows. This is development evidence only;
it does not substitute for the required staging backup/restore, interruption,
rollback, or independent review gates.

### Local implementation follow-up — 2026-08-04

The source follow-up also closes the remaining locally testable lifecycle
edges: direct reminder actions now reject stale, disabled, inactive-care-plan,
and stopped-plant parents before creating an outcome; replacing a care plan or
harvesting/archiving a plant disables its reminder rows; Phase 2 payloads carry
an account marker and route joins against the account-scoped plant projection;
warm/cold response cleanup and semantic response keys prevent cross-account or
duplicate routing. Permission-transition retry invalidates the registration
cache before re-registering. These changes are covered by the current 22/85
mobile and 7/62 Convex test runs.

## 3. Staging schema and migration audit

1. Deploy the exact candidate to a disposable or approved staging deployment using the normal release process. Record the deployment ref and generated schema hash. Do not run a production deploy from this packet.
2. Take and verify a restorable database backup. Record backup ID, retention, restore owner, and a restore-test result in staging.
3. Run the existing migration dry run and page audit for each original Phase 1.5 domain in this order: `garden`, `bed`, `plant`, `activity`, `harvest`, `photo`.

```sh
cd packages/convex
npx convex run syncMigration:dryRun '{"sampleLimit":100}' --deployment <staging-deployment>
npx convex run syncMigration:auditPage '{"domain":"garden","paginationOpts":{"numItems":100,"cursor":null}}' --deployment <staging-deployment>
```

Repeat auditPage for every domain, following returned cursors until the page reports completion. Capture missing UUIDs, revisions, ownership errors, parent errors, and malformed rows. A non-empty error count is a STOP.

4. If the approved migration window permits backfill, run one domain at a time with the returned cursor, recording each page:

```sh
npx convex run syncMigration:backfillPage '{"domain":"garden","paginationOpts":{"numItems":100,"cursor":null}}' --deployment <staging-deployment>
```

Run a second dry run and a second audit after backfill. Expected idempotency result: first pass changes only the approved legacy rows; second pass changes `0`; no ownership or parent inconsistencies; all rows have stable `entityUuid` and `revision`.

5. For additive Phase 2 domains (`carePlan`, `reminder`, `reminderOutcome`), verify schema/index availability, ownership filters, sync snapshot visibility, and sequence advancement using disposable records. Do not run the original six-domain backfill against additive tables unless a separately reviewed migration says so.
6. Test interruption: stop after a recorded page, resume from the returned cursor, and verify no duplicate or partial records. Test rollback by restoring the backup into a disposable staging target and recording the restore check. Do not perform destructive rollback against a shared environment.

**Staging gate PASS requires:** verified backup/restore, clean page audits, approved backfill result or documented no-backfill decision, interruption/resume evidence, idempotency evidence, schema/index evidence, and independent reviewer initials.

## 4. Two-client offline/restart/reconnect matrix

Use two real clients on the same account (`A1`, `A2`) and a separate wrong-account client (`B1`). Capture local queue IDs, operation IDs, base revisions, server receipts, sync sequence, and final projections.

| Scenario | Expected result |
| --- | --- |
| A1 creates garden → bed → plant offline, then reconnects | one server entity per logical UUID; hierarchy is preserved |
| A1 edits while offline and A2 edits the same row | deterministic revision conflict; no silent overwrite; both clients converge |
| A1 deletes a garden offline while A2 edits its bed/plant | tombstones/parent detach rules apply; stale writes are discarded or conflict; no resurrection |
| A1 creates/edits activity, harvest, and photo offline | append-only activity semantics, harvest/log linkage, photo upload retry/resume, no duplicate side effects |
| A1 creates a care plan and reminders, then A2 reconnects after missed realtime | snapshot/reconciliation supplies the same canonical tasks, plan version, reminder occurrence, and sync sequence |
| Kill and restart both clients with queued work | queues survive restart; receipt replay is idempotent; no duplicate plan/reminder/outcome |
| Drop network during upload/send/response | retryable work resumes; unknown outcomes reconcile by operation ID; no duplicate push side effect |
| Clear local storage on A1 and rehydrate | account-scoped server snapshot rebuilds state; no other account data appears |
| Sign out A1, sign in another account, and claim a guest scope | queues, projections, tokens, and cached preferences do not cross account boundaries |
| Delete the account and reinstall/restart | account data, device tokens, pending operations, and local scope are cleared according to the deletion contract |

For every row, require two independent fresh runs: normal connectivity and a forced reconnect/restart path. A stale or wrong-account projection, duplicate receipt, resurrected entity, or unexplained sequence gap is a STOP.

## 5. iOS/Android push and Expo/APNs/FCM validation

Use physical iOS and Android devices. Simulators/emulators are not sufficient for provider delivery. Complete permission flows from undetermined, denied, granted/provisional, and settings-revoked states.

First configure a disposable development/staging gate and verify the server-side gate token. Then trigger only a disposable staging reminder:

```sh
cd packages/convex
npx convex run notifications:triggerCareReminderForDevelopment \
  '{"gate":"<development-gate>","reminderId":"<staging-reminder-id>","dispatchNow":true}' \
  --deployment <staging-deployment> \
  --identity '{"tokenIdentifier":"<staging-account-token-identifier>"}'

npx convex run notifications:getNotificationDispatchStatus \
  '{"dispatchId":"<dispatch-id>"}' \
  --deployment <staging-deployment> \
  --identity '{"tokenIdentifier":"<staging-account-token-identifier>"}'
```

Record Expo ticket IDs, receipt IDs/statuses, dispatch IDs, device token IDs, provider responses, and server retry/deactivation state. Verify unknown ticket/receipt results remain retryable and `DeviceNotRegistered` deactivates only the rejected token.

Required device journeys on both platforms:

- permission granted from the profile flow while the app remains active; registration completes without an app restart;
- permission revoked in Settings, then restored; registration retries and the current token is rebound;
- foreground, background, terminated, and locked-screen receipt;
- cold-start tap routing after projection hydration;
- stale occurrence payload after the reminder has advanced, deleted reminder, and wrong-account payload;
- one-device, two-device same-account, and two-account isolation;
- single reminder and same-day batch; duplicate provider delivery; retryable provider error; partial batch failure;
- Expo token rotation/reinstall and APNs/FCM token replacement;
- no push after reminder completion/disable, plant archive/harvest, account sign-out, or account deletion.

Pass criteria: exactly one current occurrence is actionable, stale occurrence taps do not navigate, no wrong-account route is possible, provider receipts reconcile, retries respect backoff, and token deactivation is scoped to the failing token.

## 6. Observation window and rollout approval

1. Observe at least 100 sync operations across the approved staging cohort and record the exact bucket/window used by `syncRuntime:rolloutHealth`.
2. Verify the configured stop thresholds remain: conflict rate `≤2%`, wrong-generation rate `≤1%`, retryable rate `≤5%`, quarantine rate `≤2%`, minimum sample `100`.
3. Record the health result before and after the observation window. Any `breached` metric or `shouldPause=true` stops rollout.
4. Rehearse legacy cutoff in staging only: identify the old client cohort, verify the minimum safe version gate, pause/rollback behavior, and recovery path. Do not unset compatibility in production until the rollout owner signs off.
5. Obtain independent sign-off for schema/migration, operational sync evidence, iOS delivery, Android delivery, provider receipts, account isolation, and rollback readiness.

## Final gate record

Advance beyond Phase 2.5 only when every item below is explicitly marked PASS in the dated evidence record:

| Gate | Status | Evidence link / owner |
| --- | --- | --- |
| Source verification | PASS — local baseline recorded | current Phase 2/2.5 evidence |
| Staging schema/index audit | OPEN until executed |  |
| Migration/backfill/backup/rollback | OPEN until executed |  |
| Phase 1.5 operational observation | OPEN until executed |  |
| Two-client offline/restart/reconnect | OPEN until executed |  |
| iOS physical-device push | OPEN until executed |  |
| Android physical-device push | OPEN until executed |  |
| Expo/APNs/FCM ticket and receipt evidence | OPEN until executed |  |
| Token rotation/retry/account isolation | OPEN until executed |  |
| Independent review and rollout approval | OPEN until executed |  |

Until then, the repository is source-ready for external validation but not release-ready beyond Phase 2.5.
