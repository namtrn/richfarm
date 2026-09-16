# Project completeness audit — 2026-09-06

Baseline: `12d82f9`; working tree clean before audit. Light route, report-only.
Evidence: task/release records, commit history, targeted source inspection and
fresh local checks. No production inspection, device QA or deployment was
performed. Task completion is distinguished from release readiness. This is a
bounded repository assessment, not proof that every screen is defect-free.

## Assessment

The product has substantial implemented functionality and a strong offline and
content-publication foundation. The best next investment is finishing existing
workflows: predictable state, consistent labels, visible failures, green checks,
and operational release evidence. Commit counts are not completion percentages.

| Area / task | Commit anchors | Assessment |
| --- | --- | --- |
| Scoped mobile state | `758dba3`, `f9895e7` | Runtime, sync projection and scoped preferences now have dedicated stores/coordinators. The July review describes an older implementation; its 6/10 score should not be applied unchanged. Same-scope refresh ordering remains a concern. |
| Durable plant content / offline | `20b0794` | Serialized command modules and regression coverage exist. External multi-client/restart/account-isolation release evidence remains open in release records. |
| Care plans / reminders | `41ae49e`, `386da6b`, `7cf82dd`, `53384bf` | Offline activation, retry, occurrence and lifecycle work implemented. Physical-device/provider delivery is a separate outstanding evidence gate. |
| Plant authoring / canonical identity | `8c9a9ff`, `67ccc1d` | SQLite authoring, shared identity contract, publication guards and reconciliation implemented. API regression suite still fails. Production readiness cannot be inferred from local completion. |
| Geography / propagation | `9d97142`, `819ff1c`, `622d52e`, `c4bfd7c` | Shared structured metadata and mobile detail display implemented; dev completion documented. Progress document still contains an older mobile-excluded statement. Propagation detail content remains proposed. |
| Markdown review inbox | `4c67f16` | MCD implementation and measured performance documented. Progress still says to package completed work into a commit/PR, although the implementation commit exists. PR status was not checked. |
| Care approval / publish | `4cb875a`, `45c9994` | Draft → locale approval → outbox → serving projection is implemented; global notifications added. Dev readback documented; production status not verified here. |

## Prioritized findings

### P1 — Mobile typecheck includes generated native files (confirmed)

`apps/mobile/tsconfig.json:11` includes all TS/TSX recursively and excludes only
node_modules. After the local iOS build, TypeScript parses CMake
`compiler_depend.ts` and Hermes parser test fixtures under `ios/Pods`.
The ordinary mobile typecheck fails before providing a useful app-code verdict.

Acceptance: standard typecheck passes both before and after native build;
exclude generated/native dependency trees without excluding application code.

### P1 — API regression gate remains red (confirmed)

Fresh API run: 195 passed, 15 failed, in five files: care-content-migration,
generic-data, master-plants, phase3, plant-geography. Examples include
`CANONICAL_IDENTITY_REQUIRED`, canonical validation replacing old error
expectations, and expected 400/201/204 responses becoming 409.
The count matches the documented pre-existing baseline; this audit did not
prove each failure's historical introduction with a checkout/bisect.

Acceptance: classify every failure against the intended current contract;
update invalid fixtures or fix behavior while retaining the original meaningful
authorization, deletion, geography and CRUD assertions. All 210 tests green.

### P1 — Two projection refresh paths lack shared ordering (source risk)

`apps/mobile/lib/state/SyncScopeCoordinator.tsx:25` protects subscription-driven
loads with `latestRequest`; the foreground refresh at line 65 bypasses that
counter. `syncScopeStore.ts:94` accepts snapshots by scope/token, not request
generation. A foreground read started before an outbox update can finish after
the newer subscription read and publish older state within the same scope.
Cross-account scope protection exists; this is a different ordering concern.
Not reproduced on a native device in this audit.

Acceptance: all refresh triggers share one generation/order mechanism; a
deterministic delayed-foreground/newer-queue test proves old state cannot win,
including late errors. Keep the existing account-transition protections.

### P2 — Reminder plant labels ignore nickname in several locations (confirmed)

`apps/mobile/app/(tabs)/reminder.tsx:695` uses display/scientific name in the
picker. Lines 859–873 also omit nickname for bed summaries and target labels.
The same screen at line 918 uses nickname first, as does Plant Detail at line
721 (with an additional local form draft). A plant named by the user as A can
therefore appear under the species name elsewhere in the same workflow.

