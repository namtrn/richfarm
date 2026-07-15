# Phase 1 User Plant Lifecycle and Activity Foundation — Independent Audit

Date: 2026-07-14
Repository: `/Users/n/Documents/GitHub/richfarm`
Authoritative plan: `docs/tasks/2026-07-14-user-plant-care-log-and-library-plan.md`

## Verdict: FAIL

The backend foundation is mostly present and all requested type, test, build, and diff checks pass. The real app flow still has correctness failures that make the Phase 1 foundation unsafe for Phase 2:

- Harvested plants are treated as archived and automatically soft-deleted after 90 days.
- Normal Add Plant retries do not reuse a stable idempotency key.
- Backdated activities can move current snapshots backward in time.
- Harvest deletion and synchronization are not fully consistent.
- Ownership checks allow contradictory garden/bed combinations.
- Only three backend tests exist; critical mobile and offline flows are untested.

## Requirement-by-requirement evidence

| # | Requirement | Result | Evidence |
|---|---|---|---|
| 1 | Planning → Growing updates one existing `userPlants` record | PASS | `updatePlantStatus` patches the supplied plant ID and never inserts (`packages/convex/convex/plants.ts:313-409`). The test verifies one record (`packages/convex/convex/plantLifecycle.test.ts:34-67`). |
| 2 | Add Plant, status changes, and location changes append events atomically | PASS | Add inserts the plant and events in one Convex mutation (`plants.ts:202-309`). Status/location patch and event appends occur in the same mutation (`plants.ts:313-409`, `plants.ts:412-486`). |
| 3 | Gardener and Farmer plants may be Growing without garden/bed | PASS | `gardenId` and `bedId` are optional (`schema.ts:265-266`). Growing does not require a bed (`plants.ts:233-250`). Farmer UI offers Unassigned (`AddPlantTargetModal.tsx:109-153`); Gardener flow suppresses bed data (`useAddPlantFlow.ts:253-258`). |
| 4 | Explicit unassignment differs from omitted fields | PASS | Mutation validators accept `null`; handlers use `!== undefined` and convert `null` to an absent stored field (`plants.ts:318-369`, `plants.ts:418-468`). Plant Detail explicitly sends `null` when clearing (`[userPlantId].tsx:381-389`, `432-439`). |
| 5 | Manual activities support backdating with distinct `occurredAt`/`recordedAt` | PASS | UI parses and queues the chosen date (`[userPlantId].tsx:548-559`). Backend uses the chosen `occurredAt` and a server-generated `recordedAt` (`plantActivities.ts:20-33`). Watering-only coverage exists (`plantLifecycle.test.ts:111-140`). |
| 6 | Watering, fertilizing, and harvest update snapshots in the same mutation | PARTIAL | Direct/offline activity mutations atomically append and patch snapshots (`logs.ts:47-66`, `sync.ts:68-83`). Harvest sync does both (`sync.ts:113-136`). An older backdated event nevertheless overwrites a newer snapshot. |
| 7 | Add Plant and offline retries are idempotent | PARTIAL | Backend deduplicates a reused `clientRequestId` (`plants.ts:223-231`); offline activities/harvests use stable local IDs (`sync.ts:54-65`, `101-110`). Normal Library Add generates a new time-based request ID on every invocation (`useAddPlantFlow.ts:259-261`). |
| 8 | Plant Detail uses the reactive backend timeline and avoids duplicates | PARTIAL | Reactive logs query and local/server merge exist (`[userPlantId].tsx:95-101`, `191-215`). Activity and harvest IDs are filtered. `harvestRecords` are not queried, so authoritative harvest presentation still depends on local storage. No UI/integration test proves deduplication. |
| 9 | System activities cannot be deleted; manual deletion recomputes snapshots | PARTIAL | UI hides delete for non-manual entries (`PlantActivitySection.tsx:178-182`) and backend rejects deletion (`logs.ts:144`). Snapshot recomputation exists (`logs.ts:146-162`), but harvest deletion does not recompute/clear `actualHarvestDate`; the separate Harvest UI only removes local data (`[userPlantId].tsx:604-609`). |
| 10 | Harvested and archived remain distinct and history is preserved | FAIL | Both statuses are classified as archived (`plants.ts:12`, `29-31`), both receive `archivedAt` (`plants.ts:372-377`), and daily cleanup soft-deletes both after 90 days (`plants.ts:518-555`, `cron.ts:7`). UI also groups both under Archived (`GardenerMyPlantsView.tsx:24-27`). |
| 11 | No generic watering interval is invented | PASS | Missing/invalid frequency returns `undefined`, and reminder creation exits (`plants.ts:33-36`, `96-97`). |
| 12 | Plant, garden, and bed ownership is validated | PARTIAL | Ownership helpers validate each object (`lib/ownership.ts:1-23`) and plant mutations call them. The code does not reject a Garden A plus a Bed belonging to Garden B when both belong to the same user. |
| 13 | Existing data remains schema-compatible | PASS, static only | New `userPlants` and `logs` fields are optional and existing required fields remain unchanged (`schema.ts:256-310`, `399-444`). There is no legacy-row fixture or migration compatibility test. |

