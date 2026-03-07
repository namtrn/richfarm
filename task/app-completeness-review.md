# Richfarm App Completeness Review

Date: 2026-03-06

## Executive summary

I reviewed the React Native app using the `react-native-best-practices` and `security-best-practices` workflows, then applied a focused set of fixes aimed at completeness rather than broad refactors.

Important product rule confirmed: **"Add plant" should create or update `userPlants`, not add new rows into the shared plant library.** The implemented changes keep `plantsMaster` / library data read-only in the app add flows.

## Implemented improvements

### 1. User-plant nickname support now persists on `userPlants`

This closes a real gap in the current UX: Planning/Garden already asked users for a plant name, but the mutation did not store it anywhere.

- Added `nickname` to `userPlants` schema: `convex/schema.ts:220-226`
- Added nickname support in `addPlant` and `updatePlant`: `convex/plants.ts:185-220`, `convex/plants.ts:284-320`
- Nickname is now preferred for display while keeping library identity separate: `convex/plants.ts:129-177`
- Planning quick add now saves the typed name to `userPlants`: `app/(tabs)/planning.tsx:116-135`
- Planning scanner fallback now saves the detected/custom name into `userPlants` instead of losing it: `app/(tabs)/planning.tsx:323-334`
- Garden mode received the same behavior: `app/(tabs)/garden/index.tsx:549-563`, `app/(tabs)/garden/index.tsx:720-726`
- Plant detail can now edit the per-user nickname without mutating library data: `app/(tabs)/plant/[userPlantId].tsx:164-166`, `app/(tabs)/plant/[userPlantId].tsx:312-321`, `app/(tabs)/plant/[userPlantId].tsx:707-717`

### 2. Auth gating now distinguishes signed-in users from anonymous device users

Before this change, anonymous/device users were effectively treated as authenticated because `isAuthenticated` was derived from `!!user`.

- Fixed auth state to require a non-anonymous user: `lib/auth.ts:45-52`

Impact:

- Premium / signed-in-only actions now behave consistently with the product copy.
- Warning banners and gated actions in Planning/Growing/Reminder now match actual auth state.

### 3. Dead-tap reduction on high-frequency actions

The functional plan explicitly says the app should not have silent disabled interactions.

- Home reminder rows are now actionable and route to the linked plant detail or Reminder screen: `app/(tabs)/home.tsx:76-91`, `app/(tabs)/home.tsx:172-188`
- Growing "Harvest" now prompts sign-in instead of silently doing nothing for anonymous users: `app/(tabs)/growing.tsx:61-72`, `app/(tabs)/growing.tsx:169-176`
- Reminder add/complete/toggle/edit/delete now prompt sign-in instead of dead-tapping: `app/(tabs)/reminder.tsx:724-735`, `app/(tabs)/reminder.tsx:749-755`, `app/(tabs)/reminder.tsx:815-824`, `app/(tabs)/reminder.tsx:895-919`

### 4. Reminder filters and quick snooze actions

The Reminder screen now supports faster triage without opening edit forms for simple rescheduling.

- Added filter chips for `All`, `Overdue`, `Today`, `Upcoming`, and `Completed`: `app/(tabs)/reminder.tsx`
- Added quick snooze actions (`4 hours`, `Tomorrow 8:00`) via a dedicated reminder action: `convex/reminders.ts`, `hooks/useReminders.ts`, `app/(tabs)/reminder.tsx`
- Added overdue and snoozed-state messaging directly in reminder cards: `app/(tabs)/reminder.tsx`

### 5. Library-to-userPlants flow now asks Planning vs Growing

This improves the jump from discovery to action while preserving the rule that library data is shared catalog data and user actions create `userPlants`.

- Added reusable add-target sheet: `components/ui/AddPlantTargetModal.tsx`
- Library detail now asks whether to add the plant to `Planning` or place it directly into a `Growing` bed: `app/(tabs)/library/[masterPlantId].tsx`
- Library modal flow on the main library screen now uses the same decision step: `app/(tabs)/library/index.tsx`

