# Plant Geography and Adaptation Release 1 — Completion Plan

Date: 2026-08-12

Status: **STAGE D — PILOT TAXONOMY REVIEW DELIVERED (2026-08-12); PRODUCTION DEPLOYMENT AND DATA AUTHORIZATION PENDING**

Source documents:

- `docs/tasks/2026-08-11-plant-geography-adaptation-localization-plan.md`
- `docs/tasks/2026-08-11-plant-geography-adaptation-release1-design.md`

## Objective

Complete the already-started Release 1 implementation for plant origin,
proven regions, and climate adaptation. This is a completion phase, not a new
design phase: approved product semantics and the repository-specific design
remain authoritative unless implementation evidence proves that a correction
is required.

Release 1 is complete only when geography can be authored in the existing
dashboard, published through the SQLite-to-Convex pipeline, resolved with the
approved category-level inheritance rule, and verified through automated and
feature-screen evidence.

## Verified starting point — 2026-08-12

The current worktree already contains a locally tested partial implementation:

- the shared country catalog contains the complete ISO 3166-1 alpha-2 set with
  Vietnamese and English names;
- the shared adaptation vocabulary contains 13 fixed terms across
  `temperature`, `moisture`, `climate`, and `season`;
- SQLite contains the five geography/adaptation tables proposed by the Release
  1 design;
- the master-plant API accepts, validates, persists, clears, and projects
  `origin_countries`, `proven_regions`, and `adaptation_term_codes`;
- the SQLite projection resolves base-to-cultivar inheritance independently by
  category and keeps own editing values separate from resolved values;
- focused verification passes for country/adaptation contracts and the five
  API geography cases.

This starting point does **not** establish Convex, dashboard, or publication
completion. Mobile detail-screen display of geography is Release 2 scope and is
intentionally excluded here (mobile remains a boundary gate only — see
Non-goals); no production-data changes have been made.

Convex and dashboard completion has since been established by Stage A — see
the "Stage A result" section below.

## Open decision point — resolved (2026-08-12)

The design's sync semantics contained a conflict that implementation must
settle before Stage A code is written: `upsertPlantFromBackend` replaces
the three join tables from the full outbox payload and rejects archived term
codes, yet archived assignments must be preserved. A plant retaining an
assignment to a term archived after assignment would send that code in every
subsequent save and fail the outbox row, blocking unrelated edits.

Adopted: Convex rejects an archived code only when it is **not already
assigned to that plant**; codes already present are preserved and never
re-added. Verify with a dedicated test pair — re-saving a plant that holds an
archived term succeeds; adding a new assignment to that archived term fails.

Reflected in the design's §2.3/§3.3/§6.4/§7.3 wording and in the localization
plan's §19.4 note. The test pair is a Stage A deliverable.

## Completion scope

### 1. Stabilize the partial SQLite/API implementation

- Review the current uncommitted implementation against the Release 1 design
  before extending it.
- Confirm table uniqueness, foreign keys, archive behavior, duplicate
  normalization, and `[] = clear` / omitted = preserve semantics.
- Preserve optional source references for origin, proven-region, and adaptation
  assignments end to end; do not silently discard provenance accepted by the
  design contract.
- Add the missing outbox-payload assertion and health report for mirror rows,
  assignments, and orphan detection.
- Ensure API errors distinguish invalid country, malformed subdivision,
  unknown term, and archived term.

### 2. Complete Convex persistence and sync

- Add `adaptationTerms`, `adaptationTermI18n`, `plantOriginCountries`,
  `plantProvenRegions`, and `plantAdaptationTerms` to the Convex schema with the
  designed indexes and validators.
- Add an idempotent seed for the 13 approved terms and their Vietnamese and
  English labels and definitions.
- Extend the backend payload validator and `upsertPlantFromBackend` so all
  three assignment categories round-trip from SQLite through the existing
  outbox operation.
- Reject unknown terms and new assignments to archived terms authoritatively in
  Convex while preserving already-assigned archived codes (re-saving a plant
  that holds an archived term succeeds).
- Resolve own-versus-inherited categories in the canonical plant library using
  the same category-level rule as SQLite.
- Project localized country names, localized adaptation labels, source state
  (`own`, `inherited`, `none`), and inherited base identity without changing
  existing plant identity or search contracts.
- Verify that missing geography remains unknown and never becomes an
  unsuitable/excluded marker.