## Findings ordered by severity

### High — harvested plants lose lifecycle history after 90 days

Reproduction:

1. Add a Growing plant.
2. Mark it Harvested from Plant Detail.
3. `updatePlantStatus` writes `status = harvested` and `archivedAt`.
4. After 90 days, daily cleanup considers `harvested` an archived status.
5. The plant is marked `isDeleted`, so it and its timeline disappear from normal queries.

Evidence: `packages/convex/convex/plants.ts:12`, `372-377`, `518-555`; `packages/convex/convex/cron.ts:7`.

### High — normal Add Plant retry can create duplicate plants

Reproduction:

1. Tap Add Plant.
2. The server commits but the client loses the response.
3. Retry the same user action.
4. `completeLibraryAdd` calculates a new `library:<plant>:<Date.now()>` request ID.
5. Backend receives a new key and inserts another `userPlants` row.

Only scanner retries use a stable key derived from `scanHistoryId`.

Evidence: `apps/mobile/hooks/useAddPlantFlow.ts:250-289`; `packages/convex/convex/plants.ts:223-231`.

### High — backdated activities corrupt current snapshots

Reproduction:

1. Record watering today, producing `lastWateredAt = today`.
2. Add a backdated watering for last week.
3. `snapshotForActivity` returns last week's timestamp.
4. `addActivity` or `batchSync` unconditionally patches `lastWateredAt` to last week.

The same issue applies to fertilizing and harvest.

Evidence: `packages/convex/convex/lib/plantActivities.ts:36-42`; `logs.ts:47-66`; `sync.ts:68-83`.

### Medium — harvest deletion leaves inconsistent backend state

- Deleting a backend harvest log recomputes `lastHarvestedAt` but not `actualHarvestDate`.
- Deleting from the separate Harvest UI only removes the local AsyncStorage entry; it does not delete `harvestRecords` or its backend log.

Evidence: `packages/convex/convex/logs.ts:146-162`; `apps/mobile/app/(tabs)/plant/[userPlantId].tsx:604-609`.

### Medium — garden/bed relationship is not validated

Garden A and a bed belonging to Garden B pass validation if both belong to the user. `addPlant` prefers an explicitly supplied garden over the bed's garden, allowing inconsistent location state.

Evidence: `packages/convex/convex/plants.ts:240-252`; `packages/convex/convex/lib/ownership.ts:1-15`.

### Medium — Plant Detail harvest data is not fully server-backed

Plant Detail queries `logs`, not `harvestRecords`. Local harvest entries remain in AsyncStorage after synchronization, and the corresponding server log is hidden while the local record exists. After local storage loss, the Harvest section no longer has its authoritative quantity/unit record.

Evidence: `apps/mobile/app/(tabs)/plant/[userPlantId].tsx:95-101`, `191-215`; `apps/mobile/lib/sync/useSyncExecutor.ts:121-170`.

### Low — activity UI copy is misleading

The Activity section still says “local only” even though it renders the reactive backend timeline.

Evidence: `apps/mobile/components/plant/PlantActivitySection.tsx:143-145`.

## Missing or weak test coverage

The Convex suite currently contains only three tests. There are no Phase 1 mobile component, hook, queue, integration, or E2E tests.

Missing coverage:

- Add Plant retry through the real mobile-generated request ID.
- Rapid double-submit and lost-response retry.
- Farmer and Gardener Growing-without-location flows through the UI.
- Fertilizing and harvest snapshot updates.
- Backdated activity added after a newer activity.
- Deleting newest, oldest, and only snapshot-producing activity.
- `actualHarvestDate` recomputation after harvest deletion.
- Rejection of system activity deletion.
- `batchSync` retry behavior for activities and harvests.
- Timeline deduplication before and after sync.
- App restart or cleared local storage after harvest sync.
- Unauthorized plant, garden, and bed use.
- A garden and bed belonging to different gardens.
- Harvested-versus-archived UI grouping and cleanup behavior.
- Missing Library watering data.
- Compatibility fixtures containing pre-migration logs without `occurredAt` or `localId`.
- Transaction rollback when event or reminder creation fails.

