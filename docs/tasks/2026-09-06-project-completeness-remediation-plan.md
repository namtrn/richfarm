# Project completeness remediation plan — 2026-09-06

Status: locally actionable remediation implemented and verified on 2026-09-06.
Release evidence remains open. Durable offline favorites and propagation-label
changes remain conditional on their separate design/editorial approval gates.

Source audit:
[`2026-09-06-project-completeness-audit.md`](./2026-09-06-project-completeness-audit.md).

Baseline used by the source audit: `12d82f9`. The audit file and this plan are
working documents and are not release evidence. Re-verify the current branch
before implementation because the working tree or baseline may have changed.

## 1. Objective

Finish the existing Richfarm workflows before expanding product scope. The
remediation must produce:

1. useful and reproducible typecheck/test gates;
2. deterministic same-account mobile projection ordering;
3. consistent user-plant naming across existing workflows;
4. visible and recoverable favorite failures with an explicit offline contract;
5. CI evidence matching the checks used to claim completion;
6. project status records that distinguish source, development, staging, and
   production readiness;
7. approved bilingual propagation labels without changing stable codes.

This plan does not authorize production migration, deployment, publishing,
database deletion, or broad product expansion.

## 2. Planning principles

- Fix root contracts rather than patching individual screens or assertions.
- Keep application source in the typecheck; exclude only generated/native
  dependency trees.
- Never weaken a meaningful authorization, deletion, geography, identity, CRUD,
  or offline assertion merely to make a test green.
- Keep cross-account scope protection separate from same-scope request ordering.
- Distinguish a user plant instance name from a catalog/species name.
- Use idempotent desired-state commands for retryable favorite writes; replaying
  `toggle` is unsafe.
- Make CI call the same canonical verification entrypoint developers use.
- Preserve historical documents; mark superseded conclusions instead of
  rewriting history.
- Treat physical-device, provider, staging, and production checks as separate
  release gates.

## 3. Current evidence and root-cause map

The source audit reported:

- 63 Vitest files / 327 tests passing across mobile, dashboard, Convex, and
  shared packages;
- dashboard `tsc --noEmit` passing;
- mobile `tsc --noEmit` failing on generated files under `ios/Pods` and Hermes;
- API suite at 195 passed / 15 failed across five files.

The 15 API failures collapse into a smaller set of causes:

| Root-cause group | Affected tests | Current evidence | Planned response |
| --- | ---: | --- | --- |
| Direct SQL fixtures violate canonical identity triggers | 8 | One care migration test, six generic-data tests, and one reconciliation test fail with `CANONICAL_IDENTITY_REQUIRED` | Introduce canonical fixture builders; use a real legacy schema only where legacy behavior is the subject |
| Validation precedence changed | 1 | Invalid-pH test receives `CANONICAL_IDENTITY_INCOMPLETE` before the expected validation error | Supply valid identity when testing pH; separately retain an identity-validation test |
| Convex sync snapshot does not satisfy the current identity contract | 1 | Sync test expects 200 but receives 400 | Classify snapshot as invalid fixture or converter defect, then fix the correct layer |
| Hard-delete contract changed | 2 | Expected 204/older base-variant wording now receives canonical archive guard behavior | Separate authorization tests from domain-deletion tests and approve the new REST contract |
| Geography fixtures conflict with canonical identity rules | 3 | Expected 400/201 paths receive 409 | Give fixtures unique canonical identities and valid base/cultivar relationships; retain geography assertions |

## 4. Delivery sequence and gates