### 6. Plant health timeline added to plant detail

Users can now see photos, care activity, and harvests in one chronological view.

- Added reusable timeline section: `components/plant/PlantHealthTimelineSection.tsx`
- Timeline is now rendered inside plant detail: `app/(tabs)/plant/[userPlantId].tsx`

### 7. Garden dashboard summary added to the Garden tab

The Garden tab now gives users a useful top-level snapshot before they drill into individual gardens.

- Added overview summary card with live counts for gardens, beds, growing plants, and due-today work: `app/(tabs)/garden/index.tsx`
- Added weekly focus chips for upcoming harvest windows, unassigned plants, and planning backlog: `app/(tabs)/garden/index.tsx`
- Added equivalent overview coverage for gardener mode in the simplified `My Plants` screen so the feature is available in both app modes: `app/(tabs)/garden/GardenerMyPlantsView.tsx`

### 8. Offline sync status is now visible to users

The app already had a local sync queue; it now exposes that state in the UI so users can trust what is pending vs synced.

- Added sync-queue subscriptions so UI can react immediately to queued/removed sync actions: `lib/sync/queue.ts`
- Added reusable sync-status hook: `hooks/useSyncStatus.ts`
- Added global compact sync banner near the app shell header: `app/_layout.tsx`, `components/ui/SyncStatusBanner.tsx`
- Added plant-level sync banner with retry action in plant detail: `app/(tabs)/plant/[userPlantId].tsx`
- Sync executor now supports retrying a filtered plant queue: `lib/sync/useSyncExecutor.ts`
- Library add flows now route back correctly for both `gardener` and `farmer` mode instead of relying on hidden-tab params: `app/(tabs)/library/index.tsx`, `app/(tabs)/library/[masterPlantId].tsx`

### 9. Shared add-plant flow now drives manual add, scanner handoff, and library attach

The biggest product-risk duplication in the app was the number of separate paths that all meant “add this plant to my garden”. That logic is now centralized.

- Added shared flow hook for add/create/attach/navigation semantics: `hooks/useAddPlantFlow.ts`
- Planning manual add and scanner no-match save now use the shared flow: `app/(tabs)/planning.tsx`
- Farmer-mode Garden planning tab now uses the same flow instead of its own local copy: `app/(tabs)/garden/index.tsx`
- Library list/detail now share the same post-add and attach behavior: `app/(tabs)/library/index.tsx`, `app/(tabs)/library/[masterPlantId].tsx`
- Global scanner hook now uses the same library-match and unknown-save path: `hooks/usePlantScanner.tsx`

## Security review

### Fixed / hardened

#### SEC-01: Production startup now rejects the default JWT secret

Severity: High

- Evidence: `backend/src/server.ts:10-20`
- Change: production boot now throws if `JWT_SECRET` is still the default fallback; non-production keeps a warning for local/dev use.
- Impact avoided: shared or production deployments accidentally signing tokens with a public, guessable secret.

#### SEC-02: Express fingerprinting reduced

Severity: Low

- Evidence: `backend/src/app.ts:19-22`
- Change: `x-powered-by` is disabled.

#### SEC-03: Cross-entity ownership checks tightened for plants, beds, gardens, and reminders

Severity: High

- Evidence:
  - `convex/lib/ownership.ts`
  - `convex/gardens.ts`
  - `convex/beds.ts`
  - `convex/plants.ts`
  - `convex/reminders.ts`
- Changes:
  - `getBedsInGarden` now verifies the garden belongs to the current user before returning beds.
  - bed create/update now verify the referenced `gardenId` belongs to the current user.
  - plant create/update now verify the referenced `bedId` belongs to the current user.
  - reminder create/update now verify `userPlantId` and `bedId` ownership before accepting cross-table references.
- Impact avoided:
  - cross-user linking to another user's bed/garden/plant IDs
  - unauthorized enumeration via foreign-key references
  - integrity issues where one user's objects point at another user's records

### Remaining findings

#### SEC-04: Anonymous/device mode still trusts client-controlled `deviceId`

Severity: High

