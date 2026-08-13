# Plant Geography, Adaptation, and Measurement Localization Plan

Date: 2026-08-11

Status: Approved for implementation

## 1. Purpose

Define a minimal implementation path for:

- representing the origin, proven growing regions, and climate adaptation of plant varieties or cultivars;
- managing adaptation terminology in Vietnamese and English initially, with an AI-assisted path to at least five locales, as an extension of the existing dashboard;
- supporting geographic filtering and soft personalization without treating country borders as climate boundaries;
- displaying measurements in both metric and imperial units without allowing locale content to diverge;
- preserving a path toward future calendar and pest/disease alerts without building that system prematurely.

This implementation direction is approved. Concrete schema and API details must still be verified against the repository during implementation, but the product decisions in Section 17 are closed. Catalog-wide backfill must wait for the pilot review.

## 2. Agreed direction

Plant geography has three distinct meanings and must not be stored as one ambiguous list of tags:

1. **Origin**: where a variety or cultivar originated or was developed.
2. **Proven region**: a country or subdivision where there is reliable evidence that it is grown successfully or is locally adapted.
3. **Adaptation**: climate and seasonal conditions to which it is suited.

Country codes provide provenance and coarse evidence. They must not be treated as the primary suitability signal. A cultivar proven in Vietnam may also suit northern Australia when its adaptation characteristics match, even when Australia is not yet listed as a proven region.

Missing geography means **unknown**, not unsuitable or absent.

## 3. Scope

### 3.1 Included in the first implementation

- Origin countries using stable country codes.
- Proven countries, with an optional subdivision only when justified by a real use case.
- A controlled adaptation taxonomy.
- Vietnamese and English adaptation labels and descriptions as the initial publication gate.
- AI-assisted translation, automated QA, and human spot-checking for later locales, with a target of at least five locales.
- Dashboard workflows for managing terms, translations, and plant assignments.
- Locale-aware display of geography and adaptation.
- Search/filter support and, after a pilot, optional soft ranking.
- A shared measurement representation and conversion policy for localized Markdown content.

### 3.2 Explicitly deferred

- GIS shapes, coordinates, and polygon-based suitability.
- Exhaustive lists of every country where a plant may grow.
- A general-purpose hierarchical taxonomy engine.
- Dashboard-defined arbitrary adaptation dimensions.
- Hard exclusion of plants based only on country.
- Weather-driven calendars.
- Pest and disease alerts based on live conditions.
- Catalog-wide backfill before the pilot is evaluated.
- Soft matching before the pilot demonstrates reliable taxonomy assignments.
- Pest/disease dual-unit content until pest/disease localization exists.

### 3.3 Existing-dashboard integration constraint

This work must extend the dashboard that RichFarm already uses. It must not introduce a separate CMS application, a second admin shell, or a parallel authentication and authorization system.

The implementation should reuse the dashboard's existing:

- navigation and page layout;
- authentication, authorization, and admin roles;
- plant list and plant editing flows;
- localized-content editing patterns;
- form controls, validation, notifications, and confirmation dialogs;
- draft, review, and publication workflow where available;
- audit metadata and activity history where available;
- API/client conventions and shared UI components.

New adaptation functionality should appear in two places inside the current dashboard:

1. A small taxonomy-management page under the most appropriate existing content/settings area.
2. Geography and adaptation sections inside the existing plant editor.

The Phase 0 inspection must identify the exact existing routes and components before implementation. The plan intentionally does not prescribe a new dashboard information architecture without that evidence.

## 4. Illustrative data semantics

The following examples describe intended meaning, not final storage syntax.

### 4.1 US cultivar

```yaml
plant: tomato-brandywine
originCountries: [US]
provenRegions:
  - countryCode: US
adaptation:
  temperature: [warm]
  moisture: [moderate]
  climate: [temperate]
  season: [frost_free]
```

The US origin does not imply suitability everywhere in the US or exclusion outside the US.

### 4.2 Vietnamese cultivar

```yaml
plant: tomato-vn-cherry-01
originCountries: [VN]
provenRegions:
  - countryCode: VN
adaptation:
  temperature: [hot]
  moisture: [humid]
  climate: [tropical]
  season: [frost_free]
```

The adaptation terms are the principal suitability signals. The Vietnamese proven region increases confidence but is not an exclusive boundary.

### 4.3 Australian cultivar

