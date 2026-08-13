# Plant Geography, Adaptation, and Measurement Localization — Release 1 Technical Design

Date: 2026-08-11

Source plan: `docs/tasks/2026-08-11-plant-geography-adaptation-localization-plan.md` (§18 "Immediate next implementation stage")

Status: Technical design for review. No code changes have been made.

Scope: Release 1 only (taxonomy, Vietnamese/English translations, existing-dashboard management, plant assignments). Release 2 dual-unit measurement validation and all later releases are out of scope. This document does not change the approved product decisions in §17 of the source plan.

---

## 1. Integration point map (source plan §18.1)

All statements were verified against the repository on 2026-08-11. Paths are relative to the repository root.

### 1.1 Two persistence systems, one publish pipeline

RichFarm has exactly two persistence systems for plant content, and every new table in this design must exist in both:

| System | Location | Role | Evidence |
|---|---|---|---|
| SQLite | `apps/api/data/richfarm.db`; schema in `apps/api/src/db.ts` (`runMigrations`, lines 130–350) | Dashboard authoring source of truth for `master_plants`, `master_plant_i18n` | `db.ts:152-241` |
| Convex | `packages/convex/convex/schema.ts` | Canonical mobile read source and explicit publish target | `schema.ts:117-223` (`plantsMaster`, `plantI18n`) |

Publish pipeline: SQLite → `sync_outbox` (`db.ts:259-276`) → `ConvexSyncService.syncUpsert` (`apps/api/src/convex-sync.ts:192-201`) → `masterSync:upsertPlantFromBackend` (`packages/convex/convex/masterSync.ts:267`) → Convex tables. The outbox dedupe key is `operation:entityType:sourceSystem:sourceId:locale` (`apps/api/src/sync-outbox.ts:25`); existing operations are `upsert_plant | delete_plant | upsert_i18n | delete_i18n` (`sync-outbox.ts:4-8`).

### 1.2 Master plant model and inheritance

- `plantsMaster` (Convex `schema.ts:117-185`) holds both species rows (`cultivar` absent) and cultivar rows; `basePlantId` is a legacy display-cluster pointer.
- Base-cultivar inheritance is resolved at read time, never copied down:
  - `baseCandidate()` in `packages/convex/convex/lib/canonicalPlantLibrary.ts:88-101` (explicit `basePlantId`, else matching `speciesKey` + `isDisplayBasePlant`).
  - Description inheritance: `shouldUseBasePlantDescription()` in `lib/plantContentQuality.ts:49-63` (similarity ≥ 0.82 or placeholder).
  - Care fallback: `mergeLocaleContent` / `careByPlant` fallback in `canonicalPlantLibrary.ts:103-138,187-196`.
- Locale fallback: `chooseRow()` `canonicalPlantLibrary.ts:62-71` — requested locale → hardcoded English → first usable row. Final display-name fallback is the scientific name (`canonicalPlantLibrary.ts:127`).
- The SQLite side derives base/variant identity without a `basePlantId` column: `sqliteSpeciesKey()` and `isSqliteDisplayBasePlant()` in `apps/api/src/master-plants.ts:614-647`, with the same species-key + display-base rules used by `sqliteDeleteGuard` (`master-plants.ts:649-673`).

Geography inheritance must follow this same category-level read-time fallback (see §3).

### 1.3 Dashboard structure and routes

- Single dashboard app; page keys `PageKey = "plants" | "groups" | "photos" | "import"` (`apps/dashboard/src/types.ts:261`); navigation is the static `NAV_ITEMS` list in `apps/dashboard/src/components/Sidebar.tsx:4-8`; page rendering branches are in `apps/dashboard/src/App.tsx:93-101`.
- There is no settings area and no separate CMS. The most appropriate existing pattern for a taxonomy-management page is the Groups page:
  - `apps/dashboard/src/hooks/useGroups.ts` (load via `convexAdminQuery("plantAdmin:listPlantGroups")`, save via `convexAdminMutation("plantAdmin:createPlantGroup" | "updatePlantGroup")`, delete with `confirm()`).
  - `apps/dashboard/src/components/GroupManager.tsx` (list + detail + vi/en i18n cards + create/edit form).
  - Convex side: `plantGroups` table (`schema.ts:688-696`, `displayName` is a `v.record(string,string)` per locale) and `plantAdmin:listPlantGroups/createPlantGroup/updatePlantGroup/deletePlantGroup` (`packages/convex/convex/plantAdmin.ts:1195-1345`).
