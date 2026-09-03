# Project Progress

## Active package: CAP-2026-08-31 — Care content approval and Convex publication semantics

Status: **CAP-1–CAP-6 complete and verified** — implementation, dashboard,
Convex contract, migration, and manual E2E done on dev `fantastic-beagle-190`
(Medium route, no worker subagents, 2026-08-31)

Goal: make the dashboard and SQLite the sole care-content review/approval
boundary, and make Convex a serving projection that receives only approved
content. Full plan + verified result:
`docs/tasks/2026-08-31-care-content-approval-publish-flow-plan.md`.

Problem (confirmed during the Hoa giấy manual E2E): the dashboard's **Publish
pending** action could apply an outbox row to Convex while its locale remained
`needs_review / unreviewed`; public app queries then correctly hid the care
content. This violated the meaning of "publish" in the SQLite-first authoring
workflow.

Implemented (verified):

- Import is draft-only: `applyContentImport` writes authored bytes with
  manifest statuses and creates zero outbox rows.
- `approveContentLocales` (review-service.ts) + `POST
  /api/content-review/locales/approve`: stamps every locale of the plant to
  `published / reviewed` with the authenticated reviewer + `reviewed_at` and
  enqueues exactly one `upsert_plant` snapshot per plant, atomically
  (rollback-verified). Care locales require `source_refs` provenance.
- Outbox approval gate (`evaluatePayloadApproval`/`assertPayloadApproved` in
  sync-outbox.ts): enqueue throws `CONTENT_NOT_APPROVED`; delivery rechecks at
  pre-claim and pre-send and blocks unapproved rows (`CONTENT_NOT_APPROVED`).
  i18n/plant routes and queue-local save drafts locally but queue only
  approved content (`queued:false` + reason, `skippedNotApproved`).
- Dashboard: "Publish approved" (disabled with no eligible rows), exact
  pending-row list before publish, per-item results ("Applied to Convex"),
  Approve & queue control in Translations with care byte counts + source refs,
  draft-aware save messages, Content Inbox post-apply draft note.
- Convex: `careApprovalPublish.test.ts` — approved payload accepted, review
  metadata preserved, EN 4,036 / VI 4,042 bytes byte-for-byte, public queries
  expose published care only.

Migration + E2E (dev `fantastic-beagle-190`): bougainvillea-glabra manifest
regenerated as CID-6 reviewed replacement (provenance `editorial` →
`content/plans/2026-08-14-us-vn-care-guide-priority.md`, hashes unchanged);
live flow monitor → previews (4,036/4,042) → event approval → apply (drafts,
0 outbox) → locale approval (reviewer `2:nmtrn@proton.me`,
2026-08-31T09:21:51Z) → outbox 173 applied → Convex readback: base
Bougainvillea serves care at EN 4,036 / VI 4,042 bytes byte-for-byte.

Verification: API full 189 passed / 15 failed (exact pre-existing baseline);
dashboard 36/36 + tsc + build PASS; Convex 130/130 + typecheck PASS; mobile
typecheck PASS; `git diff --check` PASS.

Remaining gates:

- Legacy cultivar duplicates (Barbara Karst, California Gold, Imperial Thai,
  Rosenka, Torch Glow) — separate canonical-identity reconciliation task.
- Production Convex deployment/data mutation — separate authorization; this
  session touched only dev.
- Unrelated pre-existing dirty files (dashboard taxonomy/geography UI,
  content-source hook files, `masterSync.ts`) preserved untouched.

## Active package: MCD-2026-08-25 — Markdown content change detection and review inbox

Status: MCD-1–MCD-7 complete — full plan implemented, measured on the real
50k fixture, and locally verified (Medium route, no worker subagents,
2026-08-25)

Goal: implement `content/plans/2026-08-25-markdown-content-change-detection-plan.md`
— durable Git Markdown change detection into SQLite and a dashboard review
inbox, with no automatic import or Convex publication.

Constraints:

- Heavy route per plan handoff, but executed by the main agent only (no
  worker subagents available this session).
- Detection never writes plant/content rows, findings, or outbox entries.
- Production Convex remains untouched.

Completed (verified):

- MCD-1: pinned contracts + path rules + contract tests (10) + gitignored
  50k perf fixture generator (`scripts/generate-content-source-perf-fixture.ts`).
- MCD-2: additive SQLite schema (8 `content_*` tables) + repository layer
  (idempotent index, durable journal, checkpoints, quarantine, lease,
  scoped watermarks, disabled-by-default retention with backup/rebuild proof).
- MCD-3: `scanner.ts` — bounded per-shard reconciliation with metadata-first
  fast path, vanished-shard deletion sweep (whole-directory deletes/renames),
  manifest-neighborhood revalidation (manifest_changed events; digest-drift
  warnings), atomic one-time legacy baseline without inbox events, blocking
  post-baseline missing-manifest discoveries, rename pairing on exact digest
  in either discovery order, shard quarantine isolation (clean shards still
  commit), and a budgeted/resumable full-hash audit window (per-root cursors,
  catches mtime+size-preserving edits metadata reconcile provably misses).
