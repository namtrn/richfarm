# Phase 2 — Local Release Evidence

Date: 2026-08-03
Related task: `2026-08-03-phase-2-release-completion-task.md`
Repository HEAD during verification: `d06cf469820cb2d3839b5b04fbdc58c822a3045c`
The implementation and evidence updates are uncommitted working-tree changes;
no commit, deployment, or external migration was created by this task.

## Source implementation verified

- Care-plan interval normalization accepts only positive finite Library values
  and clamps valid sub-day values to a one-day schedule.
- Reminder outcomes reject disabled, inactive-plant, and stale-occurrence
  payloads before creating an Activity or outcome.
- Push dispatch has durable token-specific reservations, stable occurrence and
  dispatch keys, Expo ticket/receipt state, retryable versus unknown request
  handling, partial-ticket handling, `DeviceNotRegistered` deactivation, and
  mixed multi-device retry isolation independent of `lastNotifiedAt`.
- Successful receipt state advances only the matching reminder occurrence;
  the sync dataset-change signal is emitted for every affected account.
- Unknown dispatches have a development-gated provider-ticket/receipt
  reconciliation path plus explicit operator retry/permanent-failure
  resolution, and redacted dispatch evidence.
- Sign-out deactivates the authenticated device's token before auth scope
  changes; the root-mounted mobile hook invalidates its registration cache on
  account/device scope teardown or change, so same-account logout/login
  re-registers the token.
- A development-only authenticated trigger accepts a reminder or user-plant
  selector and returns selected occurrence, batch, token, ticket, and reason
  evidence. It rejects production and missing/wrong trigger gates.
- Mobile registration reports permission/provider failures, retries on app
  activation and reconnect, scopes registration by account, and handles token
  rotation.
- Development UI exposes permission, registration status/error, last attempt,
  device/platform, and masked token status.
- Phase 2 occurrence keys are mandatory at sync/direct outcome boundaries;
  legacy omission is accepted only with explicit `legacyCompatibility: true`.
- Warm and cold notification responses wait for auth-scoped projection hydration;
  single and batched payloads route to Reminder, while stale/deleted/
  wrong-account payloads are dropped. Routing and response-key deduplication
  have direct unit coverage.

## Local verification

| Check | Result | Command/context |
|---|---|---|
| Mobile typecheck | PASS | `npm --prefix apps/mobile run typecheck` |
| Mobile Vitest | PASS — 19 files, 70 tests | `npx vitest run apps/mobile` |
| Convex typecheck | PASS | `npm run typecheck --workspace @richfarm/convex` |
| Convex Vitest | PASS — 6 files, 51 tests | `npx vitest run packages/convex/convex` |
| API Vitest | PASS — 2 files, 16 tests | Node 24.13.0 / `better-sqlite3` ABI 137; ephemeral localhost socket permission granted for the run |
| API build | PASS | `npm run api:build` |
| Dashboard build | PASS | `npm run dashboard:build` |
| iOS export | PASS | `cd apps/mobile && npx expo export --platform ios --output-dir /tmp/richfarm-phase-2-ios-findings-fixed` |
| Diff whitespace check | PASS | `git diff --check` |

The API test must use the checked-in Node 24-compatible native
`better-sqlite3` binary; the default Node 26 runtime reports an ABI mismatch.
The iOS export must run from `apps/mobile` so Metro resolves the workspace
mobile dependencies. No deployment or external service was mutated by these
checks.

## Source review findings — 5 closed, 0 open

All five Phase 2/2.5 source findings are fixed and covered by the mixed-device,
sign-out/rebind, same-account logout/login cache, unknown reconciliation,
development status, and occurrence-policy regression tests. External delivery
and release gates remain open as well.

## Gates still open

These source checks do not close the release gate:

- staging additive-schema deployment, migration audit, backup, interruption /
  resume, restore / rollback, and no-backfill verification;
- Phase 1.5 operational gate, 100-operation observation window, and
  independent audit;
- iOS and Android physical-device journeys, including background, terminated,
  and locked-device behavior;
- direct Expo/APNs provider delivery evidence, permission transitions, and
  multi-device delivery;
- two-client offline/restart/reconnect and Account A → guest → Account B
  isolation evidence;
- production rollout approval.

Until those records exist, repository source verification is PASS but staging,
native, provider, multi-client, and production release status remain OPEN.