- Plant editor: `apps/dashboard/src/components/PlantManager.tsx` — tabbed form (`FormTab`), i18n language cards over `PLANT_LANGUAGE_OPTIONS` (`PlantManager.tsx:23-30`: vi, en, es, pt, fr, zh), Markdown care editor, save through `usePlants` → `PATCH /api/master-plants/:id`.

### 1.4 Permissions

- API routes: `requireAuth` + `requireRole(["admin","editor"])` on `/api/master-plants` and `/api/master-plants-i18n` (`apps/api/src/app.ts:111-122`); deletes are `requireRole(["admin"])` (`master-plants.ts:1915`, `master-plant-i18n.ts:267`). Role values are exactly `admin|editor` (`apps/api/src/auth.ts:21-23`; `db.ts:136`).
- Convex admin proxy: allowlists in `apps/api/src/convex-admin.ts:16-48` (`allowedQueries`, `allowedMutations`, `adminOnlyMutations`); every proxied Convex function validates `requireAdminServiceToken` (`packages/convex/convex/lib/adminAuth.ts`).
- Groups are managed by both roles via the proxy; only `deletePlantGroup` is admin-only (`convex-admin.ts:43-48`).

This is the mechanism §9.3 of the source plan maps onto: editors assign terms and edit draft translations; admins create/reorder/archive terms and publish. No new role is introduced.

### 1.5 API conventions to extend

- Master-plant payload schema: `masterPlantObjectSchema` in `apps/api/src/master-plants.ts:69-121` (zod); `normalizeMasterPlant` (`:389`), `upsertMasterPlantRow` (`:1023`), `buildMasterPlantPayload` (`:592`), `queuePlantSync` (`:692`).
- Convex-side payload validator that must stay in sync: `backendRowValidator` in `packages/convex/convex/masterSync.ts:91-164`.
- Existing pattern for "list of tokens on the plant payload with `[]` = clear, omitted = preserve": `propagation_methods` (`master-plants.ts:110`, comment at `:108-110`).
- Quality/completeness reporting pattern to extend for "missing mandatory translations": `plantLibraryQuality.ts` (`qualityReport`, `assertQualityGate`, lines 24-167), `missingRequiredLocale` check at `:56-60`.
- Provenance/source-refs pattern already exists on `master_plant_i18n` (`source_refs_json`) and `plantCare` (`careSourceRef`); assignments should carry the same optional provenance shape.

### 1.6 Dashboard hooks / constants to extend

- `apps/dashboard/src/hooks/usePlants.ts` (plant list + save), `useBackendPlants.ts` (bulk/export/import/outbox controls), `apps/dashboard/src/constants.ts` (`convexAdminQuery`/`convexAdminMutation` helpers, `emptyPlantForm`).
- No new runtime dependency is required: `node`/`npm` are not available in this environment, so the country-name data must be bundled as a static TypeScript/JSON module (see §4).

---

## 2. Repository-specific persistence proposal (source plan §18.2, §7)

### 2.1 Convex schema additions (`packages/convex/convex/schema.ts`)

```ts
// Adaptation taxonomy — canonical reference data (plantGroups pattern)
adaptationTerms: defineTable({
  code: v.string(),            // stable machine identifier, e.g. "hot", "frost_free"
  dimension: v.string(),       // "temperature" | "moisture" | "climate" | "season"
  status: v.string(),          // "active" | "archived"
  sortOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_dimension_status_sort", ["dimension", "status", "sortOrder"])
  .index("by_code", ["code"]),

adaptationTermI18n: defineTable({
  termCode: v.string(),
  locale: v.string(),          // "vi" | "en" required for publication gate; others later
  label: v.string(),
  description: v.optional(v.string()),
  translationStatus: v.string(), // "missing" | "machine_translated" | "qa_passed" | "human_reviewed" | "approved"
  updatedAt: v.number(),
})
  .index("by_term_locale", ["termCode", "locale"])
  .index("by_locale", ["locale"]),

// Plant geography — assignment join tables
plantOriginCountries: defineTable({
  plantId: v.id("plantsMaster"),
  countryCode: v.string(),     // ISO 3166-1 alpha-2, e.g. "US"
  sourceRefs: v.optional(v.array(careSourceRef)), // reuse existing provenance shape
})
  .index("by_plant", ["plantId"])
  .index("by_country", ["countryCode"]),

plantProvenRegions: defineTable({
  plantId: v.id("plantsMaster"),
  countryCode: v.string(),
  subdivisionCode: v.optional(v.string()), // ISO 3166-2, deferred catalog, format-validated only
  sourceRefs: v.optional(v.array(careSourceRef)),
})
  .index("by_plant", ["plantId"])
  .index("by_country", ["countryCode"]),

plantAdaptationTerms: defineTable({
  plantId: v.id("plantsMaster"),
  termCode: v.string(),
  sourceRefs: v.optional(v.array(careSourceRef)),
})
  .index("by_plant", ["plantId"])
  .index("by_term", ["termCode"]),
```