## Mismatches between the implementation report and current source

- “Add Plant retries are idempotent” is only true when the caller reuses a stable key; the primary Library flow does not.
- “Current-state snapshots synchronized” is false for out-of-order/backdated activities.
- “Harvested and archived are separate lifecycle states” is only true at the status-string level; cleanup and UI combine them.
- “History is preserved” is false because harvested plants are automatically soft-deleted.
- “Manual activity deletion synchronized with snapshots” is incomplete for harvest state.
- “Plant Detail avoids synchronized duplicates” is plausible for the current happy path but untested and incomplete for authoritative harvest records.
- “Implemented, tested” overstates coverage: only three backend tests cover a small subset of the claimed behavior.
- Production deployment claims were not verified because this audit was intentionally local and read-only.

## Verification results

All checks requested by the audit prompt passed on 2026-07-14:

```text
npx tsc -p packages/convex/tsconfig.json --noEmit  PASS
npx tsc -p apps/mobile/tsconfig.json --noEmit     PASS
npm test --workspace @richfarm/convex             PASS (3/3)
npm run api:build                                 PASS
npm run dashboard:build                           PASS
git diff --check                                  PASS
```

## Phase 2 recommendation

Do not begin Phase 2 yet. First fix and regression-test:

1. Harvested-versus-archived retention semantics.
2. Stable Add Plant idempotency across the complete UI operation.
3. Snapshot calculation using the latest `occurredAt`, including backdated and deletion paths.
4. Authoritative server-backed harvest display and deletion.
5. End-to-end ownership and garden/bed consistency.

Phase 2 can safely begin after those fixes have backend integration coverage and mobile flow coverage.

## Remediation update — 2026-07-14

The findings above are retained as a point-in-time audit record. The implementation was subsequently corrected and deployed to `https://whimsical-dove-537.convex.cloud`.

Resolved items:

- Removed automatic cleanup of harvested plants. `harvested` and `archived` now have separate timestamps and retention semantics.
- Added stable client request IDs for both direct and Library Add Plant flows, retained across failed retries until completion.
- Replaced last-write-wins activity snapshots with indexed recomputation by the greatest `occurredAt`; backdated inserts and deletions no longer regress current state.
- Made harvest records authoritative in Plant Detail, linked them to activity logs, and made deletion remove the linked activity and recompute both `lastHarvestedAt` and `actualHarvestDate` atomically. Legacy deterministic harvest log IDs remain deletable.
- Added server deletion plus local queue/AsyncStorage cleanup so synchronized activities and harvests cannot reappear after deletion.
- Added a backend location invariant: when a bed is selected, the stored garden is derived from that bed. Supplying a different garden is rejected. Moving a plant with both a new garden and a bed succeeds only when `bed.gardenId === gardenId`.
- Replaced misleading “local only” text with synchronized-across-devices copy.
- Expanded lifecycle regression coverage from 3 to 8 tests, including backdating, garden/bed mismatch and valid moves, harvested retention, authoritative harvest deletion, and system-log protection.

Verification after remediation:

```text
npx tsc -p packages/convex/tsconfig.json --noEmit  PASS
npx tsc -p apps/mobile/tsconfig.json --noEmit     PASS
npx vitest run                                   PASS (24/24)
npm run api:build                                PASS
npm run dashboard:build                          PASS
git diff --check                                 PASS
npx convex deploy --yes                          PASS
```

Updated recommendation: the blocking Phase 1 defects identified by this audit are resolved. Phase 2 may begin, while mobile E2E coverage for double-submit, restart, and cleared-local-storage scenarios should still be added as defense-in-depth.

### Focused independent AI re-check prompt

```text
Act as an independent senior Convex and React Native reviewer. Inspect the current repository at /Users/n/Documents/GitHub/richfarm; do not trust this remediation note.

Prove with file/line evidence and tests that:
1. addPlant, updatePlant, and updatePlantStatus reject a garden/bed mismatch, derive gardenId from a selected bed, and permit a valid move only when bed.gardenId equals gardenId;
2. harvested plants are not treated as archived or automatically deleted;
3. retrying Add Plant reuses a stable clientRequestId;
4. backdated watering, fertilizing, and harvest entries cannot regress snapshots;
5. server-backed harvest display/deletion stays consistent with logs, lastHarvestedAt, actualHarvestDate, the offline queue, and AsyncStorage;
6. system lifecycle logs remain undeletable.

Run both TypeScript checks, npx vitest run, both production builds, and git diff --check. Return PASS/PARTIAL/FAIL, severity-ordered findings, exact reproduction steps, and remaining coverage gaps. Do not edit, deploy, commit, or mutate production data.
```
