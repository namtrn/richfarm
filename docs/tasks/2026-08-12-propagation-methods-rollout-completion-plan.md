# Propagation Methods — Rollout Completion Plan

Date: 2026-08-12

Status: **SOURCE IMPLEMENTED — DATA MIGRATION AND FEATURE QA GATES OPEN**

Source document:

- `docs/tasks/2026-08-10-propagation-methods-plan.md`

## Objective

Finish rollout of the already-implemented propagation-method feature without
redesigning or expanding it. Source implementation and rollout completion are
separate states: this phase closes only after target migration, readback,
localized feature-screen QA, and compatibility-removal readiness are proven.

## Verified starting point — 2026-08-12

- A shared contract defines 18 language-neutral propagation methods with
  strict validation, normalization, and deduplication.
- SQLite, API, outbox, Convex `plantCare`, admin writers, seed paths, and the
  canonical library carry `propagationMethods`.
- Dashboard authoring uses a multi-select and supports multiple source
  references.
- Mobile list/detail surfaces render localized labels rather than raw enums.
- All six released locales contain labels for all 18 methods.
- The legacy `plantsMaster.source` migration provides dry-run mode, stable
  cursor traversal, discriminator rules, conflict/manual/failure reporting,
  readback, cleanup, and a sync guard.

The remaining work is intentionally deferred rollout work. It does not reopen
the independent source implementation unless fresh evidence identifies a
defect.

## Completion scope

### 1. Freeze and audit migration inputs

- Identify the exact Convex deployment and commit to be migrated.
- Record every legacy `seed`, `cutting`, and `bulb` candidate, its identity
  fields, existing canonical care profile, and expected result.
- Separate eligible, already migrated, ambiguous provenance, manual-review,
  conflict, failure, and intentionally skipped rows.
- Run propagation migration before `backfillCanonicalMetadata` and before any
  backend sync can rewrite legacy `plantsMaster.source`.
- Prevent writes during the migration window, or capture and validate the
  complete source snapshot before writes resume.

### 2. Define and rehearse rollback

- Produce a recovery artifact containing affected plant IDs, original
  `plantsMaster.source`, `sourceSystem`, `sourceId`, existing
  `plantCare.propagationMethods`, evidence fields, status, and timestamps.
- Record the prior deployable commit/functions for code rollback.
- Provide a bounded data-restore mutation or script that restores the captured
  values without affecting unrelated care fields.
- Rehearse artifact readback and data restoration on a disposable/dev target.
- A backup that has not been read and restored successfully is not accepted as
  a rollback mechanism.

### 3. Dry-run every cursor page

- Run `migrateLegacyPropagationMethods` with `dryRun: true` from the initial
  cursor until a response returns `hasMore: false`.
- Record every request cursor, response `nextCursor`, counts, failure bucket,
  and row disposition.
- The sentinel-row implementation does not require an extra zero-row request
  after the terminal `hasMore: false` response.
- Review organization/catalog/URL source values manually; never auto-map them
  to propagation methods.
- Confirm expected post-migration values before requesting mutation approval.

Dry-run exit gate:

- traversal reaches `hasMore: false`;
- every candidate has one disposition and owner;
- expected totals reconcile across pages;
- there are no unexplained failures or missing rows;
- rollback has passed its rehearsal.

### 4. Approval gate before mutation

Record names, timestamp, target, commit, exact commands, and decision for:

- **Migration operator** — resolves the target, captures recovery artifacts,
  runs commands, and records raw reports.
- **Release owner/approver** — verifies target, commit, rollback rehearsal,
  expected totals, cursor strategy, and exact mutation commands.
- **Content/data approver** — resolves all ambiguous and manual-review rows.

One person may hold multiple roles, but Stage B is blocked until the approval
record is complete. Production mutation always requires separate explicit
authorization.

### 5. Execute and verify target migration

- Execute the approved cursor sequence with `dryRun: false`.
- Stop on target mismatch, unexpected totals, cursor discontinuity, conflict,
  failure, or loss of rollback evidence.
