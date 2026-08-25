# Project Overview

RichFarm is a TypeScript workspace for a mobile gardening app, an Express/SQLite administration API, a React dashboard, and a Convex application backend. The plant library is shared by dashboard/admin workflows and the mobile read experience, but those consumers intentionally use different projections.

## Current status (2026-08-25)

Phase 3 and the CID-1–CID-9 canonical identity/content-integrity work are complete locally, including the authorized SQLite remediation and local readback checks. The production Convex rollout for this package has not been deployed or mutated. Local release gates remain open for unresolved content blockers and separately authorized production rollout.

| Check | Result |
| --- | --- |
| SQLite canonical remediation | PASS — backup, dry-run, redirect/quarantine, journal, and readback verified locally |
| API/dashboard canonical create guard | PASS — structured identity required; exact matches return `CANONICAL_PLANT_EXISTS` |
| Convex canonical upsert and bounded migration | Implemented and checked in; not deployed or run against live production data |
| Git content manifests | 56 deterministic manifests generated locally (38 plant, 18 pest/disease) |
| Reconciliation/Data Health | Implemented locally with revisioned snapshots, findings, proposals, and outbox gates |
| Remaining local content blockers | Two plant directories lack English content; Basella Ceylon remains quarantined |
| Production Convex deployment/data mutation | Not run |

## Plant-library architecture

- `apps/api` owns authenticated admin routes, SQLite authoring and canonical schema enforcement, Git-manifest import/export, Convex server-to-server sync, retryable outbox processing, and report-first reconciliation.
- `packages/shared/src/canonicalPlantIdentity.ts` defines the versioned deterministic identity contract. API, SQLite tooling, content tooling, Convex writers, and tests use the same structured genus/species, infraspecific, cultivar, scope, and parent rules.
- `packages/convex` owns the canonical mobile `plantsMaster` projection, localized plant/care content, localized pest/disease projection, mobile library queries, and defense-in-depth canonical upsert. Canonical writes route through one indexed upsert boundary; identity migrations are bounded, resumable, journaled, and rollback-scoped.
- `apps/dashboard` uses SQLite for Plant and localized i18n/care authoring. The create guard previews exact canonical matches, opens an existing record instead of creating a duplicate, and leaves near matches as suggestions. The Data Health view exposes reconciliation freshness, findings, affected identities, outbox state, and repair proposals with role-separated controls.
- Git Markdown is the authoring authority for long-form plant and pest/disease content. Per-directory manifests bind files to immutable plant/runtime identities, versions, hashes, review state, and provenance. SQLite is the staging, review, audit, and publication-control plane; Convex is the mobile runtime projection.
- `apps/mobile` reads the Convex canonical plant projection into a local cache and searches the resolved array with normalized, accent-insensitive matching. Localized pest/disease Markdown links resolve through the in-app detail route and fail safely for unsupported or missing keys.

Admin writes are protected by API JWT role checks and Convex server-side service-token checks. Canonical identity is not inferred from display names or source IDs. SQLite uses retryable `sync_outbox` work; publication is blocked by fresh unresolved data-quality findings and verified by canonical readback. Reconciliation uses complete, bounded snapshots with revision/count/cursor checks, durable findings and repair proposals, and stale-evidence rejection.

Delete paths guard live user-plant references and prevent deleting a base while variants remain. Related i18n, care, relations, and favorite rows are cleaned when a delete is allowed.

See the [Phase 3.0 report](../docs/tasks/2026-08-04-phase-3-0-backend-plant-library-report.md), [Phase 3.1 report](../docs/tasks/2026-08-04-phase-3-1-plant-library-update-report.md), and [canonical identity/content-integrity plan](../docs/tasks/2026-08-24-canonical-plant-content-integrity-plan.md) for detailed evidence and open gates.
