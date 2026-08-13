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
  architecture/ durable cross-app architecture, trust-boundary, and engineering rules
  specs/       product and data contracts
  tasks/       dated implementation and review reports
agent_docs/   durable project context and handoff documentation
```

`docs/architecture/README.md` indexes the durable application rules. Authentication and identity behavior is defined in `docs/architecture/authentication-and-identity.md`; dated bug reports and implementation history must not replace that contract.

## Plant-library ownership boundaries

- `apps/api/src/master-plants.ts`: authenticated plant CRUD/search, SQLite authoring persistence, outbox queue/publication endpoints, reconciliation, and delete guards.
- `apps/api/src/master-plant-i18n.ts`: localized i18n/care/review reads and writes with outbox integration.
- `apps/api/src/convex-sync.ts`: server-to-server Convex calls using deployment credentials and the service token.
- `apps/api/src/sync-outbox.ts`: deduplicated retryable sync work and exponential backoff.
- `packages/convex/convex/masterSync.ts`: service-token-protected backend upsert/delete and complete `listAll` snapshot.
- `packages/convex/convex/lib/adminAuth.ts`: server-only service-token validation.
- `packages/convex/convex/lib/canonicalPlantLibrary.ts`: shared production projection and locale/content inheritance policy.
- `packages/convex/convex/plantLibrary.ts`: canonical list/search/match queries.
- `packages/convex/convex/plantImages.ts`: compatibility image/detail/variant queries delegated to the canonical projection.
- `packages/convex/convex/plantLibraryQuality.ts`: authenticated quality-gate reports.
- `packages/convex/convex/schema.ts`: `plantsMaster`, i18n, care, relation, and synchronization data contracts.
- `apps/dashboard/src`: SQLite-backed Plant/i18n/care authoring, normalized accent-insensitive search and review controls through authenticated API routes; Groups and Photos through the authenticated Convex admin proxy; stats, import/export, and sync controls.
- `apps/mobile/hooks/usePlantLibrary.ts` and `apps/mobile/features/garden/hooks/usePlantLibrary.ts`: mobile consumption of canonical library data.
- `apps/mobile/lib/search.ts` and `apps/mobile/app/(tabs)/library/index.tsx`: normalized, accent-insensitive matching over the resolved locally cached/loaded mobile library array.
- `apps/api/tests/phase3.test.ts` and `packages/convex/convex/plantLibraryPhase3.test.ts`: Phase 3 contract, authorization, projection, sync, identity, and delete-guard coverage.

Local dashboard writes commit SQLite and enqueue sync work unconditionally. The queue-only action for existing local drafts and the explicit publish action are separate; publication targets Convex. Mobile treats Convex as canonical, caches its projection locally, and resolves/searches that local array. Groups and Photos remain Convex-owned.
