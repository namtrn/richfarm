# Phase 1.5 — Release Completion and Operational Verification

Date: 2026-08-03
Status: **SOURCE VERIFICATION PASS — OPERATIONAL GATE OPEN**
Depends on: Phase 1 lifecycle and durable plant commands
Blocks: Phase 2 release sign-off

## Objective

Prove that the authoritative offline-sync implementation is safe in staging
and across real clients before the product is treated as release-ready.

The repository already contains the sync-v2 protocol, durable outbox,
authoritative projections, revisions, receipts, tombstones, guest claim, and
account-scope guards. The remaining work is evidence, rollout safety, and
real-device failure testing.

## Already implemented locally

- Stable logical entity IDs and operation IDs.
- Durable, account-scoped outbox with retry and quarantine.
- Server revisions, receipts, tombstones, ownership, and parent validation.
- Authoritative snapshot pagination and optimistic pending overlays.
- Durable Activity, Harvest, and Photo commands.
- Guest-local namespace and resumable account claim.
- Development migration/backfill rehearsal and local automated coverage.

## Review findings and source correction status — 2026-08-03

The P1/P2 findings below have been corrected and regression-tested in the
working tree. The operational gate remains open because staging, native,
two-client, observation-window, and independent-audit evidence is still
required.

### P1 — Corrupt durable outbox can be presented as empty

`parseEnvelope` currently converts malformed JSON, an unsupported envelope
version, or a scope mismatch into an empty envelope. A malformed legacy queue
is also removed after parsing failure. This can make pending user operations
disappear instead of entering recovery.

Required correction:

- Preserve the raw payload under a recovery key.
- Mark the scope as `needs_attention`.
- Do not execute or silently replace the corrupt queue with an empty healthy
  queue.
- Add tests for malformed JSON, wrong version, wrong scope, malformed legacy
  queue, restart, and user-visible recovery state.

### P2 — Batch import must detect conflicting duplicate IDs

`enqueueSyncActions` deduplicates duplicate IDs with last-write-wins behavior.
Guest claim detects operation conflicts separately, but the generic batch API
should not silently overwrite different fingerprints.

Required correction: identical fingerprints may deduplicate; conflicting
fingerprints must be quarantined with an explicit recovery reason.

### P2 — Rollout health needs an explicit observation-window definition

`rolloutHealth` evaluates one hourly bucket by default. The release gate requires
at least 100 staging operations, so the runbook must either collect the sample
inside one declared bucket or add an aggregate observation-window query.

## Required work

### 1. Staging deployment and migration gate

- Deploy additive schema/functions to staging only.
- Take and retain a rollback snapshot before mutation.
- Exhaust `syncMigration:auditPage` for Garden, Bed, Plant, Activity, Harvest,
  and Photo.
- Require zero duplicate UUIDs, ownership mismatches, missing parents, and
  Garden/Bed mismatches; review every non-backfillable row.
- Run paginated backfill in dependency order.
- Interrupt and resume the backfill from a saved cursor.
- Run the complete backfill a second time and require `changed: 0`.
- Rehearse restore/rollback and verify old/new client reads remain equivalent.

### 2. Two-client failure matrix

Use two independent authenticated app processes. Capture operation IDs, server
revisions, receipts, tombstones, quarantine state, and screenshots.

- Offline edit on Client B, delete on Client A, reconnect B; delete must win
  without resurrection or infinite retry.
- Lose the response after a committed operation; retry the same operation ID
  and require one authoritative row.
- Verify same-field and different-field concurrent edits.
- Verify Bed move/delete while another client holds a stale Plant edit.
- Restart with pending Garden → Bed → Plant → Activity/Harvest/Photo commands.
- Restart after Photo binary upload but before metadata commit.
- Miss realtime, reconnect, and reconcile from authoritative state.
- Clear local storage and rehydrate all supported entities, including Photos.
- Logout Account A, login Account B, then deliver a delayed Account A response;
  it must not mutate Account B or guest state.
- Rotate generation and delete the account on the same device.

### 3. Native and guest verification

- Run the offline/restart/reconnect flow on iOS and Android.
- Create Garden and Bed while signed out; restart and verify local persistence.
- Claim the guest dataset into Account A without changing IDs or duplicating
  rows.
- Interrupt the claim at each durable checkpoint and verify resumability.
- Logout to guest, then sign in to Account B; Account A data must never appear.
- Verify pending Photo files survive restart and missing files enter recovery.

### 4. Metrics, compatibility, and rollout

- Configure and observe rollout health with at least 100 operations.
- Keep pause thresholds explicit: conflict 2%, wrong generation 1%, retryable
  5%, quarantine 2%.
- Validate the minimum supported client version against old-client writes.
- Rehearse a future legacy cutoff without enabling it prematurely.
- Record backend-first deployment, observation window, pause decision, and
  rollback owner.

### 5. Independent audit

Run an independent read-only audit against the staging evidence. The audit must
review authoritative rows, revisions, receipts, tombstones, outboxes, local
projections, and account transitions rather than relying only on UI appearance.

### 6. Durable local-state recovery

- Implement the P1 corrupt-envelope recovery path before Phase 2 native testing.
- Add conflict handling for duplicate IDs in generic batch imports.
- Define and record whether rollout health is hourly or aggregated across the
  observation window.

## Verification commands

```sh
npm --prefix apps/mobile run typecheck
npx vitest run apps/mobile
npm run typecheck --workspace @richfarm/convex
npm --prefix apps/api test
npm run api:build
npm run dashboard:build
git diff --check
```

The API test environment must use a `better-sqlite3` binary built for the active
Node.js version before API test results are considered valid.

## Definition of done

- Staging audit, backfill, interruption, and rollback all pass.
- The complete two-client matrix passes with authoritative evidence.
- iOS and Android native restart/reconnect flows pass.
- Guest claim and account isolation pass after interruption and account switch.
- Corrupt durable state never becomes an empty healthy queue; recovery state is
  preserved and visible.
- Conflicting duplicate operation IDs never overwrite silently.
- Rollout metrics remain below thresholds for the observation window.
- Legacy cutoff rehearsal passes but production enforcement remains disabled
  until explicitly approved.
- Independent audit issues a PASS.

## Explicit non-goals

- Implementing Phase 2 care-plan behavior.
- Implementing Phase 2.5 push delivery.
- Enabling a production legacy cutoff during this task.
- Treating local unit tests or a development rehearsal as staging PASS.
