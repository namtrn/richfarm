# Project Progress

## Active package: P3.1-LOCAL-AUTHORING — Dashboard SQLite boundary

Status: complete and independently verified (Heavy route, 2026-08-10)

Goal: make the dashboard plant-content workspace fully SQLite-local for list, search, detail, edit, and review, while keeping Convex as the explicit publish target and leaving the mobile Convex-to-local-cache read path unchanged.

Scope and constraints:

- Dashboard Plant Master, localized descriptions, care content, and review state must read/write `apps/api/data/richfarm.db` through authenticated API routes.
- Dashboard list/detail/search must never mix SQLite and Convex snapshots.
- Save/review is local-first; Convex publication remains explicit, retryable, and backed by the existing sync outbox.
- Mobile stays out of scope: it already subscribes to the canonical Convex projection, persists an AsyncStorage snapshot, and searches the resolved local array.
- Plant photos and user/runtime data remain Convex-owned.
- Preserve the user-owned modification to `apps/api/data/richfarm.db`; do not overwrite or revert it.

Acceptance gates:

- Dashboard plant list/detail/stats/i18n work with Convex unavailable and use SQLite consistently.
- `mồng tơi` and `mong toi` return the same local result set; search is debounced and stale responses cannot overwrite newer results.
- Saving local plant content does not wait for a Convex round trip; publication is a separate explicit action with honest pending/failed status.
- Existing authorization, delete guards, identity, validation, and retry guarantees remain intact.
- Focused API/dashboard regression tests pass, followed by API build/tests, dashboard build, Convex tests/typecheck as affected, and mobile typecheck as a boundary regression gate.

Ordered work:

1. Define the SQLite authoring API/read contract and identify the smallest safe publish boundary.
2. Convert dashboard plant and i18n hooks to authenticated SQLite API routes.
3. Add normalized local search, debounce, and stale-response protection.
4. Separate local save from explicit Convex publish/retry controls and expose sync state.
5. Verify, document the new ownership boundary, and reconcile this package status.

Verified completion:

- Dashboard Plant list/detail/stats/search and localized content now use authenticated SQLite API routes exclusively; Groups and Photos remain Convex-owned.
- Local plant, bulk, delete, and i18n writes commit first and always enqueue deduplicated publish work, even while Convex is unavailable.
- Existing local authoring rows can be queued idempotently without publishing; `Publish pending` is a separate explicit action. Convex-to-SQLite recovery is no longer a normal dashboard control.
- Accent-normalized search returns the same 10 rows for `mồng tơi` and `mong toi` in the shared sidebar browser. Debounce and stale-request guards are active.
- Independent verification passed: focused Phase 3 tests 13/13, full API tests 42/42, API build, dashboard build, and diff checks.
- Mobile required no change: its active library hook already subscribes to Convex, persists a local snapshot, and searches the resolved local collection.

Deferred follow-up:

- Search currently normalizes and filters the complete SQLite snapshot in memory. Add FTS/indexing only when measured dataset growth makes it necessary.
- Legacy Convex/auto API reads do not promise the SQLite dashboard filter semantics; dashboard callers explicitly select `source=sqlite`.

## Active package: P3-MEDIUM — Complete Phase 3.0 and 3.1

Status: technical implementation complete locally; release/content gates remain open

Goal: close the remaining technical acceptance gates for the Plant Library backend, dashboard, and mobile canonical read experience without inventing curated plant content.

Constraints:

- Preserve the existing uncommitted Phase 3 implementation.
- Historical constraint (superseded by P3.1-LOCAL-AUTHORING): Convex was the dashboard source of truth and SQLite an operational mirror. Convex remains the mobile canonical source and dashboard publish target, while SQLite now owns dashboard Plant/i18n/care authoring.
- Do not deploy, commit, push, or mutate production data without explicit authorization.
- Treat the 200–300-species curation requirement as an external-data gate unless trusted source data already exists locally.

Acceptance gates:

- API, Convex, dashboard, and mobile typechecks/builds/tests pass on the supported Node runtime.
- Unauthorized canonical/admin writes are rejected and migration/service-token paths remain protected.
- Dashboard fields round-trip without silent loss; outbox/reconciliation, stable identity, deletion guards, locale cleanup, and canonical projection have regression evidence.
- Mobile Library/list/detail/scanner/Add Plant consumers use the same active/locale/placeholder/inheritance policy.
- Content audit is reproducible and distinguishes code defects from remaining curation debt.
- Generated/local database artifacts and dependency lockfiles are reviewed for commit suitability.

Major steps:

1. Audit the existing Phase 3 diff and map every Definition of Done item to code/tests.
2. Run clean technical gates and fix scoped failures, including mobile dependency/typecheck issues.
3. Review security, migrations, data integrity, dashboard round-trip, and canonical mobile integration.
4. Run normal/strict content audits and classify remaining external-data work.
5. Reconcile documentation and provide staging-readiness evidence plus explicit remaining gates.

Verified completion:

- API build passed; full API suite passed 24/24 outside the socket-restricted sandbox.
- Convex typecheck passed; full Convex suite passed 69/69.
- Dashboard build and mobile typecheck passed.
- Admin and canonical projections are separated intentionally: full admin snapshot for management, quality-filtered canonical projection for mobile/public Library reads.
- Stable identity, outbox retry/mirror hydration, reconciliation, authorization, locale/content filtering, and delete/reference guards have regression coverage.
- Root and API lockfiles resolve Convex 1.42.2 consistently; better-sqlite3 12.11.1 supports the Node 26 runtime used for verification.

Open gates:

- Staging Convex deployment and end-to-end dashboard round-trip validation have not been authorized or run.
- Strict content audit still fails with 475 placeholder/near-duplicate findings; externalDataGate is not_run.
- Only vi/en content exists; current rows are unreviewed and lack provenance URLs, so the 200–300 trusted-species curation target is incomplete.
- Decide whether the migration-only `apps/api/data/richfarm.db` binary change belongs in the eventual commit.

Next action: obtain trusted curation/source data or authorize a staging validation pass; perform final commit-scope review before landing.