Naming note (source plan §7/§17): the name `plant_measurements` is reserved for the user measurement log (`db.ts:231-241`); none of the new tables reuse it.

### 2.2 SQLite schema additions (`apps/api/src/db.ts`, `runMigrations`)

Additive `CREATE TABLE IF NOT EXISTS` statements (no rebuild, no `ensureColumn`):

```sql
-- Term catalog mirror, hydrated from Convex (see §2.4). Used by the SQLite
-- API for assignment validation and by the plant editor for option lists.
CREATE TABLE IF NOT EXISTS adaptation_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  dimension TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS adaptation_term_i18n (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term_code TEXT NOT NULL,
  locale TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  translation_status TEXT NOT NULL DEFAULT 'missing'
    CHECK (translation_status IN ('missing','machine_translated','qa_passed','human_reviewed','approved')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(term_code, locale),
  FOREIGN KEY(term_code) REFERENCES adaptation_terms(code) ON DELETE CASCADE
);

-- Plant geography assignments (authoring source of truth)
CREATE TABLE IF NOT EXISTS plant_origin_countries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  master_plant_id INTEGER NOT NULL,
  country_code TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(master_plant_id, country_code),
  FOREIGN KEY(master_plant_id) REFERENCES master_plants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_plant_origin_countries_plant ON plant_origin_countries(master_plant_id);

CREATE TABLE IF NOT EXISTS plant_proven_regions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  master_plant_id INTEGER NOT NULL,
  country_code TEXT NOT NULL,
  subdivision_code TEXT,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(master_plant_id, country_code, subdivision_code),
  FOREIGN KEY(master_plant_id) REFERENCES master_plants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_plant_proven_regions_plant ON plant_proven_regions(master_plant_id);

CREATE TABLE IF NOT EXISTS plant_adaptation_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  master_plant_id INTEGER NOT NULL,
  term_code TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(master_plant_id, term_code),
  FOREIGN KEY(master_plant_id) REFERENCES master_plants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_plant_adaptation_terms_plant ON plant_adaptation_terms(master_plant_id);
```

Integrity constraints from §7 map as follows: unique term code → `adaptation_terms.code UNIQUE`; unique translation per term+locale → `UNIQUE(term_code, locale)`; unique plant↔term and plant↔country assignments → the `UNIQUE(...)` clauses above; "no new assignment to an archived term" and "unsupported locale values and country codes are rejected" → API validation (§5, §6) with Convex as the authoritative gate; "archiving a term does not erase historical assignments" → archive is a status change only, join rows are never deleted.

### 2.3 Master-plant payload extension (SQLite zod + Convex validator)

Extend `masterPlantObjectSchema` (`master-plants.ts:69-121`) and `backendRowValidator` (`masterSync.ts:91-164`) with the same optional fields, using the `propagation_methods` convention (`[]` clears, omission preserves):

```ts
origin_countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(64).optional(),
proven_regions: z.array(z.object({
  country_code: z.string().regex(/^[A-Z]{2}$/),
  subdivision_code: z.string().regex(/^[A-Z0-9]{1,6}$/).optional(),
  source_refs: sourceRefSchema.optional(),
})).max(128).optional(),
adaptation_term_codes: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,63}$/)).max(64).optional(),
```

Wiring in `master-plants.ts`:

