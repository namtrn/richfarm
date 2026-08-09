# Project Core Technology

## Runtime and workspace

- npm workspaces with TypeScript packages under `apps/*` and `packages/*`.
- Mobile app: Expo Router, React Native, Convex client, Better Auth integration, and Zustand.
- Dashboard: React + Vite.
- Admin API: Express, Zod validation, JWT authentication, SQLite via `better-sqlite3`, and the Convex server client.
- Backend data service: Convex functions and schema under `packages/convex/convex`.

## Plant data contract

The Convex schema stores master identity in `plantsMaster`, localized names/descriptions and provenance in `plantI18n`, structured care in `plantCare`, and localized care content in `plantCareI18n`. Canonical rows carry source identity (`sourceSystem`, `sourceId`), `recordVersion`, taxonomy fields, active/content/review metadata, and care fields. The SQLite mirror carries the same contract for dashboard administration.

## Read projections

`masterSync:listAll` is the complete source-of-truth snapshot used by the trusted API reconciler and admin reads. It preserves rows needed for management, including inactive, draft, and incomplete records.

`lib/canonicalPlantLibrary.ts` builds the production projection used by `plantLibrary`, `plantImages`, and mobile hooks. It filters inactive/archived/unpublished rows, removes placeholder descriptions, applies requested-locale then English fallback, and inherits a base species description/care profile for a cultivar when appropriate. The projection also carries source, review, version, and care metadata.

## Authorization and synchronization

Express admin routes require a valid JWT and an `admin` or `editor` role. Convex admin and backend-sync functions require the server-only `CONVEX_ADMIN_FUNCTION_KEY`; an unset or mismatched token is denied. The token is configured in `apps/api/src/server.ts` and is not passed to mobile or dashboard clients.

SQLite writes enqueue deduplicated `sync_outbox` work when Convex is unavailable. Processing uses retry/backoff and records applied or failed status. Reconciliation compares the complete Convex snapshot with the SQLite mirror, removes stale mirror rows, and records the resulting drift.

Upsert and delete use `(sourceSystem, sourceId)` stable identity, with taxonomy conflict checks. Delete guards protect live user-plant references and base rows that still have variants; allowed deletes remove dependent i18n, care, relation, and favorite records.

## Verification and known gates

Local API, Convex, dashboard, and mobile checks pass as recorded in the project overview and Phase 3 reports. The normal repository content audit passes. The strict audit fails with 475 placeholder/near-duplicate findings (the script caps reported near-duplicate pairs per locale); its `externalDataGate` is `not_run`. No staging or production deployment validation has been performed.
