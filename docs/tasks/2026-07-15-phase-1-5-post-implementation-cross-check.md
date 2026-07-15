# Phase 1.5 Post-Implementation Cross-Check

Date: 2026-07-15

Verdict: **CODE CHECKS PASS; PHASE 2 RELEASE GATE REMAINS CLOSED**

## Closed findings from the prior audit

| Prior finding | Current evidence | Result |
|---|---|---|
| Legacy child accepted after Plant deletion | `batchSync` checks Plant deletion/tombstone and returns terminal structured outcomes; lifecycle regression test covers Activity and Harvest | PASS |
| Garden-only Plant move retains incompatible Bed | v2 resolves final state, clears an incompatible retained Bed, and rejects an explicit mismatched pair | PASS |
| Projection unused by production UI | `useSyncProjection` feeds `useGardens`, `useBeds`, and `usePlants`; screens consume those hooks | PASS |
| Tombstoned legacy children retry forever | executor removes terminal child outcomes and cleans the corresponding local Plant detail projection | PASS |
| v2 entity queue unused by production CRUD | Garden/Bed/Plant hooks enqueue logical-ID operations; direct production mutations were removed | PASS |
| Realtime ignores compatibility writes | compatibility domain mutations and legacy batch sync increment the shared sync sequence | PASS |
| Arbitrary Activity can impersonate lifecycle | manual Activity allowlist is enforced in v2, batch sync, and compatibility mutations | PASS |

## Additional implementation completed

- Pending outbox overlays are composed over authoritative pages and remain
  account-scoped.
- A first offline create renders before any server snapshot exists.
- Child operations resolve logical parent IDs, allowing a fully offline
  Garden → Bed → Plant → Activity/Harvest/Photo chain.
- Photo metadata commits through v2 with a stable operation/logical ID after the
  binary upload obtains a storage ID.
- Entity acknowledgements are removed only after post-commit reconciliation is
  durably stored.
- v2 Plant writes preserve production form fields and protected lifecycle event
  behavior.

## Verification

| Check | Result |
|---|---|
| Convex TypeScript | PASS |
| Mobile TypeScript | PASS |
| Focused sync and lifecycle tests | PASS — 26 tests |
| Full repository Vitest suite | PASS — 42 tests in 6 files |

The first sandboxed full-suite attempt failed only because Supertest could not
bind `0.0.0.0`. The required localhost-enabled run passed all 42 assertions.

## Release blockers still open

These cannot be honestly marked complete from repository unit tests alone:

1. Target-backend migration dry-run, complete paginated backfill, duplicate and
   ownership review, and rollback rehearsal.
2. Minimum supported client version and timed legacy enforcement cutoff.
3. Asynchronous orphan binary cleanup and real restart testing for a partially
   completed Photo upload.
4. Two real client processes covering response loss, all-entity delete/offline
   edit/reconnect, missed realtime, storage loss, account switch, slow stale
   response, generation rotation, and account deletion.
5. Production outcome metrics, rollout pause thresholds, backend-first deploy,
   old-client compatibility observation, and an independent PASS audit.

Recommendation: treat the implementation as ready for the Phase 1.5 staging and
real-client verification campaign, not as authorization to begin Phase 2.

## Final source hardening continuation

The following release-blocking source gaps were subsequently closed:

- Added full paginated migration issue audit for duplicates, broken parents,
  Garden/Bed mismatch, and cross-account ownership; migration functions are
  internal-only.
- Added configurable minimum client version and timed legacy cutoff, defaulting
  to disabled until the observation window is complete.
- Added payload-free outcome counters, rollout health calculation, explicit
  pause thresholds, and client quarantine counters.
- Added upload reservations, committed markers, a safe orphan-upload cleanup
  mutation, and a daily cleanup cron.
- Replaced remaining scanner upload and child delete legacy paths with durable v2
  operations.
- Hydrated authoritative Photos into Plant Detail, made pending Photo deletion
  cancel its upload, and made server Photo deletion create a v2 tombstone.
- Account deletion now removes server sync state, receipts, tombstones,
  reservations/uncommitted blobs, and only the deleted account's local sync
  namespace.
- Preserved v2 server-side free-tier Garden/Bed limits.
- Added passive product-language visibility when changes are quarantined.

Final repository verification on 2026-07-15:

- Convex TypeScript: PASS
- Mobile TypeScript: PASS
- API build: PASS
- Dashboard production build: PASS
- iOS Expo production export: PASS (3,252 modules; Hermes bundle produced)
- Full Vitest suite: PASS — 6 files, 52 tests

Updated verdict: **SOURCE RELEASE CANDIDATE PASS; OPERATIONAL GATE PENDING**.
The only remaining gates require the target staging backend, two real client
processes, rollout observation, and the mandated independent audit. See
`docs/tasks/2026-07-15-phase-1-5-staging-release-runbook.md`.

## Production Convex deployment evidence — 2026-07-15

Target: `whimsical-dove-537` (`https://whimsical-dove-537.convex.cloud`).

- Convex function TypeScript check using the CLI-discovered config: PASS.
- Production dry-run: PASS; schema validation completed and no indexes were
  deleted.
- Production deployment: PASS; functions deployed and all Phase 1.5 indexes
  were added.
- `syncRuntime:policy`: reachable; rollout is not paused, minimum safe client is
  `1.0.0`, and legacy enforcement remains unset.
- `syncRuntime:rolloutHealth`: healthy initial bucket; zero outcomes recorded,
  no breached thresholds, and `shouldPause: false`.
- `syncMigration:dryRun` with a limit of 1,000: PASS and not truncated. All six
  audited domains sampled zero rows, so no missing IDs/revisions, duplicates,
  parent errors, or ownership mismatches were observed and no backfill was run.

Deployment changes the verdict to **BACKEND-FIRST DEPLOY PASS; OBSERVATION AND
REAL-CLIENT GATES PENDING**. It does not close the Phase 2 gate: production has
not yet accumulated the minimum 100-operation metrics sample, the two-client
failure matrix has not been executed, legacy cutoff has not been rehearsed, and
an independent audit has not been completed.