- `normalizeMasterPlant` (`:389`) reads the three join tables for the row and emits `origin_countries`, `proven_regions`, `adaptation_term_codes`, plus a `resolved_geography` view (see §3).
- `upsertMasterPlantRow` (`:1023`) writes the join tables inside the existing transaction with replace semantics: when the field is present, delete the plant's rows for that category and insert the new set; when omitted, leave them untouched. This keeps the existing PATCH merge behavior.
- `queuePlantSync` (`:692`) is unchanged — the arrays ride inside the existing `upsert_plant` outbox payload, so **no `sync_outbox` schema or routing change is needed**.

Convex `upsertPlantFromBackend` (`masterSync.ts:267`) gains a post-patch step that replaces the three join tables for the plant and rejects unknown term codes. Archived term codes are rejected only when they are **not already assigned to that plant**: a code already assigned is preserved (history retained) and never re-added, so re-saving a plant that holds an archived term succeeds while adding a new assignment to it fails (throws → outbox row fails with a visible error, matching existing failure handling in `sync-outbox.ts:114-126`).

### 2.4 Term catalog mirror hydration

The SQLite tables in §2.2 are a read-only mirror of the Convex term catalog (Convex remains authoritative, exactly like `plantGroups`).

- `POST /api/adaptation-terms/refresh` (admin-only, mounted like other routers in `app.ts`) hydrates the mirror from Convex via `syncService.adminQuery("plantAdmin:listAdaptationTerms", ...)` — the same mechanism as the existing `sync-convex-to-sqlite` control (`useBackendPlants.ts:135-152`).
- The TaxonomyManager calls refresh after every successful term mutation and on page load; a manual "Refresh" button mirrors the Groups page.
- Validation policy: when the mirror is non-empty, the SQLite API rejects unknown/archived term codes and unknown country codes at save time (fail-closed). When the mirror is empty (never hydrated), the API accepts structurally valid codes and Convex remains the authoritative gate. This keeps the SQLite authoring boundary working with Convex unavailable, per the P3.1 constraint.

---

## 3. Category-level fallback: queries and mutation semantics (source plan §18.3, §5 decision 2)

Three independent categories: **origin**, **proven regions**, **adaptation**.

### 3.1 Read-time resolution (Convex projection)

Extend `loadCanonicalPlantLibrary` (`canonicalPlantLibrary.ts:140-312`):

1. Load `plantOriginCountries`, `plantProvenRegions`, `plantAdaptationTerms`, `adaptationTerms`, `adaptationTermI18n` in the same batch as `plantI18n`/`plantCare`.
2. For each plant, compute `own[category]` from its join rows.
3. Resolve the base plant via the existing `baseCandidate()` (`:88-101`).
4. `resolved[category] = own[category].length > 0 ? own[category] : (base ? resolvedBase[category] : [])` — a cultivar replaces a whole category only when it has its own assignments in that category; partial merge is not allowed.
5. Emit on the projected item (additive fields, `_searchText` unchanged):
   - `originCountries: [{ code, name }]` — localized names via the shared country utility (§4);
   - `provenRegions: [{ code, subdivisionCode?, name }]`;
   - `adaptation: { temperature: [{ code, label }], moisture: [...], climate: [...], season: [...] }` — labels via `adaptationTermI18n` with the §8 fallback chain;
   - `geographySource: { origin: "own" | "inherited" | "none", ... }` and `inheritedFromId` reusing the existing field name (`:257`).

Missing values are absent from the arrays — never a negative marker (source plan §2).

### 3.2 Read-time resolution (SQLite API)

Add `resolvePlantGeography(db, plantId)` in `master-plants.ts` mirroring the Convex rule:

- Own rows from the three join tables.
- If the plant is a cultivar (`!isSqliteDisplayBasePlant`, `:634`) and a category has no own rows, find the base via the existing species-key + display-base logic (`sqliteSpeciesKey`/`sqliteDeleteGuard` pattern, `:639-673`) and inherit with `source: "inherited"` plus the base row id.
- `normalizeMasterPlant` returns both `origin_countries`/`proven_regions`/`adaptation_term_codes` (own, for editing) and `resolved_geography` (for display).

### 3.3 Mutation semantics

- Writes always target the specific plant's own rows. Removing an assignment deletes only the plant's own row; base rows are never modified by cultivar edits.
- Because resolution is computed at read time, changing a base plant's geography automatically propagates to cultivars with no own assignments — no fan-out writes, matching the description/care inheritance behavior.
- Assigning to an archived term is rejected (SQLite API when mirror is populated; Convex `upsertPlantFromBackend` rejects an archived code only when it is not already assigned to the plant, so re-syncing a plant that already holds the archived assignment succeeds). Existing assignments to an archived term remain readable and are displayed as archived.

