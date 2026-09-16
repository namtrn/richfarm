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

---

## 📋 Report — Đánh giá hiện trạng (2026-03-11) by Sonnet

> Reviewed by: Antigravity | Files: `apps/mobile/lib/auth.ts`, `auth-client.ts`, `convex.ts`, `sessionCache.ts`, `packages/convex/convex/auth.ts`, `auth.config.ts`, `lib/user.ts`, `users.ts`

### Hướng hiện tại: **Hybrid (Auth-first + Device fallback)**

App hiện không chọn rõ một trong hai hướng. `getOrCreateUser` vừa xử lý identity (Better Auth session) vừa fallback về `deviceId` nếu không có session. Đây là **Device-first trên thực tế** dù intent gần với Auth-first.

---

### ✅ Điểm đã làm đúng

| # | Best Practice | Trạng thái | File |
|---|---|---|---|
| 1 | `anonymousClient()` + `anonymous()` plugin bật đúng cả client lẫn server | ✅ | `auth-client.ts`, `auth.ts` |
| 2 | `BETTER_AUTH_SECRET`, `CONVEX_SITE_URL` được đọc từ env | ✅ | `auth.ts` |
| 3 | `expoClient()` cấu hình `SecureStore` và deep-link scheme | ✅ | `auth-client.ts` |
| 4 | Startup: mount → `useSession()` → nếu chưa có → tạo anonymous session | ✅ | `auth.ts` (L40–45) |
| 5 | Queries dùng `withIndex` (không full-scan) | ✅ | `users.ts`, `lib/user.ts` |
| 6 | Cache user-scoped theo `deviceId + sessionUserId` | ✅ | `sessionCache.ts`, `auth.ts` (L20–22) |
| 7 | `deleteAccount` clear toàn bộ dữ liệu user (plants, reminders, favorites, beds, gardens...) | ✅ | `users.ts` |
| 8 | Guard `cancelled` trong useEffect tránh setState sau unmount | ✅ | `auth.ts` (L58–89) |

---

### ⚠️ Điểm cần chú ý / rủi ro

#### 1. Convex client không reset khi session thay đổi
**Best practice #2 điểm 4:** "Nếu `session` đổi → reset Convex client để tránh state mismatch."

`convex.ts` tạo **một singleton** `export const convex = createConvexClient()` — không bao giờ reset. Khi user sign out rồi sign in bằng account khác, Convex vẫn giữ subscriptions của session cũ cho đến khi page reload.

```ts
// convex.ts — hiện tại: singleton, không reset
export const convex = createConvexClient();
```

**Rủi ro:** Data leak giữa các user, hoặc query trả về data của user cũ trong khoảnh khắc transition.

---

#### 2. `requireUser` throw `Error` thay vì `ConvexError`
**Best practice #3:** "Dùng `ConvexError` cho lỗi user-facing."

```ts
// lib/user.ts L34 — hiện tại
if (!identity) throw new Error('Not authenticated');

// Nên là
import { ConvexError } from 'convex/values';
if (!identity) throw new ConvexError('Not authenticated');
```

`Error` thông thường sẽ bị Convex serialize thành `{ message: "..." }` nhưng không có `data` field để client bắt có cấu trúc. `ConvexError` cho phép client distinguish lỗi business logic vs system error.

---

#### 3. `getCurrentUser` nhận `deviceId` từ args — query không an toàn
**Best practice #4:** "App `users` table là profile/materialized view — sync từ identity."

```ts
// users.ts L12–19 — hiện tại
export const getCurrentUser = query({
    args: { deviceId: v.optional(v.string()) },
    handler: async (ctx, args) => getUserByIdentityOrDevice(ctx, args.deviceId),
});
```

Client truyền `deviceId` vào query args → **client tự khai báo mình là ai**. Nếu ai đó biết `deviceId` của người khác, họ có thể query được profile đó. `deviceId` nên chỉ là fallback khi không có identity, không nên là primary auth vector trong query.

**Hiện tại** `auth.ts` gọi `api.users.getCurrentUser` với `{}` (không truyền deviceId) khi có session — đây là đúng. Nhưng signature `deviceId: v.optional(v.string())` vẫn để ngỏ rủi ro nếu ai gọi sai.

---

