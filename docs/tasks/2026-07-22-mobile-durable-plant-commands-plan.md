# Mobile Durable Plant Commands Plan

Date: 2026-07-22
Status: Implemented; native device verification pending
Scope: `apps/mobile` Activity, Harvest, and Photo local-first commands

## Objective

Make every user-authored Activity, Harvest, and Photo command durable before the
UI reports success, safe across concurrent writes and process death, isolated by
guest/account scope, and idempotent through sync retries.

This is implementation step 5 from the mobile state-management remediation:
move plant-local and outbox choreography out of screens and into serialized
domain commands.

## Current problem

Plant Detail currently performs two independent durable writes:

1. update `plant_local_data:<scope>:<plantId>`;
2. enqueue a second operation in `rf_sync_outbox_v2_<scope>`.

The writes are coordinated by React screen handlers. A process interruption can
leave local presentation without an outbox operation, or an outbox operation
without matching presentation. Concurrent screen and sync-executor
read-modify-write sequences can also overwrite entries.

Concrete hotspots:

- `apps/mobile/app/(tabs)/plant/[userPlantId].tsx` uses a React state updater as
  an input to `savePlantLocalData`, then separately calls `queueActivity`,
  `queueHarvest`, or `queuePhoto`.
- `apps/mobile/app/(tabs)/library/[masterPlantId].tsx` repeats the same
  load-modify-save-enqueue sequence for initial watering and growth-stage data.
- `apps/mobile/lib/sync/useSyncExecutor.ts` directly edits plant-local data when
  a child operation becomes invalid.
- `apps/mobile/lib/sync/guestClaim.ts` copies plant-local data separately from
  the outbox.
- `apps/mobile/lib/plantLocalData.ts` has no envelope version, revision,
  validation, recovery state, or write serialization.

## Architecture decision

### One durable owner

The scoped outbox becomes the only durable owner of pending Activity, Harvest,
and Photo metadata.

```text
authoritative child entities
        + pending outbox child commands
        - pending deletes / tombstones
        = rendered plant children
```

`plantLocalData` will become a compatibility migration source, not a second
source of truth. The screen will no longer persist a local array and then enqueue
the same content separately.

This avoids trying to emulate an atomic transaction across two AsyncStorage
keys. Activity and Harvest each require one serialized outbox write. Photo uses
an ordered filesystem-plus-outbox protocol described below.

### State-library boundary

Reuse the existing Zustand `SyncScopeStore`. Do not add another general global
state library and do not copy Convex query results into a new store.

The store composes pending child commands once per outbox transition and exposes
typed selectors. React components keep form drafts and modal state locally, but
they invoke commands for durable domain changes.

## Required invariants

1. A command captures `scope + scopeToken`; an obsolete scope may finish its own
   durable write but cannot publish into the active scope.
2. The UI reports success only after the durable outbox write completes.
3. Operation ID and entity UUID are created once and reused across every retry.
4. Outbox insert/upsert and cancellation are idempotent by operation ID.
5. Commands for the same `scope + plantUuid` execute serially.
6. Commands for different plants may execute concurrently.
7. Guest commands make zero authenticated network calls and remain claimable.
8. An account command schedules sync only after local durability succeeds.
9. Server acknowledgement does not remove the optimistic row until the
   authoritative projection containing that result is durably reconciled.
10. No screen, executor, or guest-claim flow directly coordinates
    `plantLocalData` and outbox writes after migration.
11. User-authored payloads and local photo paths never enter analytics or logs.

## Command model

### Activity and Harvest

Create Activity and Harvest as normal v2 entity operations:

```ts
type PlantChildCreateCommand = {
  operationId: string;
  entityType: 'activity' | 'harvest';
  entityUuid: string;
  plantUuid: string;
  operationType: 'create';
  payload: ActivityCreatePayload | HarvestCreatePayload;
  createdAt: number;
};
```

Use `entityUuid` as the stable local ID shown by the UI and later returned by the
authoritative projection. Resolve the logical parent UUID inside the command
layer rather than accepting a Convex ID blindly from a screen.

### Photo

Photo keeps a specialized durable operation because binary upload and entity
commit are separate retryable steps:

```ts
type PhotoCreateCommand = {
  operationId: string;
  entityType: 'photo';
  entityUuid: string;
  plantUuid: string;
  operationType: 'create';
  phase: 'staged' | 'uploaded';
  managedUri: string;
  storageId?: string;
  source: 'camera' | 'gallery';
  note?: string;
  takenAt: number;
  createdAt: number;
};
```

