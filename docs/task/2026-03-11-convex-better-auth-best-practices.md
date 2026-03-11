Below is the full content of the most recent assistant message:

Dưới đây là “best practice hợp nhất” từ 2 skill, áp vào app React Native iOS dùng Convex + Better Auth. Mục tiêu là **giảm rối** và **ổn định flow**.

**1) Chọn một hợp đồng auth rõ ràng**
- **Auth-first** (khuyến nghị nếu có trả phí/subscription): mọi mutation cần user đều yêu cầu identity. Anonymous session phải luôn sẵn trước khi gọi mutation.
- **Device-first** (nếu muốn nhanh, ít “Not authenticated”): cho phép một số mutation chạy unauth theo `deviceId`, sau đó merge khi sign in.

**2) Startup flow chuẩn (React Native iOS)**
1. App mount → `useSession()` (Better Auth)
2. Nếu chưa có session → tạo anonymous session
3. Khi `session` có → Convex mutation được phép gọi
4. Nếu `session` đổi → reset Convex client để tránh state mismatch

**3) Convex function design**
- Tất cả functions đều có `args` và `returns`.
- Queries dùng `withIndex`.
- Mutations idempotent (tránh write conflict).
- Dùng `ConvexError` cho lỗi user-facing.

**4) Đồng bộ Better Auth ↔ users table**
- Better Auth tables là **identity source**.
- App `users` table là profile/materialized view.
- Khi có identity → `getOrCreateUserFromIdentity`.
- Nếu chọn Device-first → `getOrCreateUserFromDevice` cho một số mutation.

**5) Guest vs Auth**
- Nếu chọn Auth-first:  
  - `requireUser()` chỉ dùng khi session đã sẵn  
  - UI phải chặn mutation khi chưa có session
- Nếu chọn Device-first:  
  - `userSettings`/onboarding có thể ghi theo `deviceId`  
  - Merge khi sign in

**6) Cache và state**
- Cache user-scoped theo `session.user.id`, không chỉ `deviceId`.
- Khi sign out/delete: clear user-scoped cache + onboarding local.

**7) Better Auth config tối thiểu**
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` rõ ràng.
- Bật plugin `anonymous()` ở server nếu dùng guest.
- Chạy `better-auth migrate` sau khi thêm plugin.
- Email reset/verify phải có handler.

---

Nếu bạn muốn tôi **chốt một hướng** và refactor theo hướng đó, trả lời 1 hoặc 2:

1. Auth-first (strict, sạch, phù hợp subscription)
2. Device-first (dễ dùng, ít lỗi auth, chấp nhận rủi ro)