#### 4. Logic trùng lặp giữa `getOrCreateUser` (users.ts) và `requireUser` / `getOrCreateUserFromDevice` (lib/user.ts)
Cùng logic tạo/lấy user nhưng viết ở 2 nơi:
- `users.ts:getOrCreateUser` — mutation endpoint
- `lib/user.ts:requireUser` + `getOrCreateUserFromDevice` — helper functions

`getOrCreateUser` (users.ts) có thêm `lastSyncAt` patch, còn `requireUser` (lib/user.ts) không patch `lastSyncAt`. **Dễ drift** nếu sửa một chỗ mà quên chỗ kia.

---

#### 5. `deleteAccount` không xóa Better Auth session/account
`deleteAccount` xóa Convex `users` record và toàn bộ data liên quan, nhưng **không gọi** `authComponent` để xóa Better Auth account. Sau khi delete, user vẫn có thể sign in lại (Better Auth vẫn còn account) và sẽ tạo ra Convex user mới.

**Cần thêm:**
```ts
// Sau khi xóa Convex user
await authComponent.api.deleteUser(ctx, { email: user.email });
// hoặc dùng Better Auth admin API nếu có
```

---

### 🔵 Kết luận & Khuyến nghị

**Hướng phù hợp nhất:** **Auth-first (Option 1)** — vì app có subscription (RevenueCat), cần identity rõ ràng để attach entitlement.

**Action items ưu tiên:**

| Priority | Action |
|---|---|
| 🔴 High | Reset Convex client khi `session.user.id` thay đổi (sign out/in) |
| 🔴 High | `deleteAccount` phải xóa cả Better Auth account |
| 🟡 Medium | Đổi `throw new Error(...)` → `throw new ConvexError(...)` trong `lib/user.ts` |
| 🟡 Medium | Consolidate logic tạo user về 1 nơi (bỏ duplicate giữa `users.ts` và `lib/user.ts`) |
| 🟢 Low | Remove `deviceId` arg khỏi `getCurrentUser` query (dùng identity only) |

---

## 📌 Plan Fix (append) by Codex

### Mục tiêu
- Sửa các rủi ro còn lại trong phần “⚠️ Điểm cần chú ý / rủi ro”.
- Chuẩn hóa hành vi auth để giảm lỗi “Not authenticated” và tránh leak dữ liệu.

### Plan (đề xuất)
1. **Chuẩn hóa lỗi auth**  
   - Đổi `throw new Error('Not authenticated')` → `throw new ConvexError(...)` trong `packages/convex/convex/lib/user.ts`.
   - Lợi ích: client phân biệt lỗi business vs system rõ hơn.

2. **Siết `getCurrentUser` theo identity**  
   - Loại `deviceId` khỏi `getCurrentUser` query hoặc chỉ dùng trong nội bộ khi `identity` rỗng.
   - Mục tiêu: không để client tự khai báo identity qua `deviceId`.

3. **Hợp nhất logic tạo user**  
   - Dồn toàn bộ logic tạo/patch user về một helper duy nhất trong `lib/user.ts`.
   - `users.ts:getOrCreateUser` gọi helper này thay vì tự viết lại.

4. **Xóa Better Auth account khi deleteAccount**  
   - Sau khi xóa dữ liệu app, gọi API delete user của Better Auth (admin).
   - Mục tiêu: không còn tình trạng sign up lại báo “email tồn tại”.

5. **Chốt hướng auth**  
   - Chọn **Auth-first** nếu ưu tiên subscription/RevenueCat.  
   - Hoặc **Device-first** nếu muốn giảm lỗi khi chưa có session.
   - Áp các guard UI/mutation theo hướng đã chọn.

### Ghi chú triển khai
- Nếu dùng `ConvexError`, cần import từ `convex/values`.
- Nếu loại `deviceId` khỏi `getCurrentUser`, đảm bảo client không truyền `deviceId` vào query.
- Với delete Better Auth account, cần xác định chính xác API/adapter đang dùng trong `authComponent`.

---

## ✅ Implementation Report (2026-03-11) by Sonnet

### Chọn hướng: Auth-first (Option 1)

---

### Những gì đã fix

#### Fix 1 — Consolidate user logic + ConvexError
**File:** `packages/convex/convex/lib/user.ts` (rewrite toàn bộ)

