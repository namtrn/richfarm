# Project Structure

## Top-level layout

```text
apps/
  api/         Express admin API, SQLite authoring/control plane, Convex sync, API tests
  dashboard/   React/Vite plant administration and Data Health UI
  mobile/      Expo Router React Native application and pest/disease detail routes
packages/
  convex/      Convex schema, projections, canonical writers, migrations, tests
  shared/      Shared canonical plant identity contract and fixtures
scripts/       data build, manifest, content audit, and maintenance scripts
content/
  plants/      Git-authoritative plant Markdown plus per-directory manifests
  pests-diseases/ Git-authoritative localized pest/disease Markdown plus manifests
docs/
  architecture/ durable cross-app architecture, trust-boundary, and engineering rules
  specs/       product and data contracts
  tasks/       dated implementation and review reports
agent_docs/   durable project context and handoff documentation
```

`docs/architecture/README.md` indexes the durable application rules. Authentication and identity behavior is defined in `docs/architecture/authentication-and-identity.md`; dated bug reports and implementation history must not replace that contract.

## Plant-library ownership boundaries

- `apps/api/src/db.ts`: SQLite schema and revision tables, including canonical identity status, quarantine/redirect support, migration journal, reconciliation runs/findings/proposals, and outbox audit state.
- `apps/api/src/master-plants.ts`: authenticated plant CRUD/search, structured canonical create guard, SQLite authoring persistence, outbox queue/publication endpoints, and delete guards.
- `apps/api/src/sqlite-canonical-identity.ts`: SQLite canonical identity resolution, dry-run/apply/rollback migration flow, quarantine, redirects, backups, and journaled readback.
- `apps/api/src/canonical-identity-audit.ts`: read-only identity/content/provenance/relationship audit and evidence classification.
- `apps/api/src/content-manifests.ts` and `scripts/content-manifests.ts`: deterministic Git Markdown manifest generation/validation and identity-bound content import/export gates.
- `apps/api/src/sync-reconciliation.ts` and `apps/api/src/sync-reconciliation-state.ts`: bounded complete-snapshot reconciliation, revision/count/cursor freshness boundaries, durable findings/proposals, and dashboard state.
- `apps/api/src/master-plant-i18n.ts`: localized i18n/care/review reads and writes with outbox integration.
- `apps/api/src/convex-sync.ts`: server-to-server Convex calls using deployment credentials and the service token.
- `apps/api/src/sync-outbox.ts`: deduplicated retryable sync work and exponential backoff.
- `packages/convex/convex/masterSync.ts`: service-token-protected admin snapshot and backend sync boundary.
- `packages/convex/convex/lib/canonicalPlantUpsert.ts`: single indexed canonical upsert used by normal Convex writers, seed, and migration paths.
- `packages/convex/convex/canonicalIdentityMigration.ts` and related migration modules: bounded, resumable, journaled canonical-field migration and run-scoped rollback/readback.
- `packages/convex/convex/lib/adminAuth.ts`: server-only service-token validation.
- `packages/convex/convex/lib/canonicalPlantLibrary.ts`: shared production projection and locale/content inheritance policy.
- `packages/convex/convex/lib/pestDiseaseProjection.ts` and `packages/convex/convex/pestsDiseases.ts`: localized/versioned pest/disease detail projection and stable-key queries.
- `packages/convex/convex/plantLibrary.ts`: canonical list/search/match queries.
- `packages/convex/convex/plantImages.ts`: compatibility image/detail/variant queries delegated to the canonical projection.
- `packages/convex/convex/plantLibraryQuality.ts`: authenticated quality-gate reports.
- `packages/convex/convex/schema.ts`: `plantsMaster`, i18n, care, relation, and synchronization data contracts.
- `apps/dashboard/src/components/DataHealth.tsx`, `useDataHealth.ts`, and `dataHealth.ts`: freshness, health counts, findings/evidence, affected identities, outbox state, and admin proposal controls.
- `apps/dashboard/src`: SQLite-backed Plant/i18n/care authoring, normalized accent-insensitive search and review controls through authenticated API routes; Groups and Photos through the authenticated Convex admin proxy; stats, import/export, and sync controls.
- `apps/mobile/hooks/usePlantLibrary.ts` and `apps/mobile/features/garden/hooks/usePlantLibrary.ts`: mobile consumption of canonical library data.
- `apps/mobile/lib/search.ts` and `apps/mobile/app/(tabs)/library/index.tsx`: normalized, accent-insensitive matching over the resolved locally cached/loaded mobile library array.
- `apps/mobile/hooks/usePestDiseaseDetail.ts`, `apps/mobile/lib/pestDiseaseRouting.ts`, and `apps/mobile/app/pests-diseases/`: localized pest/disease lookup and safe in-app detail routing.
- `apps/api/tests/phase3.test.ts` and `packages/convex/convex/plantLibraryPhase3.test.ts`: Phase 3 contract, authorization, projection, sync, identity, and delete-guard coverage.

Git Markdown remains the long-form content authority. SQLite stages and audits it before explicit publication; Convex remains the mobile runtime target. Local dashboard writes commit SQLite and enqueue work, while pending outbox rows are not sent implicitly. Production Convex deployment and mutation for the canonical identity/content rollout remain outside the local implementation state.