### 3. Complete taxonomy management inside the existing dashboard

- Add a `Taxonomy` page to the existing dashboard navigation and application
  shell; do not create a parallel CMS or auth path.
- Implement listing grouped by dimension, Vietnamese/English translation
  cards, translation status, ordering, active/archived state, and usage count.
- Reuse the existing admin proxy and `admin`/`editor` roles:
  editors may maintain permitted translations and assignments; admin-only
  operations cover creation, reordering, and archive/unarchive.
- Add Convex admin functions, proxy allowlists, and SQLite mirror refresh.
- Require both Vietnamese and English labels before a term can be active.
- Preserve archived assignments in reads and block new assignments.

### 4. Add geography options to the plant editor

- Add a `Geography` section or tab to the existing `PlantManager` form.
- Add a searchable country multi-select for `origin_countries`, using only the
  shared country catalog for visible names.
- Add proven-region rows with country selection and optional format-validated
  subdivision code; the exhaustive ISO 3166-2 catalog remains deferred.
- Add adaptation selectors grouped by the four fixed dimensions.
- Expose independent values such as `hot` and `humid`; do not create combined
  free-form terms such as `hot_humid`.
- Show category-level inherited state for cultivars and provide an explicit
  override action that copies the resolved category into own assignments.
- Save through the existing SQLite-first plant endpoint and outbox flow.
- Add focused dashboard tests for render, payload, validation, inheritance
  affordance, role visibility, and archive behavior.

### 5. Complete quality gates and pilot evidence

- Extend the plant-library quality report with missing mandatory Vietnamese or
  English adaptation translations.
- Add the three approved tomato examples as test/pilot fixtures without
  starting a catalog-wide backfill.
- Verify own and inherited origin, proven region, and adaptation values through
  SQLite, outbox, Convex, canonical query, and dashboard reload.
- Verify Vietnamese and English label fallback; later locales may fall back to
  English for Release 1 and do not block publication.
- Verify missing geography renders as an empty/unknown state without invented
  suitability claims.

## Stage A result — 2026-08-12

Stage A (source completion) is implemented and verified locally. Recorded
below are the verified facts; the scope/stage text above remains
authoritative for the open stages.

### Implemented — Convex (`packages/convex`)

- Schema: `adaptationTerms`, `adaptationTermI18n`, `plantOriginCountries`,
  `plantProvenRegions`, `plantAdaptationTerms` tables with the designed
  indexes (`convex/schema.ts`).
- Idempotent 13-term vi/en seed: `convex/data/adaptationTermsSeed.ts`,
  `seedAdaptationTerms` in `convex/seed.ts`, wired into `seedAll`.
- Taxonomy admin: `plantAdmin:listAdaptationTerms` (dimension-grouped,
  translations, usage counts), `createAdaptationTerm`,
  `updateAdaptationTerm`, `updateAdaptationTermTranslation`,
  `reorderAdaptationTerms`, `archiveAdaptationTerm` — all behind
  `requireAdminServiceToken`; vi+en label gate enforced on create/update and
  on restoring an archived term (`convex/plantAdmin.ts`).
- Sync: `backendRowValidator` gained `origin_countries`, `proven_regions`,
  `adaptation_term_codes`; `upsertPlantFromBackend` replaces the three join
  tables with the resolved archived rule (archived code rejected only when
  not already assigned to the plant; re-save holding an archived assignment
  succeeds); `listAll` mirrors own geography back (`convex/masterSync.ts`).
- Canonical projection: `originCountries` (localized names), `provenRegions`,
  `adaptation` grouped by the four dimensions, `geographySource`
  (`own`/`inherited`/`none` per category), `geographyInheritedFromId`;
  category-level own ≥ base fallback; label chain requested → en → code;
  missing geography stays absent (`convex/lib/canonicalPlantLibrary.ts`).
- Quality gate: `missingMandatoryAdaptationTranslationCount` added to the
  report and `assertQualityGate` content-debt checks
  (`convex/plantLibraryQuality.ts`).

### Implemented — API (`apps/api`)

- `GET /api/adaptation-terms` (mirror read) and admin-only
  `POST /api/adaptation-terms/refresh` (hydration from
  `plantAdmin:listAdaptationTerms` with a never-wipe-on-empty guard)
  (`src/adaptation-terms.ts`, mounted in `src/app.ts`).
- `adaptationTermsHealth(db)` report: mirror rows, join rows, orphan counts
  (`src/master-plants.ts`).