| Stage | Workstream | Entry gate | Exit gate |
| --- | --- | --- | --- |
| 0 | Baseline capture | Current branch identified | Clean, attributable verification log and failure inventory |
| 1 | Mobile typecheck boundary | Existing failure reproduced | Typecheck passes before and after native generation |
| 2 | API regression baseline | Exact 15 failures classified | Baseline API coverage and new regressions pass without weakened assertions |
| 3 | Canonical verification and CI | Local checks are green | Required CI jobs reproduce the agreed matrix |
| 4 | Projection ordering | Deterministic race test fails on old code | All refresh sources share one generation guard |
| 5 | Plant naming | Call-site inventory complete | Instance labels follow one tested fallback contract |
| 6A | Favorite reliability | Desired-state API and online-only interim behavior specified | Safe retry and visible failures verified |
| 6B | Durable favorites (conditional) | Offline scope and integration design approved | Persistence, ordering, recovery and isolation verified |
| 7 | Documentation reconciliation | Implementation evidence stable | One current status per package with separate release gates |
| 8 | Terminology alignment | Botanical labels approved | All consumers show approved labels; codes unchanged |
| 9 | External release evidence | Local/CI gates green | Required device, restart, multi-client, staging, and provider evidence recorded |

Stages 1 and 2 should be completed before CI enforcement so the first required
workflow has a green baseline. Stages 4–6 can be planned independently but
should not run overlapping edits in the same large mobile screens.

Track completion separately:

- **Local remediation complete:** Stages 0–5, 6A and 7 pass their implementation,
  automated verification and required CI gates. Until 6B is approved and complete,
  favorites explicitly require connectivity; offline controls explain this.
- **Release evidence complete:** Stage 9 evidence passes for the named release
  candidate. Production deployment/readback remains separately authorized and
  recorded; neither local completion nor staging evidence implies it occurred.

Stage 6B and Stage 8 have independent completion gates. Record deferred decisions
and whether they block the selected release; do not hold finished code packages
open solely because optional scope, editorial approval or devices are unavailable.

## 5. Stage 0 — Capture a trustworthy baseline

### Scope

- Record branch, HEAD, Node/npm versions, dependency-lock status, and worktree
  status.
- Preserve user-owned uncommitted changes.
- Re-run the smallest checks required to confirm the audit is still current.
- Run API test files in a configuration that avoids shared database/server
  interference; attribute environmental listen failures separately from product
  failures.

### Deliverables

- A failure inventory mapping each failure to fixture, behavior, or environment.
- Commands that will become the canonical local verification matrix.
- No production or device claims.

### Acceptance

- Every red check has a named owner layer: configuration, fixture, application
  behavior, or environment.
- Test totals and command lines are recorded.
- No unrelated file is modified.

## 6. Stage 1 — Restore mobile typechecking

### Root cause

`apps/mobile/tsconfig.json` includes TypeScript recursively and excludes only
`node_modules`. Expo native generation introduces third-party/generated `.ts`
files under `ios/Pods` and Hermes, so ordinary application typechecking parses
files the project does not own.

### Implementation

1. Prefer retaining broad TS/TSX inclusion with targeted exclusions for generated
   native dependency/build trees. Inventory owned code before changing the boundary:
   `app/`, `components/`, `hooks/`, `lib/`, `features/`, `types/**/*.d.ts`, root
   entrypoints such as `index.ts`, and root declarations/config source.
2. Exclude generated native dependencies and build output under `ios`, `android`,
   `dist`, and `coverage` as appropriate to the ownership inventory. Do not blindly
   exclude generated declarations required by Expo, including typed-route output
   under `.expo` when enabled. If an allowlist is chosen instead, enumerate every
   owned path above and validate it against the resolved TypeScript file list.
   Imported files may still enter the program regardless of include/exclude rules;
   an imported feature file passing is not proof the ownership inventory is complete.
3. Do not solve this with `skipLibCheck`; that option does not define the
   application ownership boundary.
4. Keep the existing `npm --prefix apps/mobile run typecheck` developer command.

### Verification

- Run typecheck with no generated native directories.
- Run or use an existing native generation, then run the same typecheck again.
- Introduce a temporary deliberate type error in owned application source and
  prove the command fails; remove it and prove the command passes.
- Confirm tests under owned source remain typechecked if that is the chosen
  repository policy.

### Acceptance

- The standard command passes both before and after an iOS/Android native build.
- Generated Pod/Hermes/CMake files are absent from TypeScript diagnostics.
- A real application type error still fails the command.

### Risk and rollback

The primary risk is an allowlist that accidentally omits owned code. Review the
resolved TypeScript file list during verification. Roll back only the config
change if an owned directory cannot be represented safely; do not exclude the
entire application or suppress diagnostics.

