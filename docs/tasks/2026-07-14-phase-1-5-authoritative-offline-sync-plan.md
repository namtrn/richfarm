# Phase 1.5 — Authoritative Offline Sync and Multi-Device Consistency

Date: 2026-07-14
Status: Planned
Release gate: Must complete before Phase 2

## Objective

Phase 1.5 makes RichFarm safe across offline use, retries, multiple devices, account changes, and missed realtime events.

The user experience must remain local-first:

```text
User action
  -> persist durable operation
  -> update local projection immediately
  -> sync automatically when possible
  -> reconcile with authoritative Convex state
```

Sync is an implementation detail. The user must not need to understand queues, retries, revisions, tombstones, or conflict recovery.

This phase adapts the business invariants from `LOCAL_SUPABASE_SYNC_GUIDELINES.md` to Convex and the RichFarm domain:

- Designs become Gardens, Beds, Plants, Activities, Harvests, Photos, and other offline-editable entities.
- Supabase transactions/RPCs become transactional Convex mutations.
- User Preferences retain their separate permanent-document, revisioned-patch model.

## Why This Is Phase 1.5

Phase 1 established user-plant lifecycle and activity foundations. Phase 2 will introduce care-plan snapshots, reminders, reminder outcomes, and more automatic activity creation.

The sync correctness layer must exist before those additional entities depend on it. Retrofitting tombstones, revisions, and multi-device reconciliation after Phase 2 would multiply data-loss and stale-data risks.

```text
Phase 1
Lifecycle and activity foundation
        ->
Phase 1.5
Offline sync correctness and multi-device consistency
        ->
Phase 2
Care-plan snapshots and reminders
```

## Non-Goals

Phase 1.5 does not implement:

- care-plan recommendation UX;
- reminder generation and scheduling;
- reminder resolution actions;
- Library content curation or quality scoring;
- collaborative multi-user editing of the same farm;
- arbitrary last-write-wins based on device timestamps.

## Shared Sync Invariants

These invariants apply to every sync domain:

1. Local storage, projection, outbox, and sync sessions are scoped by authenticated user ID. Guest data uses a separate namespace.
2. Account changes invalidate all requests and sync sessions belonging to the prior account.
3. Device clocks are not conflict authority. Server revisions, server timestamps, mutation receipts, and tombstones decide ordering.
4. Retrying a mutation reuses the same `operationId`.
5. A timeout is not proof of failure. The operation remains pending until the server confirms its outcome.
6. Realtime signals only indicate that authoritative state may have changed. The client reloads and reconciles; it does not blindly patch local state from an event.
7. An empty server result never means stale local data should be uploaded automatically.
8. Missing update targets never fall back to insert.
9. Tombstones defeat stale create and update operations for the same logical entity ID.
10. Convex validates ownership, lifecycle, parent relationships, revision, tombstone, and idempotency in the same mutation that applies an operation.

## Domain Model

The primary hierarchy is:

```text
Garden
  -> Bed
       -> Plant
            -> Activity
            -> Harvest
            -> Photo
```

A plant may be unassigned. When it has a bed, the following invariant is mandatory:

```text
plant.bedId exists
  -> bed exists
  -> bed.userId == plant.userId
  -> bed.gardenId exists and belongs to the same user
  -> plant.gardenId == bed.gardenId
```

## Two Separate Sync Domains

### User Preferences

User Preferences use one permanent logical document per account:

```text
permanent server document
  + server revision
  + dataset generation
  + field patches
  + idempotent operationId
  + optimistic concurrency
```

Suggested metadata:

```ts
type UserPreferencesSyncMetadata = {
  revision: number;
  generation: string;
  updatedAt: number; // server time
};
```

Save request:

```ts
type ApplyPreferencesPatch = {
  operationId: string;
  baseRevision: number;
  generation: string;
  patch: Partial<UserPreferences>;
};
```

Rules:

- Reset writes defaults as a revisioned patch; it does not delete the document.
- Different-field conflicts rebase the pending patch over the latest revision.
- Same-field conflicts resolve by server application order after revision validation.
- Local `lastCloudSync` is cache/observability metadata only.
- A wrong generation or wrong user prevents upload and clears or quarantines the local dataset.
- Only account deletion removes the permanent server document and local user namespace.

### Business Entities

Gardens, Beds, Plants, Activities, Harvests, Photos, and future offline-editable records use:

```text
durable outbox
  + stable logical entity ID
  + sync-session generation
  + authoritative snapshot
  + server revision
  + deletion tombstone
  + idempotent mutation receipt
  + quarantine/conflict recovery
```

## Stable Identity

Convex `_id` values are server-generated. Any entity that may be created fully offline needs an additional stable client-generated logical ID, for example `entityUuid`.

```ts
type OfflineIdentity = {
  entityUuid: string;
  convexId?: string;
};
```

Each entity table must have a user-scoped lookup index equivalent to:

```text
(userId, entityUuid)
```

References between pending entities use logical IDs until Convex IDs are known. This enables an offline-created Bed to reference an offline-created Garden without inventing server IDs.

## Durable Operation Model

```ts
type EntityType =
  | 'garden'
  | 'bed'
  | 'plant'
  | 'activity'
  | 'harvest'
  | 'photo';

type EntityOperation = {
  operationId: string;
  userId: string;
  syncGeneration: string;
  entityType: EntityType;
  entityUuid: string;
  type: 'create' | 'update' | 'delete';
  baseRevision?: number;
  parentRefs?: {
    gardenUuid?: string;
    bedUuid?: string;
    plantUuid?: string;
  };
  payload?: unknown;
  createdAtLocal: number; // audit only; never conflict authority
  attempts: number;
  lastError?: string;
};
```

