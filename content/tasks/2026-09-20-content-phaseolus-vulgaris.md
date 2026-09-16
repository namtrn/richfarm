# Content plan — Đậu cô ve / Common bean — 2026-09-20

Status: planned. This file owns the content work for one plant only. It is
not a combined weekly plan and does not authorize production publication.

## Plant identity

- Display name: Đậu cô ve / Common bean
- Scientific name: Phaseolus vulgaris
- Content directory: content/plants/phaseolus-vulgaris
- Immutable plant_code: PHASEOLUS_VULGARIS_28NN81CJG2
- Pair for the day: the other plant scheduled on 2026-09-20 has its own plan file.

The directory currently contains en.md, vi.md and content.json. Both locales
are authored drafts with needs_review/unreviewed status and no source references.
Before editing, confirm the plant_code and exact canonical identity against the
manifest and SQLite. Do not copy content from a cultivar or a different taxon.

## Parallel-track rule

Run this content plan in parallel with the feature track:

- Research, source collection and Markdown editing may proceed immediately.
- Dashboard detect/confirm/apply/sync follows the documented content flow; if a
  feature change makes the integration gate red, pause only the affected
  integration or publication step and keep this plant draft pending.
- Before approval or publication, confirm npm run verify and git diff --check on
  the compatible tree.

Feature and content work must not overwrite each other's files. A draft may be
prepared while feature work is in progress, but it cannot be published until
the current integration path is verified.

## Plant-specific research and writing focus

- Phân biệt dạng bụi và dạng leo trong hướng dẫn giàn, khoảng trống, gieo hạt và thu hoạch; không gộp hai kiểu sinh trưởng thành một quy tắc.
- Mô tả trạng thái đất cho lúc gieo và cây con, cách giữ ẩm khi ra hoa/đậu quả và rủi ro úng sau mưa.
- Nêu cách thu quả non đúng thời điểm và gieo nối vụ theo vùng trồng, tránh lịch cứng thiếu nguồn.
- Đối chiếu sâu hại và bệnh trên lá/quả với thư viện; chỉ link key đã tồn tại và giữ hai nhóm riêng.

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

- Revised content/plants/phaseolus-vulgaris/en.md.
- Revised content/plants/phaseolus-vulgaris/vi.md.
- Updated content.json with exact identity, hashes, byte counts and source_refs.
- A short review note listing changed claims, sources, stable pest/disease keys
  and any unresolved editorial questions.
- Content remains needs_review/unreviewed until a human reviewer approves it.

## Acceptance criteria

- The manifest targets PHASEOLUS_VULGARIS_28NN81CJG2 and the intended scientific name only.
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

