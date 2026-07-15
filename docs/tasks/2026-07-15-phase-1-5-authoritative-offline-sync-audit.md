# Phase 1.5 Authoritative Offline Sync Audit

Date: 2026-07-15
Plan: `docs/tasks/2026-07-14-phase-1-5-authoritative-offline-sync-plan.md`
Reviewed commit: `4d2190c` — `feat: add authoritative offline sync v2`
Verdict: **FAIL — Phase 1.5 release gate remains closed**

## Executive Summary

The latest implementation adds a meaningful Phase 1.5 backend and client foundation:

- a generic six-entity Convex operation processor;
- logical entity IDs and server revisions;
- operation receipts and deletion tombstones;
- account sync generations;
- paginated authoritative snapshots;
- a user-scoped durable outbox and quarantine;
- dependency ordering for queued v2 operations;
- revisioned User Preferences patches;
- automatic startup, foreground, network, and realtime sync triggers;
- focused backend and queue tests.

However, the production mobile application still uses legacy mutations and legacy activity/harvest queues for most real user flows. The v2 authoritative projection is written to a separate cache that no production screen reads. Several correctness gaps allow invalid child writes or leave stale deleted data visible and retrying indefinitely.

Phase 1.5 is therefore not complete and must not be treated as a release-ready multi-device sync implementation.

## Scope Check

```text
Scope Check: REQUIREMENTS MISSING
Intent: Implement authoritative offline sync v2 for Phase 1.5.
Delivered: Backend protocol foundation, durable outbox, snapshots, tombstones,
           receipts, revisions, and focused tests.
Missing: Production CRUD integration, rendered authoritative projection,
         terminal legacy reconciliation, complete realtime signaling,
         migration rollout, and real multi-device verification.
```

The implementation cross-check committed with the feature is accurate in calling the work `PARTIAL`. Its release recommendation correctly keeps the Phase 2 gate closed.

## Findings

### P1 — Legacy sync accepts Activity and Harvest children for a deleted Plant

Production Plant Detail still queues Activities and Harvests through legacy `batchSync`.

The mutation checks only whether the Plant exists and belongs to the user. It does not reject:

- `plant.isDeleted === true`;
- a Plant tombstone;
- a stale child operation created before the Plant was deleted.

Reproduction:

1. Device B remains offline with a pending Activity or Harvest for Plant P.
2. Device A deletes Plant P.
3. Device B reconnects.
4. Legacy `batchSync` loads P, sees the correct owner, and inserts the child record even though P is soft-deleted.

This violates the mandatory rule that a parent tombstone defeats stale child mutations.

Evidence:

- `packages/convex/convex/sync.ts:63-69`
- `apps/mobile/hooks/usePlantSync.ts`
- `apps/mobile/lib/sync/useSyncExecutor.ts:248-315`

Required fix:

- Reject a missing, unauthorized, soft-deleted, or tombstoned Plant using a structured terminal result such as `discarded_parent_deleted`.
- Remove the terminal operation from the outbox.
- Remove the corresponding stale Activity/Harvest from local projection and AsyncStorage.
- Add regression tests for both Activity and Harvest.

### P1 — A Garden-only Plant update can retain an incompatible Bed

`syncV2.updateEntity` resolves a new Bed only when `bedUuid` is supplied. If an operation supplies only `gardenUuid`, the mutation patches the Garden while leaving the current `bedId` untouched.

Reproduction:

1. Plant P belongs to Bed A in Garden A.
2. Send a v2 Plant update with `gardenUuid = Garden B` and no `bedUuid`.
3. Convex patches `gardenId = Garden B`.
4. `bedId` remains Bed A, whose parent is Garden A.

The resulting Plant violates:

```text
plant.bedId exists -> plant.gardenId == bed.gardenId
```

Evidence: `packages/convex/convex/syncV2.ts:207-217`.

Required fix:

- Resolve the final location from both current state and submitted fields.
- If a final Bed exists, derive Garden from `bed.gardenId`.
- Reject an explicitly supplied incompatible Garden.
- Define Bed-moving semantics: either update every assigned Plant atomically when a Bed changes Garden, or reject moving non-empty Beds.
- Add tests for Garden-only update, Bed-only update, valid Garden+Bed move, explicit unassignment, and moving a Bed containing Plants.

### P1 — Authoritative reconciliation writes a projection that production UI never reads

`reconcileAuthoritativeSnapshot` loads entities and tombstones and writes them to a scoped `rf_sync_projection_v1_*` AsyncStorage record. No production hook or screen consumes `loadAuthoritativeProjection`.