- MCD-4: watcher dependency decision recorded — `chokidar` v4 pinned
  `4.0.3` exact over `@parcel/watcher` (no native build/deploy cost; queue
  owns backpressure since chokidar has no native overflow signal). Adapter +
  bounded debounce queue (overflow flushes, never drops, counts degradation).
  `monitor.ts` lifecycle: baseline → catch-up → lease-gated watching with
  single active owner, expiry-based takeover, renewal failure demotion,
  periodic reconcile + hourly audit ticks, graceful stop releasing handles
  and leases before SQLite closes, health snapshot with degraded reasons.
  Wired into `server.ts`; `CONTENT_SOURCE_MONITOR_ENABLED=false` disables;
  real-chokidar smoke verified event delivery and clean close.
- Verification: content-source suites 58/58 PASS (contract 10, repository
  23, retention 5, scanner 13, monitor 7); API build PASS; tsc shows zero
  non-preexisting errors; `git diff --check` PASS. The 15 pre-existing test
  failures (care-content-migration/generic-data/master-plants/
  plant-geography/phase3) were reproduced identically with this package
  stashed earlier — worktree issue, unrelated.

- Post-review hardening (external MCD-1–4 review, all five findings fixed
  with regression tests): (1) lease-first startup — baseline/catch-up/
  reconcile/audit now run only while EVERY root lease is held; a failed
  acquirer goes straight to passive and writes zero detector state; one-time
  initialization is deferred until first ownership (also covering takeover).
  (2) Multi-root acquisition is all-or-nothing with rollback, so a partial
  failure can never leave half-held leases blocking takeover. (3) Debounce
  queue always re-arms its timer after an overflow push, so the final
  candidate can no longer sit unflushed forever. (4) monitor.stop() truly
  awaits the watcher adapter close before releasing ownership; server
  shutdown order watcher→SQLite is enforced. (5) Full-hash audit tracks a
  per-root cycle-error marker: unreadable files make the run incomplete,
  cycleComplete stays false across windows until a clean wrap; successful
  re-hash auto-resolves that path's quarantine.
- Verification after fixes: content-source suites 63/63 PASS (contract 10,
  repository 23, retention 5, scanner 14, monitor 11); content-manifests
  regression 13/13 PASS; API build PASS; zero non-preexisting tsc errors;
  `git diff --check` PASS.

- MCD-5: review service + routes. `content-source/review-service.ts`
  implements per-item independent batch approval (one scoped proposal per
  batch; invalid items reported individually), readable preview
  (incoming Git bytes vs current SQLite staging, manifest identity,
  findings), dismissal with actor audit, and the full apply gate chain:
  live event states → scoped index watermark → fresh disk re-hash of every
  scope path → `dryRunContentImport()` identity/validation → existing
  transactional `applyContentImport()`; post-apply the detector index is
  refreshed so reconcile does not re-report the applied change.
  `content-source/review-routes.ts` mounts
  `/api/content-review/{events,preview,approve,dismiss,apply,monitor-status}`
  behind `requireRole(["admin","editor"])`; monitor health is injected from
  server.ts. Rejection codes: PROPOSAL_NOT_FOUND/NOT_READY,
  NO_APPROVED_EVENTS, APPROVED_EVENT_SUPERSEDED, SCOPE_EVIDENCE_CHANGED,
  SCOPE_FILE_MISSING/CHANGED_ON_DISK, DRY_RUN_BLOCKED, IMPORT_REJECTED.
  Authoring-workflow note encoded in tests: locale edits require manifest
  regeneration as a reviewed replacement (CID-6 conflict-resolution) before
  approval can apply — the importer's hash-binding contract is preserved,
  not bypassed.
- Verification after MCD-5: focused suites 86/86 PASS (contract 10,
  repository 23, retention 5, scanner 14, monitor 13, review 8,
  content-manifests 13); API build PASS; zero non-preexisting tsc errors;
  `git diff --check` PASS; full API suite failures remain exactly the 15
  pre-existing ones in care-content-migration/generic-data/master-plants/
  plant-geography/phase3 (proven pre-existing via stash earlier).

- MCD-6: dashboard Content Inbox + Data Health integration.
  `contentReview.ts` mirrors the API contract (snake_case events, monitor
  health) with pure helpers (query builder, badge/phase classes, detector
  labels) and pins `CONTENT_INBOX_POLL_INTERVAL_MS = 15s` — bounded polling
  at half the 30-second visibility SLA. `useContentInbox` provides filters,
  stale-response-guarded polling, selection/preview, approve/dismiss/apply
  with per-action error surfacing; `useContentMonitorStatus` polls
  `/monitor-status` at 30s. `ContentInbox.tsx` renders a monitor strip
  (phase pill incl. explicit "passive" note, degraded-reason chips, audit
  age, quarantine count), filter toolbar + reason field, event table with
  state badges and coalesce counts, and a preview panel (incoming Git bytes
  vs SQLite staging, identity, findings). Admin-only mutation buttons render
  disabled for non-admins. Data Health page gains
  `ContentSourceHealthBadge`; nav adds "Content Inbox".
- Verification after MCD-6: dashboard tests 31/31 PASS (7 new), dashboard
  tsc + production build PASS; API focused suites 73/73 PASS;
  `git diff --check` PASS.