The server stores a mutation receipt keyed by:

```text
(userId, operationId)
```

Reusing an `operationId` with a different entity, operation type, or payload is rejected as `OPERATION_CONFLICT`.

## Local Mutation Flow

```text
Create / Update / Delete
  -> write durable outbox operation first
  -> update user-scoped local projection
  -> render UI immediately
  -> if online, attempt background flush immediately
  -> otherwise retain pending operation
```

The existing manual `Retry Sync` control must be removed. Automatic flush occurs:

- immediately after a local operation when online;
- when the app starts;
- when the app returns to the foreground;
- when the network becomes reachable;
- after an authoritative refresh triggered by realtime or reconnect.

Failures remain internal. Product UI may show a passive offline/pending indicator, but must not require the user to operate the sync engine.

## Transactional Server Validation

There must not be a separate “check server, then sync” correctness flow. State may change between two requests.

The Convex mutation that applies an operation must atomically:

1. Resolve the current authenticated user.
2. Verify the sync session and account scope.
3. Check for a prior mutation receipt.
4. Reject conflicting reuse of an `operationId`.
5. Load the entity and any tombstone by logical ID.
6. Validate `baseRevision` when required.
7. Validate ownership and lifecycle state.
8. Load and validate current parent entities.
9. Apply the operation or return a terminal discard/conflict result.
10. Increment the server revision.
11. Record the mutation receipt.

Convex transactional mutations ensure validation, entity writes, event writes, tombstones, snapshot updates, and receipts commit together or not at all.

## Structured Operation Results

```ts
type SyncOperationResult =
  | { status: 'applied'; operationId: string; revision: number }
  | { status: 'already_applied'; operationId: string; revision: number }
  | { status: 'discarded_deleted'; operationId: string }
  | { status: 'discarded_stale'; operationId: string }
  | { status: 'invalid_parent'; operationId: string; reason: string }
  | { status: 'revision_conflict'; operationId: string; revision: number }
  | { status: 'wrong_generation'; operationId: string }
  | { status: 'retryable_error'; operationId: string; reason: string };
```

Client handling:

- `applied`, `already_applied`: remove the operation from the outbox and hydrate the confirmed server state.
- `discarded_deleted`, `discarded_stale`: remove the outbox operation and remove the stale local projection.
- `invalid_parent`: refresh authoritative parent state, then discard or quarantine the operation; never retry forever.
- `revision_conflict`: refresh, rebase a safe field patch, or quarantine for explicit recovery.
- `wrong_generation`: invalidate the sync session and clear or quarantine the wrong-account/wrong-generation namespace.
- `retryable_error`: retain the operation and retry automatically later.

## Tombstones and Resurrection Prevention

Deleting an offline-editable entity creates a durable server tombstone:

```ts
type EntityTombstone = {
  userId: string;
  entityType: EntityType;
  entityUuid: string;
  deleteOperationId: string;
  deletedAt: number; // server time
  deletedRevision: number;
};
```

Mandatory rules:

1. A tombstone wins over content found in any snapshot or local cache.
2. Create using a tombstoned logical ID returns `discarded_deleted`.
3. Update using a tombstoned logical ID returns `discarded_deleted`.
4. Update of a missing, non-tombstoned entity returns not-found/conflict; it never inserts.
5. A stale pending operation encountering a tombstone is removed from active projection and optionally retained in quarantine for diagnostics or explicit recovery.
6. Restore is an explicit create operation using a new logical ID.
7. Tombstones are not garbage-collected before the maximum supported offline period.

Initial policy: retain tombstones indefinitely. If storage pressure later requires garbage collection, first introduce a documented retention window plus full-bootstrap generation/cursor rules for older clients.

## Authoritative Reconciliation

On app bootstrap, reconnect, foreground, or realtime signal:

```text
capture { userId, syncGeneration }
  -> load authoritative entities + tombstones
  -> discard response if account/session token is no longer current
  -> apply tombstones to remove stale local entities
  -> reconcile durable outbox against server revisions and tombstones
  -> quarantine terminal stale/invalid operations
  -> replace local projection with authoritative state plus valid pending overlays
  -> flush remaining valid operations in dependency order
```

Realtime must trigger this refresh. It must not directly mutate local state based only on an event payload.

## Dependency-Aware Sync Order

Operations are flushed in topological order:

```text
Gardens
  -> Beds
       -> Plants
            -> Activities / Harvests / Photos
```

Rules:

- A child create waits for its parent create to be confirmed.
- A parent tombstone invalidates stale child creates and updates.
- Deletes are ordered to preserve the selected parent-deletion policy.
- A failed parent operation prevents dependent child operations from being sent until reconciliation decides their outcome.

## Garden–Bed–Plant Validation

### App-local behavior

- Selecting a Garden shows only Beds belonging to that Garden.
- Changing Garden clears the selected Bed when it no longer belongs to the new Garden.
- Selecting a Bed derives the Garden from that Bed.
- Edit and Move forms validate the relation before writing to the outbox.
- A refreshed snapshot may invalidate a form that has been open for a long time; validation runs again immediately before enqueue.
- Invalid local state is explained in product language, such as “This bed is no longer available in the selected garden.”

