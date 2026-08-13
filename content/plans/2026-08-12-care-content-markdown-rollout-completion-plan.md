# Care Content Markdown — Rollout Completion Plan

Date: 2026-08-12

Status: **SOURCE IMPLEMENTED — MIGRATION AND FEATURE QA GATES OPEN**

Fresh local verification — 2026-08-13: care migration 8/8, mobile care cache
3/3, dashboard PlantManager 7/7, full API 64/64, full Convex 97/97, shared/API/
Convex/dashboard/mobile typechecks and builds, and `git diff --check` all pass.
Independent dashboard verification exposed a missing `PlantI18nRow.contentUpdatedAt`
type field; the contract was corrected and independently reverified with
dashboard TypeScript, focused tests, and production build passing. Migration,
physical-device feature QA, and compatibility-removal gates remain open.

Source document:

- `content/plans/2026-08-10-care-content-markdown-storage-plan.md`

## Objective

Finish rollout of canonical care-content Markdown without redesigning the
already-implemented storage, editing, rendering, or cache contracts. This phase
closes only after migration coverage, byte-preserving readback, Basella vi/en
pilot evidence, dashboard/native/cache QA, and compatibility-removal readiness
are proven.

## Verified starting point — 2026-08-12

- SQLite canonical localized storage is nullable `care_content TEXT`.
- API, outbox, Convex, dashboard, and mobile use a Markdown string with
  omitted = preserve, null/empty = clear, and non-empty = byte-preserving
  behavior.
- Convex localized ownership remains `plantCareI18n.careContent`.
- SQLite migration converts supported legacy JSON, recovers `{ "text": string
  }`, reports unsupported values, and preserves provenance and review fields.
- Dashboard provides an active Markdown editor and preview with no raw JSON
  control or invented care fallback.
- Library modal, Library Detail, and Plant Detail render through the shared
  mobile Markdown renderer.
- The versioned mobile cache stores exact strings, evicts malformed legacy
  entries, and prevents explicitly cleared server content from being
  resurrected.

The remaining work is intentionally deferred rollout work. It does not reopen
the independent source implementation unless fresh evidence identifies a
defect.

## Resolved implementation drift — 2026-08-12

The Convex care-content migration now uses the ordered query's opaque cursor
pagination. Each invocation processes one bounded page (`limit` defaults to
500 and is capped at 500), accepts the previous page's `cursor`, and returns
`isDone`, `hasMore`, and a null `nextCursor` on the terminal page. Updating a
converted row therefore does not move it ahead of the cursor or cause the
first page to be replayed.

Every scanned row receives a disposition (`converted`, `preserved`, `skipped`,
`unsupported`, or `failure`). The report includes per-disposition SHA-256
evidence for affected bytes and preserves unsupported/ambiguous values without
rewriting them. `packages/convex/convex/plantCareContentMigration.test.ts`
rehearses a three-page traversal, terminal reporting, idempotent replay, byte
preservation, unsupported-row reporting, and hash evidence. This resolves the
mechanism gate; target migration remains blocked on the separate approval,
rollback, inventory, and readback gates below.

Fresh source-level verification on 2026-08-12: the focused migration test passed
2/2 tests; the full Convex suite passed 85/85 tests across 11 files; Convex
typecheck passed; and the bounded shared care-content typecheck passed. No
Convex deploy or data mutation was run.

## Completion scope

### 1. Inventory canonical and legacy data

- Identify the exact SQLite database, Convex deployment, and commit in scope.
- Count and identify canonical Markdown, supported legacy objects, recovered
  `{ "text": string }`, empty values, malformed/JSON-looking prose, unsupported
  non-empty values, and explicit clears.
- Record locale, content bytes and SHA-256, content version, provenance,
  content/review status, reviewer, origin, and timestamps.
- Identify structured-care compatibility fields separately; do not conflate
  structured operational care with reader-facing Markdown.