The same `operationId` and `entityUuid` must survive upload URL acquisition,
binary upload, response loss, entity commit, reconciliation, and retry.

### Delete

One command API handles both cases:

- Pending local create: atomically remove/cancel the matching create operation
  from the outbox. Remove a managed Photo file only after that outbox update is
  durable.
- Authoritative child: enqueue a v2 delete operation using `entityUuid` and
  `baseRevision`. The rendered projection hides it immediately through the
  optimistic overlay.

Deleting an authoritative child must not separately mutate a local sidecar.

## Public command API

Add a non-React command service and a thin hook adapter:

```ts
type PlantContentCommands = {
  appendActivity(input: AppendActivityInput): Promise<CommandResult>;
  appendHarvest(input: AppendHarvestInput): Promise<CommandResult>;
  stageAndAddPhoto(input: AddPhotoInput): Promise<CommandResult>;
  removeActivity(input: RemovePlantChildInput): Promise<CommandResult>;
  removeHarvest(input: RemovePlantChildInput): Promise<CommandResult>;
  removePhoto(input: RemovePlantChildInput): Promise<CommandResult>;
};

type CommandResult = {
  operationId: string;
  entityUuid: string;
  status: 'local_only' | 'queued';
};
```

Recommended files:

```text
apps/mobile/lib/commands/plantContentCommands.ts
apps/mobile/lib/commands/plantCommandSerialization.ts
apps/mobile/lib/photo/managedPlantPhotos.ts
apps/mobile/hooks/usePlantContentCommands.ts
```

The command service receives runtime/store adapters through explicit arguments
so pure tests can use in-memory storage, a fake clock, deterministic IDs, and a
fake sync scheduler.

## Write protocols

### Activity/Harvest create

1. Capture the active identity, scope, scope token, and plant logical UUID.
2. Validate and normalize input before generating a command.
3. Generate stable operation/entity IDs.
4. Enter the serializer keyed by `scope + plantUuid`.
5. Recheck scope ownership for publication.
6. Upsert the operation into the scoped outbox in one serialized write.
7. Let `SyncScopeStore` compose and publish the new rendered child row.
8. For an account scope, request a sync flush without awaiting network success.
9. Return `queued`; for guest scope return `local_only`.

### Photo create

1. Capture identity/scope and allocate stable IDs.
2. Copy the selected image into app-managed storage under a sanitized,
   scope-owned path such as:

   ```text
   <documentDirectory>/richfarm/plant-photos/<scopeHash>/<plantUuid>/<photoUuid>
   ```

3. Verify that the staged file can be read.
4. Persist the Photo operation referencing only the managed URI.
5. Publish through `SyncScopeStore`, then schedule account sync.
6. If the outbox write fails, remove the staged file best-effort and return an
   error without publishing success.
7. If the process dies after staging but before the outbox write, startup orphan
   cleanup removes the unreferenced file. No acknowledged user command is lost.

`expo-file-system` is already available transitively. Before importing it from
app code, declare it as a direct mobile dependency so package ownership is
explicit.

### Delete/cancel

1. Resolve whether the row is pending or authoritative from the rendered
   projection and outbox.
2. Apply the appropriate outbox cancellation or v2 delete in one serialized
   update.
3. Publish the recomposed projection.
4. Clean a managed Photo file only after no active/quarantined operation and no
   authoritative row references it.

## Store and projection changes

Extend `composeRenderedProjection` to support pending child presentation:

- Activity payload maps to the typed rendered Activity shape.
- Harvest payload maps to the typed rendered Harvest shape.
- Photo staged/uploaded payload maps to a rendered Photo with `managedUri` and
  `_pending: true`.
- Pending delete removes the row from the rendered collection.
- A tombstone or invalid parent defeats the pending child.

Add typed selectors:

```ts
usePlantActivitiesState(plantUuid)
usePlantHarvestsState(plantUuid)
usePlantPhotosState(plantUuid)
usePlantContentStatusState(plantUuid)
```

Selectors must use stable empty constants and equality functions where needed so
an unrelated plant command does not rerender every mounted Plant Detail screen.
This follows the React Native measure → optimize → re-measure workflow; do not
add manual memoization without profiling evidence.

## Sync executor changes

1. Activity/Harvest execution consumes the unified entity operations rather
   than legacy screen-generated child actions.
2. Photo upload persists `storageId` back into the same operation before entity
   commit.