### Convex behavior

- Load Garden and Bed from current server state; never trust the client's parent relationship.
- Validate user ownership and tombstones.
- If a Bed exists, derive the stored Garden from `bed.gardenId`.
- If the client supplies both IDs and they do not match, reject atomically.
- A stale device cannot reassign a Plant to a deleted or moved Bed.

## Parent Deletion Policies

These policies must be implemented consistently in local projection, Convex mutations, snapshot reconciliation, and tests.

### Delete Garden

Recommended policy:

```text
tombstone Garden
  -> tombstone its Beds
  -> unassign gardenId and bedId from Plants
  -> preserve Plants and their Activities, Harvests, Photos, and history
```

A stale device cannot recreate the deleted Garden or its Beds with their prior logical IDs.

### Delete Bed

Recommended policy:

```text
tombstone Bed
  -> unassign bedId from Plants
  -> retain gardenId when the Garden still exists
  -> preserve Plant history
```

### Delete Plant

Recommended policy:

```text
tombstone Plant
  -> reject future stale Activity, Harvest, and Photo mutations
  -> preserve child history server-side but exclude it from normal active projection
```

Hard deletion or permanent history erasure is a separate explicit product operation and is not inferred from normal Plant deletion/archive behavior.

## Quarantine and Recovery

Quarantine is for local operations that cannot safely apply automatically:

- update target missing;
- entity or parent tombstoned;
- wrong account or dataset generation;
- revision conflict that cannot be safely field-rebased;
- child references an invalid parent;
- quota or validation rejection where the user's local work may still be recoverable.

Quarantined payloads never auto-upload. Recovery must be explicit, for example creating a new Plant with a new logical ID or copying notes into an existing entity.

Phase 1.5 may keep quarantine UI minimal, but diagnostic state must be inspectable and recoverable without silently losing user-authored content.

## Schema and Backend Work

Expected additive Convex changes:

- logical `entityUuid` and server `revision` for offline-editable entities;
- user/entity logical-ID indexes;
- `syncOperationReceipts` table;
- `entityTombstones` table;
- permanent revisioned User Preferences document and preference operation receipts;
- authoritative snapshot query or bounded per-domain snapshot queries;
- transactional operation mutation with structured results;
- compatibility handling for existing rows that predate logical IDs and revisions.

Existing production data must be migrated additively. Logical IDs for legacy entities must be assigned deterministically or by a controlled server migration before new clients depend on them.

## Client Work

- Replace the current action queue with a user-scoped durable outbox protocol.
- Add sync-session generation and cancellation/invalidation on account change.
- Attempt immediate background sync after an online local mutation.
- Remove manual Retry Sync controls and sync-engine terminology from user-facing UI.
- Add authoritative snapshot reconciliation and tombstone application.
- Preserve pending overlays only when still valid against the server snapshot.
- Add dependency ordering and logical-ID mapping.
- Add passive offline/pending state where useful without requiring user action.
- Add app-local Garden–Bed filtering and pre-enqueue validation to every create/edit/move flow.
- Implement User Preferences using a separate revisioned patch outbox.

## Backward Compatibility and Rollout

Deploy backend-first:

```text
1. Add schema fields, indexes, tombstones, receipts, and compatibility paths.
2. Deploy Convex functions.
3. Backfill or migrate logical IDs/revisions for existing entities.
4. Verify old-client behavior against the new backend.
5. Release the new mobile client with reconciliation and outbox v2.
6. Monitor discarded, conflicted, retrying, and quarantined operation rates.
7. Remove compatibility paths only after the supported old-client window ends.
```

An old client must not be able to bypass tombstone and ownership protection. If an old endpoint cannot meet that invariant, the backend must reject the unsafe mutation rather than accept possible resurrection.

## Required Test Scenarios

### Idempotency and timeout

- Server commits successfully but the response times out; retry returns the same receipt without duplicate content.
- The same `operationId` with changed payload is rejected.
- App restart retains pending operations with unchanged IDs.

### Resurrection prevention

- Device A deletes an Activity while device B is offline; B reconnects with a stale update and cannot recreate it.
- Repeat for Harvest, Photo, Plant, Bed, and Garden.
- Tombstone defeats both stale create and stale update.
- Missing update target never becomes insert.

### Garden–Bed–Plant consistency

- App filters Beds when Garden changes.
- App clears an incompatible selected Bed.
- Convex rejects mismatched Garden and Bed even if both belong to the user.
- Device A moves/deletes a Bed while device B holds an old Plant edit; B cannot restore the old relation.
- Offline-created Garden, Bed, and Plant sync in dependency order.

### Revisions and conflicts

- Two devices edit different fields and safely rebase.
- Two devices edit the same field and resolve by documented server order.
- Delete wins over concurrent update.
- Parent tombstone invalidates pending child operation.

### Session and account safety

- Logout user A and login user B on the same device without data or outbox leakage.
- A slow response for user A arrives after user B login and is discarded.
- Wrong generation never uploads stale local state.
- Account deletion clears the correct local namespace and outbox.

### Reconciliation

- Missed realtime events are corrected on reconnect.
- An empty server collection does not auto-upload stale local content.
- Cleared local storage hydrates authoritative Activity and Harvest content.
- Pending valid overlays survive refresh; deleted/stale overlays are removed.

### User Preferences

- Offline preference patch reconnects successfully.
- Two devices edit different preference fields.
- Two devices edit the same preference field.
- Reset on device A defeats stale cached preferences on device B.
- Server commit plus response timeout remains idempotent.