## 7. Stage 2 — Restore the API regression gate

### 7.1 Shared canonical fixture module

Create a focused test fixture module, for example
`apps/api/tests/fixtures/master-plant.ts`, responsible only for valid canonical
plant construction and insertion.

Proposed interface:

- `canonicalBaseIdentity(genus, species)`;
- `canonicalCultivarIdentity(base, cultivar)`;
- `buildCanonicalPlant(overrides)`;
- `insertCanonicalPlant(db, overrides)`;
- `buildCanonicalConvexPlant(overrides)`.

The helpers must use the production shared identity contract rather than
duplicating canonical-key normalization in tests.

### 7.2 Direct SQL fixture failures

Update generic-data setup and tests that merely need a foreign-key target to
insert a fully valid canonical plant. Do not make each test know every identity
column.

For care migration tests:

- a test of current-schema display-date behavior should use a valid current row;
- a test specifically exercising pre-canonical data must create a deliberate
  legacy clone/schema and run the migration under test;
- do not insert legacy-invalid rows through current-schema triggers.

For reconciliation tests, seed both SQLite and Convex representations with
explicit, matching identity evidence.

### 7.3 Validation precedence

The invalid-pH test must provide an otherwise valid plant, so it reaches the pH
rule. Retain a separate test proving an incomplete canonical identity returns
the intended identity error. This preserves both assertions instead of choosing
one by accident based on validation order.

### 7.4 Convex sync classification

Inspect the failing snapshot against the current import contract:

- If the snapshot genuinely lacks unambiguous genus/species/scope data, update
  the fixture and retain the 400 behavior in a dedicated invalid-snapshot test.
- If it contains sufficient structured identity but the converter ignores or
  misnormalizes it, fix the converter and add a regression test for the exact
  accepted shape.
- Do not silently re-enable scientific-name inference for new canonical writes.

### 7.5 Hard-delete contract

Separate three concerns in tests:

1. unauthenticated or insufficient-role deletion is rejected by authorization;
2. an admin still cannot hard-delete a canonical/referenced plant;
3. a deliberately deletable legacy/noncanonical unreferenced row follows the
   approved 204 contract, if such deletion remains supported.

Approve one stable error response for canonical deletion, preferably a machine
code plus human detail. Avoid assertions coupled only to old English wording.

### 7.6 Geography fixtures

Create unique base identities for unrelated pilot plants. Cultivars must carry a
valid parent canonical key and, where required, a parent row. Then retain the
original geography assertions:

- unknown active/archived adaptation terms;
- unrelated updates to a row already holding an archived term;
- distinct pilot origin/proven/adaptation semantics;
- omission versus explicit empty arrays;
- duplicate and malformed region rejection.

### Verification and acceptance

- Run each of the five previously failing files independently.
- Run the complete API suite after targeted files pass.
- All baseline tests remain meaningful and pass, together with new regressions.
  The audit count of 210 is a baseline, not a fixed final test total.
- Authorization, deletion, geography, CRUD, content migration, and canonical
  identity coverage remains present and meaningful.
- No production contract is changed solely to match stale fixtures.

## 8. Stage 3 — Establish canonical verification and CI enforcement

### Root cause

The repository has no single command defining a green change. The existing
GitHub workflow checks taxonomy only, and the dashboard Vite build is not a
TypeScript gate.

### Implementation

1. Add root scripts with clear responsibility:
   - `typecheck`: owned TypeScript projects;
   - `test`: deterministic automated test suites;
   - `verify`: secret-free typecheck, tests, builds, and local invariants required
     for a PR;
   - `verify:integration`: explicitly configured live taxonomy/integration checks.
2. Make dashboard verification run `tsc --noEmit` as an explicit step rather
   than relying on Vite transformation.
3. Add CI jobs by module boundary for readable failures:
   - mobile typecheck/tests;
   - dashboard typecheck/tests/build;
   - API build/tests;
   - shared and Convex tests/typecheck;
   - local taxonomy invariants within the relevant shared/Convex job.