3. Response loss retries with the same IDs and relies on server receipts for
   `already_applied`.
4. Successful operations remain in the outbox until reconciliation durably
   contains the authoritative child.
5. Terminal invalid-parent/deleted outcomes move to quarantine and projection
   composition removes their optimistic rows.
6. Remove direct `loadPlantLocalData`/`savePlantLocalData` cleanup from the
   executor.
7. Sync scheduling remains single-flight per scope; command completion never
   waits for the network.

## Guest claim and scope transitions

Outbox ownership makes child metadata naturally claimable, but Photo files need
explicit handling:

1. Serialize command destination selection with the guest-claim coordinator.
2. Freeze the source fingerprint only after earlier source commands finish.
3. Commands arriving after claim import starts are routed deterministically to
   the target scope or held until the active scope changes; they must not split
   metadata and files between namespaces.
4. Copy/remap managed Photo files before deleting the guest namespace.
5. Persist the remapped target outbox before source file cleanup.
6. A late old-scope callback may finish old-scope recovery but cannot publish
   into the account store because the scope token no longer matches.

## Legacy migration

Migration must be idempotent and safe across at least one mobile release window.

For each Plant Detail hydration and guest-claim dataset import:

1. Read legacy `plant_local_data:<scope>:<plantId>`.
2. Compare each entry by `localId/entityUuid` against authoritative projection,
   active outbox, and quarantine.
3. Convert only unmatched entries into stable operations. Derive deterministic
   migration operation IDs so rerunning migration cannot duplicate content.
4. Copy legacy Photo URIs into managed storage before creating their operations.
5. Persist all converted operations in one scoped outbox update.
6. Write a per-plant migration marker only after the outbox update succeeds.
7. Keep the original legacy payload read-only during the compatibility window.
8. Remove legacy storage and compatibility code only after release telemetry and
   migration tests show no remaining unmigrated data.

Malformed legacy content is copied to a recovery key and marks hydration as
`needs_attention`; it is never silently replaced with empty arrays.

## Implementation milestones

### Milestone 0 — Characterization and fault injection

- Add deterministic AsyncStorage failure injection for outbox writes.
- Record current persistence behavior for concurrent Activity/Harvest/Photo
  commands and process interruption.
- Add typed fixtures for guest, Account A, and Account B.

Exit gate: tests reproduce the current dual-write failure and do not rely on
React updater timing.

### Milestone 1 — Typed child operations and projection overlays

- Define rendered Activity, Harvest, and Photo domain types.
- Add child operation payload validation.
- Compose pending child creates/deletes in `SyncScopeStore`.
- Add plant-child selector hooks.

Exit gate: a seeded outbox alone renders pending child rows without
`plantLocalData`.

### Milestone 2 — Activity and Harvest commands

- Implement per-plant serialization and the command service.
- Migrate Plant Detail create/delete handlers.
- Migrate Library initial watering and growth-stage writes.
- Remove Activity/Harvest local sidecar writes from screens and executor.

Exit gate: concurrent commands cannot lose entries, offline restart preserves
them, and sync ACK/reconciliation produces no duplicate or rollback.

### Milestone 3 — Durable Photo staging

- Add managed Photo storage and specialized Photo operation state.
- Migrate camera/gallery add and pending/server delete paths.
- Persist upload progress on the existing operation.
- Add safe orphan and post-reconciliation cleanup.

Exit gate: restart between stage/upload/commit steps is recoverable and response
loss cannot create duplicate Photo rows.

### Milestone 4 — Guest claim and legacy migration

- Make command routing and claim serialization share one boundary.
- Migrate existing local sidecars idempotently.
- Copy/remap guest Photo files before source cleanup.
- Add recovery keys and `needs_attention` state for malformed payloads.

Exit gate: guest data and files survive claim exactly once, and Account A data
never appears under Account B.

### Milestone 5 — Remove obsolete ownership and profile

- Remove `persistLocalData` and direct screen imports of local persistence.
- Remove executor-side local-array cleanup.
- Retain only the time-bounded migration reader.
- Profile Plant Detail render counts and AsyncStorage calls before/after.

Exit gate: one command causes one scoped outbox transition and only relevant
selectors rerender.

## Test matrix

### Pure command/store tests