```yaml
plant: tomato-tommy-toe
originCountries: [AU]
provenRegions:
  - countryCode: AU
adaptation:
  temperature: [warm]
  moisture: [moderate]
  climate: [temperate]
  season: [frost_free]
```

This cultivar may still be relevant to users in other countries whose local conditions match.

## 5. Phase 0: confirmed repository findings and closed design gates

Repository review confirmed:

- `plantsMaster` currently contains a mixture of species-level and cultivar-level records.
- Base-to-cultivar inheritance already exists through `inheritedFromId` and fallback behavior in the canonical plant library.
- RichFarm has one existing dashboard with Plants, Groups, and Photos; there is no separate CMS or settings application.
- A taxonomy-management page can follow the existing `GroupManager` pattern.
- Search and filtering exist, but ranking and recommendations do not. Soft matching is therefore a new feature and remains a later release.
- No shared country or subdivision utility currently exists; the implementation must introduce a small standards-based utility rather than assume one is available.
- `timezone` is actively written through profile updates and read by care scheduling and notifications. USDA `zoneCode` and `frostDates` exist on the user schema but are currently not read or written by product flows.
- Dashboard roles are currently limited to `admin` and `editor`. The former `viewer` role was deliberately removed, and the database role constraint accepts only those two roles.
- The current localized plant projection falls back from the requested locale to hardcoded English and then to the first usable localized value. This existing behavior must be accounted for before introducing any new fallback abstraction.
- Plant Markdown is stored as byte-preserving strings with `absent = preserve` and `null = clear` behavior.
- The existing SQLite name `plant_measurements` is already used for user measurement logs and must not be reused for content measurement functionality.
- `pestsDiseases` does not yet have a localization model.

During implementation, verify the smallest remaining technical details:

- how the dashboard manages plants and localized content;
- how draft, review, publish, and locale fallback currently work;
- the exact routes, components, permissions, and API conventions to extend;
- how measurements are currently embedded in localized Markdown.

Closed decisions:

1. Geography is assigned to individual `plantsMaster` records, whether the record represents a base plant or cultivar.
2. Inheritance uses category-level fallback: a cultivar inherits a complete geography category from its base only when it has no assignments of its own in that category. Any cultivar assignments replace the inherited category. The three independent categories are origin, proven regions, and adaptation.
3. A proven region means a country or subdivision with reliable evidence that the specific plant record is grown successfully or locally adapted there. It is not an exhaustive allowlist.
4. Vietnamese and English are the initial publication gate. Later locales do not block plant publication while the translation workflow is being established.
5. Initial releases display and filter terms. Soft matching is deferred until after the pilot.
6. Ordinary plant editors assign active terms. Elevated existing dashboard permissions govern term creation and archival.
7. Validated Markdown authoring syntax is preferred over content tokens for the first measurement implementation.
8. Plant dual-unit validation is implemented first. Pest/disease dual-unit validation follows only after pest/disease localization is designed.
9. Dormant `zoneCode` and `frostDates` fields are not cleaned up or activated in this scope; they belong to future calendar/personalization work.

### Acceptance criteria

- `origin`, `proven region`, and `adaptation` each have one documented meaning.
- Assignment ownership and inheritance are unambiguous.
- Missing values are explicitly treated as unknown.
- Concrete persistence changes preserve existing plant inheritance and Markdown update contracts.

## 6. Phase 1: define the MVP adaptation taxonomy

Keep adaptation dimensions controlled by the application:

```text
temperature
moisture
climate
season
```

Proposed initial terms:

```yaml
temperature:
  - cool
  - mild
  - warm
  - hot

moisture:
  - dry
  - moderate
  - humid

climate:
  - tropical
  - subtropical
  - temperate

season:
  - short_season
  - long_season
  - frost_free
```

Rules:

- Codes are stable, language-neutral machine identifiers.
- Editors cannot create free-form assignments.
- A term belongs to exactly one dimension.
- A plant may have more than one term in a dimension when that is biologically meaningful.
- Terms may be active or archived.
- An assigned term is archived instead of physically deleted.
- Creating a new dimension requires an intentional product and engineering change.
- Similar terms such as `hot_humid`, `humid_tropical`, and `warm_wet` must not proliferate; independent dimensions should be combined instead.

### Acceptance criteria

- Every term has a concise editorial definition.
- No initial terms are unexplained synonyms.
- Every active term has Vietnamese and English labels before publication.
- Later locale translations can progress independently without changing plant assignments.
- The taxonomy remains small enough to understand without a hierarchy.

