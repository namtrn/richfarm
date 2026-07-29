# Phase 1.5 Staging and Release Runbook

This runbook is the remaining operational gate before Phase 2 may depend on the
authoritative sync layer. Do not run write commands against production until the
dry-run report and rollback snapshot have been reviewed.

## 1. Pre-deploy checks

Run from the repository root:

```sh
npx tsc -p packages/convex/tsconfig.json --noEmit
npx tsc -p apps/mobile/tsconfig.json --noEmit
npx vitest run
npm run api:build
npm run dashboard:build
cd apps/mobile && npx expo export --platform ios --output-dir /tmp/richfarm-phase-1-5-ios
```

Expected current baseline:

- mobile: 13 files, 45 tests;
- Convex: 2 files, 27 tests;
- API: 2 files, 16 tests;
- combined: 17 files, 88 tests.

## 2. Backend-first staging deploy

Deploy additive schema and functions to staging. Do not enable the legacy cutoff
yet. Confirm the following tables exist:

- `syncAccountState`
- `syncOperationReceipts`
- `entityTombstones`
- `userPreferenceOperationReceipts`
- `syncUploadReservations`
- `syncOutcomeMetrics`
- `syncRuntimeConfig`

## 3. Migration audit

Run `syncMigration:dryRun`, then paginate `syncMigration:auditPage` for each domain
until `isDone` is true:

```text
garden -> bed -> plant -> activity -> harvest -> photo
```

The release gate requires:

- zero `duplicate_uuid`;
- zero `*_ownership_mismatch`;
- zero missing parents;
- zero `garden_bed_mismatch`;
- every non-backfillable issue reviewed and recorded.

Store the complete report with the staging release evidence. A sampled dry-run is
not sufficient; all `auditPage` cursors must be exhausted.

## 4. Backfill and idempotency rehearsal

Take a staging backup/snapshot before mutation. Run `syncMigration:backfillPage`
in hierarchy order and persist every returned cursor. Resume from the last cursor
after an intentional interruption. Then run the complete backfill a second time.

Acceptance:

- the interrupted run resumes without changing previously assigned IDs;
- the second completed run reports `changed: 0` on every page;
- old and new client reads return the same records;
- rollback restores the pre-migration snapshot without data loss.

## 5. Two-client failure matrix

Use two separate app processes/accounts as specified. Capture operation IDs,
server revisions, resulting tombstones, screenshots, and outcome metrics.

For Garden, Bed, Plant, Activity, Harvest, and Photo:

1. Device B goes offline and edits the entity.
2. Device A deletes the entity or its relevant parent.
3. Device B reconnects.
4. Verify delete wins, no resurrection occurs, and terminal content is retained
   in quarantine rather than retried forever.

Additionally verify:

- lose the response after a committed operation, then retry the identical ID;
- same-field and different-field edits from two devices;
- Bed move/delete while another device holds a stale Plant edit;
- app restart with pending Garden → Bed → Plant → child operations;
- restart after Photo binary upload but before metadata commit;
- missed realtime interval followed by reconnect;
- clear local storage and hydrate all entities, including Photos and history;
- logout A, login B, then deliver a slow A response;
- generation rotation and account deletion on the same physical device.

No scenario passes based only on UI appearance. Verify authoritative rows,
revisions, receipts, tombstones, outboxes, and projection contents.

## 6. Metrics and pause thresholds

Review `syncRuntime:rolloutHealth` for each rollout bucket. Default pause
thresholds are:

- combined operation/revision conflict rate: 2%;
- wrong-generation rate: 1%;
- retryable rate: 5%;
- quarantine rate: 2%;
- minimum sample size: 100 operations.

Use internal `syncRuntime:configure` to set the approved minimum client version,
thresholds, and pause state. Keep `legacyEnforcementAt` unset during the old-client
observation window.

## 7. Legacy cutoff

After supported old-client tests pass, configure a future
`legacyEnforcementAt`. Before the timestamp, old endpoints remain compatible.
After it, missing or older `clientVersion` writes must return
`SYNC_CLIENT_UPGRADE_REQUIRED`; v2 operations remain available.

## 8. Final gate

Phase 2 may begin only after all of the following evidence exists:

- migration and rollback rehearsal PASS;
- complete two-client matrix PASS;
- native staging build PASS;
- metrics below pause thresholds for the observation window;
- legacy cutoff behavior PASS;
- independent audit verdict PASS.

If any item is missing or only inferred from unit tests, the Phase 2 gate remains
closed.

## Execution record — 2026-07-29

Completed:

- mobile TypeScript: PASS;
- Convex TypeScript: PASS;
- mobile tests: PASS (45/45);
- Convex tests: PASS (27/27);
- API build and tests: PASS (16/16);
- dashboard production build: PASS;
- iOS production export: PASS;
- iOS native simulator build/install/launch: PASS on iPhone 17 / iOS 26.2;
- base iOS Maestro smoke: PASS;
- scoped preference/runtime restart Maestro flow: PASS.

The scoped-state flow initially failed because it targeted controls as if
Profile were still one long page. The flow now selects the Appearance and
Garden & App pages explicitly and passes against the current UI.

Pending external/operational evidence:

- Android offline/restart/reconnect flow: no `adb` executable or Android target
  is available in the current environment;
- target staging deployment, migration audit/backfill, backup, interruption,
  idempotency, and rollback rehearsal;
- two independent real-client failure matrix;
- rollout observation with at least the configured minimum sample size;
- legacy cutoff window and old-client validation;
- independent PASS audit.

No production migration, cutoff, or rollout configuration was changed during
this run.