4. Add an aggregate required job with explicit `needs` and `if: always()` so it
   evaluates failed dependencies. Require success from every mandatory job;
   failure, cancellation or unexpected skipping must make the aggregate fail.
   Avoid path filters that prevent this required status from being reported.
5. Pin the supported Node runtime, use the lockfile with `npm ci`, and document
   any environment variables.
6. Keep live taxonomy checks requiring deployment secrets in a separate integration
   workflow. Define eligible events and deployment targets; fork PRs still run all
   secret-free checks. Missing credentials on an eligible integration run must
   fail that run, not produce a false integration pass.
7. Configure the target branch ruleset/protection to require the aggregate status
   by its exact name and verify enforcement on a test PR. Record this repository
   configuration separately from the workflow commit. If permissions are unavailable,
   report enforcement pending rather than claiming a required gate exists.
   If merge queues are enabled, include the applicable `merge_group` trigger.

### Verification

- A deliberate owned-source type error fails the expected CI-equivalent command.
- A deliberate failing test fails the expected command.
- Failed, cancelled and unexpectedly skipped dependencies make the aggregate red.
- The target branch actually blocks a PR with a failing required aggregate.
- Missing optional deployment secrets do not incorrectly hide core verification.
- A missing required secret fails only the integration/deployment job that owns
  that dependency.

### Acceptance

- Local `verify` and the secret-free CI required matrix cover the same contracts.
- Live integration results are reported separately and required for the relevant
  release gate; missing secrets never suppress core PR verification.
- A PR cannot pass with a mobile/dashboard/API/shared/Convex failure.
- CI output identifies the failing module without searching one monolithic log.

## 9. Stage 4 — Unify projection refresh ordering

### Root cause

Cross-account safety and same-account request ordering are separate concerns.
The store rejects an obsolete scope/token, while subscription reads use a local
request counter. Foreground refresh bypasses that counter. The repository
already has `createScopedProjectionLoader`, but the coordinator duplicates part
of its responsibility instead of routing every refresh through it.

### Target design

```text
initial load ---------+
subscription update --+--> one scoped projection loader --> scope/token store guard
foreground refresh ---+
reconnect refresh ----+
```

- The loader owns same-scope request generation and disposal.
- Its accepted result is one `{ projection, outbox }` snapshot from the same load
  attempt. The current helper returns only a projection; extend its contract to
  carry the complete result rather than keeping outbox state in a mutable side channel.
- The store owns active scope/token validation and derived snapshot publication.
- No caller publishes a projection or error outside those two guards.

### Implementation

1. Create one scoped loader for the captured scope/token lifecycle.
2. Route initial, subscription, foreground, and reconnect reloads through its
   `reload()` method.
3. Dispose it when scope/token changes or the coordinator unmounts.
4. Extend the loader to guard the complete snapshot and both success/error
   callbacks. Derive hydration from the accepted outbox. Run photo-orphan cleanup
   only after the store accepts that request's scope/token and snapshot; superseded
   or disposed requests must not publish errors or initiate cleanup.
5. Remove duplicate request counters after all call sites use the shared loader.
6. Keep current account-transition masking and store checks intact.
7. Trace reconnect through existing sync triggers before adding a new subscription.
   Reuse the current trigger owner and avoid duplicate reloads for one logical event;
   retain refreshes necessary to observe new durable state.

### Deterministic tests

- Old foreground read resolves after a newer subscription read.
- Old foreground read rejects after a newer read succeeds.
- Two overlapping subscription reads resolve in reverse order.
- Account A read resolves after A → guest → B.
- Foreground event occurs during an account transition.
- Coordinator unmounts while a read is pending.
- Coordinator-level tests drive actual foreground/subscription callbacks, not only
  the pure helper. Assert projection, outbox and hydration reflect the winning read.
- Superseded reads perform no photo cleanup; accepted-read cleanup remains recoverable.
- Repeated foreground/reconnect transitions do not accumulate listeners or duplicate
  reloads. Assert bounded load counts for a controlled event sequence.

### Acceptance