## 7. Phase 2: design the persistence model

The expected minimal logical model contains:

```text
adaptation_terms
- id
- code
- dimension
- status
- sortOrder
- createdAt
- updatedAt
```

```text
adaptation_term_translations
- termId
- locale
- label
- description
- translationStatus
- updatedAt
```

```text
plant_adaptation_terms
- plantId
- termId
```

```text
plant_origin_countries
- plantId
- countryCode
```

```text
plant_proven_regions
- plantId
- countryCode
- subdivisionCode (optional)
```

The implementation should reuse existing localization, publication, audit, and country-code mechanisms where available rather than duplicate them.

Expected integrity constraints:

- unique adaptation code;
- unique translation per term and locale;
- unique plant-to-term assignment;
- unique origin/proven assignment;
- no new assignment to an archived term;
- archiving a term does not erase historical plant assignments;
- unsupported locale values and country codes are rejected.

### Acceptance criteria

- The model represents the three example cultivars without listing every possible growing country.
- Changing a translated label does not change its code or plant assignments.
- Adding a sixth locale does not require modifying plant records.
- The persistence choice supports the current database's normal filtering patterns without special infrastructure.

## 8. Phase 3: establish module and service boundaries

Keep responsibilities separated:

```text
Adaptation taxonomy
├── terms
├── translations
└── translation completeness

Plant geography
├── origin assignments
├── proven-region assignments
└── adaptation assignments

Localization
├── locale selection
├── fallback
└── publish validation
```

Required operations:

- list terms by dimension and locale;
- create an approved term inside an existing dimension;
- edit, review, and publish translations;
- archive a term;
- assign or remove plant adaptation terms;
- assign origin countries and proven regions;
- read a plant's localized geography presentation;
- report missing mandatory translations.

Target fallback behavior for the new taxonomy must remain compatible with the current plant projection:

```text
requested locale → English → first usable localized value → machine code
```

The first three steps reflect the current projection behavior. The machine code is an additional dashboard safety fallback for taxonomy records, not an acceptable published user-facing label. A configurable fallback locale should not be introduced as part of this task unless separately justified.

### Acceptance criteria

- Taxonomy management and plant assignment can be tested independently.
- Locale fallback is deterministic.
- Translation edits cannot alter matching semantics.
- Archive behavior is consistent across dashboard and read APIs.

## 9. Phase 4: extend the existing dashboard

This phase adds capabilities to the current RichFarm dashboard. It is not a plan to create or deploy a separate CMS.

Before adding screens, map the new capabilities onto the existing dashboard's navigation, permission checks, plant editor, localization workflow, UI primitives, and API conventions. Prefer extending an existing plant-content or settings area over adding a new top-level product section.

### 9.1 Taxonomy management

Authorized dashboard users should be able to:

- browse terms grouped by dimension;
- create a term within an allowed dimension;
- enter labels and optional descriptions for each required locale;
- see missing, machine-translated, QA-passed, reviewed, and published translation states;
- reorder and archive terms;
- see how many plants use a term before archiving it.

Editors should not be able to:

- edit a term code after it is in use without a controlled migration;
- create arbitrary dimensions;
- create free-form plant tags;
- physically delete an assigned term;
- publish a term without Vietnamese and English labels;

The taxonomy page should use the dashboard's current list, detail, locale-switching, validation, and publication patterns. Do not build a taxonomy-specific design system or duplicate generic admin capabilities already present in the dashboard.

### 9.2 Plant editing

Add separate sections:

```text
Origin
- country selection

Proven regions
- country
- optional subdivision

Adaptation
- grouped choices by dimension
```

The dashboard must explain that:

- origin is not suitability;
- proven regions are evidence, not an exhaustive allowlist;
- unlisted countries are unknown, not unsuitable;
- adaptation should reflect supported evidence, not editorial guesswork.

These fields must be added to the current plant create/edit experience rather than placed in a second plant-management workflow. Existing plant permissions, save behavior, dirty-state protection, validation summaries, and draft/publish controls must continue to govern the record.

### 9.3 Dashboard permissions and rollout

Reuse the two existing roles, `admin` and `editor`. Do not introduce localization-editor, viewer, or other hypothetical roles as part of this feature. Introduce a new permission concept only if the existing role boundary cannot safely express the required behavior.