## Definition of Done

Phase 1.5 is complete only when:

- sync is automatic and no manual Retry Sync control remains;
- online local mutations attempt immediate background sync;
- offline mutations survive app restart and retry with stable operation IDs;
- all offline-editable entities have server-authoritative resurrection prevention;
- tombstones, receipts, revisions, and ownership checks are applied transactionally;
- reconnect and realtime signals trigger authoritative reconciliation;
- Garden–Bed–Plant constraints are enforced both locally and in Convex;
- stale devices cannot recreate deleted entities or restore invalid parent relationships;
- account changes cannot leak or apply another user's local operations;
- User Preferences use permanent revisioned documents and field patches;
- production data remains compatible through an additive migration and old-client window;
- the required multi-device, offline, timeout, deletion, and account-switch tests pass;
- backend is deployed and verified before the new client is released;
- Phase 2 has not begun to depend on incomplete sync behavior.

## Independent AI Verification Prompt

```text
You are an independent senior distributed-systems, Convex, TypeScript, and React Native reviewer.

Repository:
/Users/n/Documents/GitHub/richfarm

Authoritative Phase 1.5 plan:
/Users/n/Documents/GitHub/richfarm/docs/tasks/2026-07-14-phase-1-5-authoritative-offline-sync-plan.md

Audit the implementation against every invariant and Definition of Done in the plan. Do not trust implementation reports or comments; prove claims from current source, schema, tests, and executed verification.

Pay special attention to:
- stale offline devices recreating deleted Garden, Bed, Plant, Activity, Harvest, or Photo entities;
- stable operation IDs and mutation receipts after response timeout;
- update-missing never becoming insert;
- server-owned revisions and tombstones instead of device-clock conflict resolution;
- authoritative snapshot reconciliation before flushing pending operations;
- user-scoped local storage, outbox, and sync-session invalidation on account change;
- dependency ordering for offline-created Garden -> Bed -> Plant -> child records;
- app-local and Convex Garden-Bed relationship validation;
- parent deletion semantics and preservation of Plant history;
- automatic invisible sync with no manual Retry Sync requirement;
- the separate permanent-document revisioned-patch model for User Preferences;
- backward compatibility with entities created before Phase 1.5.

Reproduce at minimum the two-device delete/offline-edit/reconnect scenario for every offline-editable entity and the server-commit/response-timeout retry scenario. Run all relevant TypeScript checks, unit tests, integration tests, production builds, and diff checks.

Return:
A. Verdict: PASS, PARTIAL, or FAIL.
B. Requirement-by-requirement evidence with exact file and line references.
C. Findings ordered by severity with reproduction steps.
D. Missing or weak multi-device/offline test coverage.
E. Migration and old-client compatibility risks.
F. Whether Phase 2 may safely begin.

Do not deploy, edit files, mutate production data, or commit unless explicitly requested.
```

## Implementation Clarifications and Gap Closure — 2026-07-14

The initial plan describes the target invariants but leaves several implementation
decisions underspecified. The following decisions are authoritative for the first
Phase 1.5 rollout.

### Delivery slices

Phase 1.5 is delivered backend-first in independently releasable slices:

1. Additive sync metadata, receipts, tombstones, preference revisions, and legacy
   compatibility.
2. User-scoped outbox v2, session generation, automatic flush, and account-change
   invalidation.
3. Authoritative snapshot reconciliation for Plant children, followed by Garden,
   Bed, and Plant create/update/delete operations.
4. Dependency ordering, quarantine/recovery diagnostics, migration backfill, and
   removal of unsafe legacy write paths.

A slice is not permission to declare Phase 1.5 complete. The Definition of Done
still applies to the combined result.

### Canonical operation fingerprint

Mutation receipts store a deterministic fingerprint of the immutable operation
envelope. The fingerprint covers `entityType`, `entityUuid`, operation `type`,
`baseRevision`, parent references, and payload. It excludes retry counters and
local audit timestamps. A repeated `operationId` is `already_applied` only when
the fingerprint matches; otherwise it is `operation_conflict`.

JSON object keys are canonicalized recursively before hashing. Until a server-side
cryptographic hash is introduced, the canonical JSON string itself may be stored
as the fingerprint to avoid inconsistent client/server hashing implementations.

### Revision semantics

- Revisions are positive server-owned integers scoped to a logical entity.
- A create produces revision `1`.
- Every accepted content or relationship update increments the revision once.
- Delete creates a tombstone whose `deletedRevision` is the previous revision plus
  one.
- Activity/Harvest/Photo immutable creates do not use `baseRevision`; updates and
  deletes do.
- A legacy row without a revision is treated as revision `1` by compatibility code
  until backfilled.

### Session generation ownership

The server owns the active sync generation for an account. A client obtains it
from bootstrap and persists it inside the same user namespace as the outbox. The
server rotates it on account reset/deletion or an explicit dataset reset. App
restart does not rotate it. A device-generated generation is never authoritative.

### Queue durability and atomicity

AsyncStorage does not provide multi-key transactions. Outbox v2 therefore stores
the projection metadata and operations in one versioned user-scoped envelope and
serializes all in-process modifications through one writer. Startup recovery must
accept the last fully parseable envelope. Queue migration from v1 is quarantined
until the current account owns every referenced server entity; it is never blindly
adopted by the next signed-in account.

### Retry policy