- Prevent publication writes during mutation/readback, or capture and verify a
  complete source snapshot before writes resume.

### 2. Define and rehearse rollback

- Produce a recovery artifact containing every affected localized row's ID,
  original care-content bytes/hash, locale, version, provenance, statuses,
  reviewer, origin, and timestamps.
- Record the prior deployable commit/functions for code rollback.
- Provide a bounded data-restore mutation or script that restores exact bytes
  and metadata without touching unrelated plant-care data.
- Rehearse artifact readback and restoration on a disposable/dev target.
- Preserve the SQLite backup/legacy evidence needed for rollback; never attempt
  to reconstruct the original structured JSON from free-form Markdown.
- A backup without a successful restore rehearsal is not accepted as a
  rollback mechanism.

### 3. Complete migration rehearsal

- Run the focused SQLite/API migration suite against fresh, legacy, and old
  clone schemas.
- Traverse the Convex migration from the initial cursor until `isDone: true`,
  recording every cursor, page disposition, hash, and terminal response.
- Produce a disposition for every target localized row: converted, preserved,
  skipped/empty, unsupported/manual review, failure, or already canonical.
- Verify supported conversions and `{ "text": string }` recovery byte for byte.
- Verify Markdown, JSON-looking prose, arrays, scalars, and malformed JSON are
  preserved according to the contract rather than silently rewritten.
- Reconcile pre/post row counts, hashes, locale counts, provenance, status,
  version, identity, and timestamps.

Rehearsal exit gate:

- every row is covered by the chosen traversal/full-table mechanism;
- all non-empty failures have an owner and disposition;
- there is no unexplained byte, metadata, or row-count drift;
- data restoration and code rollback have passed rehearsal.

### 4. Approval gate before mutation

Record names, timestamp, target, commit, exact commands, and decision for:

- **Migration operator** — resolves targets, captures recovery artifacts, runs
  commands, and records raw reports.
- **Release owner/approver** — verifies target, commit, full-table coverage,
  restore rehearsal, expected hashes/counts, and exact mutation commands.
- **Content/data approver** — resolves unsupported or ambiguous non-empty care
  rows and approves their expected reader-facing result.

One person may hold multiple roles, but Stage B is blocked until the approval
record is complete. Production mutation requires separate explicit
authorization.

### 5. Execute and verify target migration

- Execute the approved care-content migration separately from propagation or
  structured-care mutations.
- Stop on target mismatch, incomplete coverage, unexpected counts/hashes,
  unsupported rows without disposition, failure, or loss of rollback evidence.
- Read back every converted pilot row and aggregate the complete target report.
- Require zero unexplained non-empty failures.
- Re-run the migration and verify idempotency with no byte, provenance, status,
  version, identity, or timestamp churn outside the documented contract.
- Resume publication only after readback and cache-contract checks pass.

### 6. Complete Basella vi/en end-to-end pilot

For the selected Basella base plant and representative variants, record:

- SQLite Vietnamese and English Markdown bytes and hashes;
- outbox operation IDs and applied state;
- Convex `plantCareI18n.careContent` bytes and metadata;
- canonical vi/en projections and fallback behavior;
- dashboard edit, preview, save, explicit clear, and reload;
- mobile online display, cache write, offline restart, and cache invalidation;
- base/cultivar fallback behavior where applicable;
- explicit server clear without stale cached Markdown resurrection.

Publication counts alone do not close the pilot; values must agree at every
boundary.

### 7. Complete dashboard, native, and cache QA

Dashboard matrix:

- headings, paragraphs, bold, emphasis, ordered/unordered/nested lists, links,
  inline code, Unicode, large content, whitespace preservation, and clear;
- save-state and error behavior;
- rapid locale/plant switching without cross-record content carryover;
- no raw JSON editor, JSON envelope, or invented care content.

Mobile matrix on a clean simulator and at least one physical device:

