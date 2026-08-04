# Phase 2.5 — External Gate Review

Date: 2026-08-04
Related task: `2026-08-03-phase-2-5-push-delivery-completion-task.md`
Status: **SOURCE PASS — ALL EXTERNAL RELEASE GATES OPEN**

## Review conclusion

The Phase 2/2.5 source findings are closed and the local verification record is
green. This review found no new source-level P1/P2 finding. The repository does
not contain evidence that the external Phase 2.5 release gates have passed, so
Phase 2.5 must not be marked release-complete or approved for rollout yet.

## Gate-by-gate status

| Gate | Status | Evidence currently available | Missing evidence / prerequisite |
|---|---|---|---|
| Staging schema, audit, backup, interruption/resume, restore/rollback | **OPEN** | Source migration/audit code and the Phase 1.5 runbook exist; no staging deployment or external migration record is present in the working tree. | Staging Convex deployment, pre-change snapshot, paginated audit, additive-domain schema check, interrupted/resumed run, second-pass idempotency, restore/rollback rehearsal, and old/new read equivalence. |
| iOS physical device | **OPEN** | iOS export and simulator-oriented source/test evidence are recorded. The current shell session has no reported physical iOS device. | Signed development build, device model/iOS version, token registration, foreground/background/terminated/locked delivery, tap routing, and captured logs/screenshots. |
| Android physical device | **OPEN** | Android notification permission/configuration exists in source. No Android device bridge is available in the current shell session, and no physical Android evidence is recorded. | Android signed/dev build, FCM/EAS credential setup, Android 13+ permission flow, foreground/background/terminated/locked delivery, and tap-routing evidence. |
| Expo/APNs/FCM provider delivery | **OPEN** | Source uses `expo-notifications`, Expo tickets/receipts, retry, reconciliation, and `DeviceNotRegistered` handling. | A real Expo project/deployment with provider credentials, ticket and receipt records, APNs delivery on iOS, FCM delivery on Android through the Expo/EAS path, timeout/partial-failure evidence, and redacted dispatch evidence. |
| Multi-client offline/account isolation | **OPEN** | Local sync and dispatch unit/integration tests pass. | Two independent authenticated clients, offline/restart/reconnect matrix, mixed-device push outcomes, Account A → guest → Account B isolation, delayed response rejection, receipts/revisions/tombstones, and screenshots/logs. |
| Rollout approval | **OPEN** | No production deployment or rollout mutation was performed. | Completed staging/native/provider/multi-client evidence, independent read-only audit, named rollback owner, go/no-go decision, and explicit approval record. |

## What was verified locally

- Mobile typecheck: PASS.
- Mobile Vitest: 19 files / 70 tests PASS.
- Convex typecheck: PASS.
- Convex Vitest: 6 files / 51 tests PASS.
- `git diff --check`: PASS.
- The development-only Convex trigger is exposed as
  `triggerCareReminderForDevelopment` and is documented as callable with
  `convex run`; it remains gated by development environment and a dedicated
  token.
- The mobile app is configured with `expo-notifications` and Android
  `POST_NOTIFICATIONS`, but provider credentials and real delivery cannot be
  established by repository tests.

## Required next evidence run

1. Deploy the current source to an isolated staging Convex/Expo environment and
   capture the Phase 1.5 migration/audit/rollback artifacts before any real
   push test.
2. Produce signed iOS and Android development builds with the correct Expo/EAS
   project and provider credentials.
3. Run the Phase 2.5 physical-device matrix from the completion task, recording
   device/build/deployment identifiers, provider ticket/receipt IDs, and
   redacted screenshots/logs.
4. Run the two-client offline/restart/reconnect and account-isolation matrix
   against the same staging deployment.
5. Obtain independent audit and named-owner rollout approval only after all
   preceding artifacts pass.

Until these artifacts exist, the accurate status is: **source PASS, external
delivery/release OPEN**.
