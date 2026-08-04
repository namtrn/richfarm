# User Plant Care, Activity Log, and Library Improvement Plan

Date: 2026-07-14

## Objective

RichFarm has two immediate priorities:

1. Adding a plant must create a useful, trackable user plant with care planning, reminders, activity history, photos, health records, and harvest records.
2. The shared Plant Library must provide trustworthy content and structured care defaults that can support the user-plant experience.

These priorities form one connected product loop:

```text
Library plant
    -> Add Plant
    -> User plant
    -> Care plan
    -> Reminders and user actions
    -> Activity timeline
    -> Harvest and history
```

The Library is shared reference data. A user plant is a personal instance that the user owns, changes, cares for, and tracks over time.

## Core Product Model

### Library plant

A Library plant is shared master data:

- scientific identity and taxonomy
- localized names and editorial content
- structured care defaults
- cultivar-specific overrides when there is a real difference
- source, review status, and content version

User actions must never mutate Library data.

### User plant

`Add Plant` always creates one `userPlant`.

```text
userPlant
├── care plan
├── reminders
├── activities and logs
├── photos
├── health history
└── harvest records
```

Planning and Growing are statuses of the same user plant. The app must not create a second user plant when a plant moves from Planning to Growing.

Example lifecycle:

```text
Add Tomato to Planning
    -> userPlant(status = planning)

Start Growing
    -> update the same userPlant
    -> set plantedAt if missing
    -> activate its care plan
    -> create the first reminders
    -> append a status_changed event
```

Suggested statuses:

- `planning`: saved but not planted yet
- `growing`: actively planted and cared for
- `dormant`: temporarily inactive due to season, if needed
- `harvested`: harvest lifecycle completed
- `archived`: no longer active

## Gardener and Farmer Modes

Gardener mode is a simpler organization flow, not a different data model.

### Gardener

- Does not require a garden or bed.
- Creates normal user plants.
- Uses `gardenId = null` and `bedId = null` unless the user later chooses otherwise.
- The UI may group these plants under a virtual `Unsorted` or `My Plants` section.
- Do not create a real bed named `Unsorted`.
- Care plans, reminders, logs, photos, health tracking, and harvest tracking work normally.

### Farmer

- Uses the same user-plant model.
- May assign a plant to a garden and bed.
- A plant may remain unassigned temporarily.
- The UI may show an `Unassigned` group inside a garden or farm view.

`bedId` should remain optional at the data-model level. The product can encourage bed assignment without making an otherwise valid user plant impossible to create.

## Add Plant Experience

After selecting a Library plant, show a setup sheet before saving.

### Gardener setup

```text
Add Tomato

Nickname             optional
Status                Growing now / Planning
Planting date         today or custom

Suggested care plan
  [on] Water check       every N days
  [on] Fertilizer check  every N days
  [on] Harvest check     around a target date
  [off] Pest inspection  every N days

[Add to My Plants]
```

Do not ask for a garden or bed.

### Farmer setup

Use the same setup, with optional organization fields:

```text
Garden                selected garden or Unassigned
Bed                   selected bed or Unassigned
```

### Planning behavior

Adding to Planning still creates a user plant.

- Save intended planting date if provided.
- Save a draft care plan.
- Do not activate watering or fertilizer reminders before the plant is growing.
- A harvest window may be shown as an estimate, but should be recalculated from the actual planting date when Growing starts.

### Growing behavior

Adding as Growing:

- creates the user plant
- sets `plantedAt`
- calculates `expectedHarvestDate` when reliable Library data exists
- snapshots the selected care plan
- creates the enabled reminders
- records `plant_added`
- records the initial Growing state

The user can enable, disable, or edit each suggested care item before saving.

## Care Plan Model

Library care data provides suggested defaults. The user plant owns the actual plan.

Example Library defaults:

```ts
plantCare: {
  wateringFrequencyDays: 3,
  fertilizingFrequencyDays: 14,
  typicalDaysToHarvest: 80,
}
```

Example user-specific snapshot:

