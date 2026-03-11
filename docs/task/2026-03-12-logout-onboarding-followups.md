# Logout + Onboarding Follow-ups

Date: 2026-03-12

## Đã làm

- `sign out` không còn xóa `onboarding_profile_v1`.
- Sau `sign out`, app đưa user về `/auth` thay vì để startup flow xem user như first install.
- `delete account` vẫn xóa onboarding local.
- Sau `delete account`, app cũng `redirect` về `/auth` thay vì để user ở lại màn hiện tại.

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

## Kết luận

Flow hiện tại đã đúng hướng UX phổ biến hơn.

Phần còn lại chủ yếu là:
- thêm cách explicit để reset onboarding
- test kỹ các đường chuyển trạng thái auth/onboarding
