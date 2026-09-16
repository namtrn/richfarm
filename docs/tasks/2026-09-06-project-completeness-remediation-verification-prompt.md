# AI verification prompt — Project completeness remediation

You are an independent senior engineer reviewing the current Richfarm working
tree. Treat all plans, progress notes, summaries, comments, and test names as
claims to verify, not as trusted evidence.

Repository:

`/Users/n/Documents/GitHub/richfarm`

Primary references:

- `AGENTS.md`
- `docs/tasks/2026-09-06-project-completeness-audit.md`
- `docs/tasks/2026-09-06-project-completeness-remediation-plan.md`
- `agent_docs/project_progress.md`
- `agent_docs/latest_session_work.md`

Baseline identified by the remediation package: `12d82f9`.

## Objective

Independently determine whether the locally actionable remediation is correct,
complete, meaningfully tested, and accurately documented. Review the complete
working-tree diff against the baseline and inspect surrounding production code,
not only changed tests.

This is a read-only verification task. Do not edit files, install dependencies,
commit, push, open a PR, deploy, change GitHub settings, mutate databases, or
call live providers. Preserve all existing user changes.

## Required review areas

### 1. Mobile TypeScript ownership

Verify that `apps/mobile/tsconfig.json`:

- retains every owned application path, including `app`, `components`, `hooks`,
  `lib`, `features`, declarations, and the root entrypoint;
- excludes generated native/build/coverage dependencies without hiding owned
  code;
- produces a useful application typecheck before and after native generation.

Inspect the resolved TypeScript file list rather than relying only on `include`.

### 2. API baseline and canonical fixtures

Review all API test changes and the shared canonical fixture helper. Confirm:

- fixtures use the production canonical identity contract;
- base/cultivar and parent canonical keys are valid;
- invalid-pH, authorization, CRUD, migration, geography, hard-delete, and
  reconciliation assertions still test their intended production contracts;
- reconciliation retains a successful matching-identity/zero-drift path;
- reconciliation fails closed and rolls back newly upserted rows when a stale
  canonical mirror cannot be deleted;
- the reviewed reconciliation path removes only stale, unreferenced,
  alias-free, noncanonical legacy mirror rows while ordinary API hard deletes
  remain fail-closed;
- no production behavior was weakened merely to make stale fixtures pass.

Run targeted files and the full API suite. The historical 210 count is a
baseline, not a fixed target, but every meaningful baseline test must remain.

### 3. Canonical local verification and CI

Inspect root scripts, dashboard scripts, `.nvmrc`, and both workflows. Confirm:

- `npm run verify` is secret-free and represents the local required gate;
- mobile, dashboard, API, shared, Convex, and local taxonomy invariants are
  covered with readable module boundaries;
- dashboard runs explicit TypeScript checking as well as tests/build;
- the aggregate `Required Verification` job uses `if: always()` and fails for
  failed, cancelled, or unexpectedly skipped dependencies;
- PRs and merge queues receive the aggregate status without path-filter gaps;
- credential-dependent live taxonomy verification is separate, and missing
  required credentials fail only that eligible integration run.

Do not claim branch protection is enforced from YAML alone. GitHub ruleset
configuration and a deliberately failing test PR are external gates.

### 4. Projection refresh ordering

Trace initial load, authoritative-projection subscription, queue subscription,
foreground refresh, reconnect behavior, scope transitions, error publication,
and photo cleanup. Confirm:

- one scoped loader guards the complete `{ projection, outbox }` result;
- only the newest active request can publish success or error;
- hydration is derived from the accepted outbox;
- cleanup runs only after the scope/token store accepts the winning snapshot;
- disposed, superseded, or Account A reads cannot affect guest/Account B;
- no duplicate AppState/NetInfo listeners or redundant refresh sources were
  introduced.

Require coordinator-level coverage of real subscription/foreground callbacks,
stale success/error, disposal, A → guest → B, winning outbox/hydration, cleanup,
and bounded listener/load behavior. Distinguish proven cases from remaining
device/reconnect evidence.

Do not accept helper-only tests as coordinator evidence. Confirm the production
component actually delegates scope activation and AppState transitions through
the tested lifecycle boundary.

### 5. Plant naming semantics

Verify that the pure naming module has two separate contracts:

- instance: trimmed nickname → localized common name → scientific name →
  translated fallback;
- catalog: localized common name → scientific name → translated fallback,
  never nickname.

Check locale, Home, Garden, Growing, Bed, Plant Detail, and Explorer user-plant
labels. Audit other changed and unchanged call sites and flag any user-instance
workflow still ignoring nickname. Ensure catalog/library browsing semantics were
not accidentally changed.

### 6. Favorites Phase A

Review the Convex mutation, shared mobile state, hook, UI call sites, tests, and
locales. Confirm:

- `setFavorite(plantMasterId, desired)` validates arguments and return values,
  authenticates, uses the existing index, and is idempotent for replay;
- legacy `toggle` compatibility remains available but retry never calls it;
- writes are shared and ordered per account/plant across hook consumers;
- newer intent is not silently dropped, and desired state is not recalculated
  only from a stale remote icon;
- pending state disables duplicate interaction while account/offline taps still
  produce reachable localized explanations;
- rejection shows visible retry, and retry preserves the captured desired state;
- late results and state are isolated across account changes;
- a retry closure captured in Account A cannot alert, enqueue, execute, or
  publish state after logout or transition to Account B;
- a successful acknowledged desired value is released rather than retained as
  a permanent overlay, so a later authoritative server update can become
  visible;
- all previous silent favorite catches are removed.

Durable offline favorites are explicitly out of scope. Verify that no partial
outbox implementation is presented as complete.

### 7. Documentation and scope claims

Cross-check progress and session records against source and command output.
Confirm they distinguish:

- local remediation complete;
- repository enforcement pending;
- release/device/provider/staging/production evidence pending;
- durable favorites Phase B pending design approval;
- propagation terminology pending editorial approval.

Confirm historical MCD, geography, and July mobile-state statements are marked
as superseded without deleting their dated evidence.

## Required commands

Run at minimum:

```bash
git status --short
git diff --check
git diff --stat
git diff 12d82f9 --
npm run verify
npm run check:taxonomy:local
npm --prefix apps/mobile run typecheck
npm --prefix packages/convex run typecheck
```

Add focused commands when a finding needs isolation. If an environment failure
prevents execution, provide the exact command, exit code/error, why it is an
environment blocker, and retain unaffected results. Do not convert an unrun gate
into a pass.

## Required output

Start with exactly one verdict:

`PASS`, `PARTIAL`, or `FAIL`.

Then provide:

1. severity-ordered actionable findings (`P0`–`P3`), each with absolute file
   path, exact line or tight line range, production impact, evidence, and a
   concrete recommendation;
2. a verification table listing every command, result, and relevant test count;
3. an acceptance matrix for the seven review areas above;
4. documentation overclaims or stale statements;
5. external gates that remain open;
6. a concise final recommendation: ready for commit/PR, needs local fixes, or
   blocked by external evidence.

If there are no actionable findings, explicitly say so. Do not invent findings
to make the report appear thorough. A green test suite is necessary but is not
sufficient for PASS if production behavior, UI reachability, ordering, or
documentation claims are incorrect.
