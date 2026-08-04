# Phase 3.0 — Backend Plant Library

Ngày report: 2026-08-04
Phạm vi: backend quản lý Plant Library, dashboard, SQLite mirror, Convex `plantsMaster`, `plantI18n`, `plantCare` và các đường sync.

## Trạng thái

**Chưa đạt — có P1 cần xử lý trước staging/production.**

Phase 3.0 là phần nền tảng dữ liệu và vận hành. Mục tiêu là để backend quản lý cây có một hợp đồng dữ liệu rõ ràng, ghi dữ liệu an toàn và đồng bộ được với Convex. Nội dung biên tập và trải nghiệm Library thuộc Phase 3.1.

## Kết luận review

### P1 — Convex admin đang mở trực tiếp

Các function trong `packages/convex/convex/plantAdmin.ts` và `packages/convex/convex/masterSync.ts` đang dùng public `query`/`mutation`, nhưng không kiểm tra `ctx.auth`, role admin hoặc secret hợp lệ. `adminKey` do API gửi lên hiện không phải một lớp bảo vệ thật vì Convex không validate nó.

API proxy có kiểm tra quyền, nhưng người gọi có thể bỏ qua proxy và gọi Convex trực tiếp.

### P1 — SQLite và Convex có thể lệch dữ liệu

Theo kiến trúc hiện tại, Convex là nguồn dữ liệu chính của app còn SQLite là mirror cho admin. Tuy nhiên:

- danh sách/stats có thể đọc Convex;
- detail backend luôn đọc SQLite;
- ghi thường commit SQLite trước rồi mới sync Convex;
- sync lỗi có thể trả lỗi cho client nhưng SQLite đã thay đổi;
- route i18n hiện ghi SQLite nhưng chưa sync sang Convex;
- Convex → SQLite chỉ upsert, chưa reconcile các row bị xoá hoặc stale.

### P1 — Identity và delete chưa an toàn

`masterSync` tìm row theo taxonomy thay vì stable source ID. Đổi tên hoặc đổi cultivar có thể tạo duplicate/orphan. Đường delete từ backend cũng chưa áp dụng đầy đủ guard cây gốc/cây biến thể và chưa dọn các bản ghi i18n/care liên quan.

### P2 — Schema và form không cùng hợp đồng

Dashboard cho sửa soil pH, moisture, light hours, notes và active, nhưng một phần payload không được gửi hoặc bị bỏ qua khi sync. Một số field bị nhét vào `metadata_json`, trong khi Convex sync không đọc lại các field đó. Dữ liệu có thể báo lưu thành công nhưng không round-trip đầy đủ.

### P2 — Active và i18n chưa đồng bộ end-to-end

Backend có `is_active`, nhưng Convex schema chưa có field tương ứng và mobile chưa filter theo active. Dashboard hiển thị vi/en/es/pt/fr/zh, trong khi SQLite và sync hiện chủ yếu chỉ hỗ trợ vi/en.

## Việc cần làm trong Phase 3.0

- [ ] Bảo vệ toàn bộ admin/sync Convex bằng auth + role; hoặc chuyển function chỉ dùng cho server sang internal function.
- [ ] Bỏ cơ chế `adminKey` giả bảo mật; mọi đường ghi phải có một cơ chế authorization được validate ở Convex.
- [ ] Chốt Convex là source of truth; SQLite chỉ là mirror nếu không có yêu cầu vận hành khác.
- [ ] Định nghĩa stable `sourceSystem` + `sourceId` và dùng nó cho upsert/update/delete.
- [ ] Tạo canonical plant DTO/schema cho identity, active, care, i18n, source và version.
- [ ] Có outbox/retry/reconciliation cho lỗi sync; không để ghi một bên thành công nhưng bên kia mất trạng thái.
- [ ] Áp dụng duplicate guard, base/variant guard và cleanup/reference policy cho mọi write path, kể cả backend sync.
- [ ] Đồng bộ đầy đủ i18n và care content/version; không silently bỏ field.
- [ ] Dùng cùng một nguồn cho list, detail, stats và export; không để list Convex nhưng detail SQLite mà không có mapping rõ ràng.

## Definition of Done

- [ ] Gọi trực tiếp admin mutation khi chưa có quyền bị từ chối.
- [ ] Create/update/delete/deactivate từ dashboard round-trip đầy đủ qua Convex và quay lại.
- [ ] Sync failure tạo retryable outbox item và reconciliation đưa drift về 0.
- [ ] Đổi scientific name/cultivar không tạo duplicate.
- [ ] Không xoá được base khi còn variant; không còn orphan i18n/care row.
- [ ] Tất cả field đang có trên form đều có test round-trip.
- [ ] API và Convex tests chạy được trong runtime Node/ABI tương thích.

## Bằng chứng hiện có

- Convex typecheck: PASS.
- `npm run audit:plant-content`: command PASS, nhưng đây mới là audit dữ liệu nguồn, chưa chứng minh backend sync đúng.
- API test chưa chạy được do mismatch `better-sqlite3` ABI giữa Node24 và Node26.

## Không thuộc Phase 3.0

- Curation nội dung 200–300 cây ưu tiên.
- Viết lại copy/quality của Library.
- Cải thiện UX tìm kiếm, filter và hiển thị Library.

Các phần trên thuộc [Phase 3.1](2026-08-04-phase-3-1-plant-library-update-report.md).