```ts
userPlantCarePlan: {
  userPlantId,
  watering: {
    enabled: true,
    intervalDays: 3,
  },
  fertilizing: {
    enabled: true,
    intervalDays: 14,
  },
  harvest: {
    enabled: true,
    expectedDate,
  },
  pestCheck: {
    enabled: false,
    intervalDays: 7,
  },
  sourcePlantContentVersion: 4,
}
```

Rules:

- Library values are suggestions, not commands.
- Snapshot defaults when the user adds or starts growing a plant.
- Later Library edits must not silently change an existing user's schedule.
- The app may offer an explicit `Update from Library` action.
- Do not invent generic intervals when the Library does not have trustworthy data.
- Watering reminders must be framed as condition checks, not blind instructions to water.
- Harvest dates are estimates and should be presented as harvest-readiness checks.

A separate `userPlantCarePlans` table is preferable when the plan grows in complexity or needs versioning. A small MVP snapshot may live on `userPlants`, but it should not become an unstructured dumping ground.

## Reminder, Action, and Log Semantics

These concepts are different:

- Care plan: intended schedule and policy.
- Reminder: the next prompt for the user to inspect or act.
- Activity/log: what actually happened.
- Harvest record: the measured result of a harvest.

Completing a watering reminder must not automatically mean the plant was watered.

When a watering reminder is due, offer:

```text
What did you do?

[Watered] [Checked — not needed] [Snooze] [Skip]
```

For fertilizer:

```text
[Fertilized] [Checked — not needed] [Snooze] [Skip]
```

Examples:

### Watered

```ts
{
  type: "watering",
  source: "reminder",
  occurredAt: now,
  reminderId,
  value: {
    action: "watered",
    amountLiters: 0.5,
  },
}
```

### Checked but watering was not needed

```ts
{
  type: "watering_check",
  source: "reminder",
  occurredAt: now,
  reminderId,
  value: {
    action: "not_needed",
    reason: "soil_still_moist",
  },
}
```

### Skipped reminder

```ts
{
  type: "reminder_skipped",
  source: "reminder",
  occurredAt: now,
  reminderId,
  value: {
    reminderType: "watering",
  },
}
```

## Activity Timeline

`userPlant` stores the current snapshot. `plantActivities` stores the history.

The history must not be inferred from `updatedAt`.

### Automatically recorded events

#### Add Plant

```ts
{
  type: "plant_added",
  occurredAt: now,
  source: "system",
  value: {
    initialStatus: "planning",
    plantMasterId,
  },
}
```

#### Planning to Growing

```ts
{
  type: "status_changed",
  occurredAt: now,
  source: "system",
  value: {
    fromStatus: "planning",
    toStatus: "growing",
  },
}
```

This transition also:

- sets `plantedAt` if missing
- activates the care plan
- creates the first reminders
- does not create a new user plant

#### Location changes

Record assignment or movement between garden, bed, and unassigned states.

#### Harvest and archive

Record harvest and archive transitions while preserving the complete timeline.

### Manual activity entry

Plant Detail should provide `Add activity` with:

- Watered
- Fertilized
- Pruned
- Pest spotted
- Treatment applied
- Photo
- Note
- Transplanted
- Harvested
- Custom activity

Suggested form:

```text
Activity type     Watered
Date/time         Now
Amount            optional
Photo             optional
Note              optional

[Save activity]
```

Users must be able to backdate an activity.

### Activity source

Every activity should record its source:

```ts
source:
  | "system"
  | "manual"
  | "reminder"
  | "scanner"
  | "import"
```

### Suggested activity schema

```ts
plantActivities: {
  userId: Id<"users">;
  userPlantId: Id<"userPlants">;

  type:
    | "plant_added"
    | "status_changed"
    | "location_changed"
    | "watering_check"
    | "watering"
    | "fertilizing_check"
    | "fertilizing"
    | "pruning"
    | "pest_spotted"
    | "treatment"
    | "harvest"
    | "photo"
    | "note"
    | "custom";

  occurredAt: number;
  recordedAt: number;
  source: "system" | "manual" | "reminder" | "scanner" | "import";
  reminderId?: Id<"reminders">;
  title?: string;
  note?: string;
  value?: {
    fromStatus?: string;
    toStatus?: string;
    action?: string;
    amount?: number;
    unit?: string;
    gardenId?: Id<"gardens">;
    bedId?: Id<"beds">;
    fertilizerType?: string;
    treatmentName?: string;
  };
}
```

