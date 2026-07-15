# Phase 1.5 Implementation Cross-Check

Date: 2026-07-15
Plan: `docs/tasks/2026-07-14-phase-1-5-authoritative-offline-sync-plan.md`
Verdict: **PARTIAL — backend protocol foundation is implemented; release gate remains closed**

## Executive Summary

This implementation materially advances Phase 1.5: it adds a transactional
six-entity operation processor, logical identity, revisions, receipts,
tombstones, account generations, paginated snapshots, migration helpers,
account-scoped durable queues, automatic reconciliation triggers, preference
patch receipts, durable photo upload state, and focused regression coverage.

Phase 1.5 is not complete because the production mobile Garden/Bed/Plant screens
still call legacy online Convex mutations, the authoritative v2 projection is not
yet the projection rendered by those screens, migration enforcement and
observability are incomplete, and the required real multi-device/response-loss
verification and backend-first production rollout have not occurred.

## Milestone Cross-Check

| Milestone | Result | Evidence and remaining work |
|---|---|---|
| 1. Transactional operation processor | PARTIAL | `syncV2.applyOperation` supports create/update/delete for all six entity types with generation, fingerprint, receipt, revision, tombstone, ownership, logical-parent, and deletion-policy checks (`syncV2.ts:82-368`). Missing: exhaustive per-entity update/delete tests, explicit return validators, and a first-class validation-error result distinct from `invalid_parent`. |
| 2. Migration and legacy compatibility | PARTIAL | Dry-run and paginated idempotent backfill exist (`syncMigration.ts:14-67`). Legacy Garden/Bed/Plant/Activity/Harvest/Photo creation now assigns logical identity/revision, and deletion writes tombstones. Missing: full-dataset duplicate/broken-parent audit, production dry-run, app-version cutoff configuration, and old-client integration verification. |
| 3. User-scoped outbox v2 | PARTIAL | Account-scoped envelope, serialized writes, generation, quarantine, retry backoff, and wrong-generation invalidation exist in `queue.ts` and `useSyncExecutor.ts`. Queue isolation is tested. Missing: encrypted-at-rest storage, account deletion cleanup verification, and UI/real-device restart coverage. |
| 4. Authoritative reconciliation | PARTIAL | Cursor pagination exists in `syncV2.snapshotPage` (`syncV2.ts:387`); the client loads tombstones first and rejects scope-changed responses (`reconciliation.ts:48`). Reconnect, foreground, startup, network, and v2 realtime sequence trigger reconciliation. Missing: the v2 projection is stored separately and is not yet the authoritative data source rendered by Garden/Bed/Plant screens; pending overlays are therefore not fully visible across the app. |
| 5. Dependency-aware offline CRUD | FAIL | A generic durable `useEntitySync.queueOperation` exists and executor ordering/blocking exists (`useSyncExecutor.ts:153-204`), but production Garden, Bed, and Plant hooks/screens still invoke legacy mutations directly (`garden/index.tsx:201`, `useBeds.ts:35-50`, `usePlants.ts:59-76`). Complete offline hierarchy creation is not available through the real UI. |
| 6. Photo and Preferences | PARTIAL | Photo upload persists `storageId` before metadata commit, preventing re-upload after a commit-response timeout (`useSyncExecutor.ts:214-234`). Photo tombstones and idempotent rows are implemented. Preferences use a separate durable patch queue and server revision/generation receipts. Missing: orphan-upload cleanup, explicit reset-to-default patch workflow, and tested field-aware conflict presentation/recovery. |
| 7. Verification and rollout | FAIL | Local automated verification passes, including receipt retry, operation conflict, revision conflict, tombstones, migration idempotency, preference receipts, photo resurrection prevention, and account queue isolation. Missing: two real client processes, injected post-commit response loss, old-client cutoff tests, metrics/thresholds, production migration, deploy, monitoring, and independent post-deploy audit. |

## Definition of Done Cross-Check

