# RichFarm content flow — Markdown to Dashboard to Convex

Status: current operational flow. This file consolidates the existing MCD
detection/review flow and CAP approval/publication flow for content tasks.

## Scope and ownership

- Git Markdown is the authoring source for en.md and vi.md.
- The API monitor detects source changes and writes detector evidence/events; it
  does not import content or publish to Convex.
- Dashboard Content Inbox is the review surface; it does not scan the repository
  itself.
- SQLite is the staging, review, approval and outbox control plane.
- Convex is the application-serving projection.
- A successful sync means an approved SQLite snapshot reached Convex and passed
  readback. It does not mean a Markdown edit was automatically published.

## End-to-end flow

```text
Edit content/plants/<slug>/en.md and vi.md
  -> API monitor detects file/manifest change
  -> Dashboard Content Inbox shows pending event
  -> preview incoming bytes, SHA-256 and canonical identity
  -> confirm/approve source event, or dismiss with reason
  -> apply proposal after fresh stale-evidence checks
  -> SQLite draft: needs_review / unreviewed
  -> Dashboard Plants -> Translations review
  -> approve complete locale set with source_refs and reviewer audit
  -> SQLite published / reviewed + one approved outbox snapshot
  -> Dashboard Publish approved
  -> outbox approval gate and server-to-server sync
  -> Convex serving projection
  -> byte/hash/status readback and reconciliation
```

The two approval moments have different meanings:

1. **Source-event approval** confirms that the detected Markdown change may be
   applied into SQLite.
2. **Locale approval** confirms that the staged content is editorially approved
   for publication and creates the approved outbox snapshot.

## 1. Author Markdown

Edit only the intended plant directory:

- content/plants/<slug>/en.md
- content/plants/<slug>/vi.md

Before writing, verify the exact canonical identity and immutable plant_code.
Keep both locales factually aligned, record source references in manifest
metadata, and keep unverified drafts at needs_review/unreviewed.

Refresh and validate the manifest as appropriate:

- npm run content:manifests -- --action refresh --kind plants --write
- npm run content:manifests -- --action validate --manifest content/plants/<slug>/content.json

Do not put source URLs or citations into careContent itself. Use stable internal
pest/disease keys only when the target exists.

## 2. Detect and surface in Dashboard

The API monitor uses watcher, startup catch-up and periodic reconciliation to
detect file/manifest changes. It records a durable event such as
manifest_changed or a locale-file change, together with path, revision, digest
and detector source.

Detection does not write master-plant content, findings or outbox rows. The
Dashboard reads the event state through the Content Inbox API:

- GET /api/content-review/events
- GET /api/content-review/events/:eventId/preview

The preview must show incoming versus staged content, identity, bytes and
SHA-256 evidence. Dashboard is a consumer of detector state, not the detector.

## 3. Confirm the detected source event

An authorized editor/admin chooses the exact event(s) after reviewing the
preview:

- POST /api/content-review/approve
- include eventIds and a reason;
- actor, role, reason and review time are recorded.

This approval authorizes applying the detected source change; it is not public
content approval.

An event may instead be dismissed with a reason:

- POST /api/content-review/dismiss

Missing/invalid manifest, ambiguous identity, case-fold collision or quarantined
source remains blocked. It must not be forced through by approving a preview.

## 4. Apply the approved proposal to SQLite

Apply re-resolves the live event scope and rejects stale evidence before writing:

- POST /api/content-review/proposals/:proposalId/apply

The API re-checks the current event/watermark, re-hashes the files, validates the
manifest and identity, runs a read-only dry-run import, then applies the
existing transactional importer.

A successful apply:

- writes the Markdown bytes into SQLite as draft content;
- records proposal/review audit data;
- does not create a publishable outbox row;
- does not call Convex.

A stale file, changed manifest or failed dry-run returns a blocked/stale result.
Re-preview and approve the current event before retrying.

## 5. Review and approve the locale set

In Dashboard Plants -> Translations, review the complete locale set:

- en and vi carry equivalent facts, numbers, warnings and certainty;
- source_refs are present for care content;
- Markdown, links, taxonomy and terminology pass the guideline;
- reviewer identity and approval reason are captured.

The API action is:

- POST /api/content-review/locales/approve

Approval changes the SQLite locale state to published/reviewed, records
reviewed_by/reviewed_at and creates exactly one full-snapshot upsert_plant
outbox row per plant in one transaction. If approval fails, the locale remains
draft and no partial publishable snapshot is accepted.

## 6. Publish approved content through the outbox

Use the Dashboard action named **Publish approved**. It must show the exact rows
that will be processed before sending.

Delivery runs through the existing sync outbox process:

- POST /api/master-plants/sync-outbox/process

The server checks approval at pre-claim and pre-send. Unapproved care content is
blocked with CONTENT_NOT_APPROVED and is never sent. Failed delivery remains
retryable and visible; it must not be reported as applied.

## 7. Convex readback and reconciliation

After an outbox row is applied:

1. read the canonical plant projection from Convex;
2. compare en/vi Markdown byte counts and SHA-256 against the authored files and
   approved SQLite snapshot;
3. verify review metadata and public published-only visibility;
4. check Data Health/reconciliation for drift, blocked findings or stale
   evidence;
5. record outbox ID, target deployment, timestamp and readback result.

Only this readback closes the plant's sync task. If bytes, status or identity
differ, keep the item incomplete and open a reconciliation finding.

## Failure and retry rules

- Detector failure or quarantine: fix the source/manifest issue, then retry the
  detector; do not edit SQLite by hand to hide the event.
- Stale approval: re-preview the current files, approve the current event and
  apply again.
- Import/dry-run failure: keep the plant as draft and record the validation
  error.
- Missing source_refs or reviewer data: locale approval fails closed; no
  publishable outbox row is created.
- Outbox failure: use the existing retry/backoff path and verify the final
  Convex state; do not equate queued with applied.
- A later Markdown edit creates new detector evidence; it must not silently
  revert an already approved SQLite release state.

## Parallel execution rule

Feature implementation and content authoring can run concurrently:

- feature lane owns feature source/tests;
- content lane owns scheduled plant Markdown, manifests and review notes;
- integration lane detects/applies/syncs only against the currently compatible
  API/dashboard contract.

A feature regression pauses only the affected integration/publication step. It
does not erase content work already authored. No content is marked published
until the approval gate, outbox gate and Convex readback all pass.

## State meanings

| State | Meaning |
| --- | --- |
| detected/pending | Source changed and awaits event review |
| event approved | Detected change may be applied |
| applied draft | Markdown is in SQLite; not publishable |
| published/reviewed | Human approved locale set; outbox may exist |
| outbox applied | Approved snapshot reached Convex |
| readback passed | Convex projection matches approved content |

## References

- content/plans/2026-08-25-markdown-content-change-detection-plan.md
- docs/tasks/2026-08-31-care-content-approval-publish-flow-plan.md
- content/guidelines/plant-information-guideline.md

