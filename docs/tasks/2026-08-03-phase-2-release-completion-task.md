# Phase 2 — Care Plan and Reminder Release Completion

Date: 2026-08-03
Status: **SOURCE FINDINGS CLOSED — STAGING/NATIVE/PUSH GATES OPEN**
Depends on: Phase 1.5 operational gate
Push dependency: Phase 2.5 for production-quality reminder delivery

Implementation update — 2026-08-03: source work for reminder outcome guards,
per-token push retry isolation, unknown dispatch reconciliation, development
observability, stale-occurrence policy, same-account token re-registration,
and warm/cold response routing is locally verified. This does not claim
staging, physical-device, provider, multi-client, or production PASS.

## Objective

Move the care-plan and reminder implementation from locally verified source to
a release-ready feature with staging, multi-client, native, and delivery
evidence.

Phase 2 already contains versioned care-plan snapshots, deterministic reminder
activation, explicit outcomes, sync-v2 domains, offline projection, restart
recovery, and Activity idempotency. The remaining work is proving those
contracts outside the local test environment and completing reminder delivery.

## Phase 1.5 review update — 2026-08-03

The Phase 1.5 source verification passes its new migration, queue, guest-claim,
runtime-metrics, and durable-recovery tests. The operational gate remains open
for staging, native, two-client, and independent-audit evidence. The shared
outbox now preserves corrupt payloads and exposes recovery state locally; Phase
2 must continue to treat that state as recovery-required rather than an empty
healthy queue.

The current migration tool audits the original six domains only: Garden, Bed,
Plant, Activity, Harvest, and Photo. Phase 2 care plans, reminders, and reminder
outcomes are additive domains and do not require legacy backfill when their
tables are new and empty. Staging verification must therefore:

- verify the three additive tables, indexes, validators, and empty/legacy-row
  policy;
- preserve legacy custom reminders without destructive migration; and
- extend `syncMigration` before attempting any backfill if staging already
  contains care-plan, reminder, or outcome rows that need migration.

## Phase 2 review findings — 2026-08-03

All five source findings below are fixed and regression-tested. External
staging/native/provider/multi-client gates also remain open:

1. **CLOSED — P1 multi-device retry isolation.** `lastNotifiedAt` is now a
   summary only; unresolved token-specific dispatch rows keep their own retry
   path. Mixed receipt outcomes are covered by Convex tests.
2. **CLOSED — P1 same-account re-login registration.** The profile deactivates
   the current device's tokens on sign-out, and the root-mounted
   `useNotifications` hook now invalidates `lastRegistrationRef` whenever its
   account/device scope is removed or changes. Logging back into the same
   account with the same token therefore calls `registerDeviceToken` again.
   The logout/login cache regression test passes.
3. **CLOSED — P1 unknown reconciliation.** A development-gated action resolves
   provider ticket/receipt evidence or requires explicit operator retry/failure,
   with redacted status query evidence.
4. **CLOSED — P2 development observability.** Permission, hook state, failure,
   retry timestamp, device/platform, and masked token state are visible in the
   development status surface and tested.
5. **CLOSED — P2 stale occurrence policy.** Phase 2 reminders require a current
   `occurrenceKey`; legacy omission requires explicit `legacyCompatibility` and
   is regression-tested at sync and direct mutation boundaries.

The remaining push-specific implementation and evidence requirements are handed off to
[the Phase 2.5 completion task](2026-08-03-phase-2-5-push-delivery-completion-task.md).
Phase 2 is source/test green; its completion gate stays open for external
staging/native/provider/multi-client evidence.

## Already implemented locally

- Immutable-by-version care-plan source snapshots.
- Trustworthy Library-derived values without invented generic schedules.
- Planning drafts and Growing activation with deterministic reminder IDs.
- Lifecycle stop for harvested/archived plants.
- Performed, checked, snoozed, skipped, edited, disabled, and deleted outcomes.
- Atomic reminder outcome, Activity, and plant-snapshot behavior.
- Offline outcome projection, restart persistence, reconnect retry, and
  duplicate prevention at the sync command level.
- Local typechecks, Convex/mobile tests, API build, dashboard build, iOS export,
  and a real-account iOS Simulator journey.

## Required work

### 1. Staging and additive-domain rollout

- Deploy `userPlantCarePlans`, care-plan reminder metadata, and
  `reminderOutcomes` to staging.
- Run migration audit, backup, interruption, restore, and rollback checks for
  the original Phase 1.5 domains. For the three new additive domains, verify
  schema/index deployment and the documented no-backfill policy; extend the
  migration tooling first if legacy rows exist.