- Read back every migrated row before source cleanup is accepted.
- Re-run the report and require eligible legacy rows to reach `remaining: 0`.
- Confirm a repeated run is idempotent and does not churn unrelated care data,
  evidence, status, or timestamps.
- Resume authoring/sync only after readback and sync-guard checks pass.

### 6. Complete Basella and feature-screen QA

For the selected Basella base plant and representative variants, verify:

- SQLite authored methods and source references;
- outbox operation IDs and applied state;
- Convex `plantCare.propagationMethods` readback;
- canonical Vietnamese and English projections;
- dashboard select, preserve, clear, save, and reload;
- mobile card display of at most two tags plus `+N` where designed;
- full localized labels in Library Detail and Plant Detail;
- all six locales and documented fallback behavior;
- cached/offline/restart behavior;
- no raw enum, source URL, or citation inside user-facing care guidance.

Run feature QA on a clean simulator and at least one physical device. Record
device, OS, build, commit, locale, and Convex deployment.

### 7. Remove compatibility paths only after the gate

Inventory legacy propagation meaning in `plantsMaster.source`, legacy
single-source adapters, migration guards, and compatibility readers.

Removal is allowed only when:

- target reports show `remaining: 0` for eligible rows;
- all manual/failure rows are resolved or explicitly retained;
- deployed clients no longer need the compatibility contract;
- Basella and native/cache QA pass;
- rollback no longer depends on the fields being removed;
- canonical-only regression coverage exists.

Compatibility cleanup must be a separate reviewable change from the data
migration.

## Execution stages

### Stage A — Evidence and dry-run refresh

Re-run automated coverage, capture the target inventory, traverse dry-run
pages, rehearse rollback, and complete the approval record.

### Stage B — Authorized data migration

Run the approved cursor sequence and readback. Stop on any mismatch.

### Stage C — Pilot and feature-screen QA

Complete Basella boundary verification plus dashboard, simulator, physical
device, localization, and offline/cache QA.

### Stage D — Compatibility cleanup and closeout

Remove only compatibility paths proven unused, rerun the full regression
matrix, and synchronize the source plan's header, checklist, and rollout log.

## Verification requirements

At minimum, run and record:

```sh
npx vitest run packages/shared/src/plantPropagation.test.ts
npx vitest run packages/convex/convex/plantPropagationMigration.test.ts
npm --prefix apps/api test
npm run api:build
npm --prefix packages/convex test
npm --prefix packages/convex run typecheck
npx vitest run apps/dashboard/src/components/PlantManager.test.ts
npm run dashboard:build
npm --prefix apps/mobile run typecheck
git diff --check
```

The repository currently has no standalone `packages/shared` typecheck script
or TypeScript project. Stage A must add a bounded shared typecheck command, or
an equivalent checked project explicitly including all shared sources, before
the verification gate can close. Consumer typechecks are useful boundary
coverage but are not a declared substitute.

## Definition of done

- Propagation contracts pass fresh automated verification across shared, API,
  Convex, dashboard, and mobile.
- Dry-run and mutation cursor traversal reaches `hasMore: false` with reconciled
  totals and recorded raw evidence.
- A named migration operator, release approver, and content/data approver are
  recorded.
- Code rollback and row-level data restoration pass rehearsal before mutation.
- Eligible legacy propagation reaches `remaining: 0` with no unexplained
  failures.
- Basella passes SQLite → outbox → Convex → canonical projection → dashboard
  and mobile online/offline verification.
- Localized dashboard/mobile feature QA passes without raw enum or citation
  leakage.
- Compatibility paths are removed only after their gate, or retained with an
  explicit owner and removal condition.
- The source plan no longer has contradictory Draft/checklist/result status.

## Explicit non-goals

- Adding new propagation methods or splitting `tuber`.
- Adding propagation search, filtering, or indexes.
- Generating care Markdown from propagation tags.
- Redesigning dashboard or mobile plant screens.
- Expanding catalog content beyond the bounded pilot and required manual
  migration resolutions.
- Production mutation without separate explicit authorization.
