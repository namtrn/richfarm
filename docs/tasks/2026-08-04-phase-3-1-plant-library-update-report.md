# Phase 3.1 — Update Plant Library

Ngày report: 2026-08-04
Phụ thuộc: Phase 3.0 — Backend Plant Library.

## Trạng thái

**Đã xác định phạm vi, chưa đạt Definition of Done.**

Phase 3.1 là phần cập nhật chất lượng dữ liệu và read experience của Plant Library sau khi backend Phase 3.0 đã có schema, quyền và sync ổn định.

Nội dung phase này tương ứng với phần **“Phase 3: Library quality foundation”** trong plan cũ, nay đã đổi thành **“Phase 3.1: Library quality foundation”**.

## Kết luận review

### P1/P2 — Các đường đọc Library chưa dùng cùng policy

Mobile chủ yếu đọc `plantImages.getPlantsWithImages`, trong khi logic lọc placeholder, locale fallback và inheritance nằm ở `plantLibrary`. Vì vậy list/detail/search có thể cho kết quả khác nhau. Riêng `plantLibrary.search` còn bypass helper localization và có thể trả placeholder hoặc không kế thừa description từ base.

### P2 — Chất lượng dữ liệu chưa đủ để gọi là curated

Kết quả `npm run audit:plant-content`:

- en: 1.550 rows, 198 placeholder descriptions, 244 short descriptions;
- vi: 1.550 rows, 77 placeholder descriptions, 83 short descriptions, 21 repeated rows;
- es/fr/pt/zh: chưa có row;
- duplicate identity: 0 trong dữ liệu vi/en.

Audit đã hữu ích nhưng chưa đủ các gate về care-range, near-duplicate và review/source metadata.

### P2 — Locale và content metadata còn thiếu

Plan yêu cầu source, review status, content version và inheritance. Schema hiện tại chưa truyền đủ các metadata này end-to-end. Không nên hiển thị locale hoặc nội dung được coi là “đã review” khi chưa có bằng chứng tương ứng.

## Việc cần làm trong Phase 3.1

- [ ] Tạo một canonical Library projection dùng chung cho list, search, detail, scanner và Add Plant.
- [ ] Áp dụng thống nhất active-only, locale fallback, placeholder filtering và base/cultivar description inheritance.
- [ ] Cập nhật mobile Library để đọc canonical projection thay vì mỗi màn dùng một query policy khác nhau.
- [ ] Hoàn thiện structured care/content model theo schema Phase 3.0.
- [ ] Thêm quality gate cho duplicate identity, missing base, placeholder, near-duplicate, care-range bất hợp lý và conflict giữa base/variant.
- [ ] Ưu tiên hoàn thiện khoảng 200–300 base species có nhu cầu cao trước khi mở rộng catalog.
- [ ] Hoàn thiện vi/en trước; chỉ bật es/fr/pt/zh khi đã có dữ liệu thật và được kiểm tra.
- [ ] Hiển thị/ẩn nội dung theo `contentStatus`, `contentVersion`, source và review metadata.
- [ ] Không tạo watering/fertilizer/harvest default nếu Library chưa có dữ liệu đáng tin cậy.

## Definition of Done

- [ ] List, search và detail trả cùng plant identity, locale fallback và content quality.
- [ ] Plant inactive hoặc placeholder không xuất hiện trong production response.
- [ ] Cultivar chưa có nội dung riêng kế thừa đúng từ base; cultivar có override thì không bị ghi đè.
- [ ] Locale không có dữ liệu fallback đúng và không tạo màn hình rỗng khó hiểu.
- [ ] Các cây được đánh dấu hoàn thiện có care data đủ tin cậy để tạo suggested care plan.
- [ ] Audit report có số liệu reproducible và không còn P1/P2 quality gate mở.
- [ ] Có regression tests cho Library list/search/detail, scanner match và Add Plant.

## Ranh giới với Phase 3.0

Phase 3.0 chịu trách nhiệm **backend, quyền ghi, schema, identity và sync**. Phase 3.1 chịu trách nhiệm **nội dung, quality gate, inheritance và cách Library phục vụ dữ liệu cho app**.

Không bắt đầu curation lớn hoặc sửa UX Library trước khi canonical backend contract của Phase 3.0 ổn định.