Initial responsibility split:

- `editor` can assign active origin, proven-region, and adaptation values and edit draft term translations;
- `admin` can perform all editor actions and additionally create, reorder, archive, and publish taxonomy terms and translations;
- there is no current read-only dashboard role, so this feature does not define read-only-role behavior;
- if a read-only role is introduced by a separate future change, it must remain read-only for these screens as well.

If the dashboard has no equivalent review workflow, that gap should be documented during Phase 0 rather than solved by creating an independent CMS subsystem in this task.

### Acceptance criteria

- An editor can populate a plant without entering free-form geography.
- Missing translations are visible before publication.
- Archived terms cannot be newly assigned.
- Existing assignments remain visible and understandable after archival.
- All new screens and fields are reachable through the existing dashboard.
- Users do not authenticate separately or switch to another admin application.
- Existing dashboard roles and permissions remain authoritative.
- Plant geography is saved through the existing plant editing workflow.

## 10. Phase 5: localized read experience and filtering

Plant details should present origin, proven regions, and adaptation separately. Adaptation terms use the selected locale's labels.

Avoid constructing important prose by concatenating translated labels. Languages differ in word order and grammar, so complete explanatory templates should be localized when sentences are required.

Initial filtering behavior:

- allow filtering by country evidence and adaptation terms;
- never exclude a plant only because the user's country is missing from proven regions;
- never interpret missing geography as a negative match;
- do not use origin as a suitability signal;
- preserve discoverability across countries when adaptation matches.

### Acceptance criteria

- A Vietnamese cultivar remains discoverable to a user in Australia when adaptation matches.
- A cultivar with no geography remains accessible and is not labeled unsuitable.
- All visible term labels follow the active locale and fallback policy.
- Country names use the shared country-name localization source introduced by this work.

## 11. Phase 6: pilot soft matching

Only start matching after dashboard assignments and pilot data have been reviewed.

Initial semantics:

```text
adaptation match       → primary positive signal
proven country match   → confidence increase
subdivision match      → additional confidence increase
origin match           → no suitability score
unknown                → no penalty
explicit conflict      → lower rank, not an automatic exclusion
```

The user-facing explanation must refer to the actual suitability signal, for example:

> Suitable for hot, humid conditions similar to your location.

It must not claim suitability merely because the plant originated in the user's country.

### Acceptance criteria

- Every ranking adjustment can be traced to explicit matching inputs.
- Unknown data is neutral.
- Origin does not affect suitability ranking.
- Country evidence cannot override a clear adaptation conflict without an explicit product rule.

## 12. Phase 7: dual-unit localized measurements

### 12.1 Phase 7A: plant Markdown validation

Fixed plant Markdown must display both metric and imperial measurements:

- Vietnamese: metric first, imperial second.
- English: imperial first, metric second.
- Other locales: order follows an explicit locale policy, not independent editorial conversion.

Examples:

```text
vi: 30–60 cm (12–24 in)
en: 12–24 in (30–60 cm)
```

Applicable dimensions initially include:

- length, depth, height, and spacing;
- area;
- volume;
- mass;
- temperature;
- rainfall and watering amounts;
- speed when used in content.

No dual-system conversion is needed for:

- percentages;
- pH;
- counts;
- unitless ratios.

Core rules:

- Maintain one canonical measurement value or range.
- Produce metric and imperial representations with one shared conversion utility.
- Locale controls ordering and presentation, not the converted value.
- Do not preserve meaningless decimal precision after conversion.
- Convert both endpoints of a range using the same policy.
- Round practical guidance to useful gardening increments.
- Do not allow separately authored locale Markdown to contain independently converted measurements without validation.

The first implementation uses validated authoring syntax and preserves the current Markdown string contract. Editors author a readable dual-unit literal, while dashboard and publication validation parse and verify it. The validator does not silently rewrite Markdown.

This preserves existing update semantics:

```text
absent → preserve
null   → clear
string → replace byte-for-byte
```

Validation must check:

- presence of both unit systems where conversion applies;
- metric-first order in Vietnamese and imperial-first order in English;
- numeric equivalence within the approved rounding tolerance;
- consistent conversion of both endpoints of a range;
- supported units and dimensions;
- exclusions for percentages, pH, counts, and unitless ratios;
- divergence between localized versions of the same measurement when they can be correlated safely.