- MCD-7: measured on the real 50,000-file fixture via the repeatable harness
  `scripts/content-source-perf-run.ts` (JSON metrics under
  `artifacts/perf/metrics-*.json`, structured detector logs on stdout).
  Measured numbers (before → after fixes found BY these logs):
  initial index (baseline+catch-up) 114s → **8.7s**; periodic reconcile of
  50k files 120s → **3.0s**; steady-state single-file edit 123s → **3.1s**
  with `filesHashed=1` (criterion met); 500-file burst 121s → **3.3s**
  (500 durable events); full-hash audit cycle 50k in ~14.8s (~3,400
  files/s), restart-resume cursor drill proven at scale; retention
  compaction deletes 15,000/20,000 synthetic terminal rows in <0.5s and
  VACUUM shrinks 38→29 MB; peak RSS ≈ 870 MB during baseline transaction.
  Root cause the logs exposed: per-shard `LIKE 'prefix%'` cannot use a
  BINARY index, degenerating into a full table scan PER SHARD (25k shards ×
  50k rows); replaced with range bounds on the unique path index plus one
  outer transaction per root with savepoint-per-shard (autocommit fsyncs
  also removed). `FULL_HASH_AUDIT_DEFAULT_BUDGET.maxFilesPerWindow` tuned
  from measurement: 20,000 files per 10-minute hourly window (three windows
  cover a 50k cycle). Regression guards added: EXPLAIN QUERY PLAN must use
  the path index for shard lookups, and reconcile hashing stays at
  edited-file minimum.
- Verification final: API suites — focused content-source 73/73 + review 8/8
  within 179 passed / 15 pre-existing failures unchanged; dashboard 31/31 +
  build PASS; API build PASS; zero non-preexisting tsc errors;
  `git diff --check` PASS.

Remaining operational notes: reconcile floor is now a full-tree walk
(~3s at 25k entity dirs) which is acceptable for the periodic safety net
(the live watcher covers real-time changes); directory-mtime pruning is a
future optimization if trees grow far beyond 10k entities. SQLite freelist
after compaction is reclaimed by the documented VACUUM step in maintenance.

Next: package the completed MCD-1–MCD-7 implementation into a clean commit/PR.
Before publishing or deploying, review the scoped diff and keep production
Convex/data mutation behind a separate explicit authorization.

## Active package: GEOGRAPHY-R1-2026-08-12 — Plant geography/adaptation Release 1

Status: Stages A + B + C complete and verified (dev `fantastic-beagle-190`);
Stage D pilot taxonomy review delivered — production deployment and data
authorization pending (Medium route, 2026-08-12)

Goal: complete Release 1 of plant origin, proven regions, and climate
adaptation per `docs/tasks/2026-08-12-plant-geography-adaptation-release1-completion-plan.md`,
reusing the pre-existing SQLite/API/shared partial implementation.

Scope and constraints:

- No production-data mutation; no catalog-wide backfill; pilot remains
  test-fixtures only (`tomato-brandywine`, `tomato-vn-cherry-01`,
  `tomato-tommy-toe`).
- Geography changes kept separate from unrelated in-flight work
  (propagation methods, care Markdown rollout).
- Mobile is boundary typecheck only (detail display is Release 2).

Verified completion:

- Convex: five new tables (`adaptationTerms`, `adaptationTermI18n`,
  `plantOriginCountries`, `plantProvenRegions`, `plantAdaptationTerms`) with
  designed indexes; idempotent 13-term vi/en seed wired into `seedAll`;
  six `plantAdmin:*` taxonomy functions behind `requireAdminServiceToken`;
  `backendRowValidator` + `upsertPlantFromBackend` persist/replace the three
  join tables with the resolved archived rule (archived code rejected only
  when not already assigned; re-save with an existing archived assignment
  succeeds); canonical projection emits `originCountries`, `provenRegions`,
  `adaptation` (grouped by dimension), `geographySource`, and
  `geographyInheritedFromId` with category-level own ≥ base fallback and the
  requested → en → code label chain; `plantLibraryQuality` gained
  `missingMandatoryAdaptationTranslationCount` in report + gate.
- API: `/api/adaptation-terms` GET + admin-only POST `/refresh` hydrate the
  SQLite mirror from `plantAdmin:listAdaptationTerms` (with a never-wipe-on-
  empty guard); `adaptationTermsHealth(db)` mirror/join/orphan report;
  distinct 400 errors for unknown country, malformed subdivision, unknown
  term, and archived term; proxy allowlist extended (3 admin-only taxonomy
  mutations).
- Dashboard: new `Taxonomy` page (grouped by dimension, vi/en cards with
  translation-status badges, usage counts, admin-only create/reorder/archive,
  mirror-sync control) and a Geography section in the plant editor
  (searchable country multi-select, proven-region rows with subdivision,
  dimension-grouped active-term selectors, cultivar inheritance chips with
  an explicit override action). Save rides the existing SQLite-first
  endpoint and outbox flow.

Verification evidence:

- Convex tests 93/93 PASS (8 new geography tests) + typecheck PASS.
- API tests 62/62 PASS (11 geography tests) + `npm run api:build` PASS.
- Dashboard tests 8/8 PASS (5 new geography/taxonomy tests) + `npm run
  dashboard:build` PASS.
