# Plant Taxonomy Workflow

> Updated: 2026-03-06  
> Scope: mobile app, Convex, backend sync, admin dashboard, seed data

## Summary

The plant library no longer treats `scientificName` as the only identity key. Plants are now resolved by normalized taxonomy so the app can support multiple cultivars under the same species.

Current identity model:

- `genus`
- `species`
- `cultivar` (optional)
- `genusNormalized`
- `speciesNormalized`
- `cultivarNormalized`

`scientificName` remains in `plantsMaster`, but only as a display and backward-compat field.

## Core Rules

### 1. Identity key

Each `plantsMaster` row is unique by:

```text
(genusNormalized, speciesNormalized, cultivarNormalized)
```

Base species rows use:

```text
cultivarNormalized = "__default__"
```

### 2. Base-before-variant invariant

For standard cultivar variants, the base species row must exist before the variant is created or synced.

Examples:

- Allowed: `Solanum lycopersicum` exists, then create cultivar `Roma`
- Rejected: create cultivar `Roma` before the base tomato row exists

This guard is enforced in:

- [`convex/plantAdmin.ts`](../../convex/plantAdmin.ts)
- [`convex/masterSync.ts`](../../convex/masterSync.ts)
- [`convex/seed.ts`](../../convex/seed.ts)
- [`convex/plantI18n.ts`](../../convex/plantI18n.ts)

### 3. Localized names live in `plantI18n`

`commonNames[]` in `plantsMaster` is legacy. The active source of truth for display names is:

- `plantI18n.commonName`
- `plantI18n.description`
- `plantI18n.careContent`

### 4. Variant grouping in the app

The library groups rows by species and prefers the base row for display/group headers.

User-visible effects:

- Library list shows species groups with cultivar rows underneath
- Library detail shows a varieties section for sibling rows
- Scanner can jump to a matched library entry using the resolved `plantMasterId`

## Files By Responsibility

- [`convex/lib/plantTaxonomy.ts`](../../convex/lib/plantTaxonomy.ts)
  Normalization, parsing, cultivar defaults, identity helpers.
- [`convex/schema.ts`](../../convex/schema.ts)
  Additive taxonomy fields and indexes.
- [`convex/plantLibrary.ts`](../../convex/plantLibrary.ts)
  Taxonomy-aware matching, search, species grouping metadata.
- [`convex/plantImages.ts`](../../convex/plantImages.ts)
  Plant detail lookup and sibling variant listing.
- [`convex/plantAdmin.ts`](../../convex/plantAdmin.ts)
  Create/update/delete guards and admin-facing taxonomy flow.
- [`convex/masterSync.ts`](../../convex/masterSync.ts)
  Sync contract for backend `master_plants`.
- [`convex/plantTaxonomyMigration.ts`](../../convex/plantTaxonomyMigration.ts)
  Backfill and cleanup utilities.
- [`convex/plantTaxonomyChecks.ts`](../../convex/plantTaxonomyChecks.ts)
  Invariant and seed-alignment checks.
- [`app/(tabs)/library/index.tsx`](../../app/(tabs)/library/index.tsx)
  Species-grouped library UI.
- [`app/(tabs)/library/[masterPlantId].tsx`](../../app/(tabs)/library/[masterPlantId].tsx)
  Variant switcher in library detail.
- [`hooks/usePlantScanner.tsx`](../../hooks/usePlantScanner.tsx)
  Scanner match handoff into the library.
- [`dashboard/src/components/PlantManager.tsx`](../../dashboard/src/components/PlantManager.tsx)
  Admin UI for genus/species/cultivar and growing parameters.

## Seed And Sync Flow

### Seed data

Seed rows now support cultivar-aware keys via:

- [`convex/data/plantsMasterSeed.ts`](../../convex/data/plantsMasterSeed.ts)

Important changes:

- `buildPlantSeedKey()` includes `scientificName` and `cultivar`
- duplicate seed rows are deduped by seed key
- cultivar expansions generate additional variants for supported species
- i18n seed rows are deduped by `(plantKey, locale)`

### Backend sync

Backend-originated rows are matched by taxonomy, not only by `scientific_name`.

Expected data contract:

- `scientific_name` provides species-level parsing input
- `metadata_json.cultivar` provides optional cultivar detail
- Convex computes normalized identity and rejects duplicate/conflicting rows

## Migration And Verification Commands

### Check invariants

```bash
npm run check:taxonomy
```

This runs:

- `plantTaxonomyChecks:assertTaxonomyInvariants`
- `plantTaxonomyChecks:seedAlignmentReport`

### Inspect rows needing review

```bash
npx convex run plantTaxonomyMigration:listTaxonomyManualReview '{"limit":50}'
```

### Dry-run taxonomy backfill

```bash
npx convex run plantTaxonomyMigration:runTaxonomyBackfill '{"dryRun":true,"limit":200}'
```

### Apply taxonomy backfill

```bash
npx convex run plantTaxonomyMigration:runTaxonomyBackfill '{"dryRun":false,"limit":200,"confirm":"BACKFILL_TAXONOMY"}'
```

### Remove legacy `commonNames`

`removeLegacyCommonNames` exists as an internal mutation in [`convex/plantTaxonomyMigration.ts`](../../convex/plantTaxonomyMigration.ts). Run it only after verifying that `plantI18n` coverage is complete.

## CI

Taxonomy checks run in GitHub Actions:

- [`.github/workflows/taxonomy-invariants.yml`](../../.github/workflows/taxonomy-invariants.yml)

Required secrets:

- `CONVEX_DEPLOY_KEY`
- `CONVEX_DEPLOYMENT`

## Practical Guidance

- Do not use `scientificName` alone as a unique key for plant writes.
- When adding variants, create or confirm the base species row first.
- Keep localized names in `plantI18n`, not in `plantsMaster`.
- Run `npm run check:taxonomy` before merging plant data changes.
- If scanner or library matching regresses, inspect taxonomy fields before changing fuzzy-search logic.
