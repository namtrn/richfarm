# Richfarm Goal

Date: 2026-05-11

## Executive Summary

This document defines the working goal for Richfarm after the project sat idle for a while. It is written for both humans and Codex `/goal` mode.

Richfarm should become a local-first gardening app that supports the complete user journey:

1. Discover plants in a trustworthy library.
2. Plan what to grow.
3. Add plants to a garden, bed, pot, or simple collection.
4. Track plants through planning, growing, and harvest.
5. Receive useful reminders that prompt checking rather than blind action.
6. Use AI scanner flows for plant identification and pest/disease help.
7. Preserve the user's data across offline use, restart, and sign-in.

The app should be practical and trustworthy before it is clever. The priority is not to copy every competitor feature, but to avoid the mistakes users complain about in similar apps: harmful watering schedules, noisy notifications, aggressive paywalls, lost data, and overconfident AI.

## How To Use This Document

Use the `/goal` block below when starting a long-running Codex CLI goal. Use the surrounding sections as human-readable context for product, design, and engineering decisions.

The goal assumes the current repository is `/Users/n/Documents/GitHub/richfarm`.

## Product Mission

Richfarm helps home gardeners and plant owners decide what to grow, where to grow it, what to check today, and when to harvest.

It should support:

- edible crops
- herbs
- fruits
- flowers
- indoor plants
- ornamental plants
- garden beds
- pots/containers
- simple "My Plants" collections for users who do not want full bed planning

## Core Product Loop

The core loop is:

1. `Library`: browse/search plant catalog.
2. `Planning`: save candidate plants and plan where/when to grow them.
3. `Garden / Growing`: place plants in gardens/beds/pots or a simple collection.
4. `Reminder`: check care tasks such as soil, water, fertilizer, pruning, pest inspection, and harvest.
5. `Plant Detail`: view photos, logs, reminders, harvests, and care guidance.
6. `Scanner`: identify plants or possible health issues, then connect results back to the library or a user plant.
7. `Harvest`: record what was harvested and when.

## Glossary

- `Library`: Shared catalog data. This includes taxonomy, names, care data, images, edible/ornamental purpose, days to harvest, spacing, soil/light needs, pests/diseases, and safety metadata. App user flows should not directly mutate this data.
- `User plant`: A user's personal plant record. This may reference a library plant but has personal fields like nickname, status, gardenId, bedId, photos, logs, reminders, and harvests.
- `Gardener mode`: Simpler mode for users who want My Plants and reminders without detailed farm/bed planning.
- `Farmer mode`: More structured mode with gardens, beds, planning backlog, placement, growing state, and harvest windows.
- `Planning`: A plant is saved as something the user wants to grow or is preparing to grow.
- `Growing`: A plant is actively being grown.
- `Harvested`: A plant has completed or produced a harvest record.
- `Scanner`: Camera/upload flow for plant identification or plant health analysis.
- `Diagnosis`: AI-assisted disease/pest/health suggestion. It must be correctable and should not be presented as certainty.

## Current Repository Context

Current stack:

- Mobile app: Expo React Native in `apps/mobile`
- Backend: Convex in `packages/convex`
- API workspace: Express/SQLite in `apps/api`
- Dashboard: Vite/React in `apps/dashboard`

Already present or partially present:

- plant library and taxonomy model
- i18n across six languages
- onboarding with gardener/farmer mode
- scanner tab/hook and scan history
- reminders
- harvest/log schema and UI pieces
- weather card
- profile/auth with Better Auth
- RevenueCat subscription groundwork
- Convex storage/sync groundwork

Important current caveat:

- The working tree has uncommitted changes around garden/library/add-plant flow.
- Those changes appear to add `gardenId` to `userPlants` and clarify gardener/farmer add flows.
- Do not revert them blindly. Read the diff, preserve intent, and finish the feature.

## Product Rules From Competitor Research

These rules come from `docs/task/2026-05-11-competitor-user-complaints.md`.

- Reminders should be check prompts, not blind commands.
- Watering reminders should encourage soil/plant inspection.
- Reminder volume should be managed with batching, snooze, skip, and ritual modes.
- Core plant saving, garden planning, and basic reminders should remain usable for free/guest users.
- AI scan and diagnosis must show uncertainty and allow correction.
- Unknown scanned plants should become userPlants, not shared library rows.
- Companion planting should be practical and evidence-aware, not a magical friend/foe chart.
- Offline/sync must preserve user data; failed sync actions should not be dropped.
- The design should leave room for future household/shared garden care.
- Toxicity, allergen, and pet-safety metadata should be persisted when available.

