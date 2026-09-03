# Care Content Approval and Publish Flow Plan

## Status

- Planning status: proposed
- Complexity: medium, approximately 6/10
- Estimated implementation and verification: 4–6 hours
- Estimated migration and reconciliation: 2–4 additional hours

## Problem

The current dashboard action named **Publish pending** only sends SQLite outbox payloads to Convex. It does not guarantee that the care content has been approved for public display.

This creates an invalid user-facing outcome:

```text
Dashboard publish succeeds
  → Convex accepts the payload
  → content remains needs_review / unreviewed
  → the public app does not display it
```

For RichFarm's local-authoring architecture, this flow is reversed. Review and approval belong in the dashboard and SQLite. Convex is the serving projection for the application and must receive only approved content.

## Target Architecture

```text
Markdown = proposed content source
Dashboard + SQLite = review and approval boundary
Outbox = approved snapshots waiting for delivery
Convex = application-serving projection
```

The intended end-to-end flow is:

```text
Edit Markdown
  → dashboard preview
  → import as draft into SQLite
  → approve in dashboard
  → queue approved SQLite snapshot
  → publish to Convex
  → verify in the application
```

## Required Invariants

1. Content with `needs_review / unreviewed` may exist in Markdown and SQLite, but must not be published to Convex.
2. Dashboard approval changes the SQLite locale to:
   - `content_status = published`
   - `review_status = reviewed`
   - a non-empty `reviewed_by`
   - a valid `reviewed_at`
3. An outbox row may be created for care content only after approval succeeds.
4. Outbox publication must reject any payload that is not `published / reviewed`.
5. An outbox row reaching `applied` means Convex accepted approved content and the public application can read it.
6. Convex must not introduce a second independent approval step.
7. Markdown owns authored bytes, hashes, and source references. SQLite owns operational review and release state.
8. A later Markdown scan must not silently revert an approved SQLite release state.

## Scope

### 1. Separate import from approval

Change the content review API so that importing and approving have distinct meanings:

- **Import draft** verifies the manifest and copies Markdown into SQLite as `needs_review / unreviewed`.
- Importing a draft does not create a publishable outbox row.
- **Approve** records the authenticated reviewer and promotes the selected locale or locale set to `published / reviewed`.
- Approval and outbox creation occur in one SQLite transaction.

Primary implementation areas:

- `apps/api/src/content-manifests.ts`
- `apps/api/src/content-source/review-service.ts`
- `apps/api/src/content-source/review-routes.ts`
- related repository and contract modules under `apps/api/src/content-source/`

### 2. Add an outbox approval gate

Add a final server-side guard before enqueue and before delivery:

- Require every locale being published to have `content_status = published`.
- Require every locale being published to have `review_status = reviewed`.
- Require reviewer audit metadata.
- Return a stable error such as `CONTENT_NOT_APPROVED` when the invariant fails.
- Keep the gate server-side so direct API calls cannot bypass dashboard review.

Primary implementation areas:

- `apps/api/src/sync-outbox.ts`
- `apps/api/src/master-plant-i18n.ts`
- `apps/api/src/master-plants.ts`
- `apps/api/src/content-manifests.ts`

### 3. Make dashboard actions match their effects

Update the dashboard to present this sequence:

```text
Preview → Import draft → Approve → Ready to publish → Publish approved
```

Dashboard requirements:

- Show the content and source references before approval.
- Show locale-level review status.
- Capture or derive the authenticated reviewer identity.
- Display approval timestamp.
- Show the list of approved outbox rows before publication.
- Rename **Publish pending** to **Publish approved**.
- Disable publication when no eligible approved rows exist.
- Report per-item results rather than only an aggregate toast.
- After success, show `Applied to Convex` for each row.

Primary implementation areas:

- `apps/dashboard/src/components/ContentInbox.tsx`
- `apps/dashboard/src/components/PlantManager.tsx`
- `apps/dashboard/src/components/DataHealth.tsx`
- related hooks under `apps/dashboard/src/hooks/`

### 4. Keep Convex as a serving projection

Convex continues to validate payload shape and store review metadata, but it does not make an independent approval decision.

Requirements:

- Accept the complete approved SQLite snapshot contract.
- Preserve `contentStatus`, `reviewStatus`, `reviewedBy`, and `reviewedAt`.
- Public queries continue to expose only published content.
- A successfully applied approved payload must be immediately eligible for the public application.

Primary implementation areas:

- `packages/convex/convex/masterSync.ts`
- `packages/convex/convex/lib/plantCare.ts`
- `packages/convex/convex/lib/canonicalPlantLibrary.ts`

## Existing Data Migration

1. Inventory outbox rows and Convex care rows carrying `needs_review / unreviewed`.
2. Do not automatically approve all historical content.
3. Mark stale draft outbox rows as superseded so they cannot be retried accidentally.
4. Review Hoa giấy in the dashboard.
5. Generate a new approved SQLite snapshot and publish it.
6. Verify the exact Markdown bytes stored by Convex:
   - English: 4,036 UTF-8 bytes
   - Vietnamese: 4,042 UTF-8 bytes
7. Handle duplicate legacy Bougainvillea records as a separate canonical-identity reconciliation task.

Duplicate cleanup is deliberately separated because merging the wrong base plant or cultivar can damage references and user-owned data.

## Verification Plan

### API tests

- Importing Markdown stores a draft without creating a publishable outbox row.
- Approval records reviewer metadata and creates exactly one current snapshot per intended publication unit.
- Approval and enqueue roll back together on failure.
- Direct enqueue of unapproved content is rejected.
- Delivery rechecks approval so stale or manually altered rows cannot bypass the gate.
- A newer approved snapshot supersedes an older snapshot deterministically.

### Dashboard tests

- Preview clearly distinguishes draft, approved, queued, and applied states.
- Approve requires the necessary source references and reviewer identity.
- Publish lists the exact rows it will process.
- Failed rows retain actionable error details.
- Successful rows display their Convex application state.

### Convex tests

- The mutation accepts the complete approved SQLite payload.
- Review metadata is preserved.
- Approved EN and VI care Markdown is stored byte-for-byte.
- Public queries return published care content.
- Public queries do not return drafts.

### End-to-end acceptance test

```text
Edit MD
  → monitor detects change
  → dashboard preview matches bytes and SHA-256
  → import draft
  → approve in dashboard
  → SQLite contains published/reviewed content and audit metadata
  → approved snapshot appears in the outbox list
  → Publish approved
  → outbox becomes applied
  → Convex readback matches both locale byte counts
  → application displays the care content
```

## Acceptance Criteria

- No outbox row can reach Convex with unapproved care content.
- No dashboard action can report publication success while the public application is ineligible to display the content.
- `applied` has one clear meaning: approved content reached Convex.
- The dashboard exposes the exact list before and after publication.
- Hoa giấy appears in the application with the approved EN and VI care content.
- API, dashboard, and Convex test suites pass.
- The manual end-to-end flow is documented and reproducible.

## Delivery Order

1. Implement and test the API state transition and outbox gate.
2. Update the dashboard approval and publication experience.
3. Update and verify the Convex payload contract.
4. Reconcile current draft outbox rows.
5. Approve and republish Hoa giấy.
6. Run the full end-to-end acceptance test.
7. Plan duplicate Convex cleanup as a separate canonical-identity task.

## Risk Assessment

The core implementation is medium complexity. The main risks are not code volume but state consistency:

- Manifest and SQLite status can drift if ownership is not explicit.
- Approval and enqueue can diverge without a transaction.
- Existing API paths can bypass the intended dashboard flow unless the outbox enforces the invariant.
- Historical Convex duplicates can make readback appear incorrect even when the new canonical record is valid.

These risks are controlled by explicit state ownership, transactional approval, a delivery-time gate, and a separate duplicate-reconciliation phase.

## Implementation result (2026-08-31, Medium route)

All six CAP stages are implemented and verified. Verified facts:

### CAP-1/CAP-2 — contracts, import vs approval

- `applyContentImport` (`apps/api/src/content-manifests.ts`) is now draft-only: it copies authored bytes into SQLite with the manifest statuses and creates **zero** outbox rows (`queuedOutbox: 0`). The enqueue block and the old `syncPayload` helper were removed.
- `approveContentLocales` (`apps/api/src/content-source/review-service.ts`) promotes the plant's whole locale set to `published / reviewed` with the authenticated reviewer identity and a fresh `reviewed_at`, then enqueues exactly one full-snapshot `upsert_plant` outbox row per plant — stamping and enqueueing share one SQLite transaction (verified rollback test). Care-carrying locales must already carry `source_refs` (CID provenance rule); failures are reported per item.
- Route `POST /api/content-review/locales/approve` (admin/editor) returns per-item `{ approved, failures }`.

### CAP-3 — outbox approval gate