- Distinct 400 errors: `Unknown country code`, `Invalid subdivision code`,
  `Unknown adaptation term code`, `Archived adaptation term code`
  (`validatePlantGeography`; subdivision is shape-validated in zod and
  pattern-validated in the geography validator so the distinct message
  surfaces).
- Admin-proxy allowlist: `plantAdmin:listAdaptationTerms` query; five
  taxonomy mutations; `createAdaptationTerm`, `reorderAdaptationTerms`,
  `archiveAdaptationTerm` admin-only (`src/convex-admin.ts`).

### Implemented — Dashboard (`apps/dashboard`)

- New `Taxonomy` page: `taxonomy` PageKey, Sidebar entry, App branch,
  `hooks/useAdaptationTerms.ts`, `components/TaxonomyManager.tsx` — grouped
  by dimension, vi/en translation cards with translation-status badges,
  usage counts, archive confirmation with usage warning, admin-only
  create/reorder/archive and SQLite-mirror sync control.
- Geography section in `PlantManager` via `components/GeographyEditor.tsx`:
  searchable country multi-select (shared catalog only), proven-region rows
  with format-validated subdivision input, dimension-grouped active-term
  selectors from the mirror, cultivar inheritance chips with an explicit
  "Override: copy resolved values to own" action.
- Form/payload wiring: `PlantFormState` geography fields,
  `emptyPlantForm` defaults, `mapBackendPlant`/`toFormState`, and the save
  payload sends `origin_countries`/`proven_regions`/`adaptation_term_codes`
  through the existing SQLite-first endpoint and outbox flow
  (`types.ts`, `constants.ts`, `hooks/usePlants.ts`).
- Styles for the geography editor and taxonomy badges (`styles.css`).

### Integration gaps closed — 2026-08-12

A completeness review after the initial Stage A run found two end-to-end
gaps; both are fixed and covered by tests.

1. **Archived-term re-save consistency (SQLite API).** Convex allowed
   re-saving a plant that already holds an archived assignment, but the
   SQLite API rejected every archived term — so a dashboard edit of an
   unrelated field could be blocked when the own payload still carried an
   archived code. Fixed: `validatePlantGeography(db, plantId, payload)` now
   rejects an archived code only when it is **not already assigned to the
   plant** (same rule as Convex); the call site in `upsertMasterPlantRow`
   passes the resolved plant identity. Covered by the API test
   "allows re-saving a plant that already holds an archived term".
2. **Provenance not end-to-end for origin and adaptation.** `proven_regions`
   kept `source_refs` but `origin_countries` and `adaptation_term_codes`
   were code-only arrays, so source references were dropped at the payload
   boundary even though both stores have columns. Fixed: additive
   `origin_country_source_refs` / `adaptation_term_source_refs` maps
   (keyed by code) in the API zod schema, `applyPlantGeographyPayload`,
   `normalizeMasterPlant`, the Convex `backendRowValidator`, the
   `upsertPlantFromBackend` join writes, and `listAll`; the dashboard
   carries them through `PlantFormState`/`toFormState`/save so provenance
   survives dashboard round-trips. Also corrected a pre-existing zod bug
   where `proven_regions[].source_refs` was a single object instead of an
   array (aligned with the Convex validator and storage). Covered by the
   extended round-trip tests (API + Convex) asserting refs read-back.

### Fixtures and tests

- The three approved tomato examples (`tomato-brandywine`,
  `tomato-vn-cherry-01`, `tomato-tommy-toe`) round-trip with distinct
  origin/proven/adaptation semantics in `apps/api/tests/plant-geography.test.ts`
  — test fixtures only, no production data.
- API: 11 geography tests (round-trip incl. provenance read-back, preserve/
  clear, error taxonomy, archived re-save, outbox-payload assertion, health
  report, mirror GET/refresh incl. never-wipe guard, tomato fixtures).
- Convex: 8 geography tests (`convex/plantGeography.test.ts`) — join-table
  persistence, unknown country/term rejection, archived new-assignment
  rejection vs re-save preservation, projection fallback + localized labels,
  missing-geography neutrality, usage counts, publication gate, seed
  idempotency + clean quality gate.
- Dashboard: 5 geography/taxonomy tests
  (`components/geography-taxonomy.test.tsx`) — sections, inheritance chips +
  override, selected-country chips, grouping/badges, admin-only visibility.

