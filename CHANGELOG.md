# Changelog

All notable changes to the **Richfarm** project will be documented in this file.

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
