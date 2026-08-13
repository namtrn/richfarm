# Implementation Plan — Store Care Content as Markdown

Date: 2026-08-10
Status: **SOURCE IMPLEMENTED — ROLLOUT GATES OPEN**

Closeout authority: [Care Content Markdown — Rollout Completion Plan](2026-08-12-care-content-markdown-rollout-completion-plan.md).
This source plan is implementation-complete but not rollout-complete; target
migration, byte-exact readback/rollback, feature-screen and physical-device QA,
and compatibility cleanup remain governed by that completion plan.

Current execution source: `docs/tasks/2026-08-12-care-content-markdown-rollout-completion-plan.md`.
The unchecked acceptance list below remains a rollout checklist; the
implementation result at the end records source-level completion, while target
migration, feature-screen/device QA, and compatibility cleanup remain open.
Scope: SQLite API, Convex sync/schema, dashboard, mobile, migration, tests

## Goal

Store localized care guidance directly as Markdown text instead of structured JSON.

- Canonical field name: `careContent` in TypeScript/Convex and `care_content` in SQLite/API storage.
- Canonical value type: plain Markdown string.
- Dashboard renders it with `react-markdown`.
- Mobile renders it with the existing `MarkdownText` component.
- Remove `care_content_json`, JSON parsing/stringifying, JSON editor assumptions, and `View raw JSON` from user-facing flows.
- Keep machine-readable care measurements such as pH, temperature, watering interval, light hours, and moisture target in their existing structured fields. Do not encode those operational values only in Markdown.

## Final contract

Example stored value:

```markdown
## Tưới nước

Giữ đất **ẩm đều**, nhưng tránh để rễ bị úng.

- Tưới vào buổi sáng khi thời tiết nóng.
- Phủ mùn để giảm mất nước.

## Đất trồng

Đất giàu hữu cơ, thoát nước tốt, pH khoảng 5,5–7,0.
```

Contract rules:

1. `careContent` is a Markdown string or absent; it is never a JSON object or JSON-encoded string.
2. Updates use an explicit three-state contract at API/sync boundaries:
   - Field absent/`undefined`: preserve the existing care value.
   - `null` or an explicitly submitted empty string: delete/clear the existing care value.
   - Non-empty string: store/upsert that Markdown byte-for-byte.
   SQLite stores cleared content as `NULL`; Convex represents it by absence of the `plantCareI18n` row. Create/default payloads may omit the field instead of sending `null`.
3. Supported presentation contract matches plant descriptions: paragraphs, headings, unordered/ordered lists, bold, italic, and safe links.
4. Raw HTML is not required and must not be enabled by the renderers.
5. Locale rows own their Markdown independently; Vietnamese and English are not assumed to be literal translations of one another.
6. Structured care fields remain authoritative for calculations, filters, reminders, and validation. Markdown is authoritative only for reader-facing guidance.

Contract clarifications (recorded during the 2026-08-10 plan review):

- Rule 1 describes the end-state contract: canonical care is Markdown and is never a JSON object or JSON-encoded string. During the Phase 4 transition window, readers may still encounter legacy values that were preserved byte-for-byte (including JSON-looking prose); writers must emit only Markdown from the moment the Convex → SQLite mirror fix is deployed (rollout step 5). Rule 1 is the destination contract, not the pre-migration state.
- `syncV2.ts` and `carePlans.ts` query `plantCareI18n` but consume only `contentVersion`; they never project `careContent`. They remain in the Phase 4.3 audit surface for row-ownership completeness, but they require no care-content codec change and no "string unchanged" regression test.

## Ownership and data flow

```text
Dashboard Markdown editor
        ↓ authenticated local write
SQLite master_plant_i18n.care_content TEXT
        ↓ explicit outbox publish
Convex plantCareI18n.careContent string
        ↓ canonical mobile projection
Mobile cache v2 stores Markdown string unchanged
        ↓
Library Detail + Plant Detail MarkdownText renderers
```

Dashboard save remains local-first. Convex publication remains a separate explicit action. This migration must not restore Convex reads to dashboard Plant search/detail/edit flows.

