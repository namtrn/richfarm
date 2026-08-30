# Latest Session Work

## 2026-08-30 — MCD packaging verification

- Re-ran the focused package gates before commit: all six content-source API
  suites passed (76/76), the dashboard Content Inbox suite passed (7/7), API
  and dashboard production builds passed, dashboard TypeScript checking
  passed, and `git diff --check` passed.
- The 50,000-file performance harness was not repeated during packaging; its
  previously recorded measured run remains the scale evidence. The full API
  suite's 15 unrelated failures remain the previously established baseline.
- MCD-1–MCD-7 is ready for a scoped commit and clean PR. Production Convex and
  production data remain untouched and require separate authorization.

## 2026-08-25 — MCD-7 measured verification: logs exposed and fixed a 40x bottleneck

- Built the repeatable MCD-7 harness `scripts/content-source-perf-run.ts`
  (fixture reuse/generation, fresh DB per run, phases: initial index,
  reconcile, single edit, burst, full-hash audit cycle with mid-cycle
  restart drill, retention+VACUUM) writing JSON metrics to
  `artifacts/perf/metrics-*.json`. Added structured detector logging
  (`content-source/logger.ts`, one JSON line per scan/audit/lifecycle event,
  counters only — no content bodies).
- The harness logs exposed a real 40x performance bug invisible to unit
  tests: every reconcile/catch-up took ~120–156s at 50k files regardless of
  workload. Two stacked causes found by profiling the numbers: (1) per-row
  autocommit fsyncs in the touch path; (2) dominant cost — the per-shard
  `LIKE 'prefix%'` lookup cannot use a BINARY index under SQLite's default
  case-insensitive LIKE, so each of 25k shards scanned all 50k rows.
- Fixes: shard writes now ride one outer transaction per root with a
  savepoint per shard (partial-failure semantics preserved), and shard lookups
  use exclusive range bounds on the unique path index. Result on the same
  fixture: initial index 8.7s, 50k reconcile 3.0s, single-file edit 3.1s with
  filesHashed=1, 500-event burst 3.3s, audit cycle ~15s (~3,400 files/s),
  restart-resume proven, compaction+VACUUM 38→29 MB.
- Budget tuned from measurement: `maxFilesPerWindow` 5,000 → 20,000 (three
  windows cover 50k inside one hour). Regression guards added: EXPLAIN QUERY
  PLAN must hit the path index for shard ranges; steady-state hashing stays
  at edited-file minimum.
- Final gates: API 179 passed / 15 pre-existing failures unchanged; dashboard
  31/31 + build PASS; API build PASS; zero non-preexisting tsc errors;
  `git diff --check` PASS. Full MCD plan is now implemented end to end.

## 2026-08-25 — MCD-6 dashboard Content Inbox

- Added the dashboard layer consuming the MCD-5 API: `contentReview.ts`
  (contract types + pure helpers, 15s bounded polling constant ≤ 30s SLA),
  `useContentInbox`/`useContentMonitorStatus` hooks (stale-response-guarded
  polling, selection + preview, approve/dismiss/apply flows with explicit
  rejection surfacing), and `ContentInbox.tsx` with monitor strip (explicit
  passive/degraded rendering per exit gate), filter toolbar, event table
  with state badges/coalesce counts, and incoming-vs-staged preview panel.
  Non-admins see mutation buttons disabled. Data Health page shows a
  `ContentSourceHealthBadge`; sidebar gains "Content Inbox".
- Verification: dashboard tests 31/31 PASS (7 new), dashboard tsc clean,
  production build PASS; API focused suites 73/73 PASS; `git diff --check`
  PASS. One test-assertion defect (self-defeating `.replace` check) was
  caught and replaced with disabled-button regex assertions.

## 2026-08-25 — MCD-5 review API and stale-approval gates

- Implemented the MCD-5 layer on top of the hardened MCD-1–4 foundation.
- `content-source/review-service.ts`: independent per-item batch approval
  building one scoped proposal per batch; preview with incoming bytes vs
  SQLite staging and manifest identity; dismissal with audit fields; apply
  gate chain (live events → scoped watermark → fresh disk re-hash →
  dryRunContentImport → transactional applyContentImport) followed by a
  detector-index refresh so reconcile never re-reports an applied change.
  Reuses the CID-6 importer verbatim — no second importer, Convex untouched.
- `content-source/review-routes.ts` + app.ts wiring:
  `/api/content-review/*` behind admin/editor roles; monitor-status exposes
  injected health snapshot plus open quarantine summary. `server.ts` now
  shares `resolveRepositoryRoot()` from monitor.ts and passes
  `getMonitorHealth` into createApp.
- Defects caught during verification: stale cached relinquish promise (fixed
  in round 4), short `owning_manifest_path` written by
  `observationFromClassification` (overwrote full-prefix baseline rows),
  proposal transition map missing `ready→applied`, and gate ordering that
  masked fully-superseded batches as NO_APPROVED_EVENTS instead of
  APPROVED_EVENT_SUPERSEDED. Tests encode the real authoring workflow: edit
  bytes → regenerate manifest as reviewed replacement (CID-6 contract) →
  approve both events → apply.