---

## 4. Country/subdivision utility and localized names (source plan §18.4, §10)

### 4.1 Shared module

New file `packages/shared/src/countries.ts` (plus `packages/shared/src/data/countries.ts` for the table) — `packages/shared` is already imported by API, Convex, dashboard, and mobile (e.g. `plantPropagation`, `plantBase`), giving one source for every consumer:

```ts
export interface CountryInfo { code: string; nameVi: string; nameEn: string; }
export const COUNTRIES: readonly CountryInfo[];            // all ISO 3166-1 alpha-2
export const isValidCountryCode = (code: string): boolean; // strict "XX" against catalog
export const countryName = (code: string, locale: string): string;
// fallback chain: requested locale → "en" → the code itself (machine-code safety fallback, §8)
export const SUPPORTED_COUNTRY_LOCALES = ["vi", "en"] as const;
```

Rules:

- Codes are stored uppercase ISO 3166-1 alpha-2 and validated against the catalog; unsupported codes are rejected (§7 constraint).
- The country-name source is **this shared module** (§10 acceptance criterion) — no other country-name implementation is introduced anywhere (verified: no existing countryCode/subdivision utility exists in `packages/` or `apps/`).
- `countryName` never returns an empty string for a valid code: last resort is the code itself, never a fabricated label.
- Data is bundled statically (no npm dependency — not installable in this environment). The table content (249 ISO codes, Vietnamese + English names) is sourced from CLDR-derived public data and hand-curated in one bounded file; tests assert catalog completeness (≥249 entries, unique codes, non-empty names).

### 4.2 Subdivisions

- `subdivisionCode` is optional and, for Release 1, validated only by format (`/^[A-Z0-9]{1,6}$/`) and by membership in an **empty-by-default** subdivision map per country (source plan §2: add subdivisions only for demonstrated product cases).
- The ISO 3166-2 subdivision catalog is explicitly deferred; the design keeps the column/shape so it can be added without a migration.

---

## 5. Initial adaptation vocabulary (source plan §18.5, §6)

Fixed dimensions and initial terms, each with a concise editorial definition in Vietnamese and English. Codes are the stable machine identifiers; labels are the localized display strings.

### temperature

| code | vi label | vi definition | en label | en definition |
|---|---|---|---|---|
| `cool` | Mát | Thích hợp với điều kiện mát, nhiệt độ thấp hơn ôn hòa; sinh trưởng chậm hơn khi nắng nóng kéo dài. | Cool | Suited to cool conditions with lower temperatures; growth slows during extended heat. |
| `mild` | Ôn hòa | Thích hợp với nhiệt độ trung bình, không quá nóng hoặc quá lạnh. | Mild | Suited to moderate temperatures, neither very hot nor very cold. |
| `warm` | Ấm | Thích hợp với nhiệt độ ấm, trên mức ôn hòa nhưng chưa đến mức nóng gay gắt. | Warm | Suited to warm temperatures above mild but below intense heat. |
| `hot` | Nóng | Thích hợp với nhiệt độ cao, sinh trưởng tốt trong mùa nóng. | Hot | Suited to high temperatures; performs well in hot seasons. |

### moisture

| code | vi label | vi definition | en label | en definition |
|---|---|---|---|---|
| `dry` | Khô | Chịu được điều kiện khô, ít nước; không ưa đất ngập úng. | Dry | Tolerates dry conditions and low water; dislikes waterlogging. |
| `moderate` | Vừa phải | Cần độ ẩm trung bình, đất ẩm đều nhưng không quá ướt. | Moderate | Needs average moisture: evenly damp soil without waterlogging. |
| `humid` | Ẩm | Thích hợp với độ ẩm không khí và đất cao. | Humid | Suited to high air and soil moisture. |

### climate

| code | vi label | vi definition | en label | en definition |
|---|---|---|---|---|
| `tropical` | Nhiệt đới | Thích hợp với khí hậu nhiệt đới nóng ẩm quanh năm. | Tropical | Suited to hot, humid tropical climates year-round. |
| `subtropical` | Cận nhiệt đới | Thích hợp với khí hậu cận nhiệt đới, mùa hè nóng và mùa đông ôn hòa. | Subtropical | Suited to subtropical climates with hot summers and mild winters. |
| `temperate` | Ôn đới | Thích hợp với khí hậu ôn đới, bốn mùa rõ rệt. | Temperate | Suited to temperate climates with distinct seasons. |

