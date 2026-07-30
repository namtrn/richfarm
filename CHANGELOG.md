# Changelog

All notable changes to the **RichFarm** project will be documented in this file.

## [Unreleased]

- Replaced transient in-screen offline, sync, reminder, and authentication
  feedback with a theme-aware global toast overlay for iOS and Android.
- Moved guest-data claiming, Profile actions, and plant Activity, Harvest, and
  Photo operation feedback out of screen flow and into the same toast overlay.
- Added persistent sync-attention feedback with a Review action, while keeping
  validation and contextual guidance inline and destructive choices in dialogs.
- Documented the Phase 2.5 plan for real-device push delivery, token and receipt
  observability, safe notification routing, retry, and duplicate prevention.
- No application version change.

## [2026-07-29] — Phase 2 care and release hardening

- Added versioned per-plant care plans, deterministic reminders, explicit
  performed/check/snooze/skip outcomes, and multilingual care-plan UI.
- Extended durable offline sync, projections, conflict handling, tombstones,
  restart recovery, and account cleanup to care plans and reminder outcomes.
- Added local-day and Garden/Bed batching plus a development-only due trigger;
  fixed reconnect retry and pending-reminder visibility.
- Completed Phase 1/1.5 hardening: scoped runtime state, durable plant-content
  commands, keyboard-safe flows, current-role API authorization, and auth E2E.
- Renamed native product identifiers and deep links to RichFarm and completed
  repository, simulator, migration-rehearsal, and real-account verification.
- Real push delivery, Android, staging rollout, and two-device convergence remain
  external verification gates.

## [2026-07-16] — Guest identity and QA

- Completed guest-to-account identity claiming across durable sync state.
- Stabilized guest garden creation and keyboard handling in native QA flows.

## [2026-07-15] — Local-first synchronization

- Completed the user-plant lifecycle and authoritative offline sync v2.
- Added pending projections, durable Activity/Harvest/Photo commands, restart
  recovery, reconciliation, lifecycle hardening, and expanded iOS smoke tests.

## [2026-05-14] — Gardener flows and catalog

- Refined gardener plant flows, reminder batching, and skip behavior.
- Expanded the plant catalog and synchronized master plants into backend admin.

## [2026-05-11] — Plant assignment

- Refined garden/bed plant assignment and documented the RichFarm product goal.

## [2026-03-12] — Settings, auth, and modes

- Fixed logout/onboarding reset, anonymous settings sync, timezone search,
  verification email, and anonymous-session bootstrap.
- Added gardener/farmer mode filtering and corrected scanner navigation.

## [2026-03-11] — Onboarding and cleanup

- Expanded backend auth/subscription support and added mobile scan/onboarding
  screens.
- Removed the obsolete duplicate Convex source tree.

## [2026-03-10] — Monorepo and account hardening

- Restructured the project as a monorepo and added localization tooling.
- Hardened authentication, admin/subscription flows, password changes,
  notification settings, support/legal surfaces, and navigation timeouts.

## [2026-03-09] — Plant families

- Added plant-family schema, indexing, explorer UI, and navigation.
- Fixed related backend data and application UI issues.

## [2026-03-08] — Dashboard and backend

- Refined the dashboard plant editor and updated plant schema, seeding, and
  backend documentation.

## [2026-03-07] — Product completeness

- Improved application security and completeness.
- Added richer garden summaries and gardener views.
- Expanded master-plant admin with statistics, bulk actions, export, auth, and
  proxy-backed development workflows.

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