No new content-measurement table is required for this validated-literal approach. If later work introduces one, it must not use the already occupied `plant_measurements` name.

### 12.2 Phase 7B: pest/disease localization foundation

Before applying the measurement policy to pests and diseases, design their localization model and dashboard editing workflow. This is a separate scope because `pestsDiseases` currently has no i18n representation.

### 12.3 Phase 7C: pest/disease dual-unit validation

After localized pest/disease content exists, reuse the plant Markdown validation rules rather than create a second conversion implementation.

### Acceptance criteria

- Every supported locale renders the same underlying quantitative meaning.
- Vietnamese and English render the required unit order.
- Range conversion and rounding are deterministic.
- A source-value change updates every locale representation.
- Validation detects unsupported units or independently diverging values.
- Existing plant Markdown preserve/clear/replace behavior remains unchanged.
- Pest/disease work does not block the initial plant measurement release.

## 12A. Translation quality and expansion policy

Vietnamese is the canonical authoring source and English is the initially approved companion locale. Both are required for the initial publication gate.

Later locales follow this pipeline:

1. Translate from the approved Vietnamese source, using approved English as terminology reference rather than as a mandatory translation pivot.
2. Apply a controlled agricultural glossary and locale style guide.
3. Validate Markdown structure, scientific names, measurements, numbers, and protected terms.
4. Run a second semantic review for omissions, additions, terminology errors, and unnatural AI-generated phrasing.
5. Human spot-check ordinary care content and fully review safety-sensitive content.

Target quality is clear, accurate, natural instructional content rather than literary translation. Generated content must avoid filler, repetition, exaggerated claims, unnecessary conclusions, and invented advice.

Suggested locale states in the existing dashboard:

```text
missing
machine_translated
qa_passed
human_reviewed
approved
```

Risk-based review policy:

- routine light, water, spacing, temperature, and basic care guidance may proceed after automated QA and sampling;
- propagation, pruning, symptoms, and diagnosis require stronger spot-checking;
- pesticide/fungicide guidance, toxicity, edible-use safety, dosage, and regulatory claims require human review before publication.

Later locale availability does not block initial plant publication. Adding the third through fifth locales is a translation rollout, not a change to plant taxonomy or assignment storage.

## 13. Phase 8: pilot dataset

Apply the design to 20–30 representative cultivars before catalog-wide backfill:

- 8–10 associated with Vietnam;
- 8–10 associated with the United States;
- 8–10 associated with Australia;
- cultivars that are suitable across national boundaries;
- cultivars with incomplete origin or proven-region evidence;
- content containing representative measurement types and ranges.

Record evidence for each assignment using the project's existing content provenance mechanism where possible. Leave uncertain fields empty.

Evaluate:

- whether editors understand the three geography concepts;
- whether the taxonomy is too broad or too granular;
- whether subdivisions are actually needed;
- whether search and filtering remain useful across countries;
- average editorial and translation time per cultivar;
- which terms require descriptions rather than labels only;
- whether the measurement authoring workflow remains practical as later locales are added.
- whether AI-assisted translations meet the required accuracy and naturalness threshold without excessive human rewriting.

### Acceptance criteria

- Pilot data does not require free-form tags.
- Editors do not need to enumerate all potential growing countries.
- No ambiguous term is used inconsistently across the pilot.
- Translation status and measurement completeness can be audited from the dashboard.
- Pilot findings are reviewed before catalog-wide backfill.

## 14. Phase 9: verification strategy

### 14.1 Data integrity

Verify:

- code and relation uniqueness;
- locale and country-code validation;
- archive behavior;
- Vietnamese and English publication completeness;
- unknown versus absent semantics;
- safe handling of parent/child plant relationships.

### 14.2 Service behavior

Verify:

- locale fallback;
- term assignment and removal;
- geography reads and filters;
- archive restrictions;
- soft matching explanations;
- deterministic unit conversion and rounding.

### 14.3 Dashboard behavior

Verify:

- grouped term editing;
- multilingual completion indicators;
- prevention of free-form or duplicate terms;
- country and subdivision selection;
- protection against deletion of referenced data;
- measurement authoring and validation feedback.

### 14.4 User-facing behavior

Verify:

- correct localized labels and country names;
- cross-country discoverability;
- neutral treatment of missing data;
- absence of overstated geographic claims;
- correct metric/imperial order per locale;
- natural localized sentences rather than unsafe label concatenation.

Required edge cases include:

- a term missing Vietnamese or English;
- a later locale that is machine-translated but has not passed QA;
- adding a sixth locale;
- an archived term still assigned to an existing plant;
- a plant with no geography;
- multiple origin countries;
- a proven country different from origin;
- adaptation matching despite a different user country;
- conflicting adaptation terms;
- converted measurement ranges;
- small measurements requiring decimals;
- Markdown containing percentages, pH, and counts;
- identical canonical measurements rendered in different locale orders.

## 15. Release sequence

```text
Release 1
Taxonomy, Vietnamese/English translations, existing-dashboard management, and plant assignments
        ↓
Release 2
Localized detail display, manual search/filter support, and plant Markdown dual-unit validation
        ↓
Release 3
Pilot 20–30 cultivars, review data quality, and begin later-locale translation rollout
        ↓
Release 4
Soft matching, if the pilot supports it
        ↓
Release 5
Controlled catalog backfill
        ↓
Future work
Pest/disease localization and dual-unit validation, weather-aware calendars, and pest/disease alerts
```

The dual-unit measurement work may be developed alongside the content-management portions of Releases 1–2, but it must have its own acceptance criteria and should not block the initial geography pilot unless the same content is being republished.

## 16. Principal risks and controls

| Risk | Control |
|---|---|
| Country is treated as climate suitability | Keep origin, proven evidence, and adaptation separate |
| Missing country becomes a false absence | Define missing as unknown throughout services and UI |
| Taxonomy grows into synonyms | Fixed dimensions, controlled term creation, editorial definitions |
| Later locales drift or read like AI-generated filler | Canonical Vietnamese, approved English, glossary, automated semantic QA, and risk-based human review |
| A parallel CMS increases maintenance and permission risk | Extend the existing dashboard, authentication, roles, and editing workflows |
| Editors change machine semantics through labels | Keep codes immutable and matching independent of translated text |
| Subdivision data expands without value | Add subdivisions only for demonstrated product cases |
| Matching appears more precise than the data | Use explainable soft ranking before any hard exclusion |
| Metric and imperial content diverges | One canonical value and shared conversion/rounding policy |
| Scope expands into a climate engine | Defer dynamic calendar and alert logic |

## 17. Approved product decisions

The following decisions are approved for implementation:

- Geography belongs to individual `plantsMaster` records.
- Base-to-cultivar inheritance uses category-level fallback and cultivar category replacement.
- Origin, proven regions, and adaptation remain separate concepts.
- Proven regions are evidence of successful growing or local adaptation, not an exhaustive allowlist.
- Adaptation dimensions are application-controlled; the existing dashboard manages terms and translations.
- Vietnamese and English are the initial required publication locales.
- Later locales use AI-assisted translation, automated QA, glossary enforcement, and risk-based human review; they do not initially block plant publication.
- The existing dashboard is extended; no separate CMS is created.
- Initial releases provide display and filtering, not ranking.
- Soft matching remains Release 4 and requires successful pilot evidence.
- Plant dual-unit content uses validated authoring syntax while preserving the existing Markdown string contract.
- Vietnamese displays metric first; English displays imperial first.
- Pest/disease localization and dual-unit validation are deferred from the initial plant implementation.
- Dormant `zoneCode` and `frostDates` fields are left unchanged until calendar/personalization work.
- The existing `plant_measurements` name is reserved for user measurement logs and cannot be reused.

Implementation may now proceed with bounded repository inspection, concrete schema/API design, migrations, dashboard integration, and proportionate verification. Deployment and catalog-wide backfill remain separate approval points.

## 18. Immediate next implementation stage

The next bounded stage is Release 1 technical design and implementation preparation:

1. Map the exact `plantsMaster`, localization, inheritance, dashboard route, `GroupManager`, permission, and API integration points.
2. Convert the logical persistence model in Section 7 into a repository-specific schema proposal.
3. Define category-level fallback queries and mutation semantics for origin, proven regions, and adaptation.
4. Define the small country/subdivision code utility and its source of localized country names.
5. Confirm the initial adaptation vocabulary with editorial definitions in Vietnamese and English.
6. Define dashboard wire-level operations and validation without creating a parallel CMS.
7. Produce migration, rollback, test, and pilot-seeding steps for review before execution.

Release 1 acceptance and verification requirements must be made concrete before code changes begin. The measurement validator can be designed in parallel as a separate Release 2 workstream, but it must not broaden the initial schema work.