- Evidence:
  - `lib/deviceId.ts:8-45`
  - `convex/lib/user.ts:5-29`
- Current behavior:
  - the app generates `deviceId` locally with timestamp + random string and sends it back to the backend as the anonymous identity key.
  - backend-side anonymous lookup trusts that `deviceId` directly.
- Risk:
  - if a device ID is copied, replayed, or otherwise obtained, another client could impersonate that anonymous user and access their `userPlants`, reminders, gardens, and beds.
- Recommendation:
  - move anonymous identity to a server-issued, signed credential or upgrade anonymous sessions onto a real auth/session mechanism.
  - treat current device-based anonymous isolation as convenience, not strong security.

#### SEC-05: Backend CORS policy is still fully open

Severity: Medium

- Evidence: `backend/src/app.ts:25-31`
- Current code still uses bare `cors()` with no origin allowlist.
- Risk: broader-than-needed browser access to authenticated/admin endpoints if the frontend deployment topology changes.
- Recommendation: restrict `origin` via environment-based allowlist and explicitly set credential behavior.

#### SEC-06: Helmet CSP is disabled in app code

Severity: Medium

- Evidence: `backend/src/app.ts:25-29`
- Current code sets `contentSecurityPolicy: false`.
- Risk: there is no visible browser-enforced CSP defense in app code for dashboard/admin surfaces.
- Recommendation: either restore a realistic CSP here or document/enforce it at the reverse proxy/CDN layer.

#### SEC-07: `getStorageUrl` is unauthenticated

Severity: Medium

- Evidence: `convex/storage.ts:94-101`
- Risk:
  - anyone who obtains a valid `storageId` can request a download URL without an ownership check.
- Recommendation:
  - require auth and map file access through plant/photo ownership checks before returning URLs.

## React Native / completeness recommendations still open

### RN-01: Large list screens should move to virtualized rendering as data grows

Severity: Medium

- Evidence: `app/(tabs)/growing.tsx:74-178`, `app/(tabs)/reminder.tsx:737-930`
- These screens still render with `ScrollView` + `map(...)`.
- Recommendation: switch high-cardinality feeds to `FlatList` or `FlashList` once real user data volume increases.

## Verification

- `npx convex codegen`: passed
- `npm run build` in `backend/`: passed
- `npx tsc --noEmit`: passed
- `npm run test:smoke:ios`: passed
  - `smoke-all-buttons`
  - `smoke-home-library-health`
  - `smoke-library-deeplink`
- `maestro test --device emulator-5554 .maestro/smoke-all-buttons.yaml .maestro/smoke-home-library-health.yaml .maestro/smoke-library-deeplink.yaml`: passed on Expo Android emulator (`Medium_Phone_API_36.1`)
  - `smoke-all-buttons`
  - `smoke-home-library-health`
  - `smoke-library-deeplink`

## Next product work

These are the next product-facing additions worth doing after the implemented work above.

### 1. Bed-level action heatmap

Why:

- users can now see garden totals, but still need a faster way to spot exactly which bed needs attention first.

Suggested scope:

- color-coded bed health / reminder urgency
- quick open into the busiest bed
- optional occupancy signal for empty or overcrowded beds

## QA coverage that should exist next

These are not new product features. They are regression checks for the core rule that app add flows should create or update `userPlants`, not mutate the shared library catalog.

### 1. Guest manual add to `userPlants`

Why:

- guest mode is an intentional supported app mode, so manual add without sign-in is a core path.
- this path should verify that guest users can still create a personal plant record in `userPlants`.
- it should also verify that the flow does not create or edit rows in `plantsMaster`.

### 2. Gardener-mode add from Library

Why:

- the product rule here is "select from library, then add to my plants", not "create a new library plant".
- this check should confirm gardener mode routes back to the correct surface after creating the user's plant.

### 3. Scanner no-match save as unknown user plant

Why:

- scanner no-match is the most likely place for semantics to drift from "save my plant" into "create catalog data".
- this check should verify that no-match creates a user-owned plant entry, preserves the nickname/custom label, and leaves the shared library unchanged.
