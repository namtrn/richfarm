# Richfarm Backend

Backend workspace for the plant admin API that syncs `master_plants` into Convex.

## Run Local

```bash
cd apps/api
npm install
npm run dev
```

Default:

- API: `http://localhost:4000`

## Environment Variables

- `PORT`
- `DB_PATH`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `CONVEX_URL`
- `CONVEX_ADMIN_KEY`
- `CONVEX_ADMIN_FUNCTION_KEY`
- `CONVEX_UPSERT_MUTATION`
- `CONVEX_DELETE_MUTATION`

## Auth

- Login via `POST /api/auth/login`
- Send `Authorization: Bearer <token>` for protected routes
- Login endpoint is rate-limited

## Convex Sync Contract

The backend syncs plant rows through [`masterSync.ts`](/Users/n/Documents/GitHub/richfarm/packages/convex/convex/masterSync.ts).
Admin-only Convex CRUD now also requires `CONVEX_ADMIN_FUNCTION_KEY`; keep it server-side and do not expose it to dashboard/mobile clients.

Current behavior:

- Convex computes taxonomy fields from `scientific_name`
- Optional cultivar detail is read from `metadata_json.cultivar`
- Writes are matched by `(genusNormalized, speciesNormalized, cultivarNormalized)`
- A cultivar variant requires its base species row to exist first

If you change the sync contract, redeploy Convex functions:

```bash
cd ..
npx convex deploy
```

## Dashboard Notes

The admin dashboard now manages:

- `genus`, `species`, `cultivar`
- localized common names and descriptions
- image URL
- growing parameters such as harvest days, spacing, light, and yield

Relevant files:

- [`PlantManager.tsx`](/Users/n/Documents/GitHub/richfarm/apps/dashboard/src/components/PlantManager.tsx)
- [`usePlants.ts`](/Users/n/Documents/GitHub/richfarm/apps/dashboard/src/hooks/usePlants.ts)
- [`constants.ts`](/Users/n/Documents/GitHub/richfarm/apps/dashboard/src/constants.ts)

## Test

```bash
npm test
```

## Build

```bash
npm run build
npm start
```

## Docker

```bash
docker build -t richfarm-backend .
docker run -p 4000:4000 -e PORT=4000 -e DB_PATH=/app/data/richfarm.db -v $(pwd)/data:/app/data richfarm-backend
```