### season

| code | vi label | vi definition | en label | en definition |
|---|---|---|---|---|
| `short_season` | Vụ ngắn | Hoàn thành vòng đời trong thời gian ngắn, phù hợp vụ gối hoặc vụ ngắn ngày. | Short season | Completes its cycle quickly; suits short or succession plantings. |
| `long_season` | Vụ dài | Cần thời gian sinh trưởng dài để đạt năng suất tốt nhất. | Long season | Needs a long growing period for best yield. |
| `frost_free` | Không sương giá | Nhạy cảm với sương giá; cần trồng trong mùa không sương. | Frost-free | Sensitive to frost; plant only in frost-free periods. |

Rules honored (source plan §6): codes are language-neutral and immutable; each term belongs to exactly one dimension; multiple terms per dimension per plant are allowed; `hot_humid`-style combined terms are prohibited (combine independent dimensions instead); editors cannot create free-form assignments.

Initial terms must have **both** vi and en labels before the term can be set `active` (publication gate, §6/§12A).

---

## 6. Dashboard wire-level operations and validation (source plan §18.6, §9)

No parallel CMS, no second auth shell: everything below extends the existing dashboard, admin proxy allowlists, and plant editor.

### 6.1 New taxonomy-management page (GroupManager pattern)

1. `types.ts`: extend `PageKey` with `"taxonomy"`; add `AdaptationTerm`, `AdaptationTermTranslation`, `TermDimension` types.
2. `Sidebar.tsx`: add a `NAV_ITEMS` entry `{ key: "taxonomy", label: "Taxonomy", icon: "🏷️" }`.
3. `App.tsx`: render `<TaxonomyManager .../>` for the new page key.
4. New `hooks/useAdaptationTerms.ts` shaped exactly like `useGroups.ts` (`convexAdminQuery`/`convexAdminMutation`).
5. New `components/TaxonomyManager.tsx` shaped like `GroupManager.tsx`:
   - browse terms grouped by dimension (section headers per dimension, `sortOrder`);
   - per-term translation cards for vi and en: label, optional description, and a translation-state badge (`missing | machine_translated | qa_passed | human_reviewed | approved`);
   - usage count per term ("N plants use this term") before archive;
   - create (admin), edit labels/descriptions (editor+admin), reorder (admin), archive/unarchive (admin); no free-form dimensions or codes.

### 6.2 Admin proxy allowlist additions (`apps/api/src/convex-admin.ts`)

```ts
allowedQueries.add("plantAdmin:listAdaptationTerms");           // grouped terms + translations + usage counts
allowedMutations.add("plantAdmin:createAdaptationTerm");         // admin-only
allowedMutations.add("plantAdmin:updateAdaptationTerm");         // labels/descriptions/status, editor+admin
allowedMutations.add("plantAdmin:updateAdaptationTermTranslation"); // per-locale translation + translationStatus
allowedMutations.add("plantAdmin:reorderAdaptationTerms");       // admin-only
allowedMutations.add("plantAdmin:archiveAdaptationTerm");        // admin-only
adminOnlyMutations.add("plantAdmin:createAdaptationTerm");
adminOnlyMutations.add("plantAdmin:reorderAdaptationTerms");
adminOnlyMutations.add("plantAdmin:archiveAdaptationTerm");
```

Convex-side mutations live in `plantAdmin.ts`, each validating `requireAdminServiceToken` and the same invariants as the equivalent group functions. `listAdaptationTerms` returns usage counts by joining `plantAdaptationTerms` (Convex side) so the archive confirmation is honest.

### 6.3 Geography section in the existing plant editor

New `Geography` tab in `PlantManager.tsx` (extend `FormTab` and `PlantFormState`):

- **Origin countries**: multi-select of countries (localized names from `GET /api/countries` or the shared utility bundled into the dashboard); values `origin_countries`.
- **Proven regions**: country select + optional subdivision text field (validated by format; catalog deferred); values `proven_regions`.
- **Adaptation**: pickers grouped by dimension listing only `active` terms from the mirror (`GET /api/adaptation-terms`); multi-select per dimension; values `adaptation_term_codes`.
- **Cultivar inheritance affordance**: when the plant is a cultivar and a category resolves from the base, show a chip "Inherited from base (species)" with an explicit "Override" action that starts with the inherited set copied to own rows; per category, not per term (§5 decision 2 — category-level).
- Save path is unchanged: `PATCH /api/master-plants/:id` with the new fields; the existing SQLite-first + outbox publish flow applies with no new controls.