- Only the newest active request for a scope may publish success or failure.
- Account A data never becomes visible in guest or Account B scope.
- Existing selector-reference preservation and outbox recovery tests remain green.

## 10. Stage 5 — Centralize plant naming semantics

### Root cause

Screens independently combine `nickname`, `displayName`, localized i18n rows,
and `scientificName`. This allows one user plant to show its nickname in Plant
Detail but its species/common name in Reminder, Home, Garden, Growing, or Bed.

### Domain contract

Create a pure naming module, for example `apps/mobile/lib/plantNames.ts`, with
two distinct interfaces:

- Instance name: trimmed nickname → localized common name → scientific name →
  translated unnamed-plant fallback.
- Catalog name: localized common name → scientific name → translated catalog
  fallback.

Locale matching should normalize language tags consistently and define the
English/first-row fallback policy once.

Transient form drafts remain local UI state. A screen preview may use
`trimmedDraft || getPlantInstanceName(savedPlant, ...)`, but the shared domain
helper must not read component state.

### Migration order

1. Add the pure helper and unit tests.
2. Replace Reminder picker, target label, and bed summary logic.
3. Replace Home reminder naming.
4. Replace instance labels in Garden, Growing, Bed, and Plant Detail.
5. Audit remaining call sites and classify each as instance or catalog before
   changing it.

Avoid a repository-wide textual replacement: catalog results must not display a
user nickname, and not every object carrying `displayName` is a user plant.

### Acceptance

- Two plants of the same species with different nicknames are distinguishable.
- Blank/whitespace nicknames fall back correctly.
- Rename updates all affected existing workflows.
- VI/EN switching uses the same fallback order everywhere.
- Offline cached data and reconnect do not unexpectedly replace a valid nickname.
- Catalog browsing behavior remains independent from user-instance naming.

## 11. Stage 6 — Make favorites recoverable and define offline behavior

### Root cause

`useFavorites` exposes a direct toggle mutation without pending/error/retry state,
and multiple screens swallow rejected promises. A retryable `toggle` is also
non-idempotent: replaying it after an ambiguous network outcome can reverse the
user's desired state.

### Phase A — Safe desired-state writes and visible failure

This is the required, independently deliverable reliability package. Until the
conditional durable package is complete, favorites explicitly require connectivity.

- Add `setFavorite(plantMasterId, desired)` to the authenticated backend and migrate
  remediation call sites before exposing retry. Repeating the same desired state
  must not invert a successful write. Preserve compatibility for existing clients
  using `toggle` while needed; do not implement retry by replaying that endpoint.
- Share per-account/per-plant pending state across hook consumers so two mounted
  screens cannot independently submit conflicting writes. Capture the desired
  value for retry instead of recalculating it from a potentially stale icon.
- Serialize writes for a plant and resolve ambiguous outcomes before allowing a
  newer conflicting intent. Define conflict behavior with another client; desired
  state alone does not prevent an older request from overwriting newer intent.
- Return pending/error/retry state, mask it on account transitions, and prevent
  duplicate interaction while pending. Roll back optimistic UI only on definitive
  rejection; reconcile ambiguous outcomes with server state.
- Disable offline interaction with localized explanation. Replace silent catches
  in Library index/detail and Plant Detail with visible failure and safe retry UI.

Phase A tests: rejection and successful retry; server-applied/lost-response replay;
concurrent consumers; late completion after account change; offline disabled state;
and icon/cache/server reconciliation. Acceptance: no silent failures, retry cannot
invert the desired value, and account-scoped UI accurately reflects the outcome.

### Phase B — Durable offline favorites (conditional package)

Durable offline support remains a product scope decision, not a prerequisite for
Phase A. Before implementation, approve a focused integration design covering:

- **Ownership:** the existing `EntityType` union has no favorite entity. Choose an
  extension of the existing sync contract or a separate queue boundary with a
  concrete rationale. Specify affected modules and avoid parallel ownership.
- **Full lifecycle:** persisted payload/schema validation and versioning, enqueue,
  execution, authenticated backend writes, optimistic projection, authoritative
  reconciliation, acknowledgement, retry/backoff, quarantine and recovery.