Retryable transport and server errors use capped exponential backoff with jitter.
Foreground, reconnect, realtime refresh, and a new local operation may request an
earlier attempt, but only one flush runs per user namespace. Validation,
wrong-generation, deleted, stale, and irreconcilable revision outcomes are
terminal and must not consume an infinite retry loop.

### Pagination and bootstrap bounds

Authoritative snapshots are paginated and carry a server-issued snapshot cursor.
The client completes a bootstrap before treating an empty collection as
authoritative. Tombstones are paginated separately and applied before content on
each page. Phase 1.5 must not use an unbounded `.collect()` for an account whose
entity count can grow without a documented product bound.

### Photo operation boundary

Binary upload and entity commit are separate steps. The durable Photo operation
retains its `operationId` while obtaining or retrying an upload. The authoritative
Photo row is committed through the operation processor only after a storage ID is
available. Orphaned uploads are cleaned asynchronously; an upload response timeout
must not create duplicate Photo rows.

### Legacy endpoint safety

During the old-client window, every legacy create/update/delete endpoint touching
an offline-editable entity must consult logical identity/tombstone compatibility
state. If the old request lacks enough information to distinguish a stale write,
the endpoint rejects it after the enforcement cutoff rather than weakening
resurrection prevention. The mobile release and enforcement cutoff must be
observable configuration, not an undocumented date embedded in client code.

### Observability and rollout gates

Record aggregate counts for applied, already-applied, conflicted, discarded,
wrong-generation, retryable, and quarantined operations by app version and entity
type. Never log user-authored payloads. Backend rollout is paused if conflict,
wrong-generation, or quarantine rates exceed an explicitly configured threshold.

### Data and privacy lifecycle

- Logout removes in-memory projections and cancels requests but retains the prior
  account's encrypted/local namespace for a future login on the same device.
- Account deletion removes the local namespace and server preferences, receipts,
  active entities, and tombstones according to the account-deletion policy.
- Quarantine diagnostics must redact photo paths, free-form notes, and other
  user-authored content from logs and analytics.

### Minimum implementation checkpoints

Each delivery slice must pass TypeScript, focused Convex tests, queue tests, and
`git diff --check`. Before declaring the whole phase complete, test with two real
client processes and include response-loss injection after a committed mutation;
unit tests that merely call the same mutation twice are necessary but insufficient.

## Detailed Execution Plan — 2026-07-15

This section converts the remaining Phase 1.5 work into implementation milestones.
Milestones are ordered by dependency and rollout risk. Completing an individual
milestone does not satisfy the overall Phase 1.5 Definition of Done.

### Milestone 1 — Complete the transactional operation processor

Objective: provide one authoritative server protocol for Garden, Bed, Plant,
Activity, Harvest, and Photo create/update/delete operations.

Implementation work:

- Extend the operation envelope with `operationId`, `syncGeneration`,
  `entityType`, `entityUuid`, operation type, `baseRevision`, parent logical
  references, and a validated entity-specific payload.
- Replace free-form string errors with the structured result union defined in
  this plan, including `operation_conflict` for conflicting receipt reuse.
- In the same Convex mutation, validate authentication, generation, receipt,
  fingerprint, tombstone, current revision, ownership, lifecycle, and current
  parent relationships before applying a write.
- Support create, update, and delete for all six initial entity types.
- Ensure an update whose target is missing never inserts a replacement.
- Apply the documented Garden and Bed deletion policies transactionally,
  including Plant unassignment and child tombstones.
- Preserve Plant child history after Plant deletion while excluding it from the
  normal active snapshot.
- Commit entity changes, tombstones, relationship changes, snapshot changes,
  and receipts atomically.

Primary files:

- `packages/convex/convex/syncV2.ts`
- `packages/convex/convex/lib/syncProtocol.ts`
- `packages/convex/convex/schema.ts`
- domain mutations under `packages/convex/convex/`

Acceptance gate:

- A retry after a committed response timeout returns `already_applied` without
  creating duplicate content or another revision.
- Reusing an operation ID with a different immutable envelope returns
  `operation_conflict`.
- Create and update against a tombstone return `discarded_deleted`.
- Missing update targets never become inserts.
- Garden/Bed mismatch and stale/deleted parents are rejected atomically.
- Delete wins over a concurrent or subsequently delivered stale update.

### Milestone 2 — Backfill logical identity and protect legacy endpoints

Objective: make existing production rows compatible before the new mobile client
depends on logical IDs and revisions.

Implementation work:

- Add a dry-run migration report that counts missing logical IDs, revisions,
  broken parent references, duplicate candidate IDs, and rows requiring manual
  review.
- Backfill deterministic, user-scoped `entityUuid` values and revision `1` in
  hierarchy order: Garden, Bed, Plant, then Activity, Harvest, and Photo.
- Preserve a stable mapping between Convex IDs and logical IDs throughout the
  old-client compatibility window.
- Make the migration resumable and idempotent; rerunning it must not assign new
  logical IDs or increment revisions.
- Update every legacy create/update/delete endpoint for offline-editable entities
  to consult tombstones and compatibility metadata.
- Introduce observable server configuration for minimum safe client version and
  legacy enforcement cutoff.
- Reject unsafe old-client writes after the cutoff when the request lacks enough
  identity or revision information to prove safety.

Primary files:

- new Phase 1.5 migration module under `packages/convex/convex/`
- `packages/convex/convex/schema.ts`
- `gardens.ts`, `beds.ts`, `plants.ts`, `logs.ts`, `harvestRecords.ts`, and
  `storage.ts`

