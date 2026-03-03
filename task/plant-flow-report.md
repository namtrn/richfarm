# Plant Lifecycle Flow Audit (Planning/Growing/Reminders)

Date: 2026-03-01
Repo: richfarm

## Scope Scanned
- app/(tabs)/garden/index.tsx
- app/(tabs)/planning.tsx
- app/(tabs)/growing.tsx
- app/(tabs)/plant/[userPlantId].tsx
- app/(tabs)/reminder.tsx
- app/(tabs)/bed/[bedId].tsx
- app/(tabs)/library/index.tsx
- convex/schema.ts
- convex/plants.ts
- convex/reminders.ts
- hooks/usePlants.ts
- hooks/useReminders.ts
- lib/plantLocalData.ts
- lib/locales/en.json
- docs/specs/APP_FUNCTIONAL_PLAN.md

## Current Data Model (As-Is)
Status values in schema: planting, growing, harvested, failed, paused
Timeline fields in schema: plantedAt, seedStartDate, transplantDate, expectedHarvestDate, actualHarvestDate

## Current Flow (As Implemented)
Add plant (Planning/Library) -> status = "planting", plantedAt = now
Start growing (Plant detail) -> status = "growing"
Harvest (Growing list or Plant detail) -> status = "harvested"
No UI for failed/paused

## Screen Filters And Behavior
Planning list: status == "planting"
Growing list: status == "planting" OR "growing"
Bed occupancy: status == "planting" OR "growing"
Explorer search: includes all statuses (usePlants returns all)
Harvested plants disappear from Planning/Growing/Bed lists

## Reminders Sync (As-Is)
Auto watering reminder is created/enabled when status = "growing" and disabled otherwise
Manual reminders are not changed on status transitions (except soft delete)
Reminder stage label: planting -> planning, growing -> growing, other statuses -> no stage badge

## Sync Issues / Gaps
1. planning vs planting naming mismatch. UI label uses "planning" but stored status is "planting". Translation key plant.status_planting is missing; plant detail and explorer will show the raw key.
2. Planning items appear in Growing list and Bed occupancy. The Growing list allows harvest on a planting item.
3. addPlant sets plantedAt even for planning. seedStartDate/transplantDate/actualHarvestDate are never set in UI.
4. Harvested state has no archive/history view; the plant vanishes from main lists.
5. Notes are only allowed in growing in the backend, but UI allows editing for any status (failed save with no feedback).
6. Duplicate screens exist (/planning and /growing) while main flow uses /garden?tab=planning|growing. Implementations are similar but not identical (risk of drift).
7. Reminders are not stage aware beyond planting/growing. No auto harvest reminders based on expectedHarvestDate.

## Lifecycle Modeling Options (Micro-States)
1. Option A: Status-heavy (explicit micro status values). Planning micro statuses could include wishlist, seed_sourcing, seed_start, germinating, seedling, hardening, transplant_scheduled. Growing micro statuses could include transplanted, establishing, vegetative, flowering, fruiting, harvest_window. End statuses could include harvested, failed, paused, dormant.
2. Option B: Macro status + timeline events. Keep status = planning/growing/harvested. Use event fields like seedStartDate, transplantDate, plantedAt, firstHarvestDate, lastHarvestDate. Derive stage labels from the latest event and elapsed time. Generate reminders from events plus plantMaster calendar data (germinationDays, typicalDaysToHarvest, etc.).
3. Option C: Task-first (status minimal). Keep only active/archived/failed. Tasks and reminders define the current work (seed start, transplant, water, harvest). UI stage label is derived from the next due task type.
4. Option D: Cycle-based (multi-harvest). Introduce PlantCycle entity (or reuse logs as cycle boundaries). The plant stays active; each cycle has its own status and dates. Harvest ends a cycle but does not delete the plant.

## Planning -> Growing Transition Rules (Pick One)
Rule 1: Planning ends when plant is placed in the final bed/pot (transplantDate set or bedId assigned).
Rule 2: Planning ends at germination (seedStartDate + germinationDays).
Rule 3: Planning is just a wishlist; user explicitly taps Start Growing to move it.

## Harvest Handling Options
1. Archive list: keep plant with status harvested and show in a History tab; allow "Replant" to clone.
2. Keep growing for perennials: harvesting logs an event only; status stays growing; optionally use dormant for off-season.
3. Cycle reset: harvest closes a cycle and creates a new planning item for the next season.

## Reminder / Task Mapping Example
Planning tasks: seed_start, germination_check, thin_seedlings, harden_off, transplant
Growing tasks: water, fertilize, prune, pest_check, support/training, harvest_window alerts
Harvested tasks: disable recurring care tasks; keep one-time preserve/record harvest task

## Competitor Pattern Notes (External)
Planter emphasizes calendar guidance for when to start seeds, transplant, and harvest (task-first, timeline driven).
Planta focuses on individualized care schedules and reminders for watering, fertilizing, and related tasks (task-first).
Plant Diary centers on personalized care schedules, a Today view, and an activity log with notes and photos (task-first).
Beflore emphasizes logging care actions over time and surfacing patterns in routine (task-first with history).

## External Sources
- https://planter.garden/
- https://apps.apple.com/us/app/planta-complete-plant-care/id1410126781
- https://plantdiaryapp.com/
- https://beflore.com/
