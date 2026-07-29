# Changelog

All notable changes to the **RichFarm** project will be documented in this file.

## [2026-07-29] — Phase 1 and Phase 1.5 release-candidate consolidation

### Short

- Completed the Phase 1 user-plant lifecycle and the repository-side implementation for Phase 1.5 local-first synchronization.
- Added scoped runtime/preferences/projection stores, durable Activity/Harvest/Photo commands, guest-to-account claim recovery, and keyboard-safe mobile input flows.
- Renamed native identifiers and product surfaces from My Garden/Richfarm to RichFarm.
- Hardened API and Better Auth authorization, verification email, reset-password, and signed-in profile flows.
- Added native regression flows for state persistence, offline restart/reconnect, authentication, and deep links.
- Phase 2 remains gated on staging migration rehearsal, real-device/two-client verification, rollout metrics, and an independent PASS audit.

### Version detail

#### Phase 1 — user-plant lifecycle

- Kept Planning and Growing as states of the same `userPlants` entity.
- Preserved lifecycle transitions, activity events, harvest records, personal photos, reminders, garden/bed placement, and library references without mutating shared catalog data.
- Centralized mobile add-plant and plant-content paths so guest and account users share consistent personal-data semantics.
- Added keyboard-safe input sheets, deterministic draft cleanup, stable E2E identifiers, and regression evidence for high-risk create/edit flows.

#### Phase 1.5 — authoritative local-first synchronization

- Consolidated installation, session, network, active identity, and scope-token ownership in one mobile runtime store.
- Added one active sync-scope store with guarded hydration, authoritative projection plus pending overlays, selector hooks, and stale-account publication protection.
- Unified app mode, theme, units, and weather visibility under guest/account-scoped optimistic preferences.
- Added serialized, idempotent durable commands for Activity, Harvest, and Photo metadata.
- Added managed Photo staging, resumable upload phases, orphan cleanup, guest-claim remapping, legacy sidecar migration, and malformed-payload recovery.
- Preserved failed/pending operations across restart and kept acknowledged operations until an authoritative snapshot is durably stored.
- Added regression coverage for scope isolation, preferences, projection loading, reconciliation, guest claim, durable command serialization, and local-data migration.

#### Authentication and security

- Made API authorization resolve current database role and active state instead of trusting stale JWT authorization claims.
- Replaced shared development-secret fallbacks with generated local secrets and mandatory configured secrets outside local development.
- Required configured authentication email delivery and added a stricter verification-email rate limit.
- Improved sign-up, verification, sign-in redirect, reset-password, resend-verification, and post-sign-in profile flows.
- Preserved the legacy secure auth storage namespace while changing the public deep-link scheme to `richfarm://`.

#### Native application and QA

- Renamed iOS targets/workspaces, Android package/namespace, widgets, app groups, deep links, and documentation to RichFarm.
- Added Maestro coverage for keyboard lifecycle, auth flows, profile session state, reset password, verification deep links, scoped preferences, and offline content restart/reconnect.
- Added an Android auth E2E runner and ignored generated E2E artifacts.

#### Verification baseline

- Mobile TypeScript passes.
- Mobile tests pass: 45/45.
- Convex lifecycle/sync tests pass: 27/27.
- API tests pass: 16/16 when executed with localhost listener access.
- Dashboard production build passes.
- iOS production export, native simulator build/install/launch, base smoke flow, and scoped-state restart flow pass.
- Android device verification remains pending because the current environment does not provide `adb` or an attached emulator/device.
- Operational Phase 1.5 release evidence remains tracked in the staging runbook; repository-side completion alone does not open Phase 2.

## [2026-03-06]
- **Documentation**:
  - Refreshed [`README.md`](./README.md) for the current Convex, backend, and taxonomy workflow.
  - Added [Plant taxonomy workflow](./docs/specs/PLANT_TAXONOMY_WORKFLOW.md) as the implementation-oriented reference for plant identity, migration, and checks.
  - Replaced placeholder Convex docs in [`convex/README.md`](./convex/README.md).
  - Updated [`backend/README.md`](./backend/README.md) to describe the current Convex sync contract.
- **Data Model**:
  - Added taxonomy fields to `plantsMaster`: `genus`, `species`, `cultivar`, normalized variants, and parse status.
  - Introduced taxonomy indexes for species grouping and cultivar uniqueness checks.
  - Moved plant identity matching away from `scientificName`-only lookups.
