# Phase 2.5 Open Gates Review

Date: 2026-08-04
Status: **SOURCE IMPLEMENTATION PASS — EXTERNAL RELEASE GATES OPEN**

This review separates what was implemented and verified in the repository from
what still requires staging access, provider credentials, physical devices, or
independent release approval. No external gate is marked PASS without the
artifact listed below. No commit, push, deploy, or production mutation was made
for this review.

## Local source result

The current working tree is source-ready for external validation:

| Check | Result | Evidence |
|---|---|---|
| Mobile typecheck | PASS | `npm --prefix apps/mobile run typecheck` |
| Mobile Vitest | PASS — 22 files / 85 tests | `npx vitest run apps/mobile` |
| Convex typecheck | PASS | Convex workspace typecheck |
| Convex Vitest | PASS — 7 files / 62 tests | `npx vitest run packages/convex/convex` |
| API Vitest | Prior PASS — 2 files / 16 tests | Node 24.13.0 / ABI 137; default Node 26 currently reports the known ABI mismatch |
| API build | PASS | `npm run api:build` |
| Dashboard build | PASS | `npm run dashboard:build` |
| iOS export | PASS | `/tmp/richfarm-phase-2-5-local-20260804-final4` |
| iOS simulator UI | PASS — earlier evidence, 9/9 Maestro flows | iPhone 17 simulator / iOS 26.2; no provider token |
| `git diff --check` | PASS | local working-tree check |

The implementation coverage includes care-plan/reminder parent lifecycle
guards, cleanup deletion for disabled/inactive reminders, durable per-token push receipts and retries, token rebound/account
isolation, provider-unknown reconciliation, development observability,
warm/cold notification routing with semantic deduplication, sync recovery and
account scoping, mandatory Phase 2 occurrence keys, and authoritative cold-start
response retention across scope hydration. The direct reminder and
plant-lifecycle follow-up is covered by the new Convex tests; response lifecycle,
routing, and permission-cache follow-up is covered by the new mobile tests.

Latest mobile-only follow-up verification: typecheck PASS and 22 files / 85
tests PASS. API was not rerun under Node 24 in this follow-up; the default Node
26/`better-sqlite3` ABI mismatch remains an environment prerequisite, not a
source finding.

## Gate classification and missing evidence

| Gate | 1. Local preparation / verification | 2. External prerequisite and missing artifact | 3. Current evidence / status |
|---|---|---|---|
| Staging schema, migration, backup, interruption/resume, restore/rollback | Migration dry-run/backfill/audit commands and an ordered rehearsal are documented. Development deployment `fantastic-beagle-190` had a backup, two-row backfill, zero-change second pass, and clean six-domain audit. | Release operator needs approved staging deployment, generated schema/index result, backup ID plus restore check, page-level audit output, interrupted cursor/resume log, idempotency second pass, rollback/restore log, and independent reviewer initials. | Development-only evidence exists; it is not staging evidence. **OPEN.** |
| Phase 1.5 operational observation | Rollout-health thresholds, audit queries, outbox/quarantine recovery, and the 100-operation procedure are locally available and covered by source tests. | Staging owner needs a timestamped observation window with at least 100 operations, metric buckets, `shouldPause` result, legacy-cutoff rehearsal, and independent read-only audit of rows/revisions/tombstones/outboxes/projections. | No staging observation artifact or independent audit. **OPEN.** |
| iOS physical-device journey | iOS export and earlier simulator UI smoke are complete; routing/registration behavior is unit-tested. | iOS/release operator needs a signed install on a real iPhone, device/build ID, permission transition logs, foreground/background/terminated/locked screenshots or video, cold-tap logs, and token/dispatch IDs. | Simulator reported `token=none` and unsupported permission. No physical artifact. **OPEN.** |
| Android physical-device journey | Android source/typecheck and provider-independent routing tests are local preparation only. | Android/release operator needs a signed install on a real Android device, `adb` logcat, permission/token transition evidence, background/terminated/locked journeys, cold-tap routing, and build ID. | `adb`/real Android execution was not available. **OPEN.** |
| Expo/APNs/FCM provider delivery | Durable ticket/receipt state, retry isolation, `DeviceNotRegistered` scoping, unknown reconciliation, and development status are source-tested. | Provider owner needs Expo ticket IDs, delayed receipt IDs/statuses, APNs/FCM delivery logs, retry/backoff attempts, partial-batch results, token-rotation/reinstall evidence, and proof that the wrong account never receives a send. | No physical token or provider receipt was obtained. **OPEN.** |
| Multi-client offline/restart/reconnect and account isolation | Queue, guest-claim, projection, tombstone, receipt, routing, and sync recovery tests are local preparation. | QA/release operator needs fresh A1/A2/B1 runs with local queue/operation IDs, base revisions, server receipts, sync sequences, final projections, forced restart/reconnect logs, guest claim transition, and account-switch/delete evidence. | No real multi-client matrix artifact. **OPEN.** |
| Rollout approval | Rollout-health calculation, thresholds, pause behavior, and legacy compatibility are locally verified/documented. | Release owner and independent reviewer need the completed staging evidence packet, threshold result, rollback owner/runbook, version gate decision, and signed approval. | No approval or rollback sign-off. **OPEN.** |

## Exact next actions

1. Release operator provisions the disposable staging deployment and backup,
   then runs the commands in the [external validation runbook](2026-08-04-phase-1-5-to-2-5-external-validation-runbook.md).
2. Provider owner supplies Expo/APNs/FCM credentials and a disposable staging
   account/device window; record ticket/receipt IDs without exposing raw
   tokens. The development trigger must remain gate-protected.
3. QA installs signed iOS and Android builds and executes the same reminder
   matrix in foreground, background, terminated, locked, stale, duplicate,
   partial-failure, logout, reinstall, and wrong-account cases.
4. QA executes the A1/A2/B1 offline/restart/reconnect matrix and attaches
   queue, receipt, sequence, projection, and account-scope artifacts.
5. Release owner and independent reviewer inspect the full packet, rehearse
   restore/rollback, and record the rollout decision. Until then, do not mark
   Phase 2.5 release-ready or advance to production.

## Decision

Phase 2.5 source implementation and local verification are complete for this
working tree. Phase 2.5 is **not yet eligible to advance beyond the external
validation/release gate** because staging, operational, physical-device,
provider, multi-client, and rollout-approval evidence remain OPEN.
