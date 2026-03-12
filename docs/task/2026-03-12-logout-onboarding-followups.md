# Logout + Onboarding Follow-ups

Date: 2026-03-12

## Đã làm

- `sign out` không còn xóa `onboarding_profile_v1`.
- Sau `sign out`, app đưa user về `/auth` thay vì để startup flow xem user như first install.
- `delete account` vẫn xóa onboarding local.
- Sau `delete account`, app cũng `redirect` về `/auth` thay vì để user ở lại màn hiện tại.
- **Sửa lỗi sync settings của anonymous user**: Implement User Merging trên Convex để gộp data từ anonymous device vào Better Auth session.
- **Timezone Selection**: Thay thế text input bằng searchable modal, hỗ trợ tìm kiếm và lưu ngay lập tức.
- **User Mode filtering (Gardener/Farmer)**: Ẩn/hiện card ở home screen dựa trên app mode. Gardener chỉ hiện "Growing" và "Due Today".
- **Sửa lỗi navigation scanner**: Guest user bấm sign in từ scanner alert giờ về `/auth` thay vì `/profile`.
- **Đồng bộ app mode khi signed out**: HomeScreen dùng `useAppMode` hook để đảm bảo UI nhất quán với local onboarding/cached mode kể cả khi chưa đăng nhập.

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

## Review & Planning (Today) by Codex

### Review nhanh

- Ưu tiên cao nhất: thêm `Reset onboarding`/`Reset app`, vì đây là chỗ UX còn thiếu sau khi đổi hành vi logout.
- Tiếp theo: chạy manual test matrix auth/onboarding để chốt không còn regression về startup flow và routing.
- Cần làm trong ngày nếu đủ môi trường: test email verification end-to-end (`RESEND_API_KEY`, deep link).
- Các mục có thể làm sau nếu thiếu thời gian: one-off cleanup anonymous rows, theo dõi cron batch tuning, hoàn thiện reset password screen.

### Kế hoạch thực hiện hôm nay

1. Implement action `Reset onboarding` (hoặc `Reset local app data`) trong Profile/Dev Settings + clear `onboarding_profile_v1` + route về `/onboarding/farm-setup`.
2. Chạy full manual test matrix cho các luồng logout/signin/delete account và ghi lại pass/fail.
3. Test email verification E2E trên môi trường có đủ env vars và xác nhận deep link `my-garden://verify-email`.
4. Rà wording ở `/auth` theo hướng “Sign in to sync your data” để tránh gây hiểu nhầm khi vẫn có anonymous session nền.
5. Nếu còn thời gian: thêm guard khi user đã authenticated mà vào `/auth` thì redirect về `returnTo` hoặc `/`.
6. Chuẩn bị checklist cho one-off cleanup anonymous rows + đối soát lại số lượng `user/session` sau cleanup.

### Deliverables cuối ngày

- Một PR cho `Reset onboarding` + update auth copy (và route guard nếu kịp).
- Một bản test note ngắn cho manual matrix + email verification.
- Một checklist vận hành cho one-off cleanup và theo dõi cron.

## Update thực tế (cuối ngày)

### Đã hoàn thành trong branch

- Thêm action `Reset onboarding` trong Profile (signed-in và guest), có confirm + route về onboarding.
- Auth screen:
  - thêm copy `Sign in to sync your data`
  - thêm guard redirect khi đã authenticated
  - cleanup UI forgot/reset flow theo feedback (bỏ card wrapper ở message cần gọn)
- Email verification + reset password:
  - bật `sendResetPassword` ở Better Auth server
  - fix resend verification theo email input user (tránh bị ảnh hưởng bởi anonymous/temp session)
  - thêm resend link tại Home warning với cooldown 24h
- Security hardening:
  - bỏ fallback secret mặc định, bắt buộc `BETTER_AUTH_SECRET`
  - bỏ log lộ verify/reset link token ra console
- Auth token lifetime:
  - verify email token: 24h (`emailVerification.expiresIn`)
  - reset password token: 1h (`emailAndPassword.resetPasswordTokenExpiresIn`)

### Còn lại nên làm tiếp

- Chạy full manual test matrix và ghi pass/fail chi tiết vào report.
- Deploy/restart Convex để đảm bảo auth config mới có hiệu lực trên môi trường test/prod.