- Shared tests 26/26 PASS; mobile typecheck PASS (boundary); `git diff
  --check` PASS.
- `npx convex codegen` PASS and uploaded the additive functions to the
  connected dev deployment; no schema deploy or data mutation was run.

Integration gaps closed after the initial Stage A review (both now covered
by tests): (1) the SQLite API applies the same archived-term rule as Convex —
an archived code is rejected only when it is not already assigned to the
plant, so unrelated dashboard edits on plants holding archived assignments
succeed; (2) origin and adaptation assignments now carry `source_refs` end
to end via `origin_country_source_refs` / `adaptation_term_source_refs`
payload maps, SQLite/Convex join rows, `normalizeMasterPlant`, `listAll`,
and the dashboard form/save round-trip (also fixed a pre-existing zod bug
where `proven_regions[].source_refs` was a single object instead of an
array).

Open rollout gates (Stage D):

- Production deployment, production taxonomy seeding, and production
  pilot-data publication are separate approvals (not authorized by the
  Stage D review).
- At production time: verify `plantAdmin:listAdaptationTerms` = exactly 13
  terms (qa_test exclusion), publish only the three tomato pilot records
  with §4 sets (brandywine via the existing production Brandywine seed row),
  and treat `assertQualityGate` as a bounded/batched audit tool (it exceeds
  the 1 s function limit at full catalog scale).

Stage D review verdict (read-only, dev `fantastic-beagle-190`): pilot
taxonomy quality PASS — 13 terms / 4 dimensions per design §5, all with vi +
en labels and definitions (`missingViOrEnActive: []`, `orphanI18n: []`);
pilot assignment accuracy PASS (three tomatoes match §4 with own sources);
QA fixtures to exclude from production: archived `qa_test` term (production
seed is only the 13-term `seedAdaptationTerms`), base tomato QA edits (rows
1554/6), and the vn-cherry `HCM` subdivision (production uses §4 exactly).
Acceptance checklist M (§14.1–14.4) mapped to evidence — PASS. Full review in
the completion plan's "Stage D result" section.

Stage C evidence (headless-browser feature QA on the real dashboard + dev
data): taxonomy page grouping/labels/badges/usage counts, term create +
archive (qa_test archived, blocked from new assignments), mirror sync, plant
geography editing with save→reload persistence, subdivision validation error
("Invalid subdivision code"), country search multi-select, cultivar
inheritance chips + Override (Beefsteak inheriting US/warm+moderate from the
base, Override copies into own), responsive 375×812 renders. Defects found
and fixed: P0 `authedFetch is not defined` in PlantForm (dashboard had no tsc
gate; `npx tsc --noEmit` now part of the evidence and clean), P2 CareSourceRef
import, P3 SQLite inherited-with-empty-category aligned to Convex, and the
external-review P1 mobile overflow (906 px at 375 px viewport: `.layout`
media rule now `minmax(0,1fr)`, `.card`/`.page-header`/`.actions` get
`min-width: 0` and wrap; re-verified scrollWidth 375 on Plants/Taxonomy/
geography editor, desktop 1280 unaffected). Screenshots:
`artifacts/stage-c/`. Automated gates after fixes: dashboard 12/12 + tsc +
build, API 62/62, Convex 93/93 + typecheck. Dev outbox 91 applied / 0
failed.

Stage B evidence (dev `fantastic-beagle-190`): schema + functions pushed via
`npx convex dev` (deploy CLI targets prod and was deliberately not used);
taxonomy seeded idempotently (13 terms, 26 i18n); SQLite mirror refreshed
(13/26, 0 orphans); three tomato pilots published — brandywine merged into the
existing seed row 227 (legacy identity preserved) with the duplicate row
deleted, vn-cherry-01 and tommy-toe as new rows (1552/1553); outbox 89
applied / 0 failed; canonical readback matches own sets for all three, base
tomato unchanged (none/none/none); usage counts correct (frost_free 3, warm/
moderate/temperate 2, hot/humid/tropical 1, dry 0); master_plants
1550 → 1552, no catalog-wide mutation. Pre-pilot DB backup:
`artifacts/stage-b/richfarm.db.backup-20260812-171744`.

Next action: create and review a clean PR from the task-scoped commits, then
resume the authorized production rollout with target backup/preflight before
deploying code, seeding taxonomy, or publishing the three pilots.

## Active package: PLANT-CONTENT-2026-08-11 — Propagation + Markdown completion

Status: implementation complete, locally verified, and Convex code/schema deployed; data-migration and feature-screen QA gates remain open (Heavy route, 2026-08-11)

Goal: complete the two approved plans for structured propagation methods and localized Markdown care storage, including the defects found in the implementation review.

Scope and constraints:

- Preserve the existing uncommitted implementation and user-owned SQLite database.
- `propagationMethods` must use one shared enum/normalizer and flow through SQLite/API/outbox, Convex care/profile/projection, dashboard, mobile, seed/migration, provenance, and tests.
- Markdown care must preserve bytes for non-empty strings and use absent=preserve, null/empty=clear across every writer; fix mobile stale state/cache eviction and locale-rename data loss.
- Production Convex code/schema deployment is authorized for this session; production data migration, commit, push, or other publish remains out of scope without separate authorization.
- Two implementation workers own separate packages; overlapping UI files are serialized before ownership transfers.