- **Plant Library**:
  - Grouped library entries by species and surfaced cultivar variants in plant detail.
  - Improved search and matching so scientific-name hits resolve to the preferred base row when applicable.
  - Added variant-aware fallback handling for seeded plant content and localized names.
- **Scanner**:
  - Scanner results can now carry `plantMasterId` and open the matched library entry directly.
  - Added UI feedback when the detected plant already exists in the user's garden.
- **Admin / Backend**:
  - Expanded dashboard plant editing to include taxonomy fields and growing metrics.
  - Updated backend-to-Convex sync to enforce taxonomy invariants and optional cultivar support.
- **Quality Gates**:
  - Added taxonomy invariant checks and seed-alignment reporting in `convex/plantTaxonomyChecks.ts`.
  - Added GitHub Actions workflow [`.github/workflows/taxonomy-invariants.yml`](./.github/workflows/taxonomy-invariants.yml).

## [2026-03-03]
- [2026-03-03-daily-report.md](./docs/reports/2026-03-03-daily-report.md)
- **Features**:
  - **AI Plant Scanner**: Introduced plant identification using Plant.id and Google Vision fallback, with multilingual support.
  - **Expanded Garden Locations**: Added more indoor/outdoor site options (e.g., Balcony, Rooftop, Greenhouse) with horizontal scrolling.
  - **Bottom Sheet Gestures**: Implemented swipe-down-to-close and click-outside-to-dismiss for all major modals.
  - Relaxed authentication requirements for adding gardens, beds, and plants. Guests can now use these features anonymously.
  - Implemented automatic anonymous session initialization via `deviceId` in `app/_layout.tsx`.
  - Implement offline caching system for major data entities.
  - New theming system with consistent UI and Dark Mode support.
  - Introduced Liquid Glass navigation bar.
- **Localization**:
  - Updated English and Vietnamese translations for new locations and interactive features.
- **Refactor**:
  - Unified state management for better performance.

## [2026-03-02]
- **Audit**: [2026-03-02-service-audit.md](./docs/reports/2026-03-02-service-audit.md)
- **Fixes**:
  - Fixed race conditions in `useAuth` causing loading screen hangs.
  - Added skip guards to `usePlants` and `useReminders` to prevent unnecessary Convex calls during initialization.
  - Fixed React rules violation in `useBeds` (conditional hook call).
- **Cleanup**:
  - Removed redundant `shouldBypassRemote` fallbacks across multiple hooks.

## [2026-02-25]
- **Review**: [2026-02-25-git-review.md](./docs/reports/2026-02-25-git-review.md)
- **Features**:
  - **RevenueCat Integration**: Completed subscription system with premium access gating.
  - **Account Deletion**: Implemented manual cascade deletion of all user data.
  - **Pests & Diseases**: Expanded database with 5 new entries and mock seeders.
- **UI**:
  - Major Profile screen overhaul.
  - Removed dedicated Health tab (merged into Explorer).

## [2026-02-24]
- **Reports**: [2026-02-24-tasks.md](./docs/reports/2026-02-24-tasks.md)
- **Work**:
  - Configured RevenueCat SDK and created gating utilities.
  - Add `SubscriptionProvider` to app root.

## [2026-02-23]
- **Reports**: [2026-02-23-folder-structure-report.md](./docs/reports/2026-02-23-folder-structure-report.md)
- **Refactor**:
  - Reorganized project structure into feature-slice modules.
  - Moved `my-garden` to `features/garden`.
  - Grouped `lib/` and `hooks/` by domain.

## [2026-02-21]
- **Daily Report**: [2026-02-21-daily-report.md](./docs/reports/2026-02-21-daily-report.md)
- **Auth**:
  - Switched to Convex + Better Auth stack.
  - Added Profile UI for Email/Password and Google Sign-in.
- **Native**:
  - Initial iOS/Android widget scaffolding.
  - Implemented `scripts/init-app.js` for project branding.

## [2026-02-19]
- **Review**: [2026-02-19-PROJECT_REVIEW_REPORT.md](./docs/reports/2026-02-19-PROJECT_REVIEW_REPORT.md)
- **Features**:
  - Plant Detail Screen: Added Photos, Activity Log, and Harvest Log.
  - Local-first storage implementation with `AsyncStorage`.
  - Sync queue for activities and harvests.

## [2026-02-18]
- **Initial Setup**: [2026-02-18-today-tasks.md](./docs/reports/2026-02-18-today-tasks.md)
- **Core**:
  - Expo + React Native + Convex integration.
  - NativeWind (Tailwind CSS) setup.
  - i18n support for 6 languages.
  - Basic Garden/Bed/Plant management.