Acceptance: define separate instance-name and catalog-name helpers; instance
labels consistently use trimmed nickname → localized common name → scientific
name → translated fallback. Verify two plants of the same species, empty/blank
nicknames, rename, VI/EN changes, and offline/reconnect.

### P2 — Favorite failure is silent (confirmed)

`apps/mobile/app/(tabs)/library/[masterPlantId].tsx:712` catches toggle failure
with `catch(() => undefined)`. `hooks/useFavorites.ts` writes through a direct
Convex mutation, outside the durable entity outbox. A rejected write gives no
explanation or retry affordance. This does not establish that every offline
mutation immediately rejects; it establishes that any rejection is swallowed.

Acceptance: visible failure/retry behavior; define the favorite offline
contract explicitly (queued or unavailable) and test rejection/reconnect.

### P2 — CI does not enforce the checks used to claim completion (confirmed)

The only workflow found under `.github/workflows` is `taxonomy-invariants.yml`.
It runs taxonomy checks, not the mobile/dashboard/API/shared/Convex test and
typecheck matrix. Dashboard `build` is Vite-only, without a TypeScript gate.

Acceptance: PR checks run the agreed typecheck/test matrix in a reproducible
runtime; a deliberate type error and failed test must fail the required check.

### P2 — Task/handoff state is not reconciled with commits (confirmed)

`agent_docs/project_progress.md:206` still calls for packaging MCD implementation;
line 227 describes mobile geography as boundary-only/Release 2. Commit
`4c67f16` and the dev completion/mobile-display records supersede those claims.
The July state review also needs an explicit historical/superseded marker so
its original P0 is not confused with current behavior.

Acceptance: one current status per package with source, dev, staging and
production evidence tracked separately. Preserve historical evidence and dates.
Protected progress/handoff files were not edited during this leaf-state audit.

### P3 — Propagation terminology review remains unresolved (confirmed debt)

`apps/mobile/lib/locales/vi.json:410` still labels `ground_layering` as “Uốn cành”.
The August 13 propagation detail plan proposes “Chiết áp cành” and also flags
bulb/corm/runner/offset terminology. These are proposed editorial decisions,
not approved replacements; do not rename stable codes or silently treat the
proposal as the source of truth.

Acceptance: approve bilingual botanical labels, then align displayed labels
across consumers while preserving stable codes.

### Maintainability — Large screens still combine many responsibilities

Current sizes: Library index 2,170 lines; Reminder 1,642; Plant Detail 1,303;
dashboard PlantManager 1,564. This is maintainability evidence, not by itself a
runtime defect. Extract form controllers, naming/formatting rules and command
orchestration when fixing the relevant flow; keep transient form state local.
Avoid a broad state-library rewrite.

## Fresh verification

| Check | Result |
| --- | --- |
| `vitest run apps/mobile apps/dashboard packages/convex/convex packages/shared` | 63 files, 327 tests passed |
| Dashboard `tsc --noEmit` | Passed |
| Mobile `tsc --noEmit` | Failed on generated iOS/Pods/Hermes files |
| API `npm --prefix apps/api test -- --reporter=dot` | 12 files passed / 5 failed; 195 tests passed / 15 failed |

Initial API attempt was blocked by sandbox HTTP listen permissions. The table
uses the authorized rerun, not those environmental failures. Test logs are
temporary at `/tmp/richfarm-audit-tests.log` and `/tmp/richfarm-audit-api.log`.
No fresh native UI, production readback, build, or Convex typecheck is claimed.

## Recommended completion sequence

1. Restore useful mobile typechecking and a green API baseline; enforce checks
   in CI. Do not weaken tests to turn the dashboard green.
2. Close refresh ordering and failure feedback; verify offline/restart and
   Account A → guest → Account B with two clients.
3. Align instance names, catalog names, labels, empty/loading/error states and
   approved terminology across existing screens. Start with reminders/favorites.
4. Close the current catalog's identity/content blockers and verify approved
   content readback; reconcile task status with evidence and commit anchors.
5. Complete staging migration/restore and real iOS/Android push-provider gates
   before claiming release readiness.

Later additions: canonical propagation detail pages and broader source-backed
care content. Add these after existing workflows meet their acceptance checks.
This audit does not justify expanding into additional major product features.