Acceptance gates:

- Both task-plan acceptance criteria are mapped to verified code or explicitly documented external rollout gates.
- Focused regression tests cover shared enum/normalization, API/SQLite round-trip and migration, Convex projection/writers, dashboard editor, mobile rendering/cache/state, and legacy source migration.
- API tests/build, Convex tests/typecheck, dashboard tests/build, and mobile tests/typecheck pass after integration.
- Basella fixtures contain reviewed `seed` + `stem_cutting`; no production data is mutated.

Ordered work:

1. CARE-1 finishes Markdown contract defects and missing automated coverage on its owned files.
2. PROP-1 implements shared/backend propagation contracts while CARE-1 owns overlapping UI files.
3. Transfer overlapping dashboard/mobile UI ownership to PROP-1 after CARE-1 handoff and finish propagation presentation.
4. Main agent reviews critical integration boundaries, runs full gates, and reconciles status.

Verified completion:

- A single 18-value shared propagation enum/normalizer now flows through SQLite/API/outbox, Convex `plantCare`, canonical projections, dashboard authoring, mobile cards/details, seed fixtures, source-reference compatibility, and guarded legacy migrations.
- Markdown care now uses the absent/preserve, null-or-empty/clear, non-empty-byte-preserving contract across API and Convex writers. Locale rename, stale mobile state, malformed cache eviction, explicit empty states, and dashboard save races have regression fixes.
- Legacy structured care remains readable from `plantsMaster` during the additive rollout. A paginated migration copies/read-verifies values into `plantCare`, preserves conflicts and zero values, and reports `remaining`; schema cleanup is intentionally deferred until an authorized migration reports zero remaining rows.
- Legacy propagation migration is paginated and deterministic, protects source identity before migration, applies the discriminator from the plan, verifies care readback before clearing legacy source, and reports manual-review/failure buckets.
- Basella seed data includes `seed` and `stem_cutting`; all six shipped mobile locales contain labels for all 18 methods; care-plan source labels use `library:plantCare`.

Verification evidence:

- API tests 51/51 PASS outside the socket-restricted sandbox; API build PASS.
- Convex tests 82/82 PASS; Convex typecheck PASS.
- Dashboard Markdown tests 3/3 PASS; dashboard production build PASS.
- Mobile care-cache tests 3/3 PASS; mobile typecheck PASS.
- Shared propagation tests 3/3 PASS; locale validation passed for 6 locales × 18 labels; `git diff --check` PASS.
- Convex production functions/schema deploy PASS on `whimsical-dove-537`; no migration mutation was run.
- iPhone 17 Simulator native build/install and Metro runtime smoke PASS after adding the Markdown renderer's missing `@react-native-vector-icons/common` runtime dependency. The clean simulator rendered onboarding; app-visible icons continue to use the Tabler registry.
- Dev deployment `fantastic-beagle-190` is now on the same functions/schema. The four curated species groups (28 master rows, 56 locale rows) were reviewed/published through SQLite/API/outbox; all 84 operations are applied. Canonical search verifies Basella by accented, unaccented, and scientific names, with `seed` + `stem_cutting` on the base row.

Open rollout gates:

- Convex code/schema is deployed to production; no production data migration or other data mutation was performed.
- Run dry-run and paginated Convex propagation/structured-care migrations on the authorized target; resolve manual-review/conflict/failure rows and require `remaining: 0` before removing legacy fields/fallbacks.
- Rehearse/approve the SQLite migration against the target database backup and review its evidence report before production use.
- Complete authenticated/onboarded simulator and real-device Markdown/propagation QA for links, long/nested lists, dark mode, small screens, cache invalidation, and localized tag layout.
- Care aggregates for the four published groups remain `awaiting_review`; complete evidence review before changing them to `verified`.

Next action: authorize a staged migration rehearsal and complete onboarded/authenticated feature-screen QA; only after zero-remaining evidence should the compatibility schema fields and fallbacks be removed.

## Plant geography adaptation Release 1 — dev closed (2026-08-13)

Status: **RELEASE 1 DEV COMPLETE**; production rollout remains separate.

- Native Plant Detail now displays canonical `ORIGIN` and `GROWING CONDITIONS` only
  when geography exists, alongside compact wrapping `USES`, structured
  `PROPAGATION`, while harvest, germination, spacing, and watering remain regular value rows in the lower stats list.
- iPhone 17 Simulator (iOS 26.2) passed Basella metadata/care rendering and all
  three geo pilots: Brandywine/US, VN Cherry/VN, Tommy Toe/AU, including their
  approved adaptation sets.
- A native QA finding where direct `Brandywine` search excluded cultivars was
  fixed: empty common browse remains base-only, active search covers all
  canonical plants. Direct simulator re-test passes.
- Focused mobile tests 13/13, mobile typecheck, and `git diff --check` pass.
- Evidence: `artifacts/stage-d-simulator/`. No production deployment or data
  mutation occurred during closeout.

## Active package: P3.1-LOCAL-AUTHORING — Dashboard SQLite boundary