- Two simultaneous Activity appends to the same plant preserve both entries.
- Activity and Harvest appends to different plants can proceed independently.
- Failed outbox write does not publish optimistic success.
- Retrying a command ID performs an upsert, not a duplicate append.
- Pending create deletion cancels exactly one matching operation.
- Authoritative delete creates an optimistic tombstone overlay.
- Slow Account A completion cannot publish after Account B activation.
- Guest commands never call the network scheduler.
- ACK before authoritative revision does not roll the UI backward.

### Photo fault tests

- File copy failure creates no outbox operation.
- Outbox failure after copy removes or later collects the orphan.
- Restart after durable Photo operation resumes upload from the managed URI.
- Upload response loss reuses the same storage/entity operation identity.
- Deleting a pending Photo prevents a later upload.
- Source cleanup never deletes a file referenced by target claim state.

### Migration/recovery tests

- Legacy Activity/Harvest/Photo migration is idempotent.
- Authoritative or queued `localId` prevents duplicate migration.
- Process death after outbox migration but before marker write remains safe.
- Malformed legacy payload is preserved under a recovery key.
- Guest claim interruption resumes without missing or duplicated files/content.

### Native/Maestro flows

- Offline: add Activity and Harvest, restart app, entries remain visible.
- Offline: add Photo, restart app, image remains readable.
- Reconnect: pending entries become authoritative with no duplicate flash.
- Delete pending child, restart, it stays deleted and does not sync later.
- Switch guest → Account A → Account B and verify strict content isolation.

Run native flows on both iOS and Android before removing the compatibility
reader. Unit tests alone do not prove filesystem lifecycle or process-restart
behavior.

## Verification commands

Every milestone must pass:

```bash
npm --prefix apps/mobile run typecheck
npx vitest run apps/mobile
git diff --check
```

Before the final completion gate:

```bash
npx vitest run
maestro test apps/mobile/.maestro/<durable-plant-content-flow>.yaml
```

The full test suite may require permission to bind local ephemeral ports for API
tests.

## Performance checks

Measure before and after migration:

- AsyncStorage reads/writes per Activity, Harvest, and Photo command;
- Plant Detail render count for a command on the current plant;
- render count when an unrelated plant receives a command;
- time from tap to optimistic publication;
- large Plant Detail hydration time with 100+ timeline rows.

Targets:

- one outbox write per Activity/Harvest create or cancel;
- no full projection recomposition per consumer;
- no rerender of unrelated plant-child selectors;
- optimistic publication immediately after local durability, without awaiting
  network execution.

## Non-goals

- Replacing Convex as server-state owner.
- Moving all form/modal state into Zustand.
- Rewriting Garden/Bed/Plant entity commands already using v2 operations.
- Building a generic database transaction framework over AsyncStorage.
- Solving Photo orphan cleanup on the server beyond the existing Phase 1.5
  operation/storage contract.
- Extracting every large Plant Detail workflow in this delivery; that remains
  state-management remediation step 7.

## Completion gate

This plan is complete only when:

- screens call commands and perform no plant-local/outbox choreography;
- pending Activity, Harvest, and Photo metadata has exactly one durable owner;
- concurrent same-plant commands cannot lose data;
- process interruption at every Photo boundary is recoverable;
- guest claim preserves commands and managed files exactly once;
- invalid/corrupt durable content enters recovery instead of becoming empty;
- account and scope transitions cannot publish old-scope content;
- offline/restart/reconnect native tests pass on iOS and Android;
- profiling confirms that unrelated selector consumers do not rerender.

## Implementation report — 2026-07-23

Implemented the durable command owner for Activity, Harvest, and Photo, including
per-plant serialization, idempotent outbox upserts, optimistic child projection,
scope-token publication guards, private managed Photo staging, resumable upload
phase persistence, orphan cleanup, guest-claim Photo remapping, and idempotent
legacy sidecar migration with malformed-payload recovery.

Managed Photos are stored only under Expo `Paths.document`. RichFarm does not
register retry copies with Android MediaStore or Expo MediaLibrary, so they do
not appear as duplicate images in Gallery/Google Photos.

Automated verification completed:

- mobile typecheck passes;
- all 45 mobile tests pass;
- the full repository suite passes: 88/88 tests;
- `git diff --check` passes.

Remaining completion-gate work requires device infrastructure rather than more
domain implementation: run the offline/restart/reconnect Maestro flow on both
iOS and Android and record render/AsyncStorage profiling measurements.

## Recommended implementation order

Implement Activity and Harvest first, then Photo. Activity/Harvest prove the
single-owner command and projection model without filesystem complexity. Photo
then adds staging and cleanup on top of the same IDs, serialization, scope, and
publication contracts.
