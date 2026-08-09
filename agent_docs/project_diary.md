# Project Diary

## 2026-08-09 — Phase 3 local completion and release gates

Phase 3 implementation is complete in the local workspace. The API and Convex contracts now distinguish the complete admin/source-of-truth snapshot from the filtered canonical mobile projection. Admin writes use API JWT role checks plus a Convex server service token. Stable `(sourceSystem, sourceId)` identity is used for upsert/update/delete, with taxonomy conflict detection and record-version metadata.

SQLite/Convex drift is handled through a deduplicated retryable outbox and a reconciliation pass that removes stale mirror rows and records zero drift when aligned. Delete operations protect live user-plant references and base rows with variants; successful deletes clean dependent plant content and relation records.

Local verification: API build PASS, API 24/24 PASS, Convex typecheck PASS, Convex 69/69 PASS, dashboard build PASS, mobile typecheck PASS, and normal content audit PASS. The strict content audit remains FAIL with 475 placeholder/near-duplicate findings. The audit explicitly reports `externalDataGate: not_run`; no staging or production validation has been run.

## 2026-08-04 — Initial Phase 3 review (historical)

The initial review identified missing Convex authorization, possible SQLite/Convex drift, taxonomy-based identity risks, incomplete delete guards, form/sync field loss, and inconsistent active/i18n handling. Those concerns remain useful as historical context; the local implementation and tests now cover the technical controls above. Release acceptance still requires staging/production validation, and Phase 3.1 curation/provenance work remains open.