Status: complete and independently verified (Heavy route, 2026-08-10)

Goal: make the dashboard plant-content workspace fully SQLite-local for list, search, detail, edit, and review, while keeping Convex as the explicit publish target and leaving the mobile Convex-to-local-cache read path unchanged.

Scope and constraints:

- Dashboard Plant Master, localized descriptions, care content, and review state must read/write `apps/api/data/richfarm.db` through authenticated API routes.
- Dashboard list/detail/search must never mix SQLite and Convex snapshots.
- Save/review is local-first; Convex publication remains explicit, retryable, and backed by the existing sync outbox.
- Mobile stays out of scope: it already subscribes to the canonical Convex projection, persists an AsyncStorage snapshot, and searches the resolved local array.
- Plant photos and user/runtime data remain Convex-owned.
- Preserve the user-owned modification to `apps/api/data/richfarm.db`; do not overwrite or revert it.

Acceptance gates:

- Dashboard plant list/detail/stats/i18n work with Convex unavailable and use SQLite consistently.
- `mồng tơi` and `mong toi` return the same local result set; search is debounced and stale responses cannot overwrite newer results.
- Saving local plant content does not wait for a Convex round trip; publication is a separate explicit action with honest pending/failed status.
- Existing authorization, delete guards, identity, validation, and retry guarantees remain intact.
- Focused API/dashboard regression tests pass, followed by API build/tests, dashboard build, Convex tests/typecheck as affected, and mobile typecheck as a boundary regression gate.

Ordered work:

1. Define the SQLite authoring API/read contract and identify the smallest safe publish boundary.
2. Convert dashboard plant and i18n hooks to authenticated SQLite API routes.
3. Add normalized local search, debounce, and stale-response protection.
4. Separate local save from explicit Convex publish/retry controls and expose sync state.
5. Verify, document the new ownership boundary, and reconcile this package status.

Verified completion:

- Dashboard Plant list/detail/stats/search and localized content now use authenticated SQLite API routes exclusively; Groups and Photos remain Convex-owned.
- Local plant, bulk, delete, and i18n writes commit first and always enqueue deduplicated publish work, even while Convex is unavailable.
- Existing local authoring rows can be queued idempotently without publishing; `Publish pending` is a separate explicit action. Convex-to-SQLite recovery is no longer a normal dashboard control.
- Accent-normalized search returns the same 10 rows for `mồng tơi` and `mong toi` in the shared sidebar browser. Debounce and stale-request guards are active.
- Independent verification passed: focused Phase 3 tests 13/13, full API tests 42/42, API build, dashboard build, and diff checks.
- Mobile required no change: its active library hook already subscribes to Convex, persists a local snapshot, and searches the resolved local collection.

Deferred follow-up:

- Search currently normalizes and filters the complete SQLite snapshot in memory. Add FTS/indexing only when measured dataset growth makes it necessary.
- Legacy Convex/auto API reads do not promise the SQLite dashboard filter semantics; dashboard callers explicitly select `source=sqlite`.

## Active package: P3-MEDIUM — Complete Phase 3.0 and 3.1

Status: technical implementation complete locally; release/content gates remain open

Goal: close the remaining technical acceptance gates for the Plant Library backend, dashboard, and mobile canonical read experience without inventing curated plant content.

Constraints:

- Preserve the existing uncommitted Phase 3 implementation.
- Historical constraint (superseded by P3.1-LOCAL-AUTHORING): Convex was the dashboard source of truth and SQLite an operational mirror. Convex remains the mobile canonical source and dashboard publish target, while SQLite now owns dashboard Plant/i18n/care authoring.
- Do not deploy, commit, push, or mutate production data without explicit authorization.
- Treat the 200–300-species curation requirement as an external-data gate unless trusted source data already exists locally.

Acceptance gates:

- API, Convex, dashboard, and mobile typechecks/builds/tests pass on the supported Node runtime.
- Unauthorized canonical/admin writes are rejected and migration/service-token paths remain protected.
- Dashboard fields round-trip without silent loss; outbox/reconciliation, stable identity, deletion guards, locale cleanup, and canonical projection have regression evidence.
- Mobile Library/list/detail/scanner/Add Plant consumers use the same active/locale/placeholder/inheritance policy.
- Content audit is reproducible and distinguishes code defects from remaining curation debt.
- Generated/local database artifacts and dependency lockfiles are reviewed for commit suitability.

Major steps:

1. Audit the existing Phase 3 diff and map every Definition of Done item to code/tests.
2. Run clean technical gates and fix scoped failures, including mobile dependency/typecheck issues.
3. Review security, migrations, data integrity, dashboard round-trip, and canonical mobile integration.
4. Run normal/strict content audits and classify remaining external-data work.
5. Reconcile documentation and provide staging-readiness evidence plus explicit remaining gates.

Verified completion:

- API build passed; full API suite passed 24/24 outside the socket-restricted sandbox.
- Convex typecheck passed; full Convex suite passed 69/69.
- Dashboard build and mobile typecheck passed.
- Admin and canonical projections are separated intentionally: full admin snapshot for management, quality-filtered canonical projection for mobile/public Library reads.
- Stable identity, outbox retry/mirror hydration, reconciliation, authorization, locale/content filtering, and delete/reference guards have regression coverage.
- Root and API lockfiles resolve Convex 1.42.2 consistently; better-sqlite3 12.11.1 supports the Node 26 runtime used for verification.