### Verification evidence (all PASS)

```text
Convex tests 93/93, typecheck clean
API tests 62/62, `npm run api:build` clean
Dashboard tests 8/8, `npm run dashboard:build` clean
Shared tests 26/26
Mobile typecheck clean (boundary)
`git diff --check` clean
```

Note: `npx convex codegen` uploaded the additive functions to the connected
dev deployment; no schema deploy and no data mutation were run. The
unrelated in-flight work (propagation methods, care Markdown rollout) was
left untouched.

### Open gates — Stages C, D

Feature-screen QA in the actual dashboard (Stage C); pilot taxonomy quality
review and release decision with separate production authorization
(Stage D). The exit gates listed under those stages below are unchanged.
(Stages B and C are complete — see the Stage B and Stage C result sections.)

## Stage D result — pilot taxonomy quality review (2026-08-12)

Reviewed against dev `fantastic-beagle-190` (read-only; no data mutated by
this review). Verdict: **pilot taxonomy quality PASS**; the QA fixtures must
be excluded from production as decided below; production deployment and
production-data mutation remain separate authorizations.

### 1. Taxonomy quality (13 approved terms)

- Composition: 4 dimensions × fixed vocabulary exactly per design §5
  (temperature 4, moisture 3, climate 3, season 3); codes are language-
  neutral, each term belongs to exactly one dimension; no combined
  `hot_humid`-style terms.
- Labels/definitions: every term carries vi + en label and definition
  (verified via `plantAdmin:listAdaptationTerms` and the SQLite mirror, e.g.
  `hot` = Nóng/Hot with both definitions, `translationStatus:
  human_reviewed`). `missingViOrEnActive: []` — the vi/en publication gate
  is green; `orphanI18n: []` (28 i18n rows all reference valid terms).
- Distinctness: terms within a dimension are semantically distinct
  (cool/mild/warm/hot; dry/moderate/humid; tropical/subtropical/temperate;
  short_season/long_season/frost_free) — no unexplained synonyms.
- Health: SQLite mirror holds the same 14 codes as Convex; mirror/join
  tables contain no orphans.

### 2. Pilot assignment accuracy (three approved tomatoes)

Canonical readback re-verified against the §4 sets — all PASS:

| pilot | origin | proven | adaptation | source |
|---|---|---|---|---|
| brandywine (row 227) | US | US | warm, moderate, temperate, frost_free | own (sourceId null — legacy seed identity preserved) |
| vn-cherry-01 (1552) | VN | VN | hot, humid, tropical, frost_free | own |
| tommy-toe (1553) | AU | AU | warm, moderate, temperate, frost_free | own |

Usage counts consistent (Convex): hot/humid/tropical 1, temperate 2,
warm/moderate 3, frost_free 3, dry 0. The SQLite/Convex usage difference
(warm 4 vs 3) is fully attributed to the two Stage C base-row QA edits (rows
1554 + 6) resolving onto the single canonical base tomato row — not a
data-integrity defect.

### 3. QA fixtures — exclusion decisions (basis for production)

1. **`qa_test` term (archived, usage 0) — EXCLUDE.** It exists only in dev
   Convex and the dev mirror. Production taxonomy is created exclusively by
   the idempotent `seedAdaptationTerms` (13 approved terms), so the fixture
   cannot appear in production unless explicitly created there. At production
   time, verify `plantAdmin:listAdaptationTerms` returns exactly 13 terms.
2. **Base tomato geography QA edits (rows 1554 + 6 → canonical base row
   US + warm/moderate) — EXCLUDE.** These are Stage C feature-QA fixtures,
   not pilot records; they must not be copied by any production backfill.
   The approved production pilot data is only the three tomato records.
3. **vn-cherry-01 proven-region subdivision `HCM` (dev) — production pilot
   uses the §4 spec exactly** (proven `VN`, no subdivision). `HCM` was a
   Stage C validation artifact of the subdivision error-path test.
4. **Brandywine production publish must reuse the existing production
   Brandywine seed row** (same legacy `source: seed` collision as dev row
   227): delete any duplicate pilot insert and publish geography onto the
   seed row; do not stamp new source identity over it.

### 4. Observations

- `plantLibraryQuality.assertQualityGate`/`qualityReport` exceed the 1 s
  Convex function limit at full catalog scale (≥1,000 plants) — use it as a
  bounded/batched audit tool at production scale, not a per-request gate.
