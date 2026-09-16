# Content plan — Bí ngòi / Zucchini — 2026-09-14

Status: planned. This file owns the content work for one plant only. It is
not a combined weekly plan and does not authorize production publication.

## Plant identity

- Display name: Bí ngòi / Zucchini
- Scientific name: Cucurbita pepo
- Content directory: content/plants/cucurbita-pepo
- Immutable plant_code: CUCURBITA_PEPO_513181C83D
- Pair for the day: the other two plants scheduled on 2026-09-14 have their own plan files.

The directory currently contains en.md, vi.md and content.json. Both locales
are authored drafts with needs_review/unreviewed status and no source references.
Before editing, confirm the plant_code and exact canonical identity against the
manifest and SQLite. Do not copy content from a squash cultivar or a different
taxon.

## Parallel-track rule

Run this content plan in parallel with the feature track:

- Research, source collection and Markdown editing may proceed immediately.
- Dashboard detect/confirm/apply/sync follows the documented content flow; if a
  feature change makes the integration gate red, pause only the affected
  integration or publication step and keep this plant draft pending.
- Before approval or publication, confirm npm run verify and git diff --check
  on the compatible tree.

Feature and content work must not overwrite each other's files. A draft may be
prepared while feature work is in progress, but it cannot be published until
the current integration path is verified.

## Plant-specific research and writing focus

- Phân biệt bí ngòi với các dạng bí mùa hè khác và giữ đúng taxon Cucurbita pepo trong tên, mô tả, hình thái.
- Làm rõ nhu cầu nắng, nhiệt độ, gieo thẳng/chuyển cây và khoảng cách; tách hướng dẫn cho dạng bụi gọn và dạng sinh trưởng lan nếu nguồn xác nhận.
- Nêu cách tưới đều, thu quả non thường xuyên và xử lý không gian/giàn đỡ mà không đưa ra lịch cứng thiếu nguồn.
- Đối chiếu sâu bệnh như phấn trắng, sương mai và nhóm bọ hại bí với thư viện; chỉ liên kết stable key thực sự tồn tại.

## Execution

1. Read the current en.md and vi.md, then list claims that are missing,
   duplicated, generic, unsupported, or inconsistent between locales.
2. Verify the scientific identity, common names, growing context and every
   number/caution against appropriate sources for this taxon.
3. Rewrite both locales as natural Markdown using the plant-information
   guideline. Keep facts, units, warnings and certainty aligned; do not
   translate sentence by sentence.
4. Check the pest and disease library. Link only existing stable keys with
   richfarm://pests-diseases/{key}; omit an unverified group instead of
   inventing a key or forcing a section.
5. Record source references in content.json metadata, regenerate deterministic
   hashes/byte counts, and validate the individual manifest.
6. Run a read-only dry-run import for this manifest. Leave SQLite/Convex
   publication for the explicit review and approval workflow.

## Deliverables

- Revised content/plants/cucurbita-pepo/en.md.
- Revised content/plants/cucurbita-pepo/vi.md.
- Updated content.json with exact identity, hashes, byte counts and source_refs.
- A short review note listing changed claims, sources, stable pest/disease keys
  and any unresolved editorial questions.
- Content remains needs_review/unreviewed until a human reviewer approves it.

## Acceptance criteria

- The manifest targets CUCURBITA_PEPO_513181C83D and the intended scientific name only.
- Both en.md and vi.md exist and contain Markdown, not JSON or placeholder text.
- The two locales express the same facts, numbers, cautions and uncertainty.
- The opening paragraph states the plant's practical risks and care priority.
- Each included section leads from observation/condition to interpretation and
  action; no section exists only to match a template.
- Pests and diseases are checked as separate groups, and internal links use
  stable keys that exist.
- No unsupported number, URL citation, machine-translation residue, or
  locale-mismatched common name remains in careContent.
- Manifest validation and read-only dry-run import pass.
- No Convex mutation or publication occurs in this plan.

## Out of scope

- Editing another plant directory.
- Changing stable plant identity or plant_code.
- Changing shared UI, schema, importer or publication behavior.
- Approving or publishing content without human review.
- Resolving the missing-English Rubus directory or quarantined Basella Ceylon
  directory; those are separate blocked content packages.