Open gates:

- Staging Convex deployment and end-to-end dashboard round-trip validation have not been authorized or run.
- Strict content audit still fails with 475 placeholder/near-duplicate findings; externalDataGate is not_run.
- Only vi/en content exists; current rows are unreviewed and lack provenance URLs, so the 200–300 trusted-species curation target is incomplete.
- Decide whether the migration-only `apps/api/data/richfarm.db` binary change belongs in the eventual commit.

Next action: obtain trusted curation/source data or authorize a staging validation pass; perform final commit-scope review before landing.
# Active package: PRE-12-AUG-TEST-FIX — Local verification and defect closure

Status: complete for locally executable gates; external rollout gates remain
open (Heavy route, 2026-08-13)

Goal: rerun the locally executable verification gates for Care Markdown,
Propagation, Geo Release 1, Phase 1.5–2.5, and Phase 3.1; fix reproducible source
or deterministic-test defects without claiming external rollout evidence.

Scope and constraints:

- Preserve all pre-existing user changes, especially the SQLite database,
  profile/language work, iOS project files, artifacts, and the new 2026-08-13
  propagation-content plan.
- No staging/production mutation, provider calls, physical-device claims,
  compatibility removal, commit, push, or deployment without separate scope.
- A local gate passes only from a fresh command result after the current tree;
  external gates remain OPEN unless their required artifact already exists.
- Fix only failures attributable to the plan-owned source/tests; environment
  failures must be reported separately with exact reproduction evidence.

Acceptance and verification:

1. Care/Propagation focused shared, API, Convex, dashboard, and mobile checks
   pass after any scoped repairs.
2. Broader API/Convex/dashboard/mobile regression gates pass, or every failure
   is classified with a reproducible blocker and unaffected results retained.
3. Geo and Phase 1.5–3.1 local boundaries are checked against the current tree;
   no staging/device/provider/rollout gate is silently promoted.
4. Production fixes have deterministic regression coverage and `git diff
   --check` passes.
5. Final plan statuses distinguish source-complete, locally verified, and
   externally open work using verified facts only.

Ordered work:

1. Map commands, ownership, dirty-tree exclusions, and locally executable gates.
2. Execute the Care/Propagation package and repair scoped defects.
3. Independently verify the repaired package and broader local regressions.
4. Reconcile Geo, Phase 1.5–2.5, and Phase 3.1 local evidence and documentation.

Verified result:

- Care/Propagation focused checks pass; full API 64/64 and Convex 97/97 pass;
  affected shared/API/Convex/dashboard/mobile typechecks and builds pass.
- Independent verification found and closed one dashboard contract defect:
  `PlantI18nRow` now declares the already-mapped optional `contentUpdatedAt`.
  Dashboard TypeScript, PlantManager 7/7, and production build independently
  pass after the repair.
- Geo shared checks 26/26, dashboard 12/12, canonical Convex 12/12, mobile
  110/110 plus typecheck, and a fresh iOS export pass.
- Phase 3.1 normal audit passes. Strict audit remains an expected open content
  gate with 558 findings and priority coverage 0/97; taxonomy check remains
  blocked without an authorized admin key.
- No staging, physical-device, Android, push-provider, migration mutation,
  compatibility cleanup, or rollout approval gate was claimed or executed.

# Active package: PRE12-EXTERNAL-CLOSE — Content and rollout gate execution

Status: local audit contract corrected; content curation handed to project
owner; external execution blocked on target, restore, device, provider,
identity, and credential prerequisites (Heavy route, 2026-08-13)

Goal: close the remaining Phase 3.1 content/taxonomy gates and execute the
authorized staging migration, rollback, physical-device, provider, data
migration, compatibility-cleanup, and rollout evidence gates where exact safe
targets and disposable test identities can be verified.

Constraints and stop conditions:

- Resolve the exact deployment, backup, account, reminder, and device targets
  before any mutation or provider send; never print credentials or raw tokens.
- Production mutation is not inferred when only a dev/staging gate is required.
- Preserve the user-owned SQLite database and all unrelated dirty worktree
  changes. Create recoverable backups before target data mutation.
- Compatibility removal requires verified `remaining: 0`, successful readback
  and restore rehearsal, and proof that deployed clients no longer depend on it.
- Physical-device/provider gates cannot be promoted from simulator, export,
  unit tests, or missing-device evidence.

Acceptance gates:

1. Strict content audit reaches PASS or every unresolved content row has a
   truthful evidence-backed disposition and explicit owner; no invented data.
2. Taxonomy checks run against an explicitly resolved authorized target and
   pass without exposing the admin key.
3. Migration dry-run, backup/readback, bounded mutation, idempotency, and
   restore rehearsal produce reconciled artifacts for the authorized target.
4. iOS/Android physical-device and Expo/APNs/FCM checks record exact disposable
   device/build/dispatch/receipt evidence, or remain blocked with exact missing
   hardware/credential/identity prerequisites.
5. Compatibility cleanup and rollout approval occur only after their upstream
   gates pass; documentation records verified facts and remaining blockers.