Acceptance gate:

- Dry-run reports no duplicate logical IDs and no unresolved ownership mismatch.
- Migration can be interrupted and resumed safely.
- A second completed migration run produces zero logical changes.
- All legacy rows remain readable by both supported client generations.
- A supported old client cannot recreate an entity whose logical identity has a
  tombstone.

### Milestone 3 — Complete user-scoped outbox v2

Objective: make every offline mutation durable, account-safe, automatically
retryable, and independent of Convex IDs.

Implementation work:

- Extend mobile sync action types to Garden, Bed, Plant, Activity, Harvest, and
  Photo create/update/delete operations.
- Persist logical parent references so a pending Bed can reference a pending
  Garden and a pending Plant can reference a pending Bed.
- Persist server generation and `baseRevision` in the same versioned,
  user-scoped envelope as operations and quarantine state.
- Keep all modifications to an account outbox serialized through one writer.
- Add capped exponential backoff with jitter for retryable failures.
- Allow startup, foreground, reconnect, realtime refresh, and a new online local
  mutation to request an earlier retry without allowing concurrent flushes.
- Classify operation results into success, retryable, terminal discard, and
  quarantine paths.
- Capture `{ userId, generation }` for every request and ignore responses whose
  scope is no longer current.
- Cancel or invalidate in-flight work on logout, account switch, generation
  change, and account deletion.

Primary files:

- `apps/mobile/lib/sync/types.ts`
- `apps/mobile/lib/sync/queue.ts`
- `apps/mobile/lib/sync/useSyncExecutor.ts`
- `apps/mobile/hooks/useSyncTriggers.ts`
- new account/session sync helpers under `apps/mobile/lib/sync/`

Acceptance gate:

- App restart retains pending operations with unchanged IDs and generations.
- User A logout followed by User B login exposes and flushes no A data.
- A slow response for A arriving after B login cannot mutate B's projection or
  outbox.
- Terminal outcomes do not retry forever.
- Only one flush runs for an account namespace at a time.
- No user-facing manual Retry Sync control remains.

### Milestone 4 — Add authoritative paginated reconciliation

Objective: rebuild local projections from server truth plus valid pending local
overlays after bootstrap, reconnect, foreground, or realtime signals.

Implementation flow:

```text
ensure current server session
  -> capture { userId, generation }
  -> load all tombstone pages
  -> load all authoritative entity pages
  -> discard the response if scope changed
  -> apply tombstones before entity content
  -> validate pending operations and parent references
  -> quarantine terminal or irreconcilable operations
  -> replace projection with server state plus valid pending overlays
  -> flush remaining operations in dependency order
```

Implementation work:

- Replace bounded `take` bootstrap behavior with explicit pagination cursors and
  a completion marker.
- Apply tombstones before content during each reconciliation.
- Treat an empty collection as authoritative only after the full bootstrap has
  completed for the captured generation.
- Preserve valid pending overlays while removing deleted, stale, or invalid
  overlays.
- Make realtime subscriptions request reconciliation rather than directly patch
  local projection state.
- Reconcile before flushing after reconnect or a missed realtime interval.
- Hydrate Activity and Harvest detail completely after local storage is cleared.

Primary files:

- `packages/convex/convex/syncV2.ts`
- new `apps/mobile/lib/sync/reconciliation.ts`
- local projection/storage modules under `apps/mobile/lib/`
- mobile hooks that currently merge local and server Plant detail data

Acceptance gate:

- Missed realtime events are corrected after reconnect.
- Cleared local storage hydrates authoritative Activity and Harvest content.
- Pending valid overlays survive refresh without duplicate presentation.
- Tombstoned and stale overlays disappear after reconciliation.
- An empty authoritative account never causes stale local content to auto-upload.
- A scope change during any snapshot page invalidates the entire in-progress
  reconciliation result.

### Milestone 5 — Implement dependency-aware offline CRUD

Objective: allow complete offline creation and mutation of the business hierarchy
without inventing Convex IDs or restoring invalid relationships.

Dependency order:

```text
Garden
  -> Bed
       -> Plant
            -> Activity / Harvest / Photo
```

Implementation work:

- Generate logical IDs before the local projection or outbox is written.
- Make every Garden, Bed, and Plant create/edit/move form write durable operations
  before updating its local projection.
- Filter Beds by the selected Garden in every relevant form.
- Clear an incompatible Bed when Garden changes and derive Garden when Bed is
  selected.
- Revalidate parent state immediately before enqueue because a long-open form may
  have become stale after reconciliation.
- Topologically order creates and prevent children from being sent until parent
  creates are confirmed.
- Propagate parent tombstones to pending child operations.
- Order deletes according to the documented Garden, Bed, and Plant deletion
  policies.
- Present invalid parent errors in product language and preserve recoverable user
  content in quarantine.

Primary files:

- new `apps/mobile/lib/sync/dependencies.ts`
- Garden/Bed/Plant hooks and create/edit/move screens
- `apps/mobile/components/ui/AddPlantTargetModal.tsx`
- operation processor and reconciliation modules

Acceptance gate:

- Garden, Bed, Plant, and a child activity can be created fully offline and sync
  in topological order.
- A failed parent blocks dependent children without losing their payloads.
- Device A moving or deleting a Bed prevents Device B from restoring the stale
  Plant relationship.
- Garden deletion tombstones its Beds and unassigns Plants while preserving Plant
  history.
