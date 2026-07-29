# Phase 2 — Care Plan and Reminder Activation

Date: 2026-07-29
Status: Implementation plan
Depends on: Phase 1 lifecycle and Phase 1.5 authoritative offline sync

## Objective

Materialize a reviewable, immutable-by-version care-plan snapshot for each
`userPlant`, deterministically activate due care checks, and persist explicit
reminder outcomes without confusing a dismissed prompt with a performed action.

The Library remains read-only. A user's active plan stores the Library plant ID,
care-content version, structured values used, and the resulting user overrides.
Later Library edits do not rewrite an existing plan.

## Additive domain model

### `userPlantCarePlans`

- user/account ownership, stable `entityUuid`, server `revision`, and
  `userPlantId`;
- monotonically increasing `planVersion` per plant;
- `status`: `draft`, `active`, `superseded`, or `disabled`;
- source snapshot: Library plant ID, care-content version, source label, and the
  exact trusted structured values used;
- task snapshot for `watering`, `fertilizing`, `pest_check`, and `harvest_check`;
- activation and creation timestamps.

Only positive finite Library intervals/days-to-harvest are trusted. Missing
watering/fertilizing values do not produce generic schedules. Pest inspection is
represented but defaults off because the current Library has no trustworthy
cadence. Harvest checks are derived only from a trusted Library
`typicalDaysToHarvest` and a real planting date.

### `reminders`

Existing rows remain valid. Phase 2 adds optional stable identity, revision,
care-plan/version/task references, timezone, and tombstone-compatible metadata.
Care-plan reminders use friendly condition-check content and deterministic IDs:

```text
carePlanUuid : planVersion : taskType
```

Planning plans remain drafts and create no active care reminders. Moving the
same plant to Growing activates the plan and materializes enabled reminders.
Harvested/archived plants disable their care reminders.

### `reminderOutcomes`

Each outcome has stable identity/revision, reminder and plant references,
`operationId`, semantic outcome, occurrence/record time, and optional
`snoozedUntil`/note. Supported outcomes are:

- `performed`;
- `checked_not_needed`;
- `snoozed`;
- `skipped`;
- `edited`;
- `disabled`;
- `deleted`.

Only `performed` creates watering/fertilizing Activities. Condition checks create
the corresponding check Activity. Skip creates a `reminder_skipped` Activity.
Snooze/edit/disable/delete do not claim a real-world care action.

## Command and data flow

```text
Add/attach Library plant
  -> derive trusted draft snapshot locally for review
  -> enqueue plant + care-plan operations in outbox v2
  -> optimistic projection renders both
  -> Convex validates Library source and parent ownership transactionally
  -> Growing activation creates deterministic reminder rows

Reminder outcome
  -> enqueue stable outcome operation
  -> optimistic reminder projection advances immediately
  -> restart reloads the same operation ID
  -> Convex receipt check
  -> transaction writes outcome, reminder recurrence, Activity when semantic,
     and userPlant snapshots
  -> authoritative reconciliation removes optimistic overlays
```

Care plan, reminder, and outcome are first-class sync-v2 domains. They use the
same scoped outbox, session generation, receipts, revisions, tombstones,
dependency ordering, snapshot pagination, reconciliation, retry policy, and
account-switch invalidation as Phase 1.5 entities.

## Scheduling

Daily recurrences are calculated in the user's IANA timezone by advancing the
local calendar date, then resolving the requested local wall time. This avoids
drift across 23/25-hour DST days. Invalid/missing timezone values fall back to
UTC. The next occurrence is always strictly after the outcome occurrence.

One-off harvest checks have no recurrence. Snooze moves only the current
`nextRunAt`; it does not rewrite plan cadence. Checked/performed/skip advance a
recurring reminder from the later of its scheduled occurrence or outcome time.

## Notification batching

The notification cron groups due care reminders per user, local day, and then
Garden/Bed when present. Each group emits one friendly prompt summarizing the
number of checks. Individual reminders remain actionable in-app. Legacy custom
reminders retain compatibility behavior.

