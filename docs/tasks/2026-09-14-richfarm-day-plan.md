# RichFarm day plan — 2026-09-14

Status: planned. This is a scoped execution plan for the first day of the
2026-09-14 — 2026-09-20 work week. It does not authorize a commit, push, PR,
deployment, production data mutation, or repository-settings change.

## Objective

Prepare the PCR-2026-09-06 project-completeness remediation for a clean,
reviewable package while preserving all user-owned changes and keeping release
evidence separate from local verification.

## Scope

In scope:

- confirm the current branch, HEAD, runtime, lockfile and worktree state;
- inventory the PCR implementation diff and classify unrelated/pre-existing
  changes;
- verify the current local gate with `npm run verify` and `git diff --check`;
- identify the intended commit boundaries and any remaining blockers;
- record the day's evidence and handoff notes.

Out of scope:

- production or staging deployment/data mutation;
- database migration, deletion, or destructive cleanup;
- pushing branches, opening/merging a PR, or changing repository rulesets;
- durable offline favorites (PCR-6B);
- propagation-label changes without editorial approval;
- broad feature expansion or unrelated refactoring.

## Execution sequence

### 1. Capture the baseline

Record:

- branch and HEAD commit;
- Node/npm versions and lockfile status;
- `git status --short --branch`;
- the complete changed/untracked-file list.

Use the repository's current working tree as the source of truth. Do not reset,
checkout, stash, or delete user changes.

### 2. Review the PCR diff by package boundary

Classify each changed file into:

1. mobile typecheck and projection ordering;
2. API canonical fixtures and contract regressions;
3. root verification scripts and CI workflows;
4. plant naming semantics;
5. favorite desired-state/retry behavior;
6. documentation and task evidence;
7. unrelated or pre-existing work.

Check that tests remain meaningful and that no change weakens authorization,
identity, deletion, geography, synchronization, or offline assertions.

### 3. Run local verification

Run the following from the repository root:

```sh
npm run verify
git diff --check
```

Expected local result:

- mobile, dashboard, API, shared and Convex typechecks/builds pass;
- frontend/shared/Convex tests pass;
- the complete API suite passes;
- dashboard production build passes;
- no whitespace errors are reported.

If a check fails, classify it as configuration, fixture, application behavior,
or environment before making any fix. Do not accept a new baseline by silencing
the failure.

### 4. Define the reviewable package

Produce a short package map containing:

- files that belong in the PCR package;
- files that must remain untouched;
- exact verification commands and totals;
- external gates that remain open;
- the next action for 2026-09-15.

The expected package outcome is a clean commit/PR candidate, not a claim of
release readiness.

## Acceptance criteria

- Current branch and worktree state are recorded.
- Every changed file has a package owner or is explicitly marked unrelated.
- `npm run verify` passes on the current tree, or every failure has a named
  cause and reproducible evidence.
- `git diff --check` passes.
- No production, staging, repository-settings, or destructive operation is
  performed.
- The next day's work can start from an unambiguous package boundary.

## Deliverables

- baseline output and failure inventory for the day;
- PCR file/package map;
- verification result with exact test totals;
- commit/PR preparation checklist;
- explicit list of release, editorial, and product decisions still pending.

## References

- `agent_docs/project_progress.md` — current package status and evidence;
- `docs/tasks/2026-09-06-project-completeness-remediation-plan.md` — PCR scope,
  acceptance and release gates;
- `docs/tasks/2026-09-06-project-completeness-audit.md` — source audit and
  prioritized findings.