- `evaluatePayloadApproval` / `assertPayloadApproved` in `apps/api/src/sync-outbox.ts`: a locale with non-empty care content must be `content_status=published`, `review_status=reviewed`, with non-empty `reviewed_by` and a valid `reviewed_at`; locales without care content only need `content_status=published` (absent = legacy published default). `enqueueSyncOutbox` throws `CONTENT_NOT_APPROVED` as the server-side backstop.
- Delivery (`processSyncOutbox`) rechecks approval at pre-claim and pre-send; an unapproved payload is marked `blocked` with `blocked_reason=CONTENT_NOT_APPROVED:…` and never sent. The response now includes per-row `items`.
- i18n POST/PATCH/DELETE, plant POST/PATCH, and `queue-local` save drafts locally but queue only approved content: `queued:false` + `reason` in the response, `skippedNotApproved` count for queue-local. `handleMasterPlantsError` maps `CONTENT_NOT_APPROVED` to 409.

### CAP-4 — dashboard

- "Publish pending" renamed to **Publish approved**; the button is disabled when no eligible pending outbox rows exist. A panel lists the exact approved rows before publication and renders per-item results after (applied rows show "Applied to Convex").
- Plant detail Translations: locale cards show review status, reviewer, and approval timestamp; a new **Approve & queue** control shows care byte counts and source references, requires an approval reason, and blocks locales without provenance. Care-guide saves report "(draft — approve before publish)" when not queued.
- Content Inbox shows a post-apply note: "Imported N locale(s) as drafts in SQLite. Approve the locale set in Plants → Translations, then use Publish approved."

### CAP-6 — Convex contract

- `packages/convex/convex/careApprovalPublish.test.ts` (3 tests): the mutation accepts the complete approved SQLite payload and preserves review metadata; approved EN/VI care Markdown is stored byte-for-byte (4,036 / 4,042 UTF-8 bytes asserted against the real files); public `listCanonical` returns published care content and never drafts (a draft plant is either hidden or present without care content).

### CAP-5 — migration and Hoa giấy republish (dev `fantastic-beagle-190`)

- Inventory: outbox had 95 applied / 5 superseded / 0 pending — no stale draft rows needed superseding. Legacy applied row 167 (VI, 3,080 bytes) is retained as history.
- `content/plants/bougainvillea-glabra/content.json` regenerated as a CID-6 reviewed replacement: `source_refs` (`editorial`, locator `content/plans/2026-08-14-us-vn-care-guide-priority.md`), `conflict_resolution` (reviewedBy `1:nmtr@proton.me`), `review_status=reviewed`; bytes and SHA-256 unchanged and re-verified against the files.
- Live E2E (local API on port 4000): monitor catch-up produced 3 pending events (`manifest_changed`, `vi.md modified`, `en.md modified`); previews confirmed incoming bytes 4,036/4,042; event approval → apply imported drafts (`needs_review` + `source_refs`, 0 outbox rows); locale approval stamped `published/reviewed` by reviewer `2:nmtrn@proton.me` at `2026-08-31T09:21:51Z` and queued outbox row 173 (`upsert_plant`); publish applied row 173 to Convex.
- Convex readback (`npx convex run plantLibrary:listCanonical`): the base Bougainvillea plant exposes care content at **EN 4,036 UTF-8 bytes** and **VI 4,042 UTF-8 bytes** — byte-for-byte, matching the files; public projection serves it (the app's read path).
- The five legacy cultivar rows (Barbara Karst, California Gold, Imperial Thai, Rosenka, Torch Glow) remain without care content and are the separate canonical-identity reconciliation task (deliberately not merged here).

### Verification gates

- API: focused suites content-manifests 14/14, content-source-review 15/15; full API suite 189 passed / 15 failed — the 15 failures are the proven pre-existing baseline (generic-data 6, master-plants 2, care-content-migration 1, phase3 3, plant-geography 3). API build PASS, zero non-preexisting tsc errors.
- Dashboard: 36/36 tests PASS (5 new CAP tests), `tsc --noEmit` clean, production build PASS.
- Convex: 130/130 tests PASS (3 new CAP tests), typecheck clean.
- Mobile typecheck PASS (boundary); `git diff --check` PASS.

### Remaining gates

- Duplicate/converged Convex Bougainvillea records: separate canonical-identity reconciliation task.
- Production Convex deployment and production data mutation: not authorized or run; this session touched only dev `fantastic-beagle-190`.
- Unrelated pre-existing dirty files (dashboard taxonomy/geography UI, content-source hook files, masterSync.ts) were preserved untouched.
