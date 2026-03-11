# Richfarm

# Đóng tất cả các process node và metro đang chạy ngầm
killall -9 node 2>/dev/null || true
# Xóa cache metro của expo
npx expo start --clear


cd /Users/n/Documents/GitHub/richfarm/apps/mobile
npx expo run:ios --device "iPhone 17 Pro"

cd /Users/n/Documents/GitHub/richfarm/apps/dashboard
npm run dev



Richfarm is a lightweight monorepo for the mobile app, admin dashboard, API, and Convex backend that power the Richfarm gardening product.

## Features

- Garden, bed, and personal plant tracking.
- Plant library with taxonomy-aware species and cultivar variants.
- AI plant scanner that can jump directly into the matching library entry.
- Multilingual UI and plant content for 6 locales: `en`, `vi`, `es`, `pt`, `fr`, `zh`.
- Admin dashboard for editing plant taxonomy, localized names, images, and growing parameters.

## Stack

- Mobile app: Expo + React Native + Expo Router
- Backend data layer: Convex in [`packages/convex/`](./packages/convex)
- Admin dashboard: React/Vite in [`apps/dashboard/`](./apps/dashboard)
- API workspace: TypeScript in [`apps/api/`](./apps/api)
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
npm run convex:dev
```

### Start the mobile app

```bash
npm run ios
# or
npm run android
# or
npm start
```

### Start the API workspace

```bash
npm run api:dev
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

- [`apps/mobile/`](./apps/mobile): Expo Router app, UI, hooks, and native projects
- [`apps/dashboard/`](./apps/dashboard): dashboard web app
- [`apps/api/`](./apps/api): Express API/auth service
- [`packages/convex/`](./packages/convex): schema, queries, mutations, seeds, migrations
- [`packages/shared/`](./packages/shared): shared pure TypeScript helpers
- [`packages/widgets/`](./packages/widgets): native widget assets/code
- [`packages/native-modules/`](./packages/native-modules): custom native bridge modules
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

- [`packages/convex/convex/lib/plantTaxonomy.ts`](./packages/convex/convex/lib/plantTaxonomy.ts)
- [`packages/convex/convex/plantTaxonomyChecks.ts`](./packages/convex/convex/plantTaxonomyChecks.ts)
- [`.github/workflows/taxonomy-invariants.yml`](./.github/workflows/taxonomy-invariants.yml)

## License

Private and proprietary.
