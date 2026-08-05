# Phase 2.5 — Push Delivery and Reminder Reliability

**Planned:** 2026-07-30
**Status:** Implementation reviewed; source fixes and physical/staging gates open
**Scope:** Complete the Phase 2 reminder delivery path on real devices without
changing Phase 1.5 synchronization contracts or expanding the Library catalog.

## Objective

Prove that an activated user-plant care reminder reaches the user through an
iOS system push notification while RichFarm is foregrounded, backgrounded,
terminated, or the device is locked. Notification delivery, batching, routing,
token lifecycle, retry, and duplicate prevention must be observable and
repeatable in development.

Phase 2.5 hardens delivery around the Phase 2 care-plan/reminder domain. It does
not introduce generic care intervals, mutate Library data, replace the existing
sync-v2 engine, or enable a production rollout.

## Current state

- Mobile uses `expo-notifications` to request permission and obtain an Expo push
  token on physical devices.
- Authenticated device tokens are stored in Convex.
- Convex cron invokes `internal.notifications.sendDueReminders` every minute.
- Due care reminders are grouped by local day and preferably Garden/Bed before
  being sent through the Expo Push API.
- Foreground presentation requests banner, notification-list, and sound.
- The current development trigger is available from the app and through a
  gated Convex CLI action; both paths advance a reminder through the normal
  revisioned dispatch semantics.
- Simulator verification covers in-app due state, offline outcome, restart,
  reconnect, and Activity idempotency, but it cannot prove Expo/APNs delivery
  because the app does not register an Expo push token on a simulator.

### Review findings — 2026-08-03

The original five source findings were re-reviewed after implementation and
are now closed by code and regression tests: per-token retry isolation,
same-account token re-registration after logout, provider unknown
reconciliation, development token observability, and explicit stale-occurrence
policy. The root-mounted `useNotifications` hook now invalidates its
`user:token` registration cache when auth/device scope is torn down or changed,
so logging back into the same account with the same token re-registers it after
the server token was deactivated.

Physical-device, provider, staging, and Phase 1.5 operational evidence remain
open. The local simulator smoke suite is not a substitute for those gates.

See `docs/tasks/2026-08-03-phase-2-5-push-delivery-completion-task.md` for the
required fixes and evidence matrix.

The current external execution packet is
`docs/tasks/2026-08-04-phase-1-5-to-2-5-external-validation-runbook.md`.

### Local verification addendum — 2026-08-04

Mobile typecheck and 22 mobile test files / 85 tests pass; Convex typecheck and
7 Convex test files / 62 tests pass; API build, API 2 files / 16 tests under
Node 24.13.0, dashboard build, iOS export, and `git diff --check` pass. The
README iOS Maestro suite passed all 9 default flows on iPhone 17 / iOS 26.2.
The simulator showed `hook=unsupported permission=unsupported token=none`, so
physical iOS/Android delivery, Expo/APNs/FCM receipts, staging migration and
schema evidence, two-client isolation, observation metrics, and rollout
approval remain OPEN.

## Required implementation

### 1. Development-only server trigger

Add an explicitly development-only Convex command that can run independently
of the mobile process.

- Reject production or any deployment without the dedicated test gate.
- Require authenticated account ownership.
- Accept a reminder ID or user-plant ID and operate only on that user's data.
- Advance the selected reminder to due through existing reminder/domain
  semantics.
- Optionally invoke the normal notification dispatcher immediately so tests do
  not depend on the one-minute cron boundary.
- Do not bypass batching, `lastNotifiedAt`, recurrence, revision, receipt, or
  idempotency behavior.
- Return structured evidence: selected reminder, batch key, active-token count,
  attempted-message count, accepted Expo tickets, and rejection reasons.

The existing debug UI may call this command, but the same command must be
callable from the development CLI while the app is backgrounded or terminated.

### 2. Token registration and observability

- Preserve physical-device-only Expo token registration.
- Surface development registration failures instead of silently swallowing
  them.
- Provide a safe debug status showing permission state, registration state,
  platform, device identity, last registration time, and masked token.
- Retry registration on app start, permission transition, token rotation, and
  reconnect without creating duplicate active token rows.
- Ensure account switch/sign-out cannot associate an old account's token with
  the new active scope.

### 3. Expo ticket and receipt lifecycle

- Persist or otherwise observe Expo ticket IDs for development verification.
- Fetch Expo receipts after the appropriate delay.
- Deactivate tokens that return `DeviceNotRegistered`.
- Distinguish provider acceptance from confirmed receipt delivery.
- Define exactly when `lastNotifiedAt` advances.
- Do not mark unrelated reminders notified merely because one message or chunk
  was accepted.
