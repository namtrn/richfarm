# Logout + Onboarding Follow-ups

Date: 2026-03-12

## Đã làm

- `sign out` không còn xóa `onboarding_profile_v1`.
- Sau `sign out`, app đưa user về `/auth` thay vì để startup flow xem user như first install.
- `delete account` vẫn xóa onboarding local.
- Sau `delete account`, app cũng `redirect` về `/auth` thay vì để user ở lại màn hiện tại.
- **Sửa lỗi sync settings của anonymous user**: Implement User Merging trên Convex để gộp data từ anonymous device vào Better Auth session.
- **Timezone Selection**: Thay thế text input bằng searchable modal, hỗ trợ tìm kiếm và lưu ngay lập tức.

## Việc còn lại nên làm

### 1. Thêm action `Reset onboarding` / `Reset app`

Vì logout không còn reset onboarding, cần một action explicit nếu user muốn làm onboarding lại.

Đề xuất:
- Thêm button trong Profile hoặc Developer Settings:
  - `Reset onboarding`
  - hoặc `Reset local app data`
- Action này gọi clear `onboarding_profile_v1` và đưa user về `/onboarding/farm-setup`.

### 2. Rà lại copy/UI ở auth screen

Sau logout, user đang vào `/auth` nhưng app vẫn có anonymous session ở background.

Không sai về kỹ thuật, nhưng nên kiểm tra wording để tránh user nghĩ:
- "Tôi đã đăng xuất rồi, sao app vẫn nhớ gì đó?"

Đề xuất:
- Thêm title/subtitle kiểu `Sign in to sync your data` thay vì wording ngụ ý app ở trạng thái hoàn toàn trống.

### 3. Manual test matrix

Cần test lại các case sau:

- onboard xong -> sign out -> vào auth -> sign in lại -> vẫn không bị onboarding lại
- onboard xong -> sign out -> kill app -> mở lại -> không tự rơi vào onboarding
- account có remote onboarding -> sign out -> sign in account cũ -> settings/onboarding vẫn đúng
- delete account -> onboarding local bị xóa + route về `/auth`
- user chưa từng onboard -> sign out/sign in không tạo state lạ

### 4. Cân nhắc route guard cho `/auth`

Hiện tại nếu user đã signed in thật rồi mà vẫn mở `/auth`, UX có thể hơi lửng.

Đề xuất:
- Nếu `isAuthenticated === true`, auto redirect khỏi `/auth` về `returnTo` hoặc `/`.

### 5. Chạy cleanup one-off cho anonymous rows cũ

Bug `useAuth()` trước đó đã có thể sinh nhiều anonymous session/user thừa.

Cron 30 ngày chỉ dọn dần về sau, không xử lý ngay các rows cũ vừa sinh trong dev/staging/prod.

Đề xuất:
- chạy manual cleanup một lần với cutoff ngắn hơn cho môi trường hiện tại
- kiểm tra lại số lượng Better Auth `user/session` và app `users` sau cleanup

### 6. Manual test email verification end-to-end

Đã bật verify email và Resend integration, nhưng vẫn cần test thực tế trên môi trường có `RESEND_API_KEY` + `AUTH_EMAIL_FROM`.

Cần test:
- sign up email mới -> nhận mail -> bấm deep link -> về `my-garden://verify-email`
- sign in khi chưa verify -> thấy message đúng + resend hoạt động
- verify xong -> sign in bình thường

### 7. Theo dõi cron cleanup anonymous user

Đã có cleanup job 30 ngày, nhưng nên theo dõi giai đoạn đầu để chắc không xóa nhầm guest còn hoạt động.

Đề xuất:
- log số `scanned/deleted/skipped` mỗi lần cron chạy
- sau vài ngày, review xem batch `100` và threshold `30 ngày` có phù hợp không

### 8. Cân nhắc bổ sung reset password screen

Hiện auth screen đã có flow request reset email, nhưng app vẫn chưa có màn `reset-password` để hoàn tất deep link trong mobile.

Nếu giữ nút reset password ở auth screen, nên hoàn thiện nốt:
- route `my-garden://reset-password`
- form nhập mật khẩu mới
- success state sau reset

## Kết luận

Flow hiện tại đã đúng hướng UX phổ biến hơn.

Phần còn lại chủ yếu là:
- thêm cách explicit để reset onboarding
- test kỹ các đường chuyển trạng thái auth/onboarding
