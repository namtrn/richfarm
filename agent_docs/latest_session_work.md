# Latest Session Work

## 2026-08-12 — Plant Geography and Adaptation Release 1 (Stage A)

- Completed Stage A of the Release 1 completion plan
  (`docs/tasks/2026-08-12-plant-geography-adaptation-release1-completion-plan.md`)
  in Medium route. The open decision point (archived-term re-save conflict)
  was resolved first: Convex rejects an archived code only when it is not
  already assigned to the plant; already-assigned codes are preserved.
  Reflected in design §2.3/§3.3/§6.4/§7.3 and localization plan §19.4.
- Convex: added `adaptationTerms`, `adaptationTermI18n`, `plantOriginCountries`,
  `plantProvenRegions`, `plantAdaptationTerms` tables; idempotent 13-term vi/en
  seed (`data/adaptationTermsSeed.ts` + `seedAdaptationTerms`, wired into
  `seedAll`); six `plantAdmin:*` taxonomy functions (list/create/update/
  updateTranslation/reorder/archive) behind the service token; `masterSync`
  validator + `upsertPlantFromBackend` join-table persistence with the resolved
  archived rule; canonical projection now emits `originCountries`,
  `provenRegions`, `adaptation`, `geographySource`, `geographyInheritedFromId`
  with category-level own ≥ base fallback; quality gate gained
  `missingMandatoryAdaptationTranslationCount`.
- API: `/api/adaptation-terms` GET + admin-only POST `/refresh` (SQLite mirror
  hydration from `plantAdmin:listAdaptationTerms`, never-wipe-on-empty guard);
  `adaptationTermsHealth(db)` report (mirror/join/orphan counts); distinct 400
  errors for unknown country / malformed subdivision / unknown term / archived
  term; admin-proxy allowlist extended.
- Dashboard: new `Taxonomy` page (grouped by dimension, vi/en translation cards
  with status badges, usage counts, admin-only create/reorder/archive + mirror
  sync) and a Geography section in the plant editor (searchable country
  multi-select from the shared catalog, proven-region rows with format-validated
  subdivision, dimension-grouped active-term selectors, cultivar inheritance
  chips + explicit override that copies resolved values to own). Save uses the
  existing SQLite-first endpoint + outbox flow.
- Fixtures: the three approved tomato examples round-trip with distinct
  origin/proven/adaptation semantics (test fixtures only, no production data).
- Verification: Convex 93/93 + typecheck, API 62/62 + build, dashboard 8/8 +
  build, shared 26/26, mobile typecheck, `git diff --check` clean. `npx convex
  codegen` uploaded the additive functions to the connected dev deployment; no
  schema deploy or data mutation was run.
- Closed the two integration gaps found in the Stage A review: (1) SQLite API
  now applies the same archived-term rule as Convex (reject only when not
  already assigned) so unrelated edits on plants holding archived assignments
  are not blocked — verified by a dedicated API test; (2) provenance for
  origin and adaptation assignments now survives end to end through
  `origin_country_source_refs` / `adaptation_term_source_refs` payload maps,
  SQLite/Convex join rows, API projection, `listAll`, and the dashboard
  form/save round-trip, plus a fix for the pre-existing zod
  `proven_regions[].source_refs` array bug.
- No commit or push occurred. Unrelated in-flight work (propagation methods,
  care Markdown rollout) was left untouched.