`occurredAt` is when the real activity happened. `recordedAt` is when the app or user saved it.

The timeline should be append-oriented:

- append new events when actions happen
- allow correction of user-entered time or notes
- never silently rewrite history when current state changes
- preserve history after harvest or archive

### Snapshot updates from activities

For fast queries, `userPlant` may keep derived snapshots:

```ts
status
plantedAt
lastWateredAt
lastFertilizedAt
expectedHarvestDate
lastHarvestedAt
```

The activity and snapshot update should happen in the same mutation.

Examples:

```text
watering activity
    -> append activity
    -> update userPlant.lastWateredAt

fertilizing activity
    -> append activity
    -> update userPlant.lastFertilizedAt

status_changed to growing
    -> append activity
    -> update status and plantedAt

harvest activity
    -> append activity or harvest record
    -> update lastHarvestedAt/status when appropriate
```

## Mutation and Consistency Requirements

Adding a Growing plant should be one atomic backend operation:

1. Validate the authenticated user.
2. Validate optional garden and bed ownership.
3. Load the selected Library care profile.
4. Validate or calculate care defaults.
5. Create the user plant.
6. Snapshot the user care plan.
7. Create enabled reminders.
8. Append `plant_added` and initial status activities.
9. Return the user plant ID and care-plan summary.

If any required step fails, the operation should roll back rather than leave a plant without its expected care setup.

Mutations must be idempotent where retries could otherwise create duplicate plants, reminders, or activities.

## Example Timeline

```text
20 Sep
Harvested 2.4 kg
Added a note and 2 photos

18 Sep
Checked fertilizer — not needed

15 Sep
Watered · 1.2 L
From watering reminder

12 Sep
Moved to Garden A · Bed 2

18 Jul
Started growing
Care reminders activated

14 Jul
Added Tomato to My Plants
Initially saved to Planning
```

## Library Improvement

The Library should prioritize quality over reaching 5,000 records quickly. First make approximately 200–300 commonly used base species complete enough to support care-plan generation.

### Data layers

#### Plant identity

- scientific name
- common names
- family
- group
- cultivar
- purposes

#### Structured care profile

- light requirements
- soil requirements
- spacing
- germination range
- harvest range
- water-check interval
- fertilizer-check interval
- temperature or climate guidance
- indoor/outdoor suitability
- toxicity and pet safety

#### Localized editorial content

- overview
- planting guidance
- watering guidance
- fertilizing guidance
- harvest signs
- common problems
- safety notes
- source and review metadata

Do not force all content into one generic `description` field.

### Base species and cultivar inheritance

Base species holds shared guidance. A cultivar only overrides facts that genuinely differ.

```text
Solanum lycopersicum
    -> general tomato light, soil, water, pest, and harvest guidance

Roma
    -> cultivar-specific growth habit, use, and harvest range where verified
```

If a cultivar has no verified distinct content, inherit from the base species. Do not generate filler text merely to make every record appear complete.

### Content status

Suggested metadata:

```ts
contentStatus: "placeholder" | "generated" | "reviewed";
contentVersion: number;
sourceRefs?: string[];
reviewedAt?: number;
```

Production display priority:

1. reviewed content
2. generated content only when acceptable and clearly tracked internally
3. never display placeholder content

### Quality gates

The import and content pipeline should report or reject:

- duplicate scientific name and cultivar identity
- cultivar without a base species
- missing English or Vietnamese base name
- known placeholder phrases
- exact or near-duplicate content clusters
- harvest, watering, or fertilizer values outside reasonable ranges
- unexplained conflicts between cultivar and base care data
- locale files that exist but contain no content
- Library plants without enough reviewed data to suggest a care plan