- Verification: focused suites 86/86 PASS; API build PASS; zero
  non-preexisting tsc errors; `git diff --check` PASS; remaining full-suite
  failures are exactly the 15 proven-pre-existing ones. Notably the new
  supertest route tests pass even inside this sandbox.

## 2026-08-25 — MCD-1–4 external review: five findings fixed and verified

- An external review of MCD-1–4 found three P1 and two P2 issues; all are
  fixed with dedicated regression tests before starting MCD-5.
- P1 lease-first startup: baseline/catch-up/reconcile/audit now execute only
  under full multi-root ownership (`tryBecomeActive` in monitor.ts); a
  passive instance provably writes zero detector state (snapshot-diff test);
  one-time initialization is deferred to first ownership, which also covers
  post-expiry takeover.
- P1 atomic acquisition: `acquireAllRoots` is all-or-nothing with rollback —
  regression test plants a foreign lease on the second root and proves the
  first root is released, never half-held.
- P1 debounce queue: the timer is re-armed after every push including
  overflow pushes; unit test drives the injected scheduler without flushNow
  and proves the final candidate flushes.
- P2 stop(): `stopWatching` now returns/awaits the adapter close promise;
  ownership is released only after the handle closed; deferred-stop fake
  adapter test asserts stop() stays unresolved until close completes.
- P2 honest audit: per-root `@cycle_errors` checkpoint marker makes unreadable
  files keep `cycleComplete=false` across resumable windows and marks the run
  incomplete; a successful re-hash auto-resolves that quarantine entry, and
  only then does `getLastCompleteFullHashAuditAt` advance. Regression test
  chmods a file 000→644 across two audit windows.
- Review round 2: the five fixes were confirmed; one test defect remained —
  the passive-instance snapshot assertion compared `snapshot()` with itself
  (always true). Fixed by capturing `stateBefore` before starting monitor B,
  adding `pollLeaseNow()` to exercise the passive poll path, and including
  lease rows in the snapshot. Mutation check: temporarily re-introducing
  pre-fix catch-up-on-passive behavior makes the test fail (`lastCatchUp`
  non-null), proving it guards the contract.
- Review round 3 (lease-loss handoff P1): `pollLease` demotion no longer
  releases leases while the old watcher may still be open. New unified
  `beginRelinquish()` enforces the safety order — detach candidate intake
  synchronously (queue disposed AND nulled, so late adapter callbacks are
  inert), await adapter close, and only then release ownership; a
  relinquish-in-flight also blocks new activation attempts. Regression test
  drives a deferred adapter close across takeover and asserts both late
  callbacks produce zero events and lease rows survive until close resolves.
  Design note: literal "B blocked until A releases" was rejected because it
  would let a crashed instance block takeover forever; expiry-based takeover
  stays authoritative, and intake detachment removes the correctness risk
  during any overlap. Also upgraded the passive-write snapshot to store full
  lease ROW contents (not COUNT), so same-count owner/expiry updates fail it.
- Review round 4 (stale relinquish cache P1): `beginRelinquish` cached its
  promise forever, so a monitor that demoted once and later re-took over
  would return the old resolved promise on stop() — never closing the second
  adapter, detaching its queue, or releasing the new leases. The in-flight
  promise is now cleared on completion; cleanup rides `.finally()` (always
  deferred) after an initial async-fn self-reference hit a TDZ crash on the
  synchronous no-adapter completion path. Regression test drives two full
  relinquish cycles through one monitor: stopCalls reaches 2, the second
  adapter's late callback is inert, and leases survive each cycle until that
  cycle's close resolves. Test was written first and failed against the
  buggy code (`stopCalls` stayed 1) before the fix.
- Verification: content-source suites 65/65 PASS; content-manifests 13/13;
  API build PASS; zero non-preexisting tsc errors; `git diff --check` PASS.
  Supertest-based suites remain blocked in this sandbox by listen EPERM
  0.0.0.0 (pre-existing environment limitation, not an MCD assertion
  failure); they pass outside the sandbox per prior sessions.

## 2026-08-25 — MCD-1–MCD-4 content change detection foundation + runtime

- Continued the MCD package in the deployment state without worker
  subagents. MCD-3 and MCD-4 are now complete on top of the earlier
  MCD-1/MCD-2 foundation.
- MCD-3 (`content-source/scanner.ts`): per-shard bounded reconciliation,
  vanished-shard deletion sweep, manifest-neighborhood revalidation,
  atomic legacy baseline (no inbox events, sealed checkpoint), blocking
  post-baseline missing-manifest events, digest-based rename pairing in
  either discovery order, shard quarantine isolation, and a budgeted
  resumable full-hash audit window with persisted cursors that catches
  mtime+size-preserving edits metadata reconcile provably misses.