Consequences:

- Tombstones do not remove stale entities from the rendered UI.
- Pending overlays are not reconciled into Garden, Bed, Plant, Activity, or Harvest screens.
- A server-authoritative refresh can succeed without changing what the user sees.
- The implementation contains a diagnostic projection rather than an authoritative production projection.

Evidence:

- `apps/mobile/lib/sync/reconciliation.ts:37-84`
- Repository search finds no production caller of `loadAuthoritativeProjection`.

Required fix:

- Make reconciled v2 state the source rendered by production data hooks.
- Apply valid pending operations as overlays after the authoritative snapshot.
- Remove tombstoned and terminally discarded local records.
- Prevent legacy caches from overriding the authoritative projection.
- Test cleared local storage, stale local storage, pending overlays, tombstones, and missed realtime events through actual hooks/screens.

### P1 — Tombstoned legacy Activity and Harvest operations retry forever

Legacy `batchSync` encodes `discarded_deleted` inside the generic `errors` string array. The mobile executor treats every error as retryable and calls `markSyncAttempt`.

Consequences:

- The operation stays in the queue indefinitely.
- Exponential backoff continues forever.
- The stale local record remains in AsyncStorage.
- Plant Detail may continue showing data deleted on another device.

Evidence:

- `packages/convex/convex/sync.ts:59-61`
- `packages/convex/convex/sync.ts:135-137`
- `apps/mobile/lib/sync/useSyncExecutor.ts:276-303`

Required fix:

- Return structured per-item outcomes from the legacy compatibility endpoint.
- Treat `discarded_deleted`, `discarded_stale`, and deleted/invalid parents as terminal.
- Remove terminal operations from the outbox and local projection.
- Retain only genuinely retryable network/server failures.

### P2 — The generic v2 entity queue is not connected to production CRUD

`useEntitySync.queueOperation` exists, but production Garden, Bed, and Plant flows still call legacy online mutations directly.

The application therefore does not yet provide:

- offline Garden create/edit/delete;
- offline Bed create/edit/delete;
- offline Plant create/edit/move/delete;
- real dependency-aware Garden → Bed → Plant synchronization;
- uniform app-local Garden–Bed validation before enqueue;
- v2 pending overlays through real screens.

Evidence:

- `apps/mobile/hooks/useEntitySync.ts`
- no production caller of `queueOperation` outside its defining module;
- `apps/mobile/hooks/useBeds.ts` and `apps/mobile/hooks/usePlants.ts` continue using legacy mutations;
- real Garden screens continue using legacy mutations.

### P2 — Realtime sequence omits legacy production writes

`syncAccountState.sequence` increments only when `syncV2.applyOperation` returns `applied`.

Legacy Garden, Bed, Plant, Activity, Harvest, Photo, and User Preferences mutations do not consistently increment the v2 sequence. Another active device can therefore miss the reconciliation signal for most current production actions.

Evidence:

- `packages/convex/convex/syncV2.ts:364-366`
- repository search finds no shared sequence bump in the legacy mutation paths.

Required fix:

- Route all production writes through v2, or centralize a transactional sync-sequence bump used by every compatibility mutation.
- Add a two-client test proving a legacy-window write causes the other client to refresh.

### P2 — Generic Activity creation accepts arbitrary lifecycle-like types

The v2 Activity create path accepts any non-empty string as `type` and writes it with `source = manual`.

A client could create manual events named `plant_added`, `status_changed`, or other system lifecycle types. This weakens timeline integrity and makes system-versus-user event semantics ambiguous.

Evidence: `packages/convex/convex/syncV2.ts:128-139`.

Required fix:

- Define an allowlist for user-authored Activity types.
- Reserve lifecycle event types for their owning Plant mutations.
- Validate Activity payloads with explicit validators rather than generic `v.any()` plus ad hoc string extraction.

## Definition of Done Assessment