---

## 19. Implementation status log

> Cập nhật thực thi theo từng giai đoạn. Mỗi mục ghi rõ file, ký hiệu (symbol), hành vi đã
> triển khai và bằng chứng verify. Mục mới nhất nằm ở cuối mục này.

### 19.1 Phases A–F đã hoàn thành (verification xanh)

| Phase | Nội dung | File / Symbol | Hành vi đã triển khai |
|---|---|---|---|
| **A** | Countries shared module | `packages/shared/src/data/countries.ts` | 249 quốc gia ISO 3166-1 alpha-2, tên vi/en (chuẩn hóa: "Việt Nam", "Hoa Kỳ"), code hoa, sắp xếp. |
| **A** | Countries utility | `packages/shared/src/countries.ts` | `isValidCountryCode` (catalog membership), `countryName(code, locale?)` fallback **requested → en → code**, `listCountries(locale?)`, `SUPPORTED_COUNTRY_LOCALES = ["vi","en"]`, `TERM_CODE_PATTERN = /^[a-z][a-z0-9_]{1,63}$/`, `SUBDIVISION_CODE_PATTERN = /^[A-Z0-9]{1,6}$/`. |
| **B** | Adaptation vocabulary | `packages/shared/src/adaptationTerms.ts` | 13 terms / 4 dimension cố định (`temperature` 4, `moisture` 3, `climate` 3, `season` 3) — labels + definitions vi/en **đúng nguyên văn design doc §5**; `isAdaptationTerm`, `getAdaptationTerm`, `listAdaptationTerms(dimension?)`, `adaptationTermLabel/Definition` (cùng fallback chain), `normalizeAdaptationTermCodes` / `assertAdaptationTermCodes` (mirror `plantPropagation`); `ALLOWED_MULTI_WORD_CODES` chốt rule **cấm combined terms** kiểu `hot_humid`. |
| **C+D** | SQLite migration | `apps/api/src/db.ts` `runMigrations` | 5 bảng additive `CREATE TABLE IF NOT EXISTS`: `adaptation_terms` (code UNIQUE, status active/archived, sort_order), `adaptation_term_i18n` (UNIQUE(term_code, locale), translation_status missing→approved, FK cascade), `plant_origin_countries`, `plant_proven_regions`, `plant_adaptation_terms` (UNIQUE(plant, …), FK `master_plants(id)` ON DELETE CASCADE, source_refs_json mặc định `'[]'`) + index theo master_plant_id. |
| **E** | Backend payload + validation | `apps/api/src/master-plants.ts` | 3 field zod trong `masterPlantObjectSchema` (origin_countries max 64, proven_regions max 128 kèm `source_refs`, adaptation_term_codes max 64); `sourceRefSchema` dùng chung; `normalizeMasterPlant(db, row)` giờ trả own arrays (`origin_countries`, `proven_regions`, `adaptation_term_codes`) + `resolved_geography`; `resolvePlantGeography(db, row)` — fallback **own ≥ inherited ≥ none** theo từng category, cultivar inherit base qua `findSqliteBasePlant` (species-key + display-base, không sửa row base); `validatePlantGeography` — country luôn check catalog (fail-closed), term code check mirror **fail-closed khi mirror có dữ liệu / fail-open khi mirror rỗng** (Convex là authoritative gate); write replace-semantics `applyPlantGeographyPayload` gọi trong cả 2 nhánh UPDATE/INSERT của `upsertMasterPlantRow` trong cùng transaction; `PlantGeographyValidationError` → 400 qua `handleMasterPlantsError`. |
| **F** | Sync-outbox plumbing | `apps/api/src/master-plants.ts` `queuePlantSync` | Không đổi schema: payload được stringify toàn bộ vào `upsert_plant` outbox → 3 field geography tự động đi cùng mà không cần routing mới (xác nhận bằng đọc code). |

**Điểm nối không đổi (đã đối chiếu code):**
- `normalizeMasterPlant` được gọi từ `buildMasterPlantPayload`, list/export, GET/PATCH `/api/master-plants/:id`, bulk activate/deactivate — tất cả đã cập nhật sang `(db, row)`.
- PATCH merge dùng `...normalizeMasterPlant(db, currentRow)` → omission tự động preserve (không cần xử lý đặc biệt); `[]` rõ ràng clear.
- `toCsv` param type thu hẹp bằng `MasterPlantCsvRow = Omit<ReturnType<…>, 4 geography fields>` để convex-snapshot path không vỡ type.

