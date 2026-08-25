# Project Diary

## 2026-08-25 — Canonical identity and content-integrity closeout

CID-1–CID-9 is implemented and verified locally. The shared `canonical_identity_v1` contract now supplies deterministic structured identity to API, SQLite, content tooling, Convex writers, and tests. New API/dashboard creates require complete structured identity, preview exact canonical matches, return `CANONICAL_PLANT_EXISTS` for duplicates, and keep near matches as suggestions.

The SQLite control plane now carries canonical fields/status, explicit quarantine, reference redirects, external-identity aliases, and a run-scoped migration journal. CID-3 was applied from a verified backup with dry-run and readback: tomato row 1554 is active, row 6 is reversibly archived and redirected, references/aliases were retained, and no hard delete occurred. Ambiguous or incomplete identities remain quarantined rather than receiving inferred keys.

Convex normal writers use one indexed canonical upsert boundary. Canonical-field migrations are bounded, resumable, journaled, and rollback-scoped. The implementation is checked in but has not been deployed or run against live production data.

Git Markdown is authoritative for long-form plant and pest/disease content. Deterministic manifests bind 38 plant and 18 pest/disease directories to stable identities, locale versions, hashes, review state, and provenance. Only the selected tomato Markdown was applied to local SQLite; two plant directories lack English content and Basella Ceylon remains quarantined for invalid parent/identity data.

Smart reconciliation now reads bounded complete snapshots with revision, count, cursor, and source-change checks; persists findings and repair proposals; rejects stale evidence; and gates affected outbox publication on fresh unresolved findings and canonical readback. Pending outbox rows were not sent. The dashboard Data Health view exposes freshness, health counts, evidence, affected identities, outbox status, and role-separated admin controls.

Pest/disease content now has localized/versioned Convex projection and bounded migration support. Stable internal Markdown links route to the mobile in-app detail screen and fail safely when the target is missing or unsupported.

Production Convex deployment and production data mutation remain a separate authorization boundary and were not performed for this closeout. Remaining next action is an authorized production rollout with dry-run migrations, reviewed proposals, rollback/readback rehearsal, and a fresh healthy reconciliation gate.

## 2026-08-09 — Phase 3 local completion and release gates

Phase 3 implementation is complete in the local workspace. The API and Convex contracts now distinguish the complete admin/source-of-truth snapshot from the filtered canonical mobile projection. Admin writes use API JWT role checks plus a Convex server service token. Stable `(sourceSystem, sourceId)` identity is used for upsert/update/delete, with taxonomy conflict detection and record-version metadata.

SQLite/Convex drift is handled through a deduplicated retryable outbox and a reconciliation pass that removes stale mirror rows and records zero drift when aligned. Delete operations protect live user-plant references and base rows with variants; successful deletes clean dependent plant content and relation records.

Local verification: API build PASS, API 24/24 PASS, Convex typecheck PASS, Convex 69/69 PASS, dashboard build PASS, mobile typecheck PASS, and normal content audit PASS. The strict content audit remains FAIL with 475 placeholder/near-duplicate findings. The audit explicitly reports `externalDataGate: not_run`; no staging or production validation has been run.

## 2026-08-04 — Initial Phase 3 review (historical)

The initial review identified missing Convex authorization, possible SQLite/Convex drift, taxonomy-based identity risks, incomplete delete guards, form/sync field loss, and inconsistent active/i18n handling. Those concerns remain useful as historical context; the local implementation and tests now cover the technical controls above. Release acceptance still requires staging/production validation, and Phase 3.1 curation/provenance work remains open.
