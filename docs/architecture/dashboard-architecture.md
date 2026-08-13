# Dashboard Architecture

## Purpose

The dashboard (`apps/dashboard`) is the admin surface for the master plant database. It is a Vite + React SPA that talks exclusively to the local RichFarm API (`apps/api`, Express + SQLite) through an authenticated HTTP proxy. This document records the durable rules for how the dashboard reads and writes master-plant data and how the local backend must stay fast.

## Runtime boundaries

| Component | Location | Role |
| --- | --- | --- |
| Dashboard SPA | `apps/dashboard` | Admin UI. Vite dev server proxies `/api` to `http://localhost:4000` (`apps/dashboard/vite.config.ts`). |
| Local API | `apps/api` | Express server. Source of truth for local authoring. Stores data in SQLite (`apps/api/data/richfarm.db`). |
| Convex | `packages/convex` | Remote/cloud target. Local changes are queued in the `sync_outbox` table and published to Convex; the dashboard does not read plants from Convex in normal operation. |

## Invariants

### The dashboard reads and writes local SQLite, not Convex

- Every dashboard plant request passes `source=sqlite` (see `usePlants.ts` `loadBackendPlantPage`). The API list/detail/stats routes only fall back to a Convex snapshot when `source !== "sqlite"` and the Convex admin proxy is enabled (`apps/api/src/master-plants.ts`).
- SQLite is the local authoring source of truth. Convex is a publish target fed through the outbox; treat Convex reads as a fallback/debug path, never as the primary dashboard data path.

### Plant list performance contract

The list endpoint must stay fast regardless of dataset size. Current dataset is ~1.5k plants / ~3k i18n rows.

- The API filters and sorts on **raw row + i18n fields only** (`apps/api/src/master-plants.ts`, SQLite branch of `GET /api/master-plants`). `normalizeMasterPlant` resolves geography and inheritance with several queries per plant, so it must run **only for the page slice returned to the client** (currently 30 rows).
- Inheritance resolution (`resolvePlantGeography`) accepts a precomputed `Map<speciesKey, baseRow>` so bulk callers do not rescan `master_plants` per normalized row. Keep this optional-parameter pattern when adding other bulk read paths.
- Required indexes on `master_plants`: `updated_at DESC` (list ordering), `is_active`, `image_url` (stats counts). Indexes are created in `runMigrations` **after** `ensureColumn` so legacy SQLite files without newer columns can still boot.
- The dashboard debounces search input (250 ms) before issuing requests (`usePlants.ts`). Do not remove the debounce.

### Search semantics

- Search is accent-insensitive: `mồng tơi` and `mong toi` must match the same rows. Normalization happens in JS (`normalizePlantSearchText`) over row fields plus every locale's `common_name`/`description`, so full-table reads are intentional — the cost must be paid once per request, never per row.

### Care guide editing

- Care guides are authored Markdown stored byte-for-byte in `master_plant_i18n.care_content`. Whitespace-only input is the explicit clear state; non-empty content is passed through unchanged (`buildCareContentPayload` in `apps/dashboard/src/hooks/useI18n.ts`).
- The dashboard edits care guides through the reusable `CareGuideModal` (`apps/dashboard/src/components/CareGuideModal.tsx`):
  - One tab per locale the plant already has; save applies to the **active tab only** (PATCH per locale).
  - Two modes because the content is Markdown: raw **Edit** and rendered **Preview**.
  - Drafts are kept per locale inside the modal; switching tabs or closing with unsaved changes asks for confirmation (Esc/overlay close included).
  - The modal is content-agnostic: it receives `locales` and an `onSave(locale, content)` callback, so it can be reused wherever care guides are edited.
- The modal's displayed content must come from the **fresh i18n store** (`i18n.rows`, reloaded after every save) with the plant snapshot as fallback, never the plant snapshot alone — otherwise a just-saved guide can appear stale (wiring lives in `PlantManager.tsx` `PlantDetail`).
- Saving flows through `i18n.startEdit(row)` → `i18n.save({ careContent })` → `reload()`. The save request must carry the editor value directly in the overrides so it cannot race React's `setForm` state update.

## Operational notes

- `createDatabase` runs DDL (including new-index creation) on boot. Do not run it against a database file that a running dev server is actively using — SQLite DDL takes an exclusive lock and concurrent requests can die with `SQLITE_BUSY`. Apply schema/index changes while the API is stopped (or accept a short restart window).
- `tsx watch` restarts on source edits; a crashed child leaves the watcher alive but not listening. Verify with `lsof -i :4000` after backend changes.