## Delivery Phases

### Phase 1: User plant lifecycle and activity foundation

- Confirm one user plant across Planning and Growing.
- Add `plant_added`, `status_changed`, and `location_changed` automatic events.
- Support manual activity entry.
- Keep current-state snapshots synchronized with append-only activities.
- Keep Gardener plants valid with null garden and bed IDs.

### Phase 2: Care plan and reminder activation

- Add care-plan setup to Add Plant.
- Snapshot Library defaults into a user-specific plan.
- Create watering, fertilizer, harvest, and optional pest-check reminders.
- Keep Planning reminders inactive until Growing begins.
- Add reminder-resolution actions such as Watered and Checked — not needed.
- Create activity events from confirmed reminder actions.
- Stop recurring reminders when harvested or archived.

### Phase 3.1: Library quality foundation

- Expand the structured care/content model.
- Add source, review status, and version metadata.
- Finish base/cultivar inheritance.
- Add care-range and near-duplicate audits.
- Prevent placeholder content from reaching production responses.

### Phase 4: Curated core catalog

- Complete approximately 200–300 high-value plants first.
- Prioritize vegetables, herbs, fruit trees, common flowers, indoor plants, Vietnamese plants, and plants popular in target markets.
- Require enough trustworthy care data for each completed plant to generate a useful Add Plant care plan.

### Phase 5: Catalog scale

- Import additional species and cultivars in reviewed batches.
- Prioritize by user demand and regional popularity.
- Do not count a cultivar as content-complete when it contains no meaningful difference from the base species.

## Definition of Done

The combined feature is complete when:

1. A user selects a plant from the Library.
2. Add Plant always creates one user plant.
3. Gardener can add it without a garden or bed.
4. Farmer can assign it or leave it unassigned.
5. The user can choose Planning or Growing.
6. Planning to Growing updates the same user plant.
7. The app records when the plant was added and when its status or location changed.
8. A Growing plant receives a user-reviewed care-plan snapshot.
9. Enabled watering, fertilizer, harvest, and optional inspection reminders are created without duplicates.
10. Completing a reminder requires the user to identify what actually happened.
11. Confirmed actions create timeline activities with correct source and timestamps.
12. Users can manually add and backdate notes, watering, fertilizer, pruning, pest, treatment, photo, and harvest activities.
13. Harvest and archive stop recurring reminders without deleting history.
14. Library content shown to users is reviewed or meaningfully inherited, not placeholder copy.
15. Library care defaults are sufficiently trustworthy to support the suggested care plan.

---

## Phase 1 Implementation Report

Implementation date: 2026-07-14
Status: Implemented, tested, and deployed to Convex production

### Outcome

Phase 1 now has a server-backed user-plant lifecycle and activity foundation. Planning and Growing are states of the same `userPlants` record. Lifecycle mutations append automatic events in the same Convex transaction, manual activities synchronize their relevant current-state snapshots, and plants remain valid without a garden or bed.

Convex production deployment:

```text
https://whimsical-dove-537.convex.cloud
```

### Implemented scope

- Added automatic `plant_added`, `status_changed`, and `location_changed` activities.
- Kept Planning → Growing transitions on the original user-plant ID.
- Set `plantedAt` when Growing begins and calculate an expected harvest date when reliable Library data exists.
- Kept `harvested` and `archived` as separate lifecycle states.
- Added `occurredAt` and `recordedAt` semantics to the activity model.
- Added activity source, title, offline `localId`, reminder reference, note, and structured value support.
- Added `lastWateredAt`, `lastFertilizedAt`, and `lastHarvestedAt` snapshots to `userPlants`.
- Updated activity insertion and offline batch sync so activity creation and snapshot updates are atomic.
- Added idempotency for Add Plant retries through `clientRequestId` and for offline activities through `localId`.
- Added explicit `null` inputs for assigning or unassigning gardens and beds.
- Allowed both Gardener and Farmer users to start Growing without a bed.
- Expanded manual activity choices to watering, fertilizing, pruning, pest spotted, treatment, photo, note, transplanted, harvest, and custom.
- Changed Plant Detail to merge reactive backend activities with pending offline entries while avoiding synchronized duplicates.
- Prevented deletion of system activities and kept manual activity deletion synchronized with current-state snapshots.
- Avoided inventing a generic watering interval when the Library has no trustworthy watering frequency.