- Confirm legacy custom reminders continue to work unchanged.
- Confirm no destructive backfill or legacy cutoff is enabled by default.

### 2. Care-plan correctness matrix

- Add Plant in Planning; verify a draft plan creates no active reminders.
- Move the same Plant to Growing; verify one activation and no duplicate rows.
- Verify only positive finite Library values create schedules.
- Change Library content after activation; verify the existing plan snapshot is
  unchanged.
- Edit overrides; verify a new plan version supersedes the prior version.
- Verify timezone and DST recurrence behavior, including invalid timezone fallback.
- Verify snooze changes only the current occurrence and does not rewrite cadence.
- Verify performed/check/skip create only the semantically correct Activity.
- Verify timeout/retry returns one receipt and one Activity.
- Verify deleted, disabled, archived, and stale reminders cannot create outcomes.

### 3. Offline and multi-client reminder verification

- Complete a reminder offline, restart twice, reconnect, and verify one
  authoritative outcome and one Activity.
- Corrupt the local outbox/preferences payload and verify recovery state is
  preserved and surfaced instead of rendering an empty healthy queue.
- Run the same outcome on two clients and verify revision/operation handling.
- Complete, snooze, disable, or delete a reminder before tapping an old push;
  the stale action must be harmless.
- Switch Account A → guest → Account B while reminder operations are pending;
  no reminder or outcome may cross scopes.
- Verify Home, Reminder, and Plant Detail converge without duplicate due rows.

### 4. Native UX and release evidence

- Run Add Plant → review care plan → activate → resolve outcome on iOS and
  Android.
- Verify offline/restart/reconnect behavior on both platforms.
- Verify all outcome copy remains friendly and non-coercive in six locales.
- Record exact device, build, deployment, commit, and test evidence.
- Mark repository PASS separately from staging, push, Android, and multi-device
  PASS.

### 5. Push handoff

Phase 2 is not release-complete until the Phase 2.5 task proves the delivery
path. The care-plan domain must provide a stable occurrence identity to push
dispatch, notification routing, deduplication, and outcome validation.

## Known release risks

- Phase 1.5 staging and two-client gates are still open.
- Real Expo/APNs delivery has not been observed.
- Android and two independent real clients have not completed the full matrix.
- A local Simulator journey does not prove background, terminated, or locked
  delivery.

## Verification commands

```sh
npm --prefix apps/mobile run typecheck
npx vitest run apps/mobile
npm run typecheck --workspace @richfarm/convex
npm --prefix apps/api test
npm run api:build
npm run dashboard:build
(cd apps/mobile && npx expo export --platform ios --output-dir /tmp/richfarm-phase-2-ios)
git diff --check
```

## Definition of done

- Phase 1.5 operational gate is independently PASS.
- Phase 1.5 durable-state recovery finding is fixed and regression-tested.
- Staging additive-domain deployment and the documented no-backfill or
  extended-migration rollback policy are PASS.
- Care-plan lifecycle, recurrence, outcomes, retry, deletion, and account
  isolation pass on two clients.
- iOS and Android native journeys pass.
- Phase 2.5 push delivery and routing are PASS.
- Documentation distinguishes source, simulator, staging, push, Android, and
  multi-device evidence.

## Explicit non-goals

- Expanding or rewriting the Plant Library catalog.
- Inventing care intervals when Library data is missing.
- Enabling production rollout before the Phase 1.5 and Phase 2.5 gates pass.

## Current source addendum — 2026-08-04

The remaining local implementation gaps are closed and regression-tested:

- `syncV2` derives the canonical care-plan task set from trusted Library values,
  applies validated per-task overrides, and rejects in-place task edits so a
  new plan version is required;
- mobile initial reminder creation uses the shared DST-aware local-calendar
  recurrence helper;
- notification routing rejects provider payloads whose occurrence key is no
  longer the current reminder occurrence;
- Profile permission changes notify the root registration hook, in addition to
  app activation, reconnect, and Expo token-rotation retries.

Local source verification is current at mobile 22 files / 85 tests and Convex
7 files / 62 tests. The README iOS Maestro suite also passed all 9 default
flows on iPhone 17 / iOS 26.2; simulator push status was unsupported with no
token, so this is not physical-device delivery evidence. The [external validation runbook](2026-08-04-phase-1-5-to-2-5-external-validation-runbook.md)
contains the still-open staging, physical-device, provider, two-client, and
rollout steps. Phase 2 remains source-ready but not externally release-ready.