- **Ordering:** distinguish duplicate delivery from stale intent. Specify behavior
  when an older in-flight command arrives after a newer desired state, when a
  client restarts, and when two clients disagree. Define backend enforcement or
  serialization/reconciliation that proves the selected ordering contract.
- **Coalescing:** coalesce only commands safe to replace; never erase an in-flight
  command's identity or acknowledgement tracking. Use stable idempotency keys.
- **Scope:** account-scoped persistence, synchronous visible-state masking, guest
  behavior, logout/relogin and account-change cancellation/late-response handling.
- **Compatibility:** behavior for existing clients, stored queue versions, missing
  catalog plants and rollback without losing queued user intent.

Tests must cover offline → restart → reconnect, final desired state after several
intents, server-applied/lost-response replay, older in-flight delivery after newer
intent, two-client conflict policy, corrupt/unsupported persisted commands, and
Account A commands never affecting B. Surface pending-sync and needs-attention UI.

Acceptance: approved design implemented, lifecycle and ordering tests pass, and
icon/pending/error/eventual server state agree. Record Phase B as deferred until
its scope is approved; Phase A can be complete independently.

## 12. Stage 7 — Reconcile project and handoff evidence

### Target evidence model

Each work package should have one current record with:

| Field | Meaning |
| --- | --- |
| Source | Implementation exists at a named commit |
| Automated verification | Exact local/CI checks and results |
| Device/local integration | Simulator or physical-device evidence |
| Staging | Migration/readback/provider evidence |
| Production | Deployment and production readback evidence |
| Outstanding gates | Concrete remaining work |
| Historical references | Superseded plans/reviews retained by date |

### Required reconciliation

- Record that Markdown review inbox implementation commit `4c67f16` supersedes
  the older packaging instruction.
- Replace the stale geography mobile-excluded current statement with the verified
  mobile-display status while preserving the dated historical record.
- Mark the July mobile state review as historical/superseded where later scoped
  state work changed its premises.
- Do not convert development completion into staging or production completion.

`agent_docs/project_progress.md` and `agent_docs/latest_session_work.md` are
protected by repository workflow. Update them only in deployment state or when
the user explicitly requests those edits.

### Acceptance

- A reader can identify the current status without reconciling contradictory
  paragraphs manually.
- Every readiness claim points to exact evidence.
- Historical documents remain available and dated.

## 13. Stage 8 — Approve and align propagation terminology

### Decision table

Before changing localization files, review at least:

| Stable code | Current English | Current Vietnamese | Proposed decision required |
| --- | --- | --- | --- |
| `ground_layering` | Ground layering | Uốn cành | Confirm a precise botanical Vietnamese label, including whether “Chiết áp cành” is preferred |
| `bulb` | Bulb | Củ hành | Confirm general botanical term versus example-specific wording |
| `corm` | Corm | Thân hành | Confirm distinction from bulb/rhizome/tuber |
| `runner` | Runner | Cành bò | Confirm stolon/runner terminology for the intended audience |
| `offset` | Offset | Chồi bên | Confirm offset/pup terminology and scope |

### Implementation after approval

- Preserve stable codes and stored values.
- Update display translations only.
- Find all consumers of the shared propagation codes and verify the same label is
  used in filters, detail views, editor controls, and summaries.
- Add locale contract tests for supported languages and missing-key fallback.

### Acceptance

- Editorial approval is recorded.
- Stable codes do not change.
- Every consumer presents the approved label for the same code.

## 14. Stage 9 — External release evidence

Local source completion is insufficient for release readiness. After all local
and CI gates are green, separately verify:

- offline write → restart → reconnect;
- two clients editing/syncing the same account;
- Account A → guest → Account B isolation;
- SQLite migration rehearsal and restore procedure on staging data;
- approved content publication and readback from the serving projection;
- real iOS and Android push-provider delivery;
- foreground/background/terminated reminder behavior;
- staging health and, only after authorized deployment, production readback.

Record device, OS, app build, backend deployment, timestamp, steps, and observed
result for each gate. A simulator run must not be recorded as physical-device
provider evidence.