- MCD-4: chose `chokidar` v4 pinned `4.0.3` exact over `@parcel/watcher`
  (no native build/deploy cost; overflow handled by our bounded queue).
  Added `watcher.ts` adapter + debounce queue (overflow flushes without
  dropping evidence) and `monitor.ts` lifecycle: baseline → catch-up →
  lease-gated watching (single active owner, expiry takeover, renewal
  demotion), periodic reconcile, hourly audit ticks, graceful stop before
  SQLite close, health snapshot with degraded reasons. `server.ts` starts
  it after DB init; `CONTENT_SOURCE_MONITOR_ENABLED=false` disables.
  Real-chokidar smoke verified delivery + clean close.
- Verification: 58/58 content-source tests PASS; API build PASS; zero
  non-preexisting tsc errors; `git diff --check` PASS; full API suite
  shows only the 15 failures proven pre-existing via stash experiment.
  Defects found and fixed during verification: entityDir missing root
  prefix in baseline/neighborhood paths, audit cycle-complete flag firing
  mid-budget, event counts read from the wrong field, rename pairing
  missed when created was discovered first, and no deletion sweep for
  vanished whole shards.
- No commit; production Convex untouched. Next: MCD-5 review API +
  stale-approval gates reusing dryRun/applyContentImport.

## 2026-08-25 — MCD-1 + MCD-2 content change detection foundation

- Reviewed the final version of
  `content/plans/2026-08-25-markdown-content-change-detection-plan.md`
  (all prior review findings closed) and began implementation in the
  deployment state without worker subagents.
- MCD-1 complete: pinned contracts and path rules now live in
  `apps/api/src/content-source/contract.ts` and `paths.ts`, enforced by
  10 contract tests (state machine, locale policy configurability,
  traversal rejection, case-fold collisions on real APFS, real content
  tree read access). Added
  `scripts/generate-content-source-perf-fixture.ts` for the gitignored
  50k-file performance fixture under `artifacts/perf/`.
- MCD-2 complete: additive SQLite schema (8 new `content_*` tables) wired
  into `createDatabase` via `content-source/schema.ts`; repository layer
  covers idempotent file index with per-file evidence revisions, durable
  event journal with idempotency/coalescing/supersession, rename
  correlation, guarded review transitions with actor audit, pagination,
  per-root/shard checkpoints with atomic legacy-baseline sealing,
  quarantine retries, monitor lease with expiry takeover, reproducible
  scoped proposal watermarks, health-only global revision, monitor run
  metrics, and configurable-but-disabled retention compaction with
  backup/rebuild proof tests. CID tables/outbox remain untouched.
- Verification: new suites 38/38 PASS; content-manifests regression
  13/13 PASS; API build PASS; `git diff --check` PASS. The 15 failing
  tests in care-content-migration/generic-data/master-plants/
  plant-geography/phase3 and the tsc noise in
  `tests/sync-reconciliation.test.ts` were proven pre-existing by
  stashing this package's changes and reproducing identical failures.
- No commit was made; production Convex untouched.

## 2026-08-25 — Canonical identity and content integrity (CID-1–CID-9)

- Completed and independently verified the local implementation of the full
  canonical identity/content integrity plan. Production Convex was not
  deployed or mutated, and pending outbox rows were not sent.
- Added one versioned canonical identity contract across shared, API, SQLite,
  content tooling, and Convex. API/dashboard/import writers now block exact
  duplicates and open the existing row; Convex writers route through one
  indexed canonical upsert boundary with bounded migration/rollback tooling.
- Applied the authorized local tomato remediation from a verified backup:
  row 1554 remains active, row 6 is reversibly archived/redirected, references
  and aliases are retained, and the active unique canonical-key gate passes.
- Generated 56 deterministic Git Markdown manifests (38 plant and 18
  pest/disease) and imported only the selected tomato vi/en content to row
  1554. Missing English content blocks `abelmoschus-esculentus` and
  `rubus-idaeus`; Basella Ceylon remains quarantined for invalid parent data.
- Added complete revisioned Convex snapshot reconciliation, durable findings
  and repair proposals, fresh-evidence outbox blocking/supersession, audited
  role-separated controls, and the dashboard Data Health view.
- Added localized/versioned pest/disease projection and bounded migration code,
  exact stable-link validation, and safe mobile in-app detail routing with
  locale fallback.
- Verification passed across focused tests, affected builds/typechecks,
  independent package review, migration readback/audit, and `git diff --check`.
  Current SQLite SHA-256:
  `b57d6dba7a347e11d5e50d729bec2a616ca4fee2987db8340c59b84d6fa978e9`.
- Next entry point (requires separate production authorization): deploy the
  additive Convex code/schema, initialize catalog metadata, fetch a complete
  authorized snapshot, run both migrations dry, review proposals, rehearse
  rollback/readback, then publish only through a fresh healthy gate.

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
- Closed Plant Geography Adaptation Release 1 on dev after native iPhone 17
  Simulator QA. Plant Detail now shows optional localized origin/adaptation
  metadata plus compact Uses/Propagation rows; harvest, germination, spacing,
  and watering remain in the lower stats list. Basella and all three
  tomato pilots passed; direct cultivar search exposed and then closed the
  base-only prefilter bug. Focused mobile tests 13/13, mobile typecheck, and
  diff-check pass. Completion plan status is `RELEASE 1 DEV COMPLETE`;
  production remains a separate rollout.