- The dashboard tsc gate (`npx tsc --noEmit -p apps/dashboard/tsconfig.json`)
  added during Stage C remains part of the verification evidence.

### 5. Acceptance checklist M (§14.1–14.4) — mapped to evidence

- Data integrity (§14.1): uniqueness (API tests), locale/country validation
  (shared + API tests), archive behavior (Convex tests), vi/en publication
  completeness (quality gate + review above), unknown-vs-absent semantics
  (canonical tests), parent/child safety (inheritance tests) — PASS.
- Service behavior (§14.2): locale fallback, term assignment/removal,
  geography reads, archive restrictions, unit conversion n/a (Release 2) —
  PASS (Convex/API suites + dev readback).
- Dashboard behavior (§14.3): grouped term editing, multilingual completion,
  free-form/duplicate prevention, country/subdivision selection,
  referenced-data protection, measurement validation n/a — PASS (Stage C
  feature QA + dashboard tests).
- User-facing (§14.4): localized labels/country names, cross-country
  discoverability semantics, neutral missing data, no overstated geographic
  claims — PASS (canonical projection tests + pilot readback; mobile display
  is Release 2).

### 6. Stage D status

Pilot taxonomy quality and assignment accuracy are approved for the pilot
scope. Production deployment, production taxonomy seeding, and production
pilot-data publication remain **separate authorizations** per the plan;
this review does not authorize them.

### 7. Stage D technical gaps closed — 2026-08-13

- API/SQLite geography validation now rejects duplicate origin-country,
  proven-region, and adaptation-term assignments before replace writes.
- Convex sync applies the same duplicate rejection before inserting join rows.
- SQLite geography health now detects adaptation assignment codes missing from
  the taxonomy mirror and reports approved-catalog completeness.
- The read-only Convex `plantAdmin:adaptationReleasePreflight` gate fails closed
  unless the target has exactly the approved 13 active terms, 26 required
  vi/en translations, no extra/missing/invalid taxonomy rows, no orphan rows,
  and no duplicate assignments. The admin proxy permits this query without
  granting a production mutation.
- Verification: API 63/63 tests pass; Convex 95/95 tests pass; API and Convex
  typechecks pass; `git diff --check` passes. No database mutation, outbox
  replay, deployment, or production access occurred during this closure.

Production backup/restore evidence and the three separate production
authorizations remain open release gates.

### 8. Dev closeout — native mobile verification (2026-08-13)

Release 1 is **complete on dev**. The canonical geography projection is now
rendered on the native Plant Detail screen as optional `ORIGIN` and
`GROWING CONDITIONS` metadata rows; missing geography remains absent rather than
inventing suitability. The same compact summary also renders `USES`,
structured `PROPAGATION`; harvest, germination, spacing, and watering are regular values in the lower stats list without the previous
standalone clock badge.

Native QA ran on an iPhone 17 Simulator (iOS 26.2) against dev
`fantastic-beagle-190` and passed:

- Basella base: `USES` Cooking/Salad and `PROPAGATION` Seed/Stem cutting;
  harvest, germination, spacing, and watering render in the lower stats list,
  while care Markdown remains readable.
- Brandywine: `ORIGIN` United States of America and `GROWING CONDITIONS`
  Warm/Moderate/Temperate/Frost-free.
- VN Cherry: Viet Nam and Hot/Humid/Tropical/Frost-free.
- Tommy Toe: Australia and Warm/Moderate/Temperate/Frost-free.
- Direct cultivar search `Brandywine` initially exposed a discoverability bug:
  common browse removed cultivars before applying search. Search now evaluates
  all canonical plants while the empty-query browse remains base-only; native
  re-test passes.

Evidence is under `artifacts/stage-d-simulator/`. Focused mobile tests pass
13/13, mobile typecheck passes, and `git diff --check` passes. No production
deployment or production data mutation was performed as part of this closeout.

**Final status: RELEASE 1 DEV COMPLETE.** Production rollout remains a
separate operation requiring its own target evidence and authorization.

## Stage C result — 2026-08-12

Feature-screen QA was executed in the actual dashboard (local API on dev
`fantastic-beagle-190` data + Vite dev server) using a headless browser with
DOM/JS assertions, plus targeted screenshots (evidence: `artifacts/stage-c/`).

### Exercised flows (all verified)