| Definition of Done item | Result |
|---|---|
| Sync is automatic; no manual Retry Sync control | PASS for current Plant Detail and global triggers |
| Online local mutations request immediate background sync | PASS for current queued Plant child operations and generic v2 operations |
| Offline operations survive restart with stable IDs | PASS at queue storage level; real-device verification remains missing |
| All offline-editable entities have resurrection prevention | PARTIAL; backend v2 and legacy delete paths are covered, but UI does not enqueue all six entity types |
| Tombstones, receipts, revisions, and ownership are transactional | PASS for `syncV2.applyOperation` |
| Reconnect and realtime trigger authoritative reconciliation | PASS for v2 sequence changes; legacy writes do not increment the v2 signal |
| Garden–Bed–Plant constraints enforced locally and on Convex | PARTIAL; backend is enforced, existing forms have some filtering, but v2 pre-enqueue validation is not wired everywhere |
| Stale devices cannot recreate deleted entities/parents | PASS in backend-focused scenarios; real two-device proof remains missing |
| Account changes cannot leak/apply another user's operations | PASS in queue isolation design and unit test; slow-response real-client test remains missing |
| Preferences use permanent revisioned field patches | PARTIAL; protocol and durable queue exist, reset and broader UI integration remain |
| Production compatibility through additive migration/old-client window | PARTIAL; code exists, production execution and cutoff do not |
| Required multi-device/offline/timeout/deletion/account-switch tests pass | FAIL; focused local simulations pass, required real-client matrix is incomplete |
| Backend deployed and verified before new client release | FAIL; no deployment was performed |
| Phase 2 does not depend on incomplete sync | NOT VERIFIED |

## Implemented Safety Properties

- Same operation ID and same fingerprint returns `already_applied`.
- Same operation ID with changed payload returns `operation_conflict`.
- Missing update targets return `missing_target`; they never insert.
- Server revision, not device time, controls update/delete conflicts.
- Tombstones defeat stale create and update.
- Garden deletion tombstones Beds and unassigns Plants while preserving Plant
  records and child history.
- Bed deletion unassigns Plants while retaining Garden.
- Plant deletion preserves child history and makes new child operations invalid.
- System and harvest-linked activities cannot be removed through the generic
  Activity operation.
- A wrong account generation quarantines the old namespace rather than uploading
  it.
- A Photo upload stores its storage ID durably before the authoritative metadata
  mutation.
- Legacy queue v1 is quarantined instead of adopted by the next account.

## Verification Results

Executed on 2026-07-15:

```text
npx tsc -p packages/convex/tsconfig.json --noEmit  PASS
npx tsc -p apps/mobile/tsconfig.json --noEmit     PASS
npx vitest run                                    PASS (35/35)
npm run api:build                                 PASS
npm run dashboard:build                           PASS
git diff --check                                  PASS
```

Focused Phase 1.5 coverage includes:

- hierarchical logical-ID create and idempotent response-loss-style retry;
- conflicting operation ID reuse;
- missing-target update and revision conflict;
- Garden cascade, Bed tombstone, Plant unassignment, and stale Bed update;
- wrong generation;
- idempotent migration backfill;
- preference revision/generation/receipt behavior;
- Photo commit, receipt retry, delete tombstone, and stale recreation;
- account-scoped queue isolation, serialized concurrent appends, quarantine,
  generation persistence, and v1 migration quarantine.

## Remaining Release Blockers

1. Replace real Garden, Bed, and Plant UI mutations with local-first projection +
   `useEntitySync`, including create/edit/move/delete and pending overlays.
2. Make the reconciled v2 projection the source rendered by the production UI,
   not a parallel diagnostic cache.
3. Add field-aware preference rebase/reset coverage and orphan Photo upload cleanup.
4. Expand migration audit to full paginated duplicate, ownership, and broken-parent
   validation; rehearse dry-run/backfill/rollback on non-production data.
5. Add legacy minimum-version enforcement and ensure legacy writes emit the v2
   realtime sequence or otherwise trigger reconciliation.
6. Add redacted operation metrics and explicit rollout pause thresholds.
7. Run two real client processes with injected post-commit response loss, missed
   realtime, restart, cleared storage, deletion conflicts, and account switches.
8. Deploy backend-first only after those checks, then run the independent audit.

## Release Recommendation

Do not open the Phase 2 release gate yet. The backend is sufficiently advanced to
continue integration, but shipping a mobile client that advertises full offline
Garden/Bed/Plant consistency would be inaccurate until Milestone 5 and the UI
projection portion of Milestone 4 are complete and verified on two real clients.
