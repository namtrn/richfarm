# Phase 1.5 — Source Verification Record

Date: 2026-08-03
Related task: `2026-08-03-phase-1-5-release-completion-task.md`

## Source-level implementation completed

- Migration audit reports malformed, deleted, cross-account, duplicate, and
  parent-inconsistent rows without aborting pagination.
- Backfill mutates only rows with the two backfillable issues (`missing_uuid`
  and `missing_revision`) and returns every skipped manual-review row.
- Rollout configuration validates thresholds; a rate at a configured threshold
  pauses the rollout once the minimum sample size is reached. A legacy cutoff
  at timestamp `0` is treated as enabled.
- Corrupt v2 and legacy outboxes preserve their raw payload under a recovery
  key, persist a `needsAttention` marker, and remain blocked from execution.
- Batch imports use a canonical operation fingerprint: identical IDs may
  deduplicate, while conflicting fingerprints remain durable in quarantine
  with `batch_operation_conflict`.
- Rollout health supports an explicit aggregate observation window in addition
  to the legacy single-bucket query.
- Outbox namespace deletion is serialized with enqueue/retry writes.
- Missing Photo binaries are quarantined for recovery during sync and guest
  claim instead of being retried indefinitely.

## Local verification

| Check | Result |
|---|---|
| Mobile typecheck | PASS |
| Mobile Vitest | PASS — 15 files, 60 tests |
| Convex typecheck | PASS |
| Convex Vitest | PASS — 4 files, 40 tests |
| API build | PASS |
| API Vitest | PASS — 2 files, 16 tests; Node 24 / ABI 137 native binary |
| Dashboard build | PASS at baseline; rerun after final source changes |

API tests required a Node 24 runtime because the active Node 26 runtime is not
compatible with the checked-in `better-sqlite3` release. The final API run used
the rebuilt Node 24 binary and a local listener outside the restricted sandbox.

## Operational gates still open

This record does not claim staging or release PASS. The following require the
target staging deployment, real devices/processes, and an independent auditor:

- staging snapshot, paginated audit, interrupted/resumed backfill, second-pass
  idempotency, restore/rollback, and old/new read equivalence;
- the complete two-client failure matrix and native iOS/Android restart flows;
- guest claim interruption on devices, account switching, and missing-file
  recovery UX;
- at least 100 staging operations below the configured pause thresholds;
- legacy cutoff rehearsal with production enforcement disabled;
- independent read-only audit of rows, revisions, receipts, tombstones,
  outboxes, projections, and account transitions.

No production migration, rollout pause, legacy cutoff, or external deployment
was changed during this implementation.