### Main implementation files

```text
packages/convex/convex/schema.ts
packages/convex/convex/plants.ts
packages/convex/convex/logs.ts
packages/convex/convex/sync.ts
packages/convex/convex/lib/plantActivities.ts
packages/convex/convex/plantLifecycle.test.ts

apps/mobile/app/(tabs)/plant/[userPlantId].tsx
apps/mobile/components/plant/PlantActivitySection.tsx
apps/mobile/components/plant/PlantHealthTimelineSection.tsx
apps/mobile/components/ui/AddPlantTargetModal.tsx
apps/mobile/hooks/useAddPlantFlow.ts
apps/mobile/hooks/usePlants.ts
apps/mobile/hooks/usePlantSync.ts
apps/mobile/lib/plantLocalData.ts
apps/mobile/lib/sync/queue.ts
```

### Verification evidence

The following checks passed after the production deployment generated the final Convex bindings:

```text
npx tsc -p packages/convex/tsconfig.json --noEmit     PASS
npx tsc -p apps/mobile/tsconfig.json --noEmit        PASS
npm run api:build                                    PASS
npm run dashboard:build                              PASS
npm test --workspace @richfarm/convex                PASS (3/3)
npm test --workspace apps/api                        PASS (16/16)
git diff --check                                     PASS
```

The production function metadata confirms these Phase 1 functions are published:

```text
logs.js:addActivity
logs.js:getLogsForPlant
plants.js:addPlant
plants.js:updatePlantStatus
```

The production push also created these relevant indexes:

```text
logs.by_user_plant_local
logs.by_user_plant_occurred
userPlants.by_garden
userPlants.by_user_request
```

The first production push exposed a missing required `BETTER_AUTH_SECRET`. A production-only random secret was created in Convex environment variables, after which module analysis, TypeScript generation, schema validation, and deployment completed successfully. The secret value was not written to the repository or logs.

### Scope boundary and remaining work

This report marks only **Phase 1** as implemented. It does not claim that the combined Definition of Done for Phases 1–5 is complete.

The following remain for later phases:

- User-reviewed care-plan setup and a versioned user-specific care-plan snapshot.
- Complete watering, fertilizer, harvest, and pest-check reminder generation.
- Reminder resolution choices such as Watered, Checked — not needed, Snooze, and Skip.
- Automatic activity creation from every confirmed reminder outcome.
- Full recurring-reminder shutdown behavior for harvested and archived plants.
- Library source, review status, content version, inheritance, quality gates, and curated catalog completion.

### Independent AI verification prompt

Use the following prompt with another coding AI. The reviewer should inspect the repository directly and must not treat this report as proof.