- Bed deletion unassigns Plants while retaining a valid Garden assignment.

### Milestone 6 — Finish Photo and User Preferences protocols

Objective: close the two special-case sync domains without weakening the common
idempotency and generation guarantees.

Photo implementation work:

- Persist one Photo operation ID through upload URL acquisition, binary upload,
  and authoritative Photo row commit.
- Commit Photo metadata through the operation processor only after a storage ID
  exists.
- Reuse the same logical Photo ID and operation ID after upload or mutation
  response timeouts.
- Add asynchronous orphan upload cleanup without deleting storage referenced by
  a committed Photo row.
- Apply Photo tombstones before accepting stale create or update operations.

Preferences implementation work:

- Add a user-scoped mobile preference patch outbox separate from entity
  operations.
- Persist stable operation ID, base revision, generation, and changed fields only.
- Rebase different-field patches over the latest server document.
- Resolve same-field conflicts by documented server application order after
  revision validation.
- Implement reset as a revisioned defaults patch rather than document deletion.
- Treat local cloud-sync timestamps as observability metadata only.

Acceptance gate:

- Photo upload or commit response loss does not create duplicate Photo rows.
- Deleting a Photo on one device defeats stale upload/update from another.
- Offline preference patches apply after reconnect.
- Different-field preference edits on two devices are both preserved.
- Same-field edits resolve deterministically.
- Reset defeats a stale cached preference document.

### Milestone 7 — Multi-device verification, observability, and rollout

Objective: prove the distributed-system invariants under realistic failure modes
and roll out without exposing production data to unsafe clients.

Required automated and real-client scenarios:

- Inject response loss after a committed mutation, then retry with the original
  operation ID.
- Run Device A delete / Device B offline edit / reconnect for Garden, Bed, Plant,
  Activity, Harvest, and Photo.
- Repeat tombstone tests for stale create and stale update.
- Test two-device same-field and different-field revision conflicts.
- Test Garden or Bed move/delete while another device holds a stale Plant edit.
- Test app restart with pending operations and partially completed photo upload.
- Test logout A / login B, slow A response, generation rotation, and account
  deletion on the same physical device.
- Test local storage loss followed by complete authoritative hydration.
- Exercise a supported old client against the migrated backend before and after
  the enforcement cutoff.

Observability work:

- Count applied, already-applied, operation-conflict, revision-conflict,
  discarded-deleted, discarded-stale, invalid-parent, wrong-generation,
  retryable, and quarantined outcomes by app version and entity type.
- Never send operation payloads, notes, local photo paths, or other user-authored
  content to logs or analytics.
- Define explicit rollout pause thresholds for conflict, wrong-generation, retry,
  and quarantine rates.

Rollout order:

```text
deploy additive schema and operation processor
  -> run migration dry-run
  -> backfill production logical IDs and revisions
  -> verify supported old-client behavior
  -> release mobile outbox/reconciliation v2
  -> monitor operation outcomes
  -> enable legacy enforcement cutoff
  -> run final independent audit
  -> open the Phase 2 release gate
```

Final acceptance gate:

- All original Definition of Done items pass.
- The complete TypeScript, unit, integration, build, and diff checks pass.
- Two real client processes pass the response-loss, deletion, account-switch, and
  missed-realtime scenarios.
- Migration and rollback procedures have been rehearsed without production data
  loss.
- Backend metrics remain below the configured rollout pause thresholds.
- An independent audit returns PASS before Phase 2 depends on this sync layer.

## Execution Status

Current implementation corresponds to an initial portion of Milestones 1, 3, 4,
and 6:

- additive logical identity and revision fields exist;
- receipt, tombstone, preference receipt, and sync account state tables exist;
- Activity and Harvest stale recreation protection has started;
- a bounded bootstrap snapshot and server-owned generation foundation exist;
- mobile outbox storage is account-scoped and serialized;
- online enqueue requests automatic background sync;
- the manual Plant Detail Retry Sync control is removed;
- the server preference patch mutation supports revision, generation, and
  idempotent receipts.

The following remain release-blocking:

- exhaustive hardening and per-entity coverage for the six-entity operation processor;
- production backfill, legacy minimum-version enforcement, and rollout rehearsal;
- wiring the paginated authoritative projection and pending overlays into the real UI;
- using dependency-aware offline CRUD in the production Garden/Bed/Plant screens;
- Photo orphan cleanup plus preference reset/conflict recovery UX;
- multi-device, response-loss, account-switch, migration, and rollout verification.

Latest implementation cross-check:

- `docs/tasks/2026-07-15-phase-1-5-implementation-cross-check.md`
- Verdict: PARTIAL; the Phase 2 release gate remains closed.

## 2026-07-15 Implementation Continuation and Cross-Check

This continuation closes the concrete source defects recorded by the independent
audit, but it does not waive the operational release gates in Milestone 7.

Implemented and verified in current source:

- Legacy Activity and Harvest sync now treats a deleted or tombstoned Plant as a
  terminal parent deletion; the mobile client removes these operations instead
  of retrying forever.
- Plant Garden/Bed updates validate final state. A Garden-only move clears an
  incompatible Bed; an explicitly mismatched Garden+Bed pair is rejected.
- Manual Activity types are allowlisted in v2 and compatibility mutations, so
  clients cannot manufacture protected lifecycle events.
- The paginated authoritative projection is now consumed by production Garden,
  Bed, and Plant hooks. Valid durable outbox operations are rendered as pending
  overlays, including before first online hydration.