Convex ownership note: `plantI18n` owns localized common name/description metadata. Reader-facing care content is owned by `plantCareI18n`. The existing `migrateLegacyCareToPlantCareI18n` mutation is the reference for moving legacy ownership out of `plantI18n`; the Markdown conversion must operate on the resulting `plantCareI18n.careContent` rows rather than reintroducing care into `plantI18n`.

## Pre-implementation gate

1. Finish, commit, or explicitly shelve the active Phase 3.1 work before starting this migration. The current Phase 3.1 working tree overlaps `master-plants.ts`, `master-plant-i18n.ts`, dashboard hooks, and `PlantManager.tsx`; implementation must not begin from an ambiguous mixed state.
2. Record the exact Phase 3.1 baseline commit and rerun its API/dashboard verification before branching for this plan.
3. Do not modify the live SQLite database during plan implementation until the clone rehearsal and evidence checks in Phase 2 pass.

## Phase 1 — Contract and codec removal

1. Change shared/API DTOs from `care_content_json?: Record<string, unknown>` to `care_content?: string`.
2. Keep frontend camelCase as `careContent?: string`.
3. Delete JSON parsing/stringifying helpers used only for localized care content.
4. Reject object/array payloads for the new field with a clear validation error instead of silently stringifying them.
5. Define a temporary legacy converter used only by migration and compatibility reads; it must not remain in the normal write path.

## Phase 2 — SQLite schema migration

1. Add nullable `care_content TEXT` to `master_plant_i18n`.
2. Convert every non-empty legacy `care_content_json` value:
   - Treat the system-produced legacy shape `{ "text": string }` as authored free-form content and copy its string value directly to `care_content`. This shape came from the dashboard fallback and must not be classified as malformed or unrecognized.
   - Preserve section order from the stored object.
   - Convert each section key to a localized Markdown heading when a known label exists.
   - Write `intro` as a paragraph.
   - Write `items[]` as Markdown bullets.
   - Preserve Markdown already present inside intro/items.
   - Record malformed/unrecognized legacy values in a migration report and leave `care_content` unset rather than inventing prose.
3. Verify row counts and hashes before removing the legacy column.
4. Rebuild `master_plant_i18n` without `care_content_json` after verification because SQLite cannot reliably drop/retype columns across every supported version.
   - Update both schema definitions in `apps/api/src/db.ts`: the normal `CREATE TABLE IF NOT EXISTS` definition and the table definition inside `ensureI18nLocaleCompatibility`.
   - Do not copy the existing rebuild `INSERT ... SELECT` column list unchanged: it currently omits `source`, `source_url`, `content_status`, `review_status`, `reviewed_at`, `reviewed_by`, and `content_origin`.
5. Preserve and explicitly copy IDs, foreign keys, locale uniqueness, content status/version/origin, all provenance fields, timestamps, and all user-owned database changes.
6. Migration must be transactional and idempotent.

Required migration evidence:

- Total locale rows before/after are equal.
- Count of legacy non-empty care rows equals converted rows plus explicitly reported failures.
- Count and hash authored `{ "text": string }` rows separately; every valid string must appear unchanged in `care_content` after migration.
- Per-column counts/hashes for provenance and review fields match before and after the table rebuild.
- No required `vi`/`en` locale disappears.
- `PRAGMA foreign_key_check` returns no findings.
- A backup or disposable clone is used for the first migration rehearsal.

## Phase 3 — API and outbox

1. Update `apps/api/src/master-plants.ts` normalization, create/update schemas, exports, and sync payloads to use `care_content` strings.
   - In particular, replace the `normalizeConvexPlant` path that currently runs `parseJson(row.careContent) || {}`. Markdown from Convex must map directly to `care_content`; it must never be parsed as JSON, replaced with `{}`, or silently omitted.
   - Audit every Convex → SQLite mirror/import call site that consumes `normalizeConvexPlant`, including remote preview/import and adoption flows, before removing compatibility code.
2. Update `apps/api/src/master-plant-i18n.ts` list/create/update routes to accept and return Markdown strings without JSON conversion.
   - Change `ensureRequiredLocales` defaults from `care_content_json: {}` to `care_content: null`/absent under the new contract.
   - Use a nullish update schema for `care_content` so PATCH can distinguish absent (preserve) from `null`/empty (clear) and a non-empty string (upsert).