### 6.4 Validation summary

| Layer | Validation | Mechanism |
|---|---|---|
| Dashboard form | country codes in catalog; term codes active (from mirror); duplicates rejected; required vi/en labels on term publish | client-side + server responses |
| SQLite API (zod) | field shape/country regex/term-code regex; country codes in shared catalog; term codes exist + active when mirror populated; `[]` clears / omitted preserves | `masterPlantObjectSchema` + mirror lookups |
| Convex `upsertPlantFromBackend` | authoritative: term code exists; archived code rejected only when not already assigned to the plant (already-assigned codes preserved); country codes valid; throws on violation → outbox row fails visibly | `masterSync.ts` patch step |
| Convex admin term mutations | unique code; dimension in the fixed set; translation rows have valid locale + `translationStatus`; archive refuses nothing (keeps history) but blocks new assignments | `plantAdmin.ts` validators |

---

## 7. Migration, rollback, test, and pilot-seeding plan (source plan §18.7)

### 7.1 SQLite migration

- **Up**: additive `CREATE TABLE IF NOT EXISTS` for the five tables in §2.2 inside `runMigrations` (`db.ts:130`). Existing databases upgrade in place; no `ensureColumn`, no table rebuild. A new `sync_reconciliation`-style report function (`adaptationTermsHealth(db)`) counts mirror rows, join rows, and orphaned join rows for the verification gate.
- **Rollback**: back up `apps/api/data/richfarm.db` first (established practice). Revert = drop the five tables; `master_plants`, `master_plant_i18n`, and `sync_outbox` are untouched, so no plant content is lost. Because Convex is the authoritative term store, the mirror can always be re-hydrated.

### 7.2 Convex migration

- **Up**: add the five `defineTable` entries to `schema.ts` and deploy (schema additions are additive). Initial term data is seeded idempotently by code from a new `data/adaptationTermsSeed.ts` (pattern: `data/plantsMasterSeed.ts` / `data/plantTaxonomyI18nSeed.ts`), inserted only when `code` is absent — safe to run repeatedly.
- **Rollback**: redeploy the previous schema version; because assignments also carry `sourceRefs` provenance, removing tables would only drop geography data, never plant identity. No data migration runs automatically; deployment and data mutation remain separate authorization points (source plan §1).

### 7.3 Test plan (maps to source plan §14)

- **Shared** (`packages/shared` tests): country catalog completeness + `countryName` fallback chain (`requested → en → code`); regex validators for country/subdivision/term codes.
- **API** (`apps/api` tests): payload zod validation (invalid country code, archived/unknown term code, duplicate suppression, `[]`-clears vs omitted-preserves); join-table round-trip through `normalizeMasterPlant`/`upsertMasterPlantRow`; `resolvePlantGeography` inheritance for a cultivar (own-override and base-inherit cases); outbox payload contains the arrays; mirror refresh endpoint hydrates and mirrors the fail-closed/fail-open policy.
- **Convex** (`packages/convex` tests): `upsertPlantFromBackend` writes the three join tables; rejects unknown term codes; rejects adding a new assignment to an archived term while re-saving a plant that already holds one succeeds (history preserved); projection resolves category-level fallback (own ≥ base) and localized labels with the §8 fallback chain; archive keeps historical assignments; `listAdaptationTerms` usage counts.
- **Dashboard** (extend `PlantManager.test.ts` pattern): TaxonomyManager CRUD + translation-state badges + admin-only button visibility; geography tab save payload; inherited-vs-own chip rendering.
- **Quality gate** (`plantLibraryQuality.ts`): extend the report with `missingMandatoryAdaptationTranslationCount` (vi/en labels per active term) and add it to `assertQualityGate` content-debt checks.
- **Boundary gate**: mobile typecheck (projection shape is additive; mobile consumers compile unchanged).

### 7.4 Pilot seeding (Release 3 mechanism, not data)

