# Richfarm Functional Plan (GrowIt/Planter-style)

## 1) Product Scope
- Mục tiêu: app quản lý vườn từ Planning -> Growing -> Reminder -> Harvest với trải nghiệm nhanh, rõ, actionable.
- Đối tượng: người mới trồng đến người trồng đều đặn ở nhà, ban công, indoor.
- Giá trị cốt lõi: đúng việc cần làm hôm nay, đúng thông tin cho từng cây, ít thao tác.

## 2) Navigation & Routes
- Welcome: chọn ngôn ngữ, vào app.
- Tabs chính: `garden`, `planning`, `growing`, `reminder`, `library`.
- Deep links ưu tiên:
  - `/(tabs)/garden`
  - `/(tabs)/planning`
  - `/(tabs)/growing`
  - `/(tabs)/reminder`
  - `/(tabs)/library`
- Rule: không dùng route group trống làm điểm đến CTA; luôn điều hướng đến route cụ thể.

## 3) Screen-by-Screen Functionality

### Welcome
- Buttons:
  - Language badge: mở modal chọn ngôn ngữ.
  - Language item: đổi ngôn ngữ + đóng modal.
  - Backdrop modal: đóng modal.
  - CTA Get Started: vào `/(tabs)/garden`.
- Behavior:
  - Click phải có phản hồi ngay (mở modal/chuyển màn).
  - Không có nút nào ở trạng thái “bấm không phản ứng”.
- User expectation:
  - Vào app trong 1 chạm.
  - Đổi ngôn ngữ ngay và text cập nhật tức thì.

### Garden
- Buttons:
  - `+` header: mở Create Garden modal.
  - Create button empty state: mở Create Garden modal.
  - Close modal: đóng modal.
  - Create action: tạo garden.
  - Garden card: mở chi tiết garden (MVP có thể dùng modal “coming soon”).
- Behavior:
  - Disable create khi đang submit/thiếu dữ liệu bắt buộc.
  - Hiển thị loading đúng khi query chưa có dữ liệu.
  - Nếu chưa sẵn `deviceId`, không gửi mutation.
- User expectation:
  - Tạo garden xong thấy item mới ngay.
  - Tap vào card phải có điều gì đó xảy ra.

### Planning
- Buttons:
  - Thêm cây (header + empty state): mở bottom sheet.
  - Add trong sheet: tạo plant.
  - Tap ngoài sheet: đóng sheet.
- Behavior:
  - Nếu chưa đăng nhập: vẫn nên cho tap và hiển thị lý do không thể tạo (toast/alert) thay vì im lặng.
  - Validate nickname trước submit.
- User expectation:
  - Thêm cây nhanh, tối đa 1-2 trường input.

### Growing
- Buttons:
  - Thu hoạch: đổi trạng thái sang `harvested`.
  - Card cây: mở plant detail (nên có trong roadmap ngắn hạn).
- Behavior:
  - Nếu không có quyền edit, tap phải có feedback (không chỉ disable mờ).
- User expectation:
  - Bấm “Thu hoạch” xong item biến mất khỏi danh sách Growing.

### Reminder
- Buttons:
  - Complete reminder: đánh dấu hoàn thành.
  - Card reminder: mở detail/chỉnh rule (roadmap).
- Behavior:
  - Complete thành công cập nhật danh sách ngay.
  - Time hiển thị theo locale/timezone user.
- User expectation:
  - Danh sách hôm nay rõ ràng và xử lý task nhanh 1 chạm.

### Library
- Buttons:
  - Search clear: xoá text.
  - Filter chips: lọc theo nhóm.
  - Plant card: mở detail modal.
  - Close modal: đóng detail.
- Behavior:
  - Lọc/search mượt, không block UI.
  - Có empty state rõ khi không có kết quả.
- User expectation:
  - Tìm cây trong vài giây và xem thông tin chăm sóc cốt lõi.

## 4) Core Data + Logic Requirements
- Entities MVP: gardens, beds, user_plants, reminders, plants_master.
- Logic cốt lõi:
  - Plant lifecycle: `planning -> growing -> harvested`.
  - Reminder recurrence + complete flow.
  - Sync theo `deviceId`/user để không mất dữ liệu.
- Consistency rules:
  - Mọi mutation cần guard input + error handling có feedback.
  - Mọi màn có loading, empty, error state.

## 5) UX Quality Bar ("Perfect" baseline)
- Mọi button đều có 1 trong 3 outcomes rõ ràng:
  - Navigation.
  - State change thành công.
  - Message giải thích vì sao chưa thực hiện được.
- Không có "dead tap" (bấm mà không đổi gì, không báo gì).
- Disabled action cần có context (tooltip/toast/inline text).
- Copy text nhất quán ngôn ngữ theo locale.

## 6) Short Roadmap
1. Hoàn thiện Garden detail screen + bed management.
2. Thêm plant detail/edit từ Planning/Growing.
3. Reminder create/edit/delete UI đầy đủ.
4. Harvest log + analytics nhẹ (tuần/tháng).
5. Weather + seasonal suggestions theo zone.

## 7) Acceptance Checklist
- Welcome: 3 nút chính click được 100% và không unmatched route.
- Garden: tạo được garden mới với deviceId hợp lệ.
- Planning/Growing/Reminder: action có feedback khi unauthorized.
- Library: search/filter/detail chạy đúng.
- Không còn button/card tương tác mà thiếu `onPress`.