- Thêm `upsertUserFromIdentity()` — single source of truth cho create/get/patch user
- `requireUser()` giờ dùng `ConvexError({ code, message })` thay vì `Error`
- Thêm `getUserByIdentity()` — read-only, dùng trong queries
- Giữ `getOrCreateUserFromDevice()` có `@deprecated` tag để không break code cũ

#### Fix 2 — getCurrentUser không nhận deviceId
**File:** `packages/convex/convex/users.ts`

```diff
- export const getCurrentUser = query({
-     args: { deviceId: v.optional(v.string()) },
-     handler: async (ctx, args) => getUserByIdentityOrDevice(ctx, args.deviceId),
- });
+ export const getCurrentUser = query({
+     args: {},
+     handler: async (ctx) => getUserByIdentity(ctx),  // identity only
+ });
```

#### Fix 3 — getOrCreateUser delegate sang helper
**File:** `packages/convex/convex/users.ts`

Bỏ ~70 dòng duplicate logic. Giờ chỉ:
```ts
const user = await upsertUserFromIdentity(ctx, args.deviceId);
return user?._id ?? null;
```

#### Fix 4 — deleteAccount xóa Better Auth account
**File:** `packages/convex/convex/users.ts`

```ts
const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
await auth.api.deleteUser({ headers, body: {} });
```
- Lấy `authUser` **trước** khi xóa Convex record
- Dùng `authUser?._id` (field đúng của BA Convex schema) thay vì `.id`
- Wrap trong try/catch: nếu BA fail, Convex data đã xóa xong — không rollback

#### Fix 5 — Edge case: user row bị xóa khỏi Convex
**File:** `apps/mobile/lib/auth.ts`

Khi admin xóa user row trong Convex Dashboard (hoặc bất kỳ lý do gì), app sẽ:
1. `getCurrentUser` trả về `null` (session vẫn còn)
2. `remoteResolved && rawUser === null` → detect "mất user"
3. Reset `initializedKeyRef` → trigger `getOrCreateUser` lại
4. Server `upsertUserFromIdentity()` tạo lại user từ session identity

```ts
if (remoteResolved && rawUser === null) {
    initializedKeyRef.current = null;  // force re-bootstrap
}
```

---

### Edge cases đã xử lý

| Scenario | Xử lý |
|---|---|
| Admin xóa row Convex user | `rawUser === null` → reset initKey → re-bootstrap tự động |
| User chưa sign in (anonymous session) | BA tạo anonymous session → `upsertUserFromIdentity` chạy bình thường |
| Session hợp lệ nhưng row chưa có (first boot) | `upsertUserFromIdentity` tạo mới |
| `deleteAccount` BA fail (đã xóa trước) | Warn log, không rollback, Convex data đã gone |
| `deleteAccount` session hết hạn | Catch error, return `{ ok: true }`, client sign out |
| BA user không có record (device anonymous) | `authUser?._id` là `undefined` → skip BA delete |

---

### Còn lại (chưa fix trong session này)

~~Convex client reset khi sign out/in~~ — **Đã có sẵn**, xem addendum bên dưới.
~~Enable `user.deleteUser` trong BA config~~ — **Fix 6**, xem addendum bên dưới.

---

## ✅ Addendum Fix (2026-03-11) by Antigravity

### Fix 6 — Enable `user.deleteUser` trong BA config
**File:** `packages/convex/convex/auth.ts`

```diff
+ user: {
+   deleteUser: {
+     enabled: true,  // required for auth.api.deleteUser() to work
+   },
+ },
```

Nếu không bật, `auth.api.deleteUser()` trong `deleteAccount` mutation sẽ throw `404` hoặc `Method not found`.

---

### Fix 7 — Convex client reset (đã có sẵn, không cần fix)
**File:** `apps/mobile/lib/convexAuth.tsx`

Sau khi review code, phát hiện `BetterAuthConvexProvider` đã xử lý đúng:

```tsx
const convex = useMemo(() => createConvexClient(), [sessionId]);
// ...
<ConvexProviderWithAuth key={sessionId} client={convex} ...>
```

`key={sessionId}` + `useMemo([sessionId])` → khi sign out/in account khác, `sessionId` thay đổi, React **unmount provider cũ + mount provider mới** với Convex client hoàn toàn fresh. Không có data leak.

**Không cần thêm code gì.**