3. Ensure plant and i18n local writes still commit first and enqueue the newest Markdown payload even when Convex is disabled.
4. Keep the existing outbox `ON CONFLICT(dedupe_key) DO UPDATE payload_json` newest-wins behavior and add regression coverage around it.
   - `upsert_plant` and `upsert_i18n` have different dedupe keys and may transiently publish different full-i18n snapshots. Assert the final published state after the queue drains rather than requiring every intermediate publish to contain the final value.
5. Update JSON/CSV import/export contracts:
   - JSON export uses `care_content` string.
   - CSV exports the Markdown string with correct quoting/newline handling.
   - Legacy imports may accept `care_content_json` only during a documented transition window and must convert it immediately.
6. Add a regression test for the Convex → SQLite mirror/import path using Markdown that begins with a heading and contains Unicode, quotes, and newlines. Assert that the exact Markdown reaches SQLite and that no `{}`, `{ text: ... }`, JSON envelope, or missing field is produced.

## Phase 4 — Convex contract and migration

1. Keep the canonical Convex owner as `plantCareI18n.careContent: string`; do not add care content back to `plantI18n`. Use the existing `migrateLegacyCareToPlantCareI18n` mutation as the ownership-migration reference.
   - The Convex table schema already uses `careContent: v.string()` and `plantI18n` already has no care field. Phase 4 is a data migration plus sync-boundary change, not a `plantCareI18n` schema redesign.
2. Update the concrete backend sync boundary in `packages/convex/convex/masterSync.ts`:
   - Replace `localizedRowValidator.care_content_json: v.optional(v.any())` with a temporary compatibility validator and then the final nullable Markdown update contract (`v.optional(v.union(v.string(), v.null()))`) in the correct rollout stages.
   - Update `upsertPlantFromBackend` to pass Markdown through unchanged instead of stringifying objects in the normal write path.
   - Implement the same three-state behavior as the API: absent preserves, `null`/empty deletes, and a non-empty string upserts. A valid Markdown string must never delete an existing `plantCareI18n` row.
   - Reuse or extract the behavior in `packages/convex/convex/lib/plantCare.ts::upsertPlantCareI18n` instead of maintaining a second inline implementation in `masterSync.ts`. If reuse is not practical because of module boundaries, centralize the three-state normalization and test both call sites against the same contract cases.
3. Audit the complete known `plantCareI18n` reader/writer surface and keep all projections byte-preserving: `masterSync.ts`, `syncV2.ts`, `carePlans.ts`, `plantAdmin.ts`, `plantTaxonomyMigration.ts`, `lib/localizePlant.ts`, `lib/canonicalPlantLibrary.ts`, and `lib/plantCare.ts`.
4. Add a Convex data migration for `plantCareI18n.careContent` values that are JSON-encoded legacy objects:
   - Parse only for migration detection. Convert only when `JSON.parse` succeeds and returns a supported plain-object legacy shape, including `{ "text": string }` and recognized section objects.
   - Preserve every other non-empty string byte-for-byte, including authored Markdown, JSON-looking prose, arrays, scalars, and malformed JSON; report ambiguous/unsupported parsed values instead of rewriting them.
   - Record converted, preserved, skipped, and failed counts/hashes so the migration is auditable and idempotent.
5. During rollout, readers may support both legacy and new values; writers must emit only Markdown.
6. Remove legacy compatibility after SQLite and the target Convex deployment both report zero structured legacy values.

## Phase 5 — Dashboard

1. Build and wire an active localized-care edit flow in `PlantManager`; there is no currently mounted care editor to replace. Reuse the relevant `useI18n` load/create primitives where appropriate, but either reconnect or remove the unused `startEdit`/`save`/`remove` form path explicitly rather than treating it as active UI.
2. Add a multiline Markdown editor for each localized care row and submit `care_content` directly as a string.
3. Add a nearby Markdown preview using `react-markdown`.
4. Render saved care directly through `ReactMarkdown`; do not reconstruct Markdown from JSON at render time.
5. Remove `parseFriendlyCare`, `careContentToMarkdown`, `useI18n.parseCareContent` (including its `{ text: value }` fallback), JSON stringify/parse helpers, `View raw JSON`, and raw JSON styles.
6. Empty state: `No care guide yet` or localized equivalent.
7. Preserve content status, review status, origin, source, and version controls around the editor.