- Library modal, Library Detail, and Plant Detail;
- all six locales and documented fallback behavior;
- light/dark mode and small screens;
- long/nested lists, link interaction, inline code, Unicode, and large content;
- online → cache → offline → restart;
- server clear → cache invalidation without stale resurrection;
- rapid plant/locale switching;
- malformed legacy cache eviction.

Record device, OS, build, commit, locale, and Convex deployment. Simulator
rendering does not substitute for physical-device link and cache evidence.

### 8. Remove compatibility paths only after the gate

Inventory legacy care JSON columns/codecs, cache namespaces, master structured
care fallback readers, and any compatibility adapters.

Removal is allowed only when:

- target migration has complete row coverage and zero unexplained non-empty
  failures;
- Basella and native/cache QA pass;
- deployed clients no longer need the compatibility contract;
- rollback no longer depends on the fields being removed;
- canonical-only regression coverage exists.

Compatibility cleanup must be a separate reviewable change from migration.
Structured operational care remains authoritative for calculations, reminders,
filters, and validation.

## Execution stages

### Stage A — Evidence and migration-mechanism completion

Refresh automated evidence, inventory data, rehearse full cursor traversal and
rollback, and complete the approval record.

### Stage B — Authorized care-content migration

Run only the approved care-content mutation and readback. Stop on any mismatch.

### Stage C — Pilot and feature-screen QA

Complete Basella vi/en boundary verification plus dashboard, simulator,
physical-device, localization, link, and cache QA.

### Stage D — Compatibility cleanup and closeout

Remove only compatibility paths proven unused, rerun the regression matrix,
and synchronize the source plan's header, checklist, and rollout log.

## Verification requirements

At minimum, run and record:

```sh
npx vitest run apps/api/tests/care-content-migration.test.ts
npx vitest run apps/mobile/lib/plantCareCache.test.ts
npm --prefix apps/api test
npm run api:build
npm --prefix packages/convex test
npm --prefix packages/convex run typecheck
npm --prefix packages/shared run typecheck
npx vitest run apps/dashboard/src/components/PlantManager.test.ts
npm run dashboard:build
npm --prefix apps/mobile run typecheck
git diff --check
```

`packages/shared` now exposes a bounded `typecheck` script whose checked project
explicitly includes `src/careContentLegacy.ts`. Consumer typechecks remain
boundary coverage but are not a declared substitute.

Additionally record migration coverage, recovery artifacts, restore rehearsal,
readback queries, outbox state, feature-screen evidence, and the exact
target/commit. Historical passing counts do not replace a fresh completion run.

## Definition of done

- Care Markdown contracts pass fresh automated verification across shared,
  API, Convex, dashboard, and mobile.
- Migration proves complete-table coverage through tested cursor pagination
  ending with `isDone: true`.
- A named migration operator, release approver, and content/data approver are
  recorded.
- Code rollback and byte-exact row restoration pass rehearsal before mutation.
- Target migration has zero unexplained non-empty failure rows and reconciled
  content/metadata hashes.
- Basella vi/en passes SQLite → outbox → Convex → canonical projection →
  dashboard/mobile online and cached/offline verification.
- Dashboard, clean simulator, and physical-device matrices pass for Markdown,
  links, locales, dark mode, small screens, cache invalidation, and switching.
- No raw JSON, JSON envelope, invented care content, or stale cache resurrection
  remains user-visible.
- Compatibility paths are removed only after their gate, or retained with an
  explicit owner and removal condition.
- The source plan no longer has contradictory Planned/checklist/result status.

## Explicit non-goals

- Redesigning the Markdown format or editor.
- Generating Markdown from propagation tags or structured care.
- Changing structured operational care authority.
- Redesigning mobile plant screens.
- Expanding catalog content beyond the bounded pilot and required manual row
  resolutions.
- Running propagation migration in this plan.
- Production mutation without separate explicit authorization.
