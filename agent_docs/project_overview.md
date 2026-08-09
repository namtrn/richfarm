# Project Overview

RichFarm is a TypeScript workspace for a mobile gardening app, an Express/SQLite administration API, a React dashboard, and a Convex application backend. The plant library is shared by dashboard/admin workflows and the mobile read experience, but those consumers intentionally use different projections.

## Current status (2026-08-09)

Phase 3 technical work is complete and verified locally. Staging and production validation have not been run, so release readiness is still open. Phase 3.1 data curation and provenance gates are also open.

| Check | Result |
| --- | --- |
| API build | PASS |
| API tests | 24/24 PASS |
| Convex typecheck | PASS |
| Convex tests | 69/69 PASS |
| Dashboard build | PASS |
| Mobile typecheck | PASS |
| Normal plant-content audit | PASS |
| Strict plant-content audit | FAIL — 475 placeholder/near-duplicate findings |
| External data gate | `not_run` |
| Staging/production deployment validation | Not run |

## Plant-library architecture

- `apps/api` owns authenticated admin routes, SQLite persistence, Convex server-to-server sync, outbox retry, and reconciliation.
- `packages/convex` owns the canonical `plantsMaster` data model, localized content (`plantI18n`), structured care (`plantCare`/`plantCareI18n`), admin/sync functions, taxonomy checks, and mobile library queries.
- `apps/dashboard` uses the full admin snapshot for list, detail, statistics, export, and management of inactive/draft/placeholder rows.
- `apps/mobile` reads the canonical production projection, which applies active/content-status filtering, locale fallback, placeholder suppression, and base-to-cultivar inheritance.

Admin writes are protected twice: the API requires an authenticated admin/editor role, and Convex admin/sync functions require the server-only `CONVEX_ADMIN_FUNCTION_KEY` service token. Plant identity is keyed by `(sourceSystem, sourceId)` and reconciled with normalized taxonomy identity. SQLite sync failures are represented by retryable `sync_outbox` rows; Convex-to-SQLite reconciliation removes stale mirror rows and records drift.

Delete paths guard live user-plant references and prevent deleting a base while variants remain. Related i18n, care, relations, and favorite rows are cleaned when a delete is allowed.

See the [Phase 3.0 report](../docs/tasks/2026-08-04-phase-3-0-backend-plant-library-report.md) and [Phase 3.1 report](../docs/tasks/2026-08-04-phase-3-1-plant-library-update-report.md) for detailed evidence and open gates.