## Non-Goals For The Next Pass

Do not derail the next pass by trying to build everything.

Out of scope unless needed to support the core loop:

- full social/community feed
- full shared household collaboration UI
- complex sensor integrations
- advanced analytics dashboard
- complete native widget product
- fully automated AI care plan that claims certainty
- broad refactor unrelated to current garden/library/add-plant flow

These can be future work after the core lifecycle is reliable.

## `/goal` Block

Paste this block into Codex CLI after `/goal` is available.

```text
/goal Hoàn thiện Richfarm thành app làm vườn local-first có thể dùng end-to-end: người dùng có thể khám phá thư viện cây/hoa/cây ăn được, chọn cây để lên kế hoạch trồng, đưa cây vào garden/bed hoặc My Plants, theo dõi lifecycle planning -> growing -> harvest, nhận reminder chăm sóc, dùng AI scanner để nhận diện cây và sâu bệnh, và xem thông tin chăm sóc/thu hoạch rõ ràng theo từng cây.

Product north star:
- Richfarm không phải app ghi chú cây đơn giản. Mục tiêu là vòng đời làm vườn: Library -> Planning -> Garden/Growing -> Reminder -> Harvest.
- App phải giúp user ra quyết định hôm nay: trồng gì, ở đâu, khi nào gieo/trồng/thu hoạch, cần check gì, có dấu hiệu sâu bệnh gì, và lịch chăm sóc nào đáng tin.
- Trải nghiệm phải hữu ích cho cả cây ăn được, herbs, rau, quả, hoa, indoor/ornamental plants.

Research-informed product rules:
- Reminders must be framed as "check prompts", not blind commands. Never imply "water now" without encouraging soil/plant condition check, especially for succulents/indoor plants.
- Avoid reminder fatigue. Provide snooze, skip, batch-by-day/bed, and "weekly garden check ritual" style grouping where possible.
- Basic value must not be paywalled into uselessness. Free/guest users must be able to save plants, see their garden, use core reminders, and keep local data. Premium can gate advanced AI volume, deep diagnosis, analytics, widgets, or automation.
- Never lose user data. Offline queue, photos, plant logs, harvest logs, and reminders must survive app restart and sign-in merge. Sync failures must keep failed queue items rather than dropping them.
- AI scan must be humble and correctable: show confidence/top matches where available, allow manual correction, allow unknown plant save, and never overwrite user/library data silently.
- Disease/pest detection must avoid generic "overwatering" answers. It should show likely causes, confidence/uncertainty, what visual evidence was used, and safe next steps.
- Companion planting must not be presented as absolute truth. Prefer evidence-aware guidance: spacing, mature size, sunlight/shade, water/soil compatibility, trellis/bush habit, crop rotation, pest/pollinator/trap-crop rationale, and label anecdotal companion advice as such.
- Household/shared care is a future need. Current design should avoid making it impossible to add shared garden roles later.
- Toxicity/allergen/pet-safety metadata is valuable for library and scan results; if available, store/display it on plant profiles rather than making it a one-off scan result.

Current repo context:
- Mobile app: Expo React Native in apps/mobile.
- Backend: Convex in packages/convex, API workspace in apps/api, dashboard in apps/dashboard.
- Existing features include plant library, taxonomy/i18n, onboarding gardener/farmer, scan tab/hook, reminders, harvest/log schema, weather card, profile/auth, RevenueCat, storage/sync groundwork.
- Working tree is currently dirty around garden/library/add plant flow. Do not revert existing changes. Finish them carefully.

Implementation priorities:
1. Complete the in-progress add plant flow:
   - Library list/detail -> Add to Planning or Growing bed.
   - Gardener mode -> Add directly to My Plants/planning, no bed required.
   - Farmer mode -> Planning or bed/growing clearly.
   - Scanner match/unknown save uses the same shared add flow.
   - userPlants keeps plantMasterId, nickname, gardenId, bedId, status, expectedHarvestDate consistent.
   - App user flows must create/update userPlants only; never mutate shared plantsMaster/library data.

2. Make Library a trustworthy catalog:
   - Cover edible crops, herbs, fruits, flowers, indoor/ornamental plants.
   - Support taxonomy browse/search/filter and localized display names.
   - Show care essentials: light, soil, spacing, days to harvest, edible/ornamental purpose, toxicity/pet/allergen safety if present.
   - For companion/interplanting guidance, prefer practical constraints over myth: spacing, shade, water needs, trellis habit, crop rotation, pest/pollinator notes.

3. Make Garden/Planning/Growing coherent:
   - Planning should answer: what am I considering planting, where could it go, when should I plant/transplant/harvest?
   - Garden should show gardens/beds, bed occupancy, planning backlog, growing plants, due work, and harvest windows.
   - Growing should show active plants with clear actions: check, log activity/photo, move bed, harvest.
   - Plant detail should support edit nickname/status/garden/bed, photos, activity timeline, harvest section, and reminders.

4. Make Reminder useful without harming plants:
   - Treat watering/fertilizing/pruning/pest checks/harvest as checkable tasks.
   - Provide complete, snooze, skip, edit, delete.
   - Coordinate fertilizer with watering days when applicable.
   - Batch tasks by bed/day and avoid notification spam.
   - Every reminder action must have feedback; no dead taps.

5. Make AI scanner safe and useful:
   - Identify plant from camera/upload; match to library if possible.
   - Show uncertainty/top candidates when possible.
   - Allow manual correction and unknown plant save.
   - Save scan history and connect result to userPlants.
   - Add disease/pest detection path with confidence, likely causes, treatment/prevention, and clear "not a diagnosis" language.
   - If real API keys are absent, implement clean adapter/mock boundaries rather than fake hidden behavior.

6. Protect user data:
   - Offline/local actions for plants/photos/logs/harvests/reminders must survive restart.
   - Sync queue must not drop failed actions.
   - Guest/anonymous data must merge safely when user signs in.
   - Photo storage should have a stable upload/retry boundary; if cloud upload is incomplete, local-only status must be visible.

7. Keep monetization user-respectful:
   - Core plant saving, garden planning, and basic reminders remain usable.
   - Premium gates advanced AI limits, advanced diagnosis, analytics, widgets, or high-volume scan usage.
   - Paywall copy must be transparent; no surprise lockouts of already-created data.

Acceptance criteria:
- A new user can onboard, choose gardener/farmer, browse library, add a plant, see it in Planning/My Plants/Garden, start it as growing, create or receive reminders, complete/snooze reminders, record harvest, and view plant timeline.
- Scanner can identify or accept manual/unknown plant, attach/match library entry when possible, and save history without corrupting shared library data.
- Reminder UX encourages checking plant condition and supports snooze/skip/batching so it does not train users to ignore the app.
- Companion guidance is practical and evidence-aware, not a magical friend/foe chart.
- User data is not lost on restart/offline/sign-in transitions.
- Mobile typecheck passes, Convex codegen/schema is current, dashboard build passes, and API tests are either passing or blocked only by documented local dependency setup.
```

## Human Execution Plan

If a person continues this work instead of `/goal`, use this order:

1. Read the current dirty diff.
2. Finish the add-plant flow without changing unrelated modules.
3. Run mobile typecheck and Convex codegen.
4. Manually test the key flows:
   - gardener adds from library
   - farmer adds to planning
   - farmer adds to growing bed
   - scanner match to library
   - scanner save unknown plant
   - reminder complete/snooze
   - harvest record from plant detail
5. Fix sync or data-loss risks discovered while testing.
6. Document what remains deferred.

## Definition Of Done

The next milestone is done when:

- The dirty add-plant flow is either completed and committed or deliberately split into documented follow-up work.
- `userPlants` consistently represent personal plants and never accidentally mutate library data.
- The core loop from library to planning/growing/reminder/harvest can be demonstrated.
- Verification results are written down.
- Any blocked items are named with exact blockers, not vague TODOs.

## Related Notes

- Competitor complaint research: `docs/task/2026-05-11-competitor-user-complaints.md`
- Original functional plan: `docs/specs/APP_FUNCTIONAL_PLAN.md`
- Original garden spec: `docs/specs/MY_GARDEN_SPEC.md`
- Existing completeness review: `docs/task/app-completeness-review.md`

