# Convex Workspace

This directory contains the Richfarm application schema, queries, mutations, seeds, and data maintenance utilities.

## Main Files

- [`schema.ts`](./schema.ts): database schema and indexes
- [`plantLibrary.ts`](./plantLibrary.ts): library list, search, and taxonomy-aware matching
- [`plantImages.ts`](./plantImages.ts): plant detail, image updates, variant lookup
- [`plantAdmin.ts`](./plantAdmin.ts): admin CRUD for plants and groups
- [`masterSync.ts`](./masterSync.ts): sync entrypoints from the backend workspace
- [`seed.ts`](./seed.ts): seed bootstrap for plant data and related tables
- [`plantI18n.ts`](./plantI18n.ts): localized plant content sync helpers
- [`plantTaxonomyChecks.ts`](./plantTaxonomyChecks.ts): invariant and seed-alignment checks
- [`plantTaxonomyMigration.ts`](./plantTaxonomyMigration.ts): backfill and cleanup utilities
- [`lib/plantTaxonomy.ts`](./lib/plantTaxonomy.ts): parsing and normalization helpers

## Local Development

```bash
npx convex dev
```

Deploy functions:

```bash
npx convex deploy
```

## Taxonomy Notes

`plantsMaster` now supports species and cultivar variants.

- identity key: `(genusNormalized, speciesNormalized, cultivarNormalized)`
- base species row token: `__default__`
- localized names belong in `plantI18n`
- seed sync, backend sync, and admin writes all enforce the same invariant checks

See [PLANT_TAXONOMY_WORKFLOW.md](../docs/specs/PLANT_TAXONOMY_WORKFLOW.md) for the full workflow.

## Checks

```bash
npm run check:taxonomy
npx convex run plantTaxonomyMigration:listTaxonomyManualReview '{"limit":50}'
npx convex run plantTaxonomyMigration:runTaxonomyBackfill '{"dryRun":true,"limit":200}'
```
