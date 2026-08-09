# Phase 3.0 — Backend Plant Library

Ngày report gốc: 2026-08-04

Cập nhật bằng evidence local: 2026-08-09

Phạm vi: backend quản lý Plant Library, dashboard, SQLite mirror, Convex `plantsMaster`, `plantI18n`, `plantCare` và các đường sync.

## Trạng thái hiện tại

**Hoàn tất về mặt kỹ thuật trong local; staging/production validation còn mở.** Không có deploy hoặc staging run trong evidence hiện tại.

| Evidence | Kết quả |
| --- | --- |
| API build | PASS |
| API tests | 24/24 PASS |
| Convex typecheck | PASS |
| Convex tests | 69/69 PASS |
| Dashboard build | PASS |
| Mobile typecheck | PASS |
| Staging/production validation | Chưa chạy |

## Implementation đã xác nhận

- API admin routes yêu cầu JWT hợp lệ và role `admin`/`editor`. Convex admin/sync functions yêu cầu `CONVEX_ADMIN_FUNCTION_KEY` server-side; token thiếu hoặc sai bị từ chối.
- `masterSync:listAll` là full source-of-truth snapshot cho trusted API reconciler và dashboard/admin. Snapshot giữ cả inactive, draft và incomplete rows để quản trị không mất dữ liệu.
- Mobile/production reads dùng canonical projection. Projection lọc inactive/archived/unpublished rows, loại placeholder description, áp dụng locale rồi English fallback, và kế thừa description/care từ base cho cultivar khi phù hợp.
- Upsert/update/delete dùng stable identity `(sourceSystem, sourceId)` và kiểm tra xung đột taxonomy; đổi tên/cultivar không tự tạo duplicate do đổi display fields.
- SQLite sync failure tạo deduplicated `sync_outbox` item có retry/backoff. Reconciliation đọc full Convex snapshot, xóa stale mirror rows và ghi drift result.
- Delete guard từ API và Convex giữ live user-plant references, không cho xóa base khi còn variants, và cleanup i18n/care/relations/favorites khi delete hợp lệ.

## Kết luận review ban đầu (2026-08-04, giữ lại làm lịch sử)

### P1 — Convex admin mở trực tiếp

Các function trong `plantAdmin.ts` và `masterSync.ts` từng dùng public query/mutation mà không kiểm tra `ctx.auth`, role admin hoặc secret hợp lệ. API proxy có kiểm tra quyền nhưng caller có thể gọi Convex trực tiếp.

### P1 — SQLite và Convex có thể lệch dữ liệu

Convex là nguồn dữ liệu chính của app còn SQLite là mirror cho admin; trước Phase 3 list/stats có thể đọc Convex trong khi detail đọc SQLite, ghi commit SQLite trước rồi mới sync Convex, i18n route chưa sync đầy đủ, và Convex → SQLite chỉ upsert nên có thể giữ row stale/deleted.

### P1 — Identity và delete chưa an toàn

`masterSync` từng tìm row theo taxonomy thay vì stable source ID. Đổi tên hoặc cultivar có thể tạo duplicate/orphan. Delete chưa áp dụng đầy đủ guard cây gốc/cây biến thể và cleanup các bản ghi i18n/care liên quan.

### P2 — Schema và form không cùng hợp đồng

Dashboard cho sửa soil pH, moisture, light hours, notes và active nhưng một phần payload không được gửi hoặc bị bỏ qua khi sync. Một số field bị nhét vào `metadata_json`, trong khi Convex sync không đọc lại nên dữ liệu có thể báo lưu thành công nhưng không round-trip đầy đủ.

### P2 — Active và i18n chưa đồng bộ end-to-end

Backend có `is_active` nhưng Convex schema chưa có field tương ứng và mobile chưa filter theo active. Dashboard hiển thị vi/en/es/pt/fr/zh trong khi SQLite và sync chủ yếu chỉ hỗ trợ vi/en.

Các điểm này là lý do cho các contract và test Phase 3 hiện tại. Việc pass local không thay thế validation trên staging/production.

## Definition of Done và gate còn lại

- [x] Direct admin/sync call không có service token bị từ chối trong Convex tests.
- [x] Create/update/deactivate và metadata/care/i18n round-trip được bao phủ bởi API/Convex Phase 3 tests.
- [x] Sync failure retryable qua outbox; reconciliation loại stale row và ghi drift bằng 0 trong test.
- [x] Stable source identity, taxonomy conflict check, base/variant guard và referenced-row guard có test.
- [ ] Staging/production validation và deploy evidence.

## Không thuộc Phase 3.0

Curation nội dung 200–300 cây ưu tiên, provenance/external source review, copy quality và UX Library thuộc [Phase 3.1](2026-08-04-phase-3-1-plant-library-update-report.md).
