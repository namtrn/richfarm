# Content work management — 2026-09-14 to 2026-09-20

Status: planned. This file manages the content work queue only. Feature and
content tracks run in parallel; integration and publication use the gates in
the dedicated content flow.

## Weekly objective

Review, author, and improve five P0/P1 plant care guides per day (three original review items and two newly added missing-care plants), for thirty-five plants in total. Each plant keeps its own execution plan and its own en/vi Markdown, manifest and review evidence. This file tracks coordination and completion; it does not replace or merge the individual plant plans.

Operational flow: [2026-09-content-flow.md](./2026-09-content-flow.md)

## Parallel tracks

Run these tracks concurrently:

- Feature track: finish and verify the current feature remediation.
- Content track: research and edit the five scheduled plant drafts.
- Integration track: use detector/review/import/approval/sync only against the
  currently compatible API and dashboard contract.
- If a feature change breaks an integration step, pause that step only; do not
  discard the draft or mark the plant complete.

The feature lane and Markdown authoring lane must not edit the same files.
Publication remains gated even when authoring runs in parallel.

## Daily queue

| Date | Plant 1 | Plant 2 | Plant 3 | Plant 4 | Plant 5 | Daily exit condition |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-14 | Tomato | Bell pepper | Zucchini | Bird's eye chili (Ớt hiểm) | Potato (Khoai tây) | Five drafts revised/created and detector flow exercised or blocked with evidence |
| 2026-09-15 | Cucumber | Lettuce | Carrot | Sweet potato (Khoai lang) | Spinach (Rau bina) | Five drafts revised/created and manifests validated |
| 2026-09-16 | Basil | Cilantro | Cabbage | Bitter melon (Mướp đắng) | Scallion (Hành lá) | Five plants have aligned claims and source references |
| 2026-09-17 | Mint | Strawberry | Onion | Leek (Tỏi tây) | White radish (Củ cải trắng) | Five plants have reviewed pest/disease key mapping |
| 2026-09-18 | Lime | Rose | Garlic | Butternut squash (Bí đỏ) | Chayote (Su su) | Five plants have locale parity and no unsupported claims |
| 2026-09-19 | Pothos | Monstera | Parsley | Sweet corn (Bắp ngọt) | Celery (Cần tây) | Five drafts pass content checklist and dry-run import |
| 2026-09-20 | Eggplant | Common bean | Rosemary | Asparagus (Măng tây) | Beetroot (Củ dền) | Final batch report and unresolved-content list recorded |

Individual plans:

- 2026-09-14: `2026-09-14-content-solanum-lycopersicum.md`,
  `2026-09-14-content-capsicum-annuum.md`,
  `2026-09-14-content-cucurbita-pepo.md`,
  `2026-09-14-content-capsicum-frutescens.md`,
  `2026-09-14-content-solanum-tuberosum.md`
- 2026-09-15: `2026-09-15-content-cucumis-sativus.md`,
  `2026-09-15-content-lactuca-sativa.md`,
  `2026-09-15-content-daucus-carota.md`,
  `2026-09-15-content-ipomoea-batatas.md`,
  `2026-09-15-content-spinacia-oleracea.md`
- 2026-09-16: `2026-09-16-content-ocimum-basilicum.md`,
  `2026-09-16-content-coriandrum-sativum.md`,
  `2026-09-16-content-brassica-oleracea-var-capitata.md`,
  `2026-09-16-content-momordica-charantia.md`,
  `2026-09-16-content-allium-fistulosum.md`
- 2026-09-17: `2026-09-17-content-mentha-x-piperita.md`,
  `2026-09-17-content-fragaria-x-ananassa.md`,
  `2026-09-17-content-allium-cepa.md`,
  `2026-09-17-content-allium-porrum.md`,
  `2026-09-17-content-raphanus-sativus.md`
- 2026-09-18: `2026-09-18-content-citrus-aurantiifolia.md`,
  `2026-09-18-content-rosa-chinensis.md`,
  `2026-09-18-content-allium-sativum.md`,
  `2026-09-18-content-cucurbita-moschata.md`,
  `2026-09-18-content-sechium-edule.md`
- 2026-09-19: `2026-09-19-content-epipremnum-aureum.md`,
  `2026-09-19-content-monstera-deliciosa.md`,
  `2026-09-19-content-petroselinum-crispum.md`,
  `2026-09-19-content-zea-mays.md`,
  `2026-09-19-content-apium-graveolens.md`
- 2026-09-20: `2026-09-20-content-solanum-melongena.md`,
  `2026-09-20-content-phaseolus-vulgaris.md`,
  `2026-09-20-content-rosmarinus-officinalis.md`,
  `2026-09-20-content-asparagus-officinalis.md`,
  `2026-09-20-content-beta-vulgaris.md`

## Per-plant completion protocol

For each plant, follow its individual plan and record:

1. exact canonical identity and immutable `plant_code` checked against the
   manifest and SQLite;
2. current-draft findings before editing;
3. source-backed en/vi revisions with matching facts, units, cautions and
   certainty;
4. separate pest and disease review, using only existing stable keys;
5. updated `source_refs`, deterministic hashes and byte counts in `content.json`;
6. individual manifest validation and read-only dry-run import result;
7. unresolved editorial questions or claims that need human review.

Do not mark a draft `published/reviewed` from this work alone. Content remains
`needs_review/unreviewed` until a human reviewer approves it through the
SQLite/dashboard workflow. Do not publish to Convex in the writing pass.

## Batch verification

At the end of each day:

- validate all five individual manifests;
- run the read-only dry-run import for all five manifests;
- check that only the five planned plant directories changed;
- record pass/fail and blockers in the day's handoff;
- do not carry an unfinished plant forward as complete just because its pair
  finished.

At the end of the week, run the normal content audit and prepare the approved
plants for human review. Keep missing-English directories, quarantined Basella
Ceylon, legacy cultivar duplicates and unrelated feature work outside this
queue unless a separate plan is created.

## Weekly acceptance

- Thirty-five plant plans exist as thirty-five separate files under this folder.
- Each scheduled day has exactly five plant items.
- Every completed item has en/vi Markdown, source references, manifest
  validation and dry-run evidence, with dashboard-to-Convex flow state recorded
  separately from writing status.
- No unsupported claim, missing stable link target or cross-taxonomy content is
  silently accepted.
- Feature and content tasks remain separated by directory; authoring and feature
  verification may run in parallel.
- Unfinished or blocked items are explicitly reported, not marked complete.