## 15. Maintainability boundaries during remediation

Large screens are a delivery risk but not a reason for a broad rewrite. Extract
only responsibilities directly touched by the remediation:

- projection lifecycle/order logic into the existing sync module;
- plant naming into a pure formatting module;
- favorite command state into its hook/service/outbox boundary;
- reminder-specific derived labels/controllers out of the screen when needed for
  testing.

Keep transient form state local. Do not introduce a new global state library or
split components into micro-files without a clear interface and test benefit.

## 16. Verification matrix

| Area | Required checks |
| --- | --- |
| Mobile config | Typecheck before and after native generation; deliberate owned-source type error fails |
| API | Five formerly failing files independently; complete baseline suite plus new regressions; API TypeScript build |
| Projection | Helper and coordinator reverse-resolution/late-error tests; whole-snapshot and cleanup guards; account transitions; bounded reload/listener counts |
| Naming | Pure helper unit tests plus Reminder/Home/Garden/Growing/Bed integration coverage |
| Favorites A | Desired-state rejection/retry/lost-response, concurrent consumers, offline explanation, account isolation |
| Favorites B (conditional) | Restart/reconnect, durable recovery, stale-intent ordering, two-client conflicts and account isolation |
| Dashboard | `tsc --noEmit`, tests, Vite build |
| Shared/Convex | Existing tests and typecheck/invariant commands |
| CI | Type/test failures and failed/cancelled/skipped dependencies make aggregate red; branch rules enforce it; live integration separate |
| Release | Device, multi-client, restart, staging migration/restore, provider delivery, readback evidence |

## 17. Completion checklist

### Local remediation

- [ ] Current baseline and environment recorded.
- [ ] Mobile typecheck excludes generated native dependencies and includes all
      owned application code.
- [ ] Baseline API tests and new regressions pass with meaningful assertions retained;
      record the final total rather than requiring exactly 210.
- [ ] Root `verify` command represents the agreed repository gate.
- [ ] Required secret-free CI matrix enforces mobile, dashboard, API, shared,
      Convex and local invariants; target branch rules require its aggregate.
- [ ] Every projection refresh path uses one same-scope ordering mechanism.
- [ ] Late success and late error races are covered deterministically.
- [ ] User-plant instance and catalog naming contracts are separated and tested.
- [ ] No favorite call site swallows failures.
- [ ] Favorite desired-state retry is safe; interim online-only behavior is explicit.
- [ ] Progress/handoff records distinguish source, dev, staging, and production.

### Independent conditional/editorial packages

- [ ] Durable favorites scope/design approved, or explicitly deferred with release impact.
- [ ] If approved, durable favorites ordering, recovery and lifecycle gates pass.
- [ ] Propagation labels are editorially approved and stable codes preserved, or
      approval remains explicitly pending with release impact recorded.

### Release evidence

- [ ] Live taxonomy/integration checks pass against the named release target.
- [ ] Required external/device/release evidence is recorded before declaring
      release readiness.

## 18. Explicit non-goals

- A broad mobile state-management rewrite.
- New major product features.
- Canonical propagation detail pages before existing workflows are complete.
- Broad care-content expansion before publication and release gates are closed.
- Silencing TypeScript, removing assertions, or accepting failures as a new
  baseline.
- Claiming production readiness from local tests, commit counts, or simulator
  screenshots alone.

## 19. Recommended implementation packages

For reviewable changes, use the following package boundaries:

1. Mobile typecheck boundary and regression proof.
2. API canonical fixture infrastructure plus direct-insert migrations.
3. API behavior-contract corrections and complete green suite.
4. Root verification scripts and CI matrix.
5. Projection ordering guard integration and deterministic tests.
6. Plant naming contract and Reminder/Home migration.
7. Remaining user-plant label consumers.
8. Favorite desired-state backend, safe retry and visible-failure phase.
9. Evidence/status reconciliation, completing the local remediation track.
10. Favorite durable outbox integration design and implementation, if approved.
11. Approved propagation terminology update.
12. External release-evidence execution.

Each package should state its own exact acceptance commands and should not claim
later packages complete.