Ordered work:

1. Resolve targets, credentials, devices, audit categories, and safe commands.
2. Remediate bounded strict-audit source/content defects with provenance gates.
3. Run taxonomy and staged data-migration/rollback rehearsals.
4. Execute physical-device/provider matrices on disposable identities.
5. Remove proven-unused compatibility paths, regress, and reconcile rollout.

Verified progress and blockers:

- Corrected the Phase 3.1 audit contract so explicitly inherited descriptions
  are reported separately and cannot create authored/imported duplicate
  failures. Focused tests 2/2, normal audit, syntax, and diff-check pass; an
  independent verifier confirmed the gate was not weakened.
- Strict audit remains honestly open at 558 real findings: 358 placeholders
  plus 200 capped near-duplicate pairs; current content has zero explicitly
  inherited non-empty rows. Priority coverage remains 0/97, source owners are
  TBD, and approved licensed care evidence is unavailable.
- The project owner accepted ownership of content completion. The 558 findings
  are non-critical publication-quality debt rather than code/schema/database
  integrity defects. Next content action is reviewed, provenance-preserving
  curation in small batches followed by normal and strict audit runs; do not
  invent care claims or mark unsupported evidence as verified.
- Only dev `fantastic-beagle-190` is configured. No disposable staging target,
  Care/Propagation/Phase1.5 target snapshot, or tested restore destination is
  available. Care has no dry-run; migration mutation is therefore stopped.
- Taxonomy execution was attempted against dev but the local Convex CLI rejects
  the configured deploy credential format before invoking the function. No
  taxonomy function or data mutation ran; authorized controlled credential
  injection is required.
- No physical iOS/Android device is connected (`devicectl` has none; `adb` is
  unavailable). No Expo project ID/EAS login/APNs/FCM credentials or disposable
  account/reminder/dispatch identity exists locally, so provider sends remain
  blocked.
- Compatibility cleanup and rollout approval remain downstream-blocked; no
  schema/reader removal is allowed without zero-remaining migration/readback,
  restore rehearsal, and deployed-client compatibility evidence.
## Package: CID-1–CID-9 — Canonical identity and content integrity

Status: local implementation and authorized SQLite remediation complete and
independently verified; production Convex rollout not authorized or run (Heavy
route, 2026-08-25)

Goal: prevent duplicate canonical plants, bind Git-authored plant and
pest/disease content to explicit database identities, and make SQLite a
report-first data-quality control plane for Convex publication/readback.

Scope and constraints:

- Git Markdown is authoritative for long-form content; generated manifests and
  canonical keys are never manually authored.
- Preserve existing plant codes and user-owned SQLite data.
- Local SQLite CID-3 remediation and selected tomato content import were
  authorized with backup/dry-run/readback. No hard delete, production Convex
  mutation, deployment, or publication was authorized.

Acceptance gates:

- Canonical identity is shared and deterministic across API, SQLite, content
  tooling, and Convex; every normal create/import writer is guarded.
- SQLite migration/remediation is backed up, dry-runnable, journaled,
  reversible, and independently readback-verified.
- Content manifests are deterministic and import through exact-byte hash,
  version, provenance, identity, approval, and outbox gates.
- Reconciliation proves complete revisioned snapshots and persists actionable
  findings/proposals before any affected publication can proceed.

Verified completion:

- Tomato row 1554 is active; row 6 is reversibly archived and redirected after
  verified backup, dry-run, reference/alias preservation, and readback. The
  active canonical-key uniqueness constraint passes; no hard delete occurred.
- Original pre-CID-3 SQLite backup SHA-256 is
  `5b9932e7a15ffc97b8564b6e4ffcd9c667ce3f91cb073ea8a2675d1f16c70a9b`;
  current local SQLite SHA-256 is
  `b57d6dba7a347e11d5e50d729bec2a616ca4fee2987db8340c59b84d6fa978e9`.
- API/dashboard exact duplicate create/import is blocked and opens the existing
  row; near matches remain suggestions. Convex has one indexed canonical
  upsert boundary plus bounded, resumable, journaled migration/rollback code.
- Generated manifests: 38 plant + 18 pest/disease. Tomato row 1554 received the
  selected vi/en Markdown locally; two plant directories lack English content,
  and Basella Ceylon remains quarantined for invalid parent/identity data.
- Smart reconciliation includes complete cursor/count/revision validation,
  durable findings/proposals, stale-evidence rejection, outbox blocking and
  supersession, role-separated approval/apply, and the dashboard Data Health
  view. Pending outbox rows were not sent.
- Pest/disease content now has localized/versioned Convex projection and
  bounded migration code; mobile internal Markdown links route safely to an
  in-app detail screen with locale fallback.
- Focused suites, affected builds/typechecks, independent package verification,
  final local audit/readback, and `git diff --check` passed. Convex production
  was not deployed or mutated.

Next action: after separate production authorization, deploy additive Convex
code/schema, initialize catalog metadata, capture a complete snapshot, run both
migrations dry, review proposals, rehearse rollback/readback, and publish only
through a fresh healthy gate. Resolve the two missing-English plant directories
and quarantined Basella Ceylon before including them.
