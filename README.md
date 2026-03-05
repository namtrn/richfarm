# Richfarm

Richfarm is a React Native gardening app with a Convex backend, a plant knowledge library, and admin tooling for maintaining multilingual crop data.

## Features

- Garden, bed, and personal plant tracking.
- Plant library with taxonomy-aware species and cultivar variants.
- AI plant scanner that can jump directly into the matching library entry.
- Multilingual UI and plant content for 6 locales: `en`, `vi`, `es`, `pt`, `fr`, `zh`.
- Admin dashboard for editing plant taxonomy, localized names, images, and growing parameters.

## Stack

- Mobile app: Expo + React Native + Expo Router
- Backend data layer: Convex
- Admin/API workspace: TypeScript in [`backend/`](./backend)
- Styling: NativeWind
- Localization: `i18next`

## Getting Started

### Prerequisites

- Node.js LTS
- npm
- Expo iOS/Android toolchain if you want native builds

### Install

```bash
git clone https://github.com/namtrn/richfarm.git
cd richfarm
npm install
```

### Start Convex

```bash
npx convex dev
```

### Start the mobile app

```bash
npm run ios
# or
npm run android
# or
npm start
```

### Start the backend workspace

```bash
cd backend
npm install
npm run dev
```

## Plant Taxonomy Workflow

Richfarm now identifies library plants by normalized taxonomy instead of `scientificName` alone.

- Identity key: `(genusNormalized, speciesNormalized, cultivarNormalized)`
- Base species rows use `cultivarNormalized="__default__"`
- Localized display names live in `plantI18n`
- Library, scanner, seed sync, and backend sync all resolve plants through the taxonomy key

Useful commands:

```bash
npm run check:taxonomy
npx convex run plantTaxonomyMigration:listTaxonomyManualReview '{"limit":50}'
npx convex run plantTaxonomyMigration:runTaxonomyBackfill '{"dryRun":true,"limit":200}'
```

For the full workflow, see [PLANT_TAXONOMY_WORKFLOW.md](./docs/specs/PLANT_TAXONOMY_WORKFLOW.md).

## UI Smoke Test

```bash
brew install maestro
npm run ios
npm run test:smoke:ios
```

## Project Structure

- [`app/`](./app): Expo Router screens
- [`components/`](./components): shared UI
- [`convex/`](./convex): schema, queries, mutations, seeds, migrations
- [`backend/`](./backend): API and dashboard workspace
- [`docs/specs/`](./docs/specs): product and technical specs
- [`docs/reports/`](./docs/reports): audits and working reports

## Key Documentation

- [Plant taxonomy workflow](./docs/specs/PLANT_TAXONOMY_WORKFLOW.md)
- [Plant schema decision](./docs/specs/PLANT_SCHEMA_DECISION.md)
- [Plant schema review](./docs/specs/PLANT_SCHEMA_REVIEW.md)
- [Localization](./docs/specs/LOCALIZATION.md)
- [My Garden specification](./docs/specs/MY_GARDEN_SPEC.md)
- [Functional plan](./docs/specs/APP_FUNCTIONAL_PLAN.md)

## Contributing

Before changing plant data flows, review:

- [`convex/lib/plantTaxonomy.ts`](./convex/lib/plantTaxonomy.ts)
- [`convex/plantTaxonomyChecks.ts`](./convex/plantTaxonomyChecks.ts)
- [`.github/workflows/taxonomy-invariants.yml`](./.github/workflows/taxonomy-invariants.yml)

## License

Private and proprietary.
