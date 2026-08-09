# Project Progress

## Active package: P3-MEDIUM — Complete Phase 3.0 and 3.1

Status: technical implementation complete locally; release/content gates remain open

Goal: close the remaining technical acceptance gates for the Plant Library backend, dashboard, and mobile canonical read experience without inventing curated plant content.

Constraints:

- Preserve the existing uncommitted Phase 3 implementation.
- Convex remains the application source of truth; SQLite is an operational mirror with retry/reconciliation.
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