- Garden, Bed, and Plant production CRUD now enqueues stable logical-ID v2
  operations. Direct legacy mutation calls for these entities were removed from
  production mobile screens.
- Activity, Harvest, and Photo queue flushes now commit through the v2 operation
  processor. This allows children to reference a Plant created offline by its
  logical ID.
- Acknowledged entity operations remain in the outbox until a post-commit
  authoritative snapshot is durably stored, covering mutation-response loss and
  preventing optimistic rollback after acknowledgement.
- Compatibility Garden, Bed, Plant, Activity, Harvest, Photo, and legacy batch
  writes invalidate `syncSignal`, so other clients request authoritative
  reconciliation.
- v2 Plant parity now preserves Bed dimensions, Plant position and expected
  harvest fields, and emits protected lifecycle/location activities.
- Regression coverage now includes deleted-parent legacy children, final
  Garden/Bed invariants, lifecycle Activity reservation, compatibility realtime
  invalidation, account-scoped outboxes, pending overlays, and first-hydration
  offline creation.

Verification executed after the implementation:

- Convex TypeScript: PASS — `npx tsc -p packages/convex/tsconfig.json --noEmit`
- Mobile TypeScript: PASS — `npx tsc -p apps/mobile/tsconfig.json --noEmit`
- Full Vitest suite: PASS — 6 files, 42 tests
- The API/Supertest tests required an unsandboxed localhost run; all assertions
  passed when run with that permission.

Remaining release gates (not source claims):

- Run the migration dry-run and paginated backfill against the target backend,
  record zero unresolved duplicates/ownership mismatches, and rehearse rollback.
- Define and enable the minimum-safe-client/legacy enforcement cutoff after the
  supported old-client window is proven.
- Add Photo orphan-upload cleanup and prove partially uploaded Photo recovery on
  a real restarted client.
- Execute the required two-real-client matrix: response loss, same/different
  field conflicts, delete versus offline edit for all six entities, missed
  realtime, local-storage loss, account switch, slow old-account response,
  generation rotation, and account deletion.
- Configure outcome metrics and rollout pause thresholds, deploy backend-first,
  then obtain the required independent PASS audit.

Current verdict: **SOURCE IMPLEMENTATION ADVANCED; RELEASE GATE STILL CLOSED**.
Phase 2 must not depend on this layer until the operational and independent-audit
gates above are completed.

## 2026-07-16 Guest-local identity completion task

Signed-out local-only CRUD, canonical guest/account identities, and resumable
guest-to-account claim behavior are tracked separately in:

- `docs/tasks/2026-07-16-phase-1-5-guest-local-identity-sync-task.md`

This is Phase 1.5 sync correctness work, not a production rollout/version gate.

### Final source-hardening status — 2026-07-15

All repository-side blockers identified in the prior cross-check were completed:
full migration auditing, internal-only backfill, runtime legacy cutoff,
payload-free metrics and pause thresholds, orphan Photo cleanup, authoritative
Photo hydration/deletion, complete v2 production mutation routing, free-tier
parity, quarantine visibility, and account-deletion cleanup.

Verification baseline:

- both Convex and mobile TypeScript checks pass;
- API and dashboard production builds pass;
- iOS Expo production export passes;
- all 52 tests in the full repository suite pass.

Current verdict: **SOURCE RELEASE CANDIDATE PASS; OPERATIONAL GATE PENDING**.
The remaining required evidence is explicitly procedural: target-backend
migration/rollback rehearsal, the two-real-client failure matrix, rollout metric
observation, legacy cutoff validation, and an independent PASS audit. Execute
`docs/tasks/2026-07-15-phase-1-5-staging-release-runbook.md` before opening Phase 2.

## Consolidated Release-Candidate Status — 2026-07-29

Repository status: **PASS**.

The source baseline now also includes:

- a single mobile runtime owner for installation, auth classification, network,
  active scope, and scope token;
- one active sync-scope projection store with stale-scope publication guards;
- guest/account-scoped optimistic preference ownership for mode, theme, units,
  and weather visibility;
- durable serialized Activity, Harvest, and Photo commands with managed Photo
  staging and resumable upload state;
- recovery tests for corrupt/legacy local payloads and guest-claim remapping;
- Maestro specifications for preference restart and offline content
  restart/reconnect.

Local verification on 2026-07-29:

- mobile TypeScript: PASS;
- mobile suite: PASS (45/45);
- Convex lifecycle/sync suite: PASS (27/27);
- API suite: PASS (16/16) with localhost listener access;
- dashboard production build: PASS;
- iOS production export: PASS;
- RichFarm iOS simulator build/install/launch: PASS on iPhone 17 / iOS 26.2;
- base iOS Maestro smoke: PASS;
- scoped preference/runtime restart flow: PASS after updating the flow for the
  paginated Profile layout;
- Android native flow: PENDING because this environment has no `adb` executable
  or attached Android target.

The Phase 2 gate remains **CLOSED** until the release runbook records:

1. target-backend migration dry-run, backfill, and rollback rehearsal;
2. iOS and Android offline/restart/reconnect device evidence;
3. the required two-real-client conflict and account-transition matrix;
4. rollout metrics and pause-threshold observation;
5. legacy minimum-client enforcement validation;
6. an independent audit verdict of PASS.

These are evidence gates, not permission to weaken or delete the corresponding
acceptance criteria.
