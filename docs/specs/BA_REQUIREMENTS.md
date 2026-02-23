# Richfarm Business Requirements Document (BRD)

Last updated: 2026-02-23
Owner: Product + Engineering
Status: Draft

## 1. Objective

This document defines business goals, scope, requirements, and acceptance criteria for Richfarm.

## 2. Business Goals

- Help home growers manage plants from planning to harvest in one app.
- Improve daily task completion through reminders and clear actions.
- Reduce onboarding friction for first-time growers.
- Establish a maintainable product baseline for future premium features.

## 3. Problem Statement

Garden users often have scattered information and no consistent daily workflow. Richfarm should convert plant care information into actionable, localized, and trackable tasks.

## 4. Scope

In scope (MVP):
- Garden and bed setup.
- Plant lifecycle tracking (`planning -> growing -> harvested`).
- Reminder list and completion flow.
- Plant library browse/search/filter.
- Localization for UI and plant content.
- Basic sync-safe behavior and offline tolerance.

Out of scope (MVP):
- Social/community features.
- Full sensor integrations.
- Advanced analytics dashboards.
- Complex team collaboration and permissions.

## 5. Stakeholders

- Product Owner.
- Engineering team.
- Design team.
- QA team.
- End users: home gardeners (balcony, indoor, small plots).

## 6. User Segments

- Beginner growers: need guided setup and simple tasks.
- Regular growers: need speed, organization, and reliable reminders.
- Power users: need deeper customization and scalable workflows.

## 7. Functional Requirements

FR-01 Welcome and entry
- User can choose language and enter the app in one tap.
- No dead tap interactions.

FR-02 Garden management
- User can create a garden and see it immediately.
- Loading, empty, and error states are shown.

FR-03 Planning flow
- User can add plant with minimal required input.
- Validation and auth feedback are visible.

FR-04 Growing flow
- User can update plant status and mark harvested.
- UI updates immediately after successful action.

FR-05 Reminder flow
- User can see today's tasks and complete reminder in one tap.
- Reminder times respect locale/timezone.

FR-06 Library flow
- User can search, filter, and open plant detail.
- Empty result state is explicit.

FR-07 Localization
- UI text comes from i18n resources.
- Localized content supports fallback when translation is missing.

FR-08 Sync behavior
- User action always yields clear outcome (success/error).
- Offline transitions do not silently discard actions.

## 8. Non-Functional Requirements

NFR-01 Performance
- Core user interactions should feel immediate.
- Network-bound screens must show loading quickly.

NFR-02 Reliability
- No silent failure in core actions.
- Mutation errors return user-visible feedback.

NFR-03 Security and privacy
- Ownership checks enforced server-side.
- Image privacy handling required where applicable.

NFR-04 Accessibility
- Controls are clear and consistently interactive.
- Copy supports novice comprehension.

NFR-05 Maintainability
- Route files under `app/` remain thin.
- Domain logic belongs in `features/`, `hooks/`, or `lib/`.

## 9. Business Rules

- Every interactive element must cause navigation, state change, or explicit feedback.
- Data ownership actions require identity (`deviceId` and/or authenticated user).
- Unit defaults:
- US region -> imperial.
- Non-US region -> metric.
- User preference overrides default.

## 10. Success Metrics

- Activation: first plant added in first session.
- Engagement: at least one reminder completed per active day.
- Retention: D7 active users with at least one tracked plant.
- Reliability: core mutation failure rate.

## 11. Dependencies

- Expo Router app shell.
- Convex backend and auth.
- Localization resources.
- Notification permissions and device behavior.

## 12. Risks and Mitigations

- Complexity for beginners -> simplify flows and empty states.
- Reminder fatigue -> batching and rule controls.
- Sync conflicts -> versioning and defensive mutation patterns.

## 13. Acceptance Criteria (UAT)

- Welcome, Garden, Planning, Growing, Reminder, Library flows are testable end to end.
- Core actions have visible outcomes.
- Localization and unit behavior match documented defaults.
- No unresolved high-severity defects in core lifecycle flows.

## 14. Traceability

Supporting docs:
- `docs/specs/APP_FUNCTIONAL_PLAN.md`
- `docs/specs/MY_GARDEN_SPEC.md`
- `docs/specs/UNIT_SYSTEM.md`
- `docs/specs/LOCALIZATION.md`