## Phase 6 — Mobile

1. Replace the Library Detail section-key renderer (`care[s.key]`, `CareSection`, section icon/color configuration) with the existing theme-aware `MarkdownText` component fed directly from canonical `careContent`.
2. Remove `LOREM_CARE` and JSON parsing fallbacks. Missing or malformed legacy content must show an explicit empty/unavailable state, never invented care instructions.
3. Update `apps/mobile/lib/plantCareCache.ts` so the cached payload stores a Markdown string rather than `PlantCareContent`.
   - Bump the cache namespace/version (for example, `plant_care_v2_*`) or explicitly remove legacy `plant_care_*` entries.
   - Treat old object-shaped cache entries as incompatible and ignore/evict them; do not render them as Markdown via implicit string coercion.
   - Verify online and offline reads return the exact same Markdown string.
4. Update the additional parser/cache flow in `apps/mobile/app/(tabs)/library/index.tsx`; no mobile search or selection path may retain the structured-object assumption.
5. Add care rendering to `apps/mobile/app/(tabs)/plant/[userPlantId].tsx`. This is an explicit new Plant Detail feature required for parity, not merely verification of existing behavior.
6. Make Library Detail and Plant Detail consume the same canonical locale/fallback source and the same `MarkdownText` rendering policy.
7. Keep search local; care Markdown must not cause a Convex request during mobile search.
8. Test long headings, nested/long lists, bold/italic text, links, dark mode, small screens, missing content, and an invalidated v1 cache on a real device before release.

## Phase 7 — Basella alba pilot

Use `Mồng tơi / Basella alba` as the first end-to-end migrated record.

1. Convert both `vi` and `en` care content into authored Markdown.
2. Keep existing verified facts and provenance; change formatting only unless a separate evidence-backed content edit is approved.
3. Save to SQLite with `needs_review` / `in_review` until content review completes.
4. Verify dashboard editor, preview, saved detail, export, outbox payload, Convex dev projection, mobile cache, Library Detail, and Plant Detail.
5. Do not publish to production during the pilot.

## Tests

### API/SQLite

- Migration converts valid legacy section JSON to deterministic Markdown.
- Migration converts the dashboard-produced `{ "text": "authored Markdown" }` shape by extracting the string byte-for-byte.
- Migration reports malformed legacy JSON without data loss elsewhere.
- Migration is idempotent and passes foreign-key checks.
- SQLite rebuild preserves every provenance, review, origin, version, ID, locale, and timestamp column rather than following the existing incomplete copy list.
- i18n create/update/list round-trip multiline Markdown exactly.
- Update semantics are covered explicitly: absent preserves, `null`/empty clears, and non-empty Markdown upserts.
- Object/array input is rejected for `care_content`.
- CSV and JSON export preserve headings, bullets, Unicode, quotes, and newlines.
- Convex → SQLite mirror/import preserves a Markdown fixture byte-for-byte and never substitutes `{}`, wraps `{ text: ... }`, or drops the field.
- Local writes enqueue Markdown while Convex is disabled.
- Retry publishes the newest payload and never rehydrates stale content over SQLite.

### Convex

- Sync validators accept absent/string/null according to the update contract and reject structured objects after migration; the stored `plantCareI18n.careContent` schema remains `v.string()`.
- `masterSync:upsertPlantFromBackend` preserves Markdown strings unchanged, preserves existing care for absent input, deletes care only for explicit `null`/empty input, and never treats valid Markdown as `"{}"`/empty legacy data.
- Shared care-upsert behavior and every remaining caller pass the same absent/null/empty/string contract tests.
- Convex migration converts JSON-encoded section strings in `plantCareI18n`, preserves already-authored Markdown byte-for-byte, and reports malformed legacy values.
- Known readers/writers in master sync, sync v2, care plans, plant admin, taxonomy migration, localization, and canonical library projections return/pass the string unchanged.
- Legacy compatibility reader works only during the transition window.
- Mobile locale fallback and inherited-content behavior remain correct.

