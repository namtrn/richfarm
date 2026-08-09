# Phase 3.1 — Update Plant Library

Ngày report gốc: 2026-08-04

Cập nhật bằng evidence local: 2026-08-09

Phụ thuộc: Phase 3.0 — Backend Plant Library.

## Trạng thái hiện tại

**Technical projection và local gates đã hoàn tất; curation/provenance Definition of Done chưa đạt.** Chưa có staging/production validation và external data gate chưa chạy.

## Implementation đã xác nhận

- `lib/canonicalPlantLibrary.ts` là policy dùng chung cho canonical list/search/detail/match và image compatibility queries.
- Projection áp dụng active/content-status filtering, locale fallback (requested locale rồi English), placeholder suppression, và base/cultivar description/care inheritance.
- Mobile library hooks đọc canonical Convex projection; admin dashboard tiếp tục dùng full snapshot để quản lý inactive/draft/incomplete rows.
- Projection giữ source, source URL, review status, content version, record version và care metadata để downstream không phải suy luận provenance.

## Historical review (2026-08-04)

### P1/P2 — Các đường đọc Library chưa dùng cùng policy

Mobile chủ yếu đọc `plantImages.getPlantsWithImages`, trong khi logic lọc placeholder, locale fallback và inheritance nằm ở `plantLibrary`. Vì vậy list/detail/search có thể cho kết quả khác nhau. `plantLibrary.search` còn có thể bypass helper localization và trả placeholder hoặc không kế thừa description từ base.

### P2 — Chất lượng dữ liệu chưa đủ để gọi là curated

Audit cũ ghi nhận placeholder/short descriptions và duplicate identity metrics nhưng chưa có đủ gate về care-range, near-duplicate và review/source metadata.

### P2 — Locale và content metadata còn thiếu

Plan yêu cầu source, review status, content version và inheritance. Schema cũ chưa truyền đủ metadata end-to-end; không nên hiển thị locale hoặc nội dung là “đã review” khi chưa có bằng chứng tương ứng.

Các đường đọc hiện đã delegate về canonical projection, nhưng chất lượng nguồn và external provenance vẫn là gate riêng.

## Audit evidence

`npm run audit:plant-content` **PASS** về identity/care-range gate. Repository data hiện có 1,550 rows ở `en` và 1,550 rows ở `vi`; `es`, `fr`, `pt`, `zh` không có rows. Duplicate identity và invalid care range đều bằng 0. Audit ghi nhận placeholder descriptions: `en` 198, `vi` 77; short descriptions: `en` 244, `vi` 83; repeated description rows ở `vi` là 21.

`npm run audit:plant-content -- --strict` **FAIL** với 475 placeholder/near-duplicate findings (near-duplicate output bị giới hạn tối đa 100 pair mỗi locale trong script). Audit trả về `externalDataGate.status: "not_run"` và yêu cầu external source/curation trước bulk curation.

Các row hiện có chưa cung cấp bằng chứng external curation/provenance đầy đủ; không được coi là đã review chỉ vì có trong SQLite mirror.

## Definition of Done và gate còn lại

- [x] List/search/detail/match dùng cùng canonical active, locale fallback, placeholder và inheritance policy ở local tests.
- [x] Inactive/draft/placeholder rows bị loại khỏi canonical production response; admin snapshot vẫn giữ để quản trị.
- [ ] Strict quality gate không còn placeholder/near-duplicate findings.
- [ ] External source/provenance review và content/review metadata được xác nhận cho bulk curation.
- [ ] Curation khoảng 200–300 base species; es/fr/pt/zh chỉ bật sau khi có dữ liệu thật và kiểm tra.
- [ ] Staging/production regression validation cho Library list/search/detail, scanner match và Add Plant.

Không tạo watering/fertilizer/harvest defaults từ dữ liệu chưa được external gate xác nhận.

## Ranh giới với Phase 3.0

Phase 3.0 chịu trách nhiệm backend, quyền ghi, schema, stable identity và sync. Phase 3.1 chịu trách nhiệm canonical read policy, content quality, inheritance và provenance/curation.
