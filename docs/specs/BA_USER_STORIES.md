# Richfarm BA User Stories

Last updated: 2026-02-23

## Epic 1: Onboarding and Entry

US-01
As a new user, I want to enter the app quickly so that I can start using core features without setup friction.
Acceptance criteria:
- Language selection is available on welcome screen.
- Get Started opens the default tab route.
- No button tap is silent.

US-02
As a multilingual user, I want UI text in my language so that I can understand tasks clearly.
Acceptance criteria:
- Language switch updates UI strings.
- Missing keys fall back safely.

## Epic 2: Garden Setup

US-03
As a user, I want to create a garden so that I can organize plants by space.
Acceptance criteria:
- Create garden action validates required fields.
- Created garden appears immediately.

US-04
As a user, I want visible state feedback so that I know if data is loading or unavailable.
Acceptance criteria:
- Loading state for pending query.
- Empty state when no gardens exist.
- Error state when request fails.

## Epic 3: Plant Lifecycle

US-05
As a user, I want to add a plant with minimal input so that planning is fast.
Acceptance criteria:
- Add flow works from planning screen.
- Invalid input shows feedback.

US-06
As a user, I want to move plants through statuses so that I can track progress.
Acceptance criteria:
- Lifecycle includes planning, growing, harvested.
- Harvest action updates list state.

## Epic 4: Reminders and Daily Execution

US-07
As a user, I want to see today's reminders so that I know what to do now.
Acceptance criteria:
- Today's reminders are clearly listed.
- Time display aligns with locale/timezone.

US-08
As a user, I want one-tap completion so that task execution is fast.
Acceptance criteria:
- Completing reminder updates UI immediately.
- Failure returns actionable feedback.

## Epic 5: Plant Library

US-09
As a user, I want to search and filter plants so that I can find care info quickly.
Acceptance criteria:
- Search input filters results.
- Group chips filter by category.
- Clear empty state for no matches.

US-10
As a user, I want plant details so that I can make better care decisions.
Acceptance criteria:
- Plant card opens detail view.
- Detail view can be closed reliably.

## Epic 6: Reliability and Data Safety

US-11
As a user, I want clear action outcomes so that I trust the app.
Acceptance criteria:
- Every key action provides success or error feedback.
- No dead interactions in core flows.

US-12
As a user, I want my data preserved through network changes so that work is not lost.
Acceptance criteria:
- Offline actions are not silently dropped.
- Sync behavior is predictable after reconnect.