- Executed Stage B (dev deployment + pilot) on dev target
  `fantastic-beagle-190`: pushed schema (5 tables) + functions via
  `npx convex dev` (the `convex deploy` CLI targets production — its prompt
  was aborted, nothing pushed to prod); seeded the taxonomy idempotently
  (13 terms + 26 i18n, re-run = 0); refreshed the SQLite mirror via the API
  (13/26, 0 orphans, hot = Nóng/Hot with definitions); published the three
  tomato pilots through SQLite → outbox → Convex. Brandywine collided with
  the pre-existing seed row 227 (legacy `source: seed` identity, preserved
  by the source-guard): deleted the duplicate row 1551 and published
  geography onto row 227; vn-cherry-01/tommy-toe are new rows 1552/1553.
  Outbox 89 applied / 0 failed; canonical readback matches the §4 own sets
  for all three, base tomato row unchanged; usage counts correct
  (frost_free 3, warm/moderate/temperate 2, hot/humid/tropical 1, dry 0);
  master_plants 1550 → 1552, no catalog-wide mutation. Pre-pilot backup:
  `artifacts/stage-b/richfarm.db.backup-20260812-171744`. Local API server
  was run from `apps/api/.env` (dev deployment) and stopped afterwards.
- Executed Stage C (feature-screen QA) on the real dashboard (Vite dev +
  local API on dev data) with a headless browser: taxonomy grouping/labels/
  badges/usage counts, term create + archive (qa_test archived, inert, not
  offered for new assignments), mirror sync, geography editing with save →
  reload persistence, subdivision validation error banner, country search
  multi-select, Beefsteak cultivar inheritance chips + Override (copies
  inherited US + Warm/Moderate into own), responsive 375×812 renders.
  Evidence screenshots: `artifacts/stage-c/`.
- Defects found and closed during Stage C: P0 `ReferenceError: authedFetch
  is not defined` in PlantForm (geography editor rendered with an
  out-of-scope variable; the dashboard had no tsc gate, so `vite build` did
  not catch it — `npx tsc --noEmit -p apps/dashboard/tsconfig.json` is now
  part of the evidence and clean); P2 `CareSourceRef` import in usePlants;
  P3 SQLite `resolvePlantGeography` reported `inherited` for empty base
  categories — aligned to Convex (`none`); P1 mobile overflow from the
  external Stage C QA review (906 px at 375 px viewport — `.layout` media
  rule, `.card`, `.page-header`, `.actions` fixed with `minmax(0,1fr)` +
  `min-width:0` + wrap; re-verified scrollWidth 375 on Plants/Taxonomy/
  geography editor with all action buttons on-screen, desktop 1280
  unaffected; evidence `artifacts/stage-c/c9-*`/`c10-*`). Automated gates
  after fixes: dashboard 12/12 + tsc + build, API 62/62, Convex 93/93 +
  typecheck. Dev outbox 91 applied / 0 failed.
- Delivered the Stage D pilot taxonomy quality review (read-only, dev
  `fantastic-beagle-190`): taxonomy quality PASS (13 terms / 4 dimensions
  per design §5, all vi/en labels + definitions, `missingViOrEnActive: []`,
  `orphanI18n: []`); pilot assignment accuracy PASS (brandywine/vn-cherry/
  tommy-toe match §4 with own sources); exclusion decisions for production:
  `qa_test` archived fixture (prod taxonomy comes only from
  `seedAdaptationTerms` — verify 13 terms at prod time), base tomato QA
  edits rows 1554/6 (not pilot records), vn-cherry `HCM` subdivision
  (production uses §4 exactly), and brandywine must reuse the production
  seed row (legacy-identity collision path). Observations: `assertQualityGate`
  exceeds the 1 s Convex limit at full catalog scale (use bounded/batched);
  dashboard tsc gate stays in the evidence run. Acceptance checklist M
  (§14.1–14.4) mapped to evidence — PASS. Production deployment and
  production-data mutation remain separate authorizations (not granted by
  this review).
- Production rollout authorization has been granted for Convex deploy,
  taxonomy seed/mirror refresh, and the three pilot records. Preflight stopped
  safely because branch `dev` had no PR and the worktree mixed unrelated
  changes. Task-scoped commits were created before any production mutation.
- Next entry point: create/review the clean PR, then execute production rollout —
  Convex schema/functions deploy (prod), `seedAdaptationTerms` (verify 13
  terms, qa_test absent), publish the three tomato pilots per §4 via the
  production SQLite/API/outbox (brandywine via the existing seed row), then
  close the completion plan.
