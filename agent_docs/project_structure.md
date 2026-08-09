# Project Structure

## Top-level layout

```text
apps/
  api/         Express admin API, SQLite mirror, Convex sync, API tests
  dashboard/   React/Vite plant administration UI
  mobile/      Expo Router React Native application
packages/
  convex/      Convex schema, queries, mutations, migrations, tests
scripts/       data build, content audit, and maintenance scripts
docs/
  specs/       product and data contracts
  tasks/       dated implementation and review reports
agent_docs/   durable project context and handoff documentation
```

## Plant-library ownership boundaries

- `apps/api/src/master-plants.ts`: authenticated CRUD, admin snapshot reads, SQLite mirror operations, reconciliation endpoints, and delete guards.
- `apps/api/src/master-plant-i18n.ts`: localized content writes and outbox integration.
- `apps/api/src/convex-sync.ts`: server-to-server Convex calls using deployment credentials and the service token.
- `apps/api/src/sync-outbox.ts`: deduplicated retryable sync work and exponential backoff.
- `packages/convex/convex/masterSync.ts`: service-token-protected backend upsert/delete and complete `listAll` snapshot.
- `packages/convex/convex/lib/adminAuth.ts`: server-only service-token validation.
- `packages/convex/convex/lib/canonicalPlantLibrary.ts`: shared production projection and locale/content inheritance policy.
- `packages/convex/convex/plantLibrary.ts`: canonical list/search/match queries.
- `packages/convex/convex/plantImages.ts`: compatibility image/detail/variant queries delegated to the canonical projection.
- `packages/convex/convex/plantLibraryQuality.ts`: authenticated quality-gate reports.
- `packages/convex/convex/schema.ts`: `plantsMaster`, i18n, care, relation, and synchronization data contracts.
- `apps/dashboard/src`: admin list/detail/forms, stats, import/export, and sync controls.
- `apps/mobile/hooks/usePlantLibrary.ts` and `apps/mobile/features/garden/hooks/usePlantLibrary.ts`: mobile consumption of canonical library data.
- `apps/api/tests/phase3.test.ts` and `packages/convex/convex/plantLibraryPhase3.test.ts`: Phase 3 contract, authorization, projection, sync, identity, and delete-guard coverage.

The dashboard/admin surface must retain access to the full snapshot; mobile and other production readers must use the canonical projection. This is an intentional ownership boundary, not two competing data sources.