### 19.2 Bằng chứng verify (chạy thực tế)

```text
$ npx vitest run packages/shared          → 3 files, 26 tests passed
  (plantPropagation 3, countries 11, adaptationTerms 12)
$ npx tsc --noEmit --strict --module esnext --moduleResolution bundler \
    packages/shared/src/{countries,adaptationTerms,index}.ts   → clean
$ npx vitest run apps/api                  → 6 files, 56 tests passed
  (gồm tests/plant-geography.test.ts mới: 5 tests)
$ npx tsc --noEmit -p apps/api/tsconfig.json                    → clean
```

`apps/api/tests/plant-geography.test.ts` (5 tests, pattern `phase3.test.ts`):
1. round-trip origin/proven/terms + `resolved_geography.source = "own"`;
2. PATCH omission **preserve**, `[]` **clear**;
3. unknown country code → 400 (`Unknown country code`);
4. term mirror fail-open khi rỗng / fail-closed khi có dữ liệu, archived term → 400;
5. cultivar không có assignment → inherit từ base (origin own thắng, terms inherited, `inherited_from_id` = base id), editing view chỉ hiện own rows.

Migration idempotent đã verify trên **bản copy DB thật** (`apps/api/data/richfarm.db`):
5 bảng tạo mới thành công, `master_plants` giữ nguyên 1550 rows (additive, không mất dữ liệu).

### 19.3 Chưa làm — các phase còn lại

| Phase | Nội dung | Ghi chú thiết kế tham chiếu |
|---|---|---|
| **G** | Convex schema + `plantAdmin` mutations | 5 `defineTable` trong `packages/convex/convex/schema.ts`; seed idempotent `data/adaptationTermsSeed.ts` (pattern `plantsMasterSeed`); mutations list/upsert/archive term + `upsertPlantFromBackend` ghi 3 join table, reject term archived/unknown (throw → outbox fail visible). |
| **H** | `canonicalPlantLibrary` fallback read | Projection: own ≥ base; labels theo §8 fallback chain; archive giữ assignment lịch sử. |
| **I** | Quality gate | `plantLibraryQuality.ts`: thêm `missingMandatoryAdaptationTranslationCount` (vi/en per active term) vào report + `assertQualityGate`. |
| **J** | Dashboard | Taxonomy page mới (pattern `GroupManager`) + geography section trong plant editor + admin proxy allowlist (`convex-admin.ts`). |
| **K** | Tests/fixtures/smoke | Fixtures 3 cultivar mẫu §4 (`tomato-brandywine`, `tomato-vn-cherry-01`, `tomato-tommy-toe`); boundary gate mobile typecheck. |
| **L** | Seed pilot | Release 1 **chỉ fixtures**, không seed dữ liệu sản xuất; backfill catalog-wide gated trên pilot review (§13). |
| **M** | Docs + acceptance checklist | Đối chiếu §14.1–14.4 (data integrity, service, dashboard, user-facing). |

> Cập nhật 2026-08-12 (completion-plan Stage A): các phase **G, H, I, J, K đã hoàn
> thành** và được verify (Convex 93/93 + typecheck, API 61/61 + build, dashboard
> 8/8 + build, shared 26/26, mobile typecheck, `git diff --check` sạch). Phase **L**
> giữ đúng "chỉ fixtures" — không seed dữ liệu sản xuất. Phase **M** chưa đóng:
> acceptance checklist §14 còn chờ feature-screen QA (completion-plan Stage C).
> Dev deployment, pilot publish và release decision (Stages B–D) là các bước mở.

### 19.4 Quyết định thiết kế bổ sung — archived-term re-save (2026-08-12)

Mâu thuẫn giữa "reject archived term" (Convex upsert) và "preserve historical
assignments" được chốt: `upsertPlantFromBackend` thay 3 join table theo
full-set payload, nhưng chỉ reject archived code khi code đó **chưa được gán
cho plant**; code đã gán sẵn được giữ nguyên và không bao giờ được thêm lại.
Re-save plant đang giữ archived term → thành công; gán mới archived term →
outbox row fail. Được phản ánh vào design §2.3/§3.3/§6.4/§7.3; áp dụng khi
triển khai phase G, kèm test pair (re-save giữ archived term thành công / gán
mới archived term thất bại).