### Dashboard

- Editor saves Markdown without JSON parsing.
- Active edit/create flows send a string and never use the legacy `{ text: value }` wrapper.
- Preview and detail render headings, paragraphs, lists, bold, italic, and safe links.
- No raw JSON control remains in Plant Detail.
- Empty and invalid inputs have clear states.

### Mobile

- Library Detail and Plant Detail render the same fixture.
- Cache v2 stores the Markdown string unchanged; legacy object-shaped `plant_care_*` entries are ignored/evicted without crashing or displaying placeholder care.
- Cached/offline rendering matches online rendering byte-for-byte.
- Missing care content renders an explicit empty state and never `LOREM_CARE` or other invented guidance.
- Theme and device-layout checks pass.

## Rollout order

1. Land compatibility readers and the deterministic legacy converter.
2. Rehearse SQLite migration on a clone and review its report.
3. Deploy Convex schema/functions that can read both representations without changing the canonical owner from `plantCareI18n`.
4. Migrate SQLite and Convex dev data and review both migration reports.
5. Deploy and verify the Convex → SQLite mirror fix before any writer can emit canonical Markdown.
6. Switch API/dashboard writers to Markdown-only, including explicit absent/null/empty/string semantics.
7. Switch dashboard/mobile readers to direct Markdown rendering and invalidate the mobile v1 care cache.
8. Run the Basella alba pilot end to end.
9. Confirm zero legacy structured values in SQLite, Convex, queued outbox payloads, and active mobile cache keys.
10. Remove compatibility code and the legacy SQLite column.
11. Obtain explicit authorization before any production migration or publish.

## Rollback

- Before destructive column removal, retain a database backup and migration report.
- During the compatibility window, rollback readers can still consume legacy JSON.
- Do not attempt to reconstruct the original structured JSON from free-form Markdown automatically; rollback uses the preserved backup/legacy data.
- If Convex migration fails, stop publishing, keep dashboard SQLite-local, and restore the prior Convex schema/functions before retrying.

## Acceptance criteria

- [ ] SQLite has one localized `care_content TEXT` field and no active `care_content_json` dependency.
- [ ] Convex localized care is owned by `plantCareI18n.careContent`; `plantI18n` contains no active or reintroduced care field.
- [ ] API, outbox, Convex, dashboard, and mobile use `careContent` as a Markdown string end to end.
- [ ] Every mirror/import/export path preserves Markdown without loss or wrapping: no parse-to-`{}`, no `{ text: ... }`, no JSON envelope, and no implicit deletion of valid Markdown.
- [ ] Dashboard and mobile render the stored Markdown directly.
- [ ] Dashboard exposes an active Markdown editor and preview rather than relying on currently unused i18n edit-hook code.
- [ ] Mobile cache format is versioned or legacy entries are evicted; cached/offline Markdown matches online Markdown unchanged.
- [ ] Library Detail and Plant Detail both render canonical care Markdown through `MarkdownText`; Plant Detail care is tracked as an explicit new feature.
- [ ] `LOREM_CARE` and all invented care fallbacks are removed.
- [ ] No user-facing raw JSON button or JSON editor remains.
- [ ] Structured operational care fields continue to power calculations and validation.
- [ ] All legacy non-empty care content is converted or appears in an explicit failure report.
- [ ] Legacy `{ "text": string }` authored content is recovered byte-for-byte rather than reported and discarded.
- [ ] SQLite table rebuild preserves all provenance, status, review, origin, version, identity, and timestamp columns.
- [ ] Update behavior is consistent at API and Convex boundaries: absent preserves, `null`/empty clears, and non-empty Markdown upserts.
- [ ] Convex Phase 4 performs only the required data/sync-boundary migration; it does not churn the already-correct `plantCareI18n.careContent: v.string()` storage schema.
- [ ] Basella alba vi/en passes SQLite → outbox → Convex dev → mobile verification.
- [ ] API tests/build, Convex tests/typecheck, dashboard tests/build, and mobile typecheck pass.
- [ ] Real-device Markdown verification passes before release.
- [ ] No production migration or publish occurs without explicit authorization.

## Explicit non-goals