```text
You are an independent senior TypeScript, React Native, and Convex reviewer.

Repository root:
/Users/n/Documents/GitHub/richfarm

Authoritative plan:
/Users/n/Documents/GitHub/richfarm/docs/tasks/2026-07-14-user-plant-care-log-and-library-plan.md

Task:
Audit the current implementation of "Phase 1: User plant lifecycle and activity foundation" against the plan. This is a read-only verification unless I explicitly ask you to fix something. Do not trust the implementation report at the end of the plan; prove or disprove every claim from the current source code and test output.

Verify all of the following:

1. Planning → Growing updates one existing userPlants record and never creates a second plant.
2. Add Plant, status changes, and location changes append plant_added, status_changed, and location_changed events atomically with their state changes.
3. Gardener and Farmer plants are valid with null/absent gardenId and bedId, including Growing plants.
4. Explicit unassignment of garden and bed works; missing fields are not confused with a request to clear a field.
5. Manual activities support backdating and preserve distinct occurredAt and recordedAt values.
6. Watering, fertilizing, and harvest activities update lastWateredAt, lastFertilizedAt, and lastHarvestedAt in the same mutation.
7. Add Plant and offline activity retries are idempotent and do not create duplicate plants or activities.
8. Plant Detail reads the reactive backend timeline, merges pending offline entries, and does not duplicate synchronized activity or harvest entries.
9. System activities cannot be deleted, while deleting a manual snapshot-producing activity recomputes the relevant snapshot.
10. Harvested and archived remain distinct statuses and history is preserved.
11. No generic watering interval is invented when Library watering data is absent.
12. Ownership is validated for plants, gardens, and beds.
13. Existing user data remains schema-compatible after the additive migration.

Inspect at minimum:

- packages/convex/convex/schema.ts
- packages/convex/convex/plants.ts
- packages/convex/convex/logs.ts
- packages/convex/convex/sync.ts
- packages/convex/convex/lib/plantActivities.ts
- packages/convex/convex/plantLifecycle.test.ts
- apps/mobile/app/(tabs)/plant/[userPlantId].tsx
- apps/mobile/components/plant/PlantActivitySection.tsx
- apps/mobile/components/ui/AddPlantTargetModal.tsx
- apps/mobile/hooks/useAddPlantFlow.ts
- apps/mobile/hooks/usePlants.ts
- apps/mobile/hooks/usePlantSync.ts
- apps/mobile/lib/sync/queue.ts

Run these checks:

- npx tsc -p packages/convex/tsconfig.json --noEmit
- npx tsc -p apps/mobile/tsconfig.json --noEmit
- npm test --workspace @richfarm/convex
- npm run api:build
- npm run dashboard:build
- git diff --check

Also inspect the existing test cases and state clearly where test coverage is insufficient. Do not deploy, mutate production data, change environment variables, commit, or edit files.

Return:

A. Verdict: PASS, PARTIAL, or FAIL.
B. A requirement-by-requirement evidence table with file and line references.
C. Findings ordered by severity, including concrete reproduction paths.
D. Missing or weak test coverage.
E. Any mismatch between the report and the actual implementation.
F. A concise recommendation on whether Phase 2 can safely begin.
```

### Post-audit fix and deployment note — 2026-07-14

The independent audit initially found lifecycle correctness gaps. They have now been fixed and deployed to Convex production. The implementation now enforces the garden/bed parent relationship during create and move operations, preserves harvested history, uses stable Add Plant retry keys, computes snapshots from the latest occurrence time, and treats harvest records as authoritative server data with atomic deletion and snapshot repair.

Final verification: Convex and mobile TypeScript checks passed; API and dashboard production builds passed; all 24 Vitest tests passed; `git diff --check` passed; Convex schema validation and deployment passed with the two new log indexes installed.

For an independent re-check, use the focused prompt in `docs/tasks/2026-07-14-phase-1-user-plant-lifecycle-audit.md` under “Remediation update — 2026-07-14”.

## Phase 1 Consolidated Status — 2026-07-29

Status: **COMPLETE — MAINTAINED AS THE PHASE 1 BASELINE**

The current repository preserves the Phase 1 lifecycle contract:

- Planning and Growing remain states of one user-owned plant record.
- Garden/Bed placement is optional where the product mode permits it.
- Lifecycle changes create protected automatic activity events.
- Manual Activity, Harvest, and Photo changes now enter the Phase 1.5 durable
  command pipeline instead of relying on independent local writes.
- Shared library rows remain read-only from personal add/edit flows.
- Guest and signed-in users render the same lifecycle through isolated local or
  account scopes.

Verification on the 2026-07-29 working baseline:

- mobile TypeScript: PASS;
- mobile tests: PASS (45/45);
- Convex lifecycle and sync tests: PASS (27/27);
- API tests: PASS (16/16);
- dashboard production build: PASS.

Phase 1 is not blocked by the remaining Phase 1.5 operational rollout evidence.
Phase 2 may consume the Phase 1 lifecycle only after the Phase 1.5 release gate
is independently signed off.