- Release 1 adds **test fixtures only** for the three example cultivars from §4 of the source plan (`tomato-brandywine`, `tomato-vn-cherry-01`, `tomato-tommy-toe`), used to verify origin/proven/adaptation round-trips and cross-country semantics. No production pilot data is seeded in Release 1; catalog-wide backfill remains gated on the pilot review (§13).

---

## 8. Concrete Release 1 acceptance and verification requirements

Before code changes begin, these must hold (each maps to a source-plan acceptance criterion):

1. **§5/§7 model**: the three example cultivars from §4 of the source plan are representable with no free-form tags and without enumerating all growing countries. → verified by the §7.3 fixtures.
2. **Unique constraints**: code, term+locale translation, plant↔term, origin country, proven region are unique per the §2 schema. → verified by API tests exercising the UNIQUE constraints.
3. **Archive semantics**: archiving a term preserves historical assignments; new assignments to it are rejected; dashboard and read APIs are consistent. → verified by Convex tests (§14.1 "archive behavior").
4. **Category-level inheritance**: a cultivar with no own assignments in a category inherits the whole category from its base; any own assignment replaces the whole category; writes never mutate base rows. → verified by API `resolvePlantGeography` and Convex projection tests.
5. **Missing = unknown**: a plant with no geography is accessible, unlabeled, and never marked unsuitable (§10). → verified by projection tests with no-geography fixtures.
6. **Locale fallback**: taxonomy labels follow `requested → en → first usable → machine code`, with machine code as a dashboard-only safety fallback, never a published user label (§8). → verified by shared/Convex fallback tests.
7. **Country names**: every visible country label comes from the shared `countries` module (§10). → verified by shared tests + dashboard rendering test.
8. **vi/en publication gate**: every `active` adaptation term has vi + en labels; the quality report surfaces any violation. → verified by the extended `plantLibraryQuality` gate.
9. **No parallel CMS**: all new UI is inside the existing dashboard; all new Convex functions are on the admin-proxy allowlist with existing role gates; no new role is introduced (§9.3). → verified by the allowlist diff + dashboard build.
10. **Existing contracts preserved**: Markdown preserve/clear/replace, `plant_measurements` ownership, and the outbox payload path are unchanged; geography rides inside the existing `upsert_plant` payload. → verified by regression tests (API 51/51, Convex 82/82, dashboard build, mobile typecheck as boundary).
11. **Verified gates**: `git diff --check` clean; API tests + build, Convex tests + typecheck, dashboard tests + build, shared tests, mobile typecheck all pass before any commit is proposed.

---

## 9. Open approval points (require product confirmation before implementation)

1. **Dashboard placement**: no settings/content area exists (evidence §1.3); the recommendation is a new top-level `Taxonomy` nav item, rendered exactly like Groups. Alternative: embed term management inside the Plants page — not recommended (mixes reference-data management with per-plant authoring).
2. **Country-name data volume**: bundling all 249 ISO 3166-1 alpha-2 codes with vi + en names is a bounded but real content task (≈500 strings). Confirm CLDR-derived public-domain names are acceptable and that Vietnamese editorial normalization (e.g. "Hoa Kỳ" vs "Mỹ", "Việt Nam") is centralized in the shared module.
3. **Subdivision catalog**: deferred by default (§4.2); confirm format-only validation is acceptable for Release 1.
4. **Term mirror policy**: SQLite mirror is hydrated on taxonomy saves + manual refresh; plant saves are fail-closed only when the mirror is populated (§2.4). Confirm the fail-open-when-empty behavior is acceptable for the offline authoring boundary.

## 10. Immediate next implementation order (after approval)

1. Add shared `countries` module + data + tests (no new dependencies).
2. Extend `schema.ts` (Convex) and `db.ts` (SQLite) with the five tables each; seed `adaptationTermsSeed`.
3. Extend payload schema, `normalizeMasterPlant`, `upsertMasterPlantRow`, `upsertPlantFromBackend`, `loadCanonicalPlantLibrary` (projection + fallback), and `resolvePlantGeography`.
4. Add `plantAdmin:*` term mutations + admin-proxy allowlist entries; add `/api/adaptation-terms` mirror routes; add SQLite hydration.
5. Add dashboard `Taxonomy` page (Sidebar + App + hook + component) and the plant-editor Geography tab.
6. Extend `plantLibraryQuality`; add fixtures and the full test matrix of §7.3; run the verification gates of §8.