- Do not wrap Markdown in `{ format, body }` or any other JSON envelope.
- Do not keep JSON as the canonical reader-facing care format.
- Do not move machine-readable care measurements into prose.
- Do not rewrite care claims or invent evidence during the format migration.
- Do not change dashboard SQLite-local ownership or mobile Convex-cache ownership.
- Do not preserve the old icon/color-per-section mobile presentation once Markdown becomes the canonical free-form contract.
- Do not expand Plant Detail beyond adding the same localized care guide and rendering policy already required for Library Detail parity.

## Implementation result — 2026-08-11

Status: **implementation complete, locally verified, Convex production functions/schema deployed; data migration/feature-screen QA gates pending**.

Completed and verified:

- SQLite owns nullable `care_content TEXT`; transactional/idempotent migration converts supported legacy JSON, recovers `{ "text": string }` byte-for-byte, reports unsupported rows, preserves provenance/review/origin/identity/timestamps, and supports old clones without `source_refs_json`.
- API, outbox and Convex master sync use Markdown strings with absent=preserve, null/empty=clear, and non-empty=byte-preserving semantics; structured object payloads are rejected.
- `plantCareI18n.careContent` remains the Convex canonical owner. Convex admin writers preserve bytes and locale rename moves the care row without data loss.
- Dashboard has an active Markdown editor/preview and no raw JSON UI. The save-state race was fixed and covered by focused tests.
- Mobile Library Detail, Library modal and Plant Detail render through `MarkdownText`; v2 cache stores exact strings, evicts malformed/legacy entries, does not resurrect explicitly cleared server content, and has explicit missing-care states.
- Structured operational care remains authoritative in `plantCare`. Four legacy `plantsMaster` fields are retained temporarily as additive-rollout fallbacks; a paginated, zero-safe, conflict-preserving, readback-verified migration copies them before cleanup.

Verification:

- API full suite: 51/51 PASS; API build PASS; care migration tests 7/7 PASS.
- Convex full suite: 82/82 PASS; typecheck PASS; focused admin-care tests 2/2 PASS.
- Dashboard Markdown tests: 3/3 PASS; production build PASS.
- Mobile cache tests: 3/3 PASS; typecheck PASS.
- `git diff --check` PASS.

Deployment and simulator evidence (2026-08-11):

- Convex functions/schema deployed successfully to production deployment `whimsical-dove-537` (`https://whimsical-dove-537.convex.cloud`). No care-content or structured-care migration mutation was executed.
- Deployment exposed a Node-only `crypto` import in `plantCareContentMigration.ts`; it now uses Web Crypto SHA-256, and focused Convex tests 14/14 plus typecheck passed before redeploy.
- The native app built and installed on iPhone 17 Simulator (iOS 26.2). Metro initially exposed a missing `@react-native-vector-icons/common` runtime dependency from the Markdown renderer; the dependency was added, Metro cache was rebuilt, and the app bundled/rendered successfully. App-visible icons remain on the project's Tabler icon registry.

Remaining rollout gates:

- Target migration rehearsal must be recorded separately; no data migration should run without reviewing dry-run reports.
- Basella vi/en SQLite → outbox → Convex target → mobile pilot is not complete until the deployed target is verified.
- The clean simulator stopped at onboarding, so Library/Plant Detail Markdown was not directly exercised. Real-device QA remains required for Markdown links, long/nested lists, dark mode, small screens, locale fallback and cache invalidation.
- Remove compatibility fields/readers only after all target reports show zero legacy/remaining values.

Dev publication follow-up (2026-08-11):

- Dev functions/schema were brought to parity on `fantastic-beagle-190`, then all 28 rows/56 locale rows belonging to the four curated species groups were marked reviewed/published through the API authoring boundary and drained through the outbox.
- Final outbox evidence: 84/84 operations applied. Canonical queries return 10 Basella, 6 Laurus, 6 Rubus, and 6 Valeriana rows. Care aggregates remain `awaiting_review`; publication did not falsely upgrade them to `verified`.
- The mobile Convex subscription was verified by inspecting the live Simulator v8 cache after publication; it automatically contained all 10 Basella rows. Cross-locale search now includes canonical `i18nRows` names instead of only the active-locale display name.