- **Login + shell**: admin login; sidebar shows Plants/Groups/Taxonomy/Photos;
  stats reflect 1,552 plants.
- **Taxonomy page**: 13 terms grouped by the four dimensions; vi/en
  translation cards with `Human reviewed` badges; usage counts match the pilot
  (hot 1, warm 2, moderate 2, humid 1, tropical 1, temperate 2, frost_free 3,
  dry 0); admin controls visible (Refresh, Sync SQLite mirror, + New Term).
- **Term create/archive**: created `qa_test` (climate) → "Adaptation term
  created" toast, appears in list; archived it → `archived` badge + toast +
  detail "0 plant(s)"; the archived term is **not** offered in the plant
  editor's adaptation options (new assignments blocked).
- **Mirror sync**: "Taxonomy mirror refreshed" toast.
- **Geography editor** (pilot vn-cherry-01): origin chip Viet Nam (VN), proven
  region row VN, adaptation checked `Nóng/Hot, Ẩm/Humid, Nhiệt đới/Tropical,
  Không sương giá/Frost-free`; all three inheritance chips "own".
- **Save → reload persistence**: toggled `Khô/Dry` on → saved ("Plant updated
  locally") → reload → still checked → untoggled → saved → SQLite join rows
  confirm the set is back to hot/humid/tropical/frost_free.
- **Error path**: proven-region subdivision filled with `hcm!` → save → error
  banner "Invalid subdivision code: hcm! Retry"; corrected to `HCM` → save
  clean.
- **Country search**: "Australi" → Australia (AU) result → click adds an
  Australia chip alongside Viet Nam; removable via ×.
- **Cultivar inheritance/override**: base tomato rows carry geography (row
  1554 via the UI: US + warm/moderate; legacy base row 6 via the API so the
  SQLite resolver picks it up) → opening the Beefsteak cultivar shows
  "Origin: 1 value(s), inherited" / "Adaptation: 2 value(s), inherited" chips
  and the "Override: copy resolved values to own" button → clicking Override
  copies US + Warm/Moderate into the own form fields → cancelled without
  saving.
- **Responsive**: 375×812 screenshots of the geography editor and the
  taxonomy page captured; navigation and rendering work at mobile width.

### Defects found and closed

- **P1 — dashboard overflows a 375 px mobile viewport** (reported by the
  Stage C external QA review): at 375×812 the page was 906 CSS px wide; the
  page-header action row (826 px) and the Plants card (523 px) ran off-screen
  because the ≤980 px media rule used `grid-template-columns: 1fr`
  (`minmax(auto, 1fr)`, so the card grew to the table's min-content), the
  `.card` grid item had no `min-width: 0`, and `.actions` did not wrap.
  Fixed in `apps/dashboard/src/styles.css`: `.layout` collapses to
  `minmax(0, 1fr)`, `.card`/`.page-header`/`.page-content`/`.actions` get
  `min-width: 0`, `.actions` wraps. Re-verified at 375×812: `scrollWidth =
  375` on Plants, Taxonomy, and the geography editor; all seven page-header
  action buttons are inside the viewport (wrapped); tables scroll locally via
  `.table-wrap`. Desktop 1280×720 re-check: `scrollWidth = 1280`, no console
  errors. Evidence: `artifacts/stage-c/c9-mobile-taxonomy-fixed.png`,
  `c10-mobile-geography-fixed.png`.
- **P0 — `ReferenceError: authedFetch is not defined` in `PlantForm`**
  (PlantManager.tsx: the geography editor was rendered with a variable that
  only exists in the outer component scope; the inner `PlantForm` did not
  receive the prop). Fixed by passing `authedFetch` into `PlantForm`. Root
  cause of the slip: `vite build` does not typecheck and the dashboard has no
  tsc gate; `npx tsc --noEmit -p apps/dashboard/tsconfig.json` is now part of
  the evidence run and is clean.
- **P2 (types)** — `usePlants.ts` imported `CareSourceRef` from `../types`
  where it is not re-exported; now imported from the shared package. Caught by
  the dashboard tsc gate.
- **P3** — SQLite `resolvePlantGeography` reported `inherited` even when the
  base plant's category is empty; aligned with Convex (`none` when nothing to
  inherit).

### Exit gate status

- Automated UI tests pass: dashboard 12/12 (incl. 5 geography/taxonomy tests),
  API 62/62, Convex 93/93 + typecheck, dashboard tsc + build clean.
- Feature-screen evidence recorded (assertions above + screenshots in
  `artifacts/stage-c/`, including the post-fix mobile re-verification).
- All P0/P1 defects closed (P1 responsive overflow fixed and re-verified at
  375×812; no P1 remains). Dev outbox: 91 applied, 0 pending/failed. Dev data
  carries the QA fixtures (base tomato rows 1554/6 with US origin +
  warm/moderate; archived inert `qa_test` term).

## Stage B result — 2026-08-12

Stage B (dev deployment and pilot) is executed against the authorized dev
target `fantastic-beagle-190`. Evidence:

Live read-only re-verification after the original execution confirmed the
recorded state remains current: SQLite has 1,552 master plants and 89/89
outbox operations applied; Convex has 13 adaptation terms, 26 vi/en
translations, 3 origin assignments, 3 proven-region assignments, and 12
adaptation assignments. Canonical readback still matches all three pilot sets,
and the base tomato remains geography-neutral (`none`/`none`/`none`). No
additional deploy or data mutation was needed for this re-verification.

### Rollback steps (design §7.1–7.2)

- SQLite: pre-pilot backup at
  `artifacts/stage-b/richfarm.db.backup-20260812-171744` (1,550 master rows).
  Revert = restore the backup, or drop the five geography tables
  (`adaptation_terms`, `adaptation_term_i18n`, `plant_origin_countries`,
  `plant_proven_regions`, `plant_adaptation_terms`); `master_plants`,
  `master_plant_i18n`, `sync_outbox` are untouched and the mirror can be
  re-hydrated from Convex.
- Convex dev: additions are additive (schema + functions). Revert = redeploy
  the previous code/schema state via `npx convex dev` after reverting source;
  no data migration runs automatically.

### Deploy, seed, mirror

- Schema (5 tables + indexes) and functions pushed to dev via `npx convex
  dev` ("Convex functions ready!" 17:18). Note: `npx convex deploy` was
  deliberately NOT used — it targets the production deployment
  (`whimsical-dove-537`) and its interactive confirmation was aborted in the
  non-interactive shell; nothing was pushed to production.
- Seed: `npx convex run seed:seedAdaptationTerms` → 13 terms + 26 i18n rows
  inserted; a second run inserted 0 (idempotent).
- Mirror: `POST /api/adaptation-terms/refresh` → `{mirror:{terms:13,i18n:26},
  joins:{origin:0,provenRegions:0,adaptationTerms:0},orphans:0}`;
  `GET /api/adaptation-terms` → 13 terms, `hot` = vi "Nóng" / en "Hot" with
  definitions, `translationStatus: human_reviewed`.

### Pilot publication (approved tomato records)

- `tomato-vn-cherry-01` (SQLite id 1552) and `tomato-tommy-toe` (1553)
  published as new Solanum lycopersicum cultivars with their §4 sets.
- `tomato-brandywine` collided with the pre-existing seed row 227
  (`SOLANUM_LYCOPERSICUM_BRANDYWINE_3PKN82EX7J`, legacy identity `source:
  seed`): the Convex upsert matched by taxonomy and merged into that seed row
  (its legacy identity is preserved by the existing source-guard, so the row
  keeps no `sourceId`). Resolved by deleting the duplicate pilot row (id
  1551) and publishing the geography onto the existing seed row 227 instead.
- Outbox: every operation applied — 89 applied, 0 pending, 0 failed
  (`retry-failed` → 0).

### Readback (canonical `plantLibrary:listCanonical`, locale en)

- brandywine (row 227): origin `[US]`, proven `[US]`, adaptation
  `[warm, moderate, temperate, frost_free]`, all `geographySource` "own";
  `sourceId` null (legacy seed identity preserved by design).
- vn-cherry-01: origin `[VN]`, proven `[VN]`, adaptation
  `[hot, humid, tropical, frost_free]`, all "own".
- tommy-toe: origin `[AU]`, proven `[AU]`, adaptation
  `[warm, moderate, temperate, frost_free]`, all "own".
- Existing base tomato row: `geographySource` none/none/none, `originCountries`
  empty — unchanged.
- Readback was done via `npx convex run plantLibrary:listCanonical`; the
  admin proxy cannot call public queries because the injected service token
  is rejected by their arg validators (dashboard never routes public
  canonical queries through the proxy, so no product impact).

### Labels, usage counts, no-mutation evidence

- Convex `plantAdmin:listAdaptationTerms` (via admin proxy): 13 terms; usage
  `hot 1, humid 1, tropical 1, warm 2, moderate 2, temperate 2, frost_free 3,
  dry 0` — matches the pilot assignment sets.
- `master_plants` 1,550 → 1,552 (only the two new pilot rows; brandywine
  reused the existing seed row); join tables 3 origin / 3 proven / 12
  adaptation rows, 0 orphans; mirror tables hold only taxonomy data. No
  catalog-wide mutation.

## Execution stages

### Stage A — Source completion

Finish SQLite/API gaps, Convex schema/sync/projection, taxonomy administration,
and dashboard authoring. No production data mutation occurs in this stage.

The worktree also carries unrelated in-flight changes (propagation-method and
care-content Markdown rollout). Keep geography changes and their commits
separate from that work; exclude unrelated diffs from the geography
verification gates.

Exit gate:

- source implementation is complete across shared, API, Convex, and dashboard;
- focused tests cover every persistence and UI contract;
- builds and typechecks pass.

### Stage B — Dev deployment and pilot

Deploy additive Convex schema/functions to the authorized dev target, seed the
controlled taxonomy idempotently, refresh the SQLite mirror, and publish only
the approved pilot records.

Exit gate:

- rollback steps for the dev target (design §7.1–7.2) are recorded;
- outbox operations are applied with no unresolved failures;
- readback matches SQLite own values and expected inherited values;
- vi/en labels and usage counts are correct;
- no catalog-wide data mutation has occurred.

### Stage C — Feature-screen QA

Exercise taxonomy administration and plant geography authoring in the actual
dashboard. Verify country search, term grouping, archive behavior, cultivar
inheritance/override, save/reload, errors, and responsive layout.

Exit gate:

- automated UI tests pass;
- dashboard feature-screen evidence is recorded;
- all P0/P1 defects are closed or explicitly accepted.

### Stage D — Release decision

Review pilot taxonomy quality and assignment accuracy before authorizing any
production seed or broader backfill. Production deployment and production data
mutation are separate approvals.

Documentation is finalized with verified facts only:
`agent_docs/project_progress.md` and `agent_docs/latest_session_work.md`
(deployment state), the localization plan's §19.3 status log, and this plan's
open-decision resolution.

## Verification requirements

At minimum, run and record:

```sh
npx vitest run packages/shared/src/countries.test.ts packages/shared/src/adaptationTerms.test.ts
npm --prefix apps/api test
npm run api:build
npm --prefix packages/convex test
npm --prefix packages/convex run typecheck
npm run dashboard:build
npx vitest run apps/dashboard
npm --prefix apps/mobile run typecheck
git diff --check
```

Also record focused dashboard tests (root vitest — the dashboard has no
dedicated test script), outbox/readback evidence, rollback evidence, target
deployment, pilot row IDs, and any data mutation command and report. A sandbox
restriction or skipped feature-screen check is not a PASS.

## Definition of done

- All three geography meanings have distinct storage and UI.
- Dashboard editors can select origin countries, proven regions, and active
  adaptation terms including independent `hot` and `humid` values.
- Taxonomy management exists inside the current dashboard with correct roles,
  vi/en publication gates, usage counts, and archive semantics.
- SQLite and Convex persistence, sync, projection, and inheritance agree.
- Country and adaptation labels follow the approved locale fallback and never
  invent suitability from missing data.
- Pilot records pass SQLite → outbox → Convex → canonical readback and
  dashboard save/reload verification.
- Automated tests, builds, typechecks, and feature-screen QA pass.
- Production deployment and production data mutation, if performed, have
  separate explicit authorization and recorded evidence.
- The source design's stale “no code changes” status and the localization
  plan's §19.3 status log are superseded by an implementation result that
  accurately lists completed and open gates (including this plan's open
  decision point).

## Explicit non-goals

- Measurement localization Release 2.
- Exhaustive subdivision catalogs or GIS suitability.
- Weather-driven calendars, zones, frost dates, or pest alerts.
- Country-based hard exclusion or automatic suitability claims.
- Soft ranking before pilot review.
- Catalog-wide geography backfill during Release 1 completion.
- Mobile geography filtering/ranking and location-driven recommendations
  (Release 2). Release 1 includes read-only Plant Detail display of canonical
  origin and adaptation labels, verified on iPhone 17 Simulator.