## Conflicts and failure modes

- Same operation ID with different content: `operation_conflict`.
- Tombstoned care plan/reminder/outcome: `discarded_deleted`.
- Missing update target: `missing_target`; never insert.
- Stale base revision: `revision_conflict`, then refresh/quarantine.
- Plant or plan deleted/archived: dependent create/outcome is terminal-invalid.
- Wrong account/generation: quarantine exactly as Phase 1.5.
- Timeout after commit: retry returns the stored receipt and creates no duplicate
  reminder, outcome, or Activity.
- Library value becomes unavailable after local derivation: server validates the
  captured source/version and rejects an untrusted invented default.
- Old reminders without Phase 2 metadata continue through compatibility CRUD;
  no destructive migration or legacy cutoff is enabled.

## Rollout and migration

1. Deploy additive tables, fields, indexes, sync validators, and snapshot domains.
2. Preserve all existing reminder rows; no backfill is required for legacy CRUD.
3. Release the client with plan review/activation and outcome commands.
4. Observe sync outcome metrics for the new domains.
5. Do not enable legacy enforcement until the Phase 1.5 runbook gates pass.

## Test matrix

- derivation accepts only trustworthy Library values and snapshots their version;
- later Library edits do not alter an existing plan version;
- user overrides produce a new version and supersede the old plan;
- planning creates no active reminders; Growing activates exactly once;
- recurrence remains at the same local time across DST boundaries;
- every explicit outcome advances/preserves schedule correctly;
- only semantically confirmed outcomes create the matching Activity/snapshot;
- retry/timeout is idempotent for plan, reminder, outcome, and Activity;
- offline projection survives restart and reconnect without duplicates;
- revision conflict and delete/tombstone defeat stale multi-device writes;
- guest/account scopes never leak;
- batching groups by local day and Garden/Bed;
- native journey: derive/review -> activate -> offline outcome -> restart ->
  reconnect -> one Activity visible.

## Verification gates

Run mobile and Convex typechecks; Convex/mobile/API tests; dashboard production
build; `git diff --check`; iOS export; and native Maestro flows available in the
environment. Record exact PASS evidence and explicitly list staging,
multi-device, Android, push-delivery, or signing gates that were not actually
executed.

## Local implementation evidence — 2026-07-29

Implemented:

- additive care-plan/outcome schema and compatibility reminder metadata;
- Library-derived version/source/value snapshots with no generic interval
  invention;
- planning drafts, Growing activation, deterministic tasks, and lifecycle stop;
- explicit outcome transactions and semantically correct Activity/snapshot
  writes;
- sync-v2 domains, receipts, revisions, tombstones, dependency ordering,
  authoritative snapshot pagination, offline overlays, restart persistence,
  guest/account isolation, and account-deletion cleanup;
- day/Garden/Bed push grouping and individually actionable in-app rows;
- reviewable Plant Detail snapshot card and six-locale outcome copy;
- pure, Convex integration, mobile projection/restart, and Maestro coverage.

Verified locally:

- Convex TypeScript PASS;
- mobile TypeScript PASS;
- Convex tests PASS (35/35);
- mobile tests PASS (46/46);
- API tests PASS (16/16) with localhost listener permission;
- API build PASS;
- dashboard production build PASS;
- iOS Expo production export PASS;
- iOS native build/install/launch PASS on iPhone 17 / iOS 26.2.

Pending external evidence:

- the Phase 2 Maestro flow has not been executed: the local debug app built and
  launched, but Metro reported missing `EXPO_PUBLIC_CONVEX_URL` and
  `EXPO_PUBLIC_CONVEX_SITE_URL`, so application UI could not initialize;
- real push delivery grouping has not been observed through Expo services;
- Android is unavailable in this environment;
- two independent physical/simulator clients have not executed the full
  delete/conflict/account-transition matrix;
- no staging or production schema deployment/migration was performed;
- no legacy cutoff or rollout setting was changed;
- no independent Phase 2 audit has issued PASS.