| Definition of Done item | Audit result |
|---|---|
| Sync is automatic and manual Retry Sync is removed | Partial pass; global triggers exist, but production domains are not all v2 |
| Online local mutations immediately attempt background sync | Partial pass; current child queues and generic v2 queue do, legacy CRUD does not |
| Offline mutations survive restart with stable IDs | Partial pass at queue-unit level; not proven through real UI |
| All offline-editable entities have resurrection prevention | Fail |
| Tombstones, receipts, revisions, and ownership are transactional | Pass for `syncV2.applyOperation`; fail across production compatibility paths |
| Reconnect and realtime trigger authoritative reconciliation | Partial; sequence omits legacy writes and projection is not rendered |
| Garden–Bed–Plant constraints are enforced locally and in Convex | Fail due to Garden-only update and incomplete UI wiring |
| Stale devices cannot recreate deleted entities or invalid relationships | Fail for legacy child sync and stale local display |
| Account changes cannot leak/apply another user's operations | Partial; queue isolation is tested, real slow-response/account-switch flow is not |
| Preferences use permanent revisioned field patches | Partial; protocol exists, reset and complete conflict UX remain |
| Production data remains compatible through migration | Not verified in production |
| Required multi-device/offline/timeout tests pass | Fail; focused simulations exist but required real-client matrix is incomplete |
| Backend deployed and verified before client release | Fail |

## Verification Results

Fresh checks executed on 2026-07-15:

```text
npx tsc -p packages/convex/tsconfig.json --noEmit  PASS
npx tsc -p apps/mobile/tsconfig.json --noEmit     PASS
npx vitest run                                    PASS (35/35)
working tree                                      CLEAN
```

The green suite does not cover the P1 scenarios identified in this audit. Test success therefore proves the implemented focused paths but does not satisfy Phase 1.5 release correctness.

## Missing Critical Coverage

- Legacy Activity sync after Plant deletion.
- Legacy Harvest sync after Plant deletion.
- Terminal tombstone result removes queue and local projection.
- Plant changes Garden while retaining an old Bed.
- Bed changes Garden while containing Plants.
- Production UI renders the authoritative projection.
- Tombstones remove stale items from production screens.
- Valid pending overlays survive snapshot replacement.
- Two real client processes exercising delete/offline edit/reconnect.
- Injected server-commit/response-loss recovery.
- Legacy mutation emits a realtime reconciliation signal.
- Slow response from account A arriving after account B login.

## Release Recommendation

Do not deploy or release this work as a complete Phase 1.5 implementation, and do not open the Phase 2 release gate.

Recommended completion order:

1. Fix server invariants and terminal legacy outcomes.
2. Make the authoritative projection drive production data hooks and screens.
3. Route all Garden, Bed, and Plant CRUD through the local-first v2 outbox.
4. Complete local Garden–Bed validation and server final-state validation.
5. Make every compatibility write emit the reconciliation sequence during the old-client window.
6. Add the missing regression and two-client tests.
7. Rehearse migration and rollback outside production.
8. Deploy backend-first, verify old-client safety, then release the new mobile client.
9. Run an independent post-deploy audit before opening Phase 2.

## Independent AI Verification Prompt

```text
You are an independent senior distributed-systems, Convex, TypeScript, and React Native reviewer.

Repository:
/Users/n/Documents/GitHub/richfarm

Phase 1.5 plan:
/Users/n/Documents/GitHub/richfarm/docs/tasks/2026-07-14-phase-1-5-authoritative-offline-sync-plan.md

Audit report to challenge:
/Users/n/Documents/GitHub/richfarm/docs/tasks/2026-07-15-phase-1-5-authoritative-offline-sync-audit.md

Reviewed implementation commit:
4d2190c feat: add authoritative offline sync v2

Perform a read-only audit. Do not trust the plan, implementation report, commit message, or audit conclusions. Prove or disprove every material claim using current source and fresh test output.

Specifically reproduce or trace:
1. An offline legacy Activity and Harvest syncing after their parent Plant was deleted on another device.
2. A Plant update that supplies a new Garden but omits Bed while the Plant currently has a Bed in another Garden.
3. A tombstoned legacy queue item and whether it is removed or retried forever.
4. Whether any production hook or screen reads the v2 authoritative projection.
5. Whether real Garden, Bed, and Plant CRUD uses the v2 durable outbox.
6. Whether legacy writes increment the realtime reconciliation sequence.
7. Whether arbitrary manual Activity types can impersonate lifecycle events.

Run both TypeScript checks, all tests, production builds, and diff checks. Evaluate missing multi-device, response-loss, migration, old-client, and account-switch coverage.

Return:
A. Verdict: PASS, PARTIAL, or FAIL.
B. Findings ordered by severity with exact file and line references.
C. Concrete reproduction steps for every correctness issue.
D. Requirement-by-requirement Definition of Done table.
E. Missing tests and rollout risks.
F. Whether Phase 2 may safely begin.

Do not edit files, deploy, mutate production data, or commit.
```
