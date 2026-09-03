# Changelog

All notable changes to the **RichFarm** project will be documented in this file.

## [Unreleased]

- No application version change.

## [2026-09-03] — Dashboard DX, review notifications, and plant group diacritics

- Added a Vite dev server supervisor plugin that automatically manages the RichFarm API process lifecycle during dashboard development.
- Added two-stage global dashboard notification banners for incoming Markdown source changes and pending plant care approvals.
- Added Vietnamese diacritics to plant group master seed data and introduced an idempotent seed sync mutation (`syncPlantGroupNames`).
- Enhanced TaxonomyManager with dynamic translation locale columns and responsive table/stats layouts.
- Updated plant care guides and manifests for Aloe vera, Bougainvillea, and Abelmoschus esculentus (okra).
- Aligned iOS project configurations and CocoaPods dependencies for Hermes.

## [2026-08-31] — Care content approval and Convex publication semantics

- Implemented strict separation of draft import and content publication: Markdown import creates drafts without generating outbox records.
- Added `approveContentLocales` service and endpoint to stamp plant locales to published/reviewed with reviewer identity and source provenance (`source_refs`).
- Implemented outbox approval gate (`CONTENT_NOT_APPROVED`) to prevent unapproved care content from being queued or delivered to Convex.
- Updated the dashboard with "Publish approved" controls, pending publication inspection, and Translations approval actions.
- Verified care content approval and public serving contract end-to-end with Bougainvillea glabra on dev Convex deployment.

## [2026-08-25] — Canonical identity and markdown content change detection

- Implemented `canonical_identity_v1` across API, SQLite, content tooling, and Convex writers to guarantee deterministic plant identities.
- Enforced duplicate prevention (`CANONICAL_PLANT_EXISTS`) and quarantine/redirect mechanisms for ambiguous taxonomy entries.
- Built Markdown content change detection scanner and dashboard Content Inbox for inspecting incoming diffs before import.
- Standardized git-backed Markdown content manifests binding directories to stable identities, hashes, and review states.
- Implemented smart reconciliation engine to detect drift, verify invariants, and protect Convex synchronization.

## [2026-08-12] — Plant geography adaptation and structured propagation

- Added plant geography adaptation models including climate zones, soil types, sunlight requirements, and hardiness ranges.
- Added structured plant propagation methods and step-by-step guidance.
- Standardized localized plant descriptions and care markdown for mobile and dashboard displays.
- Expanded plant curation for key cultivars with honest care status and Vietnamese diacritics.

## [2026-08-09] — Phase 3 SQLite-local authoring and Convex sync outbox

- Established SQLite as the local authoring source of truth with master plant CRUD and stable source identity `(sourceSystem, sourceId)`.
- Implemented retryable, deduplicated sync outbox with exponential backoff to mirror SQLite mutations to Convex.
- Added Convex server service-token authentication and role-separated write guards (`admin` vs `editor`).
- Built canonical plant library projection (`listCanonical`, `getCanonical`) and variant resolution for mobile queries.
- Defined care status contracts (`needs_review`, `reviewed`, `published`) and content tier derivations.

## [2026-08-03] — Phase 2.5 push reliability and global feedback

- Replaced transient in-screen banners with a theme-aware global toast overlay for iOS and Android (`RichToastHost`, `SyncToastCoordinator`).
- Moved guest claiming, profile actions, and plant Activity, Harvest, and Photo feedback into the toast overlay.
- Hardened push notification delivery: device token registration routing, delivery receipts, and logout feedback alignment.
- Enforced care-plan lifecycle rules, reminder occurrences, and safe offline retry for reminder outcomes.

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
