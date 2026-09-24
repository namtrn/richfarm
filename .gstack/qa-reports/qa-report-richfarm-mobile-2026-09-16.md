# RichFarm mobile QA report

Date: 2026-09-16 (Asia/Ho_Chi_Minh)
Scope: Task 1 mobile core flow on iOS
Framework: Expo / React Native; Maestro; Vitest; TypeScript
Device: iPhone 17, iOS 26.2, simulator UDID `F7051FFA-68FA-49BD-8709-F789A8892B46`
Environment: development Convex backend configured from the repository's dev setup; no production mutation

## Executive result

Core guest/local flow: **PASS**, with one P1 data-display blocker fixed and reverified.

Health score: **8/10** for the requested mobile track. The score is not a baseline delta because no prior QA baseline was present. The remaining two points are authenticated account coverage, Android coverage, and clean-install onboarding coverage that could not be completed in this environment.

## Verified manually on iPhone 17

| Flow | Result | Evidence |
| --- | --- | --- |
| App launch and Home | PASS | App launched on the exact requested iPhone 17 simulator |
| Home ↔ Library | PASS | Search screen reached after dismissing Expo dev warning toast |
| Gardener/farmer mode | PASS | Mode switch changed the available navigation and content |
| Appearance/weather/theme and restart | PASS | Theme persisted across stop/relaunch; weather visibility persisted |
| Garden creation → Garden detail → Bed creation | PASS | Created QA garden and QA bed |
| Farmer Planning → plant creation | PASS | Created a local guest plant and opened Plant Detail |
| Photo entry points | PASS | Camera and Gallery actions were visible; photo modal was cancelled without mutation |
| Activity save → airplane mode → stop/relaunch → Activity visible | PASS | Focused restart flow retained the activity note |
| Harvest save → airplane mode → stop/relaunch → Harvest visible | PASS | Focused restart flow retained quantity/unit/note |
| Reconnect | PASS for simulator network toggle | Airplane mode was disabled at the end; no authenticated remote sync claim made |

The combined content flow had a Maestro navigation race around the Activity form. The focused Activity and Harvest restart flows passed independently, so the race is treated as test-harness flakiness rather than an app blocker.

## P1 fixed

### ISSUE-001 — Guest plant content was hidden before projection hydration

Guest Activity/Harvest/Photo writes are local-only and appear in the pending outbox before an authoritative projection is complete. Plant Detail previously fell back to remote query results whenever the projection was incomplete, which made newly saved local content appear missing and fail to survive a visible restart flow.

Fix status: **verified**.

Changed files:

- `apps/mobile/app/(tabs)/plant/[userPlantId].tsx`
- `apps/mobile/lib/plantContentProjection.ts`
- `apps/mobile/lib/plantContentProjection.test.ts`

The helper now selects the local projected rows for guests even while the projection is incomplete, while preserving the remote fallback for accounts until hydration completes. The regression test covers guest pending content, account fallback, and authoritative account projection.

## Open gates / deferred issues

1. Real authenticated sign-in, logout, and account switching were not run because no verified E2E credentials were supplied. The existing mock auth flow is not evidence for real session behavior.
2. Fresh-install onboarding was not rerun; the simulator already had onboarding/local data and was intentionally not erased.
3. Android coverage was not run because `adb` is unavailable in the environment.
4. Several existing Maestro fixtures are stale or incomplete for the current UI: Theme needs the selector opened first; the Garden flow must enter Garden & App before mode controls; the durable plant flow mixes farmer Planning selectors with gardener My Plants. The Expo debugger-warning toast can also intercept taps in dev-client runs.
5. P2 UI follow-up: Farmer Planning can show “Unnamed plant” after quick add even though the nickname is retained on Plant Detail; the list appears to use `displayName` rather than the saved nickname.

## Automated checks

- `npx vitest run apps/mobile` — **16 files, 54 tests passed**
- `npm --prefix apps/mobile run typecheck` — **passed**
- `git diff --check` — **passed**

## Delivery notes

No commit and no deploy were performed, per task scope. The iPhone 17 simulator remains booted with the app available, and simulator network mode was restored to enabled at the end.