- Retrying a timeout or repeated cron invocation must not produce duplicate
  user-visible notifications for the same scheduled occurrence.

### 4. Notification navigation

- Register notification-response listeners for warm/background launches.
- Read the last notification response during cold start.
- A single reminder routes to the relevant user plant/reminder context.
- A batched notification routes to the Reminder screen with the relevant batch
  or reminder IDs available.
- Defer navigation until authentication, account scope, and router state are
  ready.
- Reject stale, deleted, tombstoned, or wrong-account notification payloads
  safely.
- Repeated response delivery must not push duplicate routes.

### 5. Delivery semantics

- Preserve friendly, non-coercive condition-check language.
- Preserve per-day and Garden/Bed batching.
- Keep in-app reminders individually actionable.
- Foreground, background, terminated, and locked-device delivery must share the
  same server occurrence identity.
- A dismissed push notification must not record watering, fertilizing, or any
  performed outcome.
- Completing an in-app reminder after receiving a push must retain Phase 2
  atomic/idempotent Activity behavior.

## Failure modes to cover

- notification permission denied, provisional, and later enabled;
- no Expo project ID or invalid APNs/EAS configuration;
- token registration network failure;
- stale or rotated token;
- `DeviceNotRegistered`;
- Expo request timeout after provider acceptance;
- partial success within a batch or 100-message chunk;
- two cron/trigger executions for the same occurrence;
- app terminated before token registration completes;
- notification tapped before auth/scope/router hydration;
- account switch after notification delivery;
- reminder completed, disabled, deleted, or snoozed before notification tap;
- multiple active devices for one account;
- one device offline while another completes the reminder.

## Verification matrix

Use a signed development build on a physical iPhone. Record the device model,
iOS version, build commit, Expo project, and Convex development deployment.

1. **Permission and token**
   - Grant permission.
   - Confirm an active masked token is registered for the expected account and
     device.

2. **Foreground**
   - Trigger one care reminder from Convex.
   - Verify banner/list/sound according to foreground policy.
   - Verify one notification for one occurrence.

3. **Background**
   - Put RichFarm in the background and use another app.
   - Trigger from Convex.
   - Verify system banner and sound.
   - Tap and verify routing to the correct plant/reminder.

4. **Terminated**
   - Force-close RichFarm.
   - Trigger from Convex.
   - Verify system notification arrives without the mobile process running.
   - Tap, cold-start, restore account scope, and route correctly.

5. **Locked device**
   - Lock the device.
   - Trigger from Convex.
   - Verify lock-screen presentation and post-unlock routing.

6. **Batching**
   - Make multiple reminders due for the same day/Garden/Bed.
   - Verify one friendly aggregate push and individually actionable in-app
     tasks.

7. **Idempotency**
   - Run the dispatcher again for the same occurrences.
   - Verify zero duplicate pushes.
   - Complete one reminder and verify exactly one semantic Activity.

8. **Permission and token failures**
   - Deny permission, then enable it in System Settings.
   - Exercise a stale/unregistered test token.
   - Verify safe UI feedback, retry, and token deactivation.

9. **Multi-device/account safety**
   - Where a second real device is available, verify both active tokens receive
     the intended notification and no account data leaks across sign-out or
     account switch.

## Repository verification

- mobile and Convex typechecks;
- mobile and Convex unit/integration tests;
- API tests and build;
- dashboard production build;
- `git diff --check`;
- iOS export and signed development build;
- native physical-device flows above;
- exact Expo ticket/receipt and Convex evidence.

## Definition of done

- Convex can deterministically trigger a development reminder while RichFarm is
  not running.
- A physical iPhone receives the expected push in foreground, background,
  terminated, and locked states.
- Notification taps route safely for warm and cold starts.
- Batching and retry do not create duplicates.
- Permission and token failure states are observable and recoverable.
- Push dismissal never creates a performed care outcome.
- Phase 1.5 revision, tombstone, idempotency, restart, account-scope, and
  multi-device contracts remain intact.
- Documentation distinguishes repository PASS from physical-device, Expo/APNs,
  staging, Android, and multi-device evidence.

## Explicit non-goals

- Production deployment or mutation.
- Enabling a legacy cutoff.
- Phase 3 Library catalog/quality expansion.
- Claiming Android, staging, two-device, or APNs delivery PASS without direct
  evidence.
