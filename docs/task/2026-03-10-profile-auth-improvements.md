# Profile Screen — Missing Features & Auth Edge Cases

Date: 2026-03-10
Repo: `/Users/n/Documents/GitHub/richfarm`

---

## Context

Review of `apps/mobile/app/(tabs)/profile.tsx` and `apps/mobile/app/auth.tsx` to identify missing features required for a production-ready profile and auth flow (including App Store compliance).

---

## Done in This Session (by Sonnet)

### Profile Screen (`profile.tsx`)

| Feature | Status |
|---|---|
| Delete Account | ✅ Already existed |
| Đổi mật khẩu (Change Password) | ✅ Added — collapsible form, show/hide, min 8 chars, only for non-anonymous |
| Cài đặt thông báo (Notifications) | ✅ Added — reads `expo-notifications` permission, enable/open settings |
| Liên hệ hỗ trợ (Support) | ✅ Added — `mailto:support@richfarm.app` + GitHub Issues |
| Chính sách / Điều khoản (Legal) | ✅ Added — Privacy Policy + Terms of Service links |
| App Version | ✅ Added — reads from `expo-constants`, shows at bottom of Legal section |

### Auth Screen (`auth.tsx`)

| Fix | Status |
|---|---|
| Auto-navigate after sign in/sign up | ✅ Fixed — `setTimeout(navigateBack, 900-1200ms)` after success |
| `KeyboardAvoidingView` | ✅ Added — `behavior="padding"` on iOS |
| Error code mapping | ✅ Added — `mapAuthError()` maps common server errors to friendly i18n keys |
| Confirm password field (sign up) | ✅ Added — inline mismatch hint |
| Loading text in button | ✅ Fixed — shows "Signing in…", "Creating account…", "Sending…" |
| Error vs success message style | ✅ Fixed — errors show warning color, success shows neutral |
| Forgot password reset-sent hint | ✅ Added — secondary hint text after successful reset email |
| Network error catch | ✅ Added — all handlers wrapped with `catch` → `auth_err_network` |

---

## Still TODO

### Profile — URL placeholders to replace

These are hardcoded placeholders that need real URLs before App Store submission:

- `mailto:support@richfarm.app` in Support section  
- `https://github.com/namtrn/richfarm/issues` — bug report URL  
- `https://richfarm.app/privacy` — Privacy Policy page  
- `https://richfarm.app/terms` — Terms of Service page  

### Auth — Feature flags to enable when backend is ready

Located at top of `apps/mobile/app/auth.tsx`:

```ts
const GOOGLE_OAUTH_ENABLED = false;   // needs GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET on server
const RESET_PASSWORD_ENABLED = false; // needs emailAndPassword.sendResetPassword in Better Auth config
```

When `GOOGLE_OAUTH_ENABLED = true`, **Sign in with Apple must also be added** — Apple requires it whenever any third-party social login is offered.

### Profile — Nice to have (not blocking)

- [ ] **Edit name inline** — currently name is display-only; need TextInput + save
- [ ] **Avatar / profile photo** — not present at all
- [ ] **Sign in with Apple** — add when Google OAuth is enabled (App Store requirement)
- [ ] **Notification granularity** — currently binary on/off; could add per-type toggles (watering, harvest, general)
- [ ] **Data export (GDPR)** — not required for App Store but good practice

### Auth — Nice to have

- [ ] **Rate limiting UI** — backend should rate-limit; frontend could disable button with countdown
- [ ] **Email verification flow** — if Better Auth is configured to require verification, a "check your inbox" holding screen is needed
- [ ] **Deep link handler for reset password** — when user taps reset link in email, app should open a "new password" form. Currently `redirectTo: APP_SCHEME://` goes nowhere.

---

## App Store Compliance Checklist (Apple)

| Requirement | Status |
|---|---|
| Privacy Policy link | ✅ Added |
| Terms of Service link | ✅ Added |
| Account Deletion | ✅ Already existed |
| App Version display | ✅ Added |
| Sign in with Apple (if social login enabled) | ⚠️ Needed when Google OAuth is turned on |
| Push notification permission must be opt-in | ✅ `requestPermissionsAsync()` is user-triggered |

---

## Files Changed

- `apps/mobile/app/(tabs)/profile.tsx` — 4 new sections added
- `apps/mobile/app/auth.tsx` — full auth flow hardening  
- `apps/mobile/lib/locales/en.json` — added `profile.*` keys for all new features + error mapping
- `apps/mobile/lib/locales/vi.json` — Vietnamese translations for all above

----------

# Review by Codex

Date: 2026-03-10
Reviewer: Codex
Commit: `feat(profile): add change password, notifications, support, legal sections + auth hardening`

## Severity guide

- `P1`: nghiêm trọng cao, có thể gây mất dữ liệu, hỏng flow chính, lỗi bảo mật, hoặc chặn release.
- `P2`: nghiêm trọng vừa, không làm app sập toàn bộ nhưng gây sai hành vi rõ ràng, UX sai đáng kể, hoặc regression cần sửa sớm.
- `P3`: nghiêm trọng thấp, edge case hoặc issue nhỏ hơn; nên sửa nhưng thường không chặn release nếu đã chấp nhận rủi ro.

Trong commit này:

- Không có `P1` nào mình xác nhận được.
- Có `P2`: nên sửa trước khi phát hành rộng.
- Có `P3`: không quá nghiêm trọng nhưng nên dọn.

## Findings

### 1. `[P2]` Notification permission bị gom sai trạng thái

File: `apps/mobile/app/(tabs)/profile.tsx`

Relevant lines:

- `79`
- `100-102`
- `221-223`
- `704-718`

Vấn đề:

State `notifStatus` hiện chỉ nhận `'granted' | 'denied' | 'undetermined'`, nhưng `expo-notifications` có thể trả thêm các trạng thái như `provisional` trên iOS. Code hiện đang cast cưỡng bức:

- `Notifications.getPermissionsAsync()`
- `Notifications.requestPermissionsAsync()`

về union hẹp đó.

Hệ quả:

- Khi OS trả về `provisional`, UI sẽ không coi đây là trạng thái đã được cấp quyền.
- Người dùng có thể đã cho phép notification ở mức tạm thời nhưng màn hình vẫn hiển thị như chưa bật.
- Điều này gây sai hành vi thực tế, dễ làm user hiểu nhầm là app không xin quyền đúng.

Đánh giá mức độ:

- Đây là `P2`, không phải `P1`, vì không làm crash app hay mất dữ liệu.
- Tuy vậy nó là bug hành vi thực tế ở feature mới thêm, nhất là trên iOS, nên nên sửa sớm.

Khuyến nghị:

- Dùng type đầy đủ từ Expo thay vì cast tay.
- Xử lý riêng `provisional` như một trạng thái được cấp quyền một phần.
- Nếu muốn UI đơn giản, ít nhất nên map `provisional` vào cùng nhóm “enabled”.

### 2. `[P2]` Notification status không refresh sau khi mở System Settings

File: `apps/mobile/app/(tabs)/profile.tsx`

Relevant lines:

- `99-102`
- `711-718`

Vấn đề:

Permission notification chỉ được đọc một lần khi screen mount. Khi user bấm `Open Settings`, đổi quyền ở OS settings, rồi quay lại app, state hiện tại không được reload lại.

Hệ quả:

- User bật notification thành công nhưng màn profile vẫn giữ trạng thái cũ.
- UI có thể tiếp tục hiển thị “denied”.
- Người dùng phải reload/remount screen mới thấy đúng.

Đánh giá mức độ:

- Đây là `P2`, không phải `P1`.
- Nó không phá dữ liệu hay bảo mật, nhưng gây hiểu nhầm trực tiếp ở flow cấp quyền, ảnh hưởng UX của feature mới.

Khuyến nghị:

- Refresh permission khi app quay lại foreground.
- Hoặc refresh khi screen focus lại.

### 3. `[P3]` `setTimeout(navigateBack, ...)` không được cleanup

File: `apps/mobile/app/auth.tsx`

Relevant lines:

- `103-105`
- `127-128`

Vấn đề:

Sau khi sign in/sign up thành công, code gọi `setTimeout(navigateBack, ...)` để delay điều hướng. Nhưng timeout không được lưu ref và không được clear khi component unmount hoặc khi state/context thay đổi.

Hệ quả:

- Nếu user đổi màn hình trước khi timeout chạy, callback cũ vẫn có thể tiếp tục điều hướng.
- Có thể tạo ra navigation muộn, khó đoán, nhất là trong lúc user đang thao tác tiếp.

Đánh giá mức độ:

- Đây là `P3`, không phải `P2` hoặc `P1`.
- Nó là edge case về điều hướng và không phải lỗi chặn release trong đa số trường hợp.

Khuyến nghị:

- Lưu timeout id trong ref.
- Cleanup trong `useEffect` return.

## Overall assessment

Commit này làm đúng hướng và tăng chất lượng sản phẩm rõ rệt ở hai khu vực:

### Profile

Đã thêm các khu vực còn thiếu cho profile/settings:

- Change password
- Notifications
- Support
- Legal
- App version

Điểm tốt:

- Phạm vi tính năng hợp lý cho màn profile production-ready hơn.
- Có tách anonymous user khỏi một số action nhạy cảm như đổi mật khẩu.
- Support/legal links là phần cần thiết cho bản phát hành app store.

### Auth

Auth flow được làm chắc hơn trước:

- Có confirm password lúc sign up
- Có mapping lỗi phổ biến sang text thân thiện hơn
- Có loading label rõ theo từng mode
- Có `KeyboardAvoidingView`
- Có auto-return sau khi auth thành công
- Có hint sau reset flow

Điểm tốt:

- UX của auth screen tốt hơn đáng kể.
- Tránh được nhiều lỗi nhập liệu phổ biến.
- Typecheck hiện tại vẫn pass.

## Verification

Đã kiểm tra:

- `git show e885d2c97f3a65699e9754e0ebb407d0eea61985`
- Diff các file `profile.tsx`, `auth.tsx`, `en.json`, `vi.json`
- `npm run typecheck` trong `apps/mobile`

---

## Fixes applied by Codex

Date: 2026-03-10

Ba issue trong review phía trên đã được sửa trực tiếp trong code:

### 1. Notification permission state handling

File: `apps/mobile/app/(tabs)/profile.tsx`

Đã sửa:

- Bỏ cast tay từ Expo permission status sang union hẹp.
- Thêm hàm `refreshNotificationStatus()` để đọc permission theo cách an toàn hơn.
- Xử lý riêng trường hợp iOS `PROVISIONAL`.
- Map `granted` và `provisional` về trạng thái UI đã bật notification.

Kết quả:

- UI không còn hiểu sai các trạng thái permission hợp lệ từ Expo.

### 2. Notification status refresh after returning from Settings

File: `apps/mobile/app/(tabs)/profile.tsx`

Đã sửa:

- Lắng nghe `AppState` và refresh lại notification permission khi app quay về `active`.
- Sau `requestPermissionsAsync()` cũng refresh lại trạng thái từ hệ thống thay vì dùng cast trực tiếp.

Kết quả:

- Khi user mở System Settings, thay đổi quyền notification, rồi quay lại app, trạng thái trên Profile được cập nhật lại.

### 3. Auth navigation timeout cleanup

File: `apps/mobile/app/auth.tsx`

Đã sửa:

- Thêm `navigateTimeoutRef`.
- Clear timeout cũ trước khi navigate.
- Cleanup timeout khi component unmount.

Kết quả:

- Tránh điều hướng muộn ngoài ý muốn nếu user rời màn auth trước khi timeout hoàn tất.

Kết quả:

- Typecheck pass.
- Không thấy `P1`.
- Có 2 issue mức `P2` và 1 issue mức `P3`.

## Conclusion

Mức độ nghiêm trọng hiện tại:

- `P1`: không có
- `P2`: có, nên sửa sớm trước release hoặc trước khi QA vòng tiếp theo
- `P3`: có, nên sửa cùng đợt dọn auth flow

Kết luận ngắn:

Commit nhìn chung tốt, có giá trị thật, và không làm vỡ build. Tuy nhiên vẫn còn một vài lỗi hành vi ở notification/auth flow. Chúng không ở mức khẩn cấp kiểu `P1`, nhưng `P2` thì đủ nghiêm trọng để nên xử lý trước khi coi đây là bản hoàn thiện.

----------

# Review of Codex Fixes (by Sonnet)

Date: 2026-03-10
Reviewer: Sonnet (Claude 3.7)
Scope: Đọc toàn bộ code Codex đã apply vào `profile.tsx` và `auth.tsx`, so sánh với 3 findings trong Codex review ở trên.

---

## Fix 1 — Notification permission state

File: `apps/mobile/app/(tabs)/profile.tsx`
Lines reviewed: `104–119`, `121–132`, `240–243`, `725–735`

### Nhận xét

Hướng đi đúng. Codex đã:

- Thêm `'provisional'` vào union type của `notifStatus`.
- Tách hàm `refreshNotificationStatus()` ra riêng, không còn inline `setNotifStatus(status as ...)`.
- Kiểm tra `settings.granted` trước, sau đó `ios?.status === PROVISIONAL`, sau đó mới `DENIED`.
- Map `'enabled'` và `'provisional'` về cùng một nhánh UI "đã cấp quyền".

Cả ba điểm này đều đúng.

### Issue còn sót

Bên trong `refreshNotificationStatus`, Codex đặt tên biến local là `settings`:

```ts
const refreshNotificationStatus = useCallback(async () => {
  const settings = await Notifications.getPermissionsAsync();
  ...
}, []);
```

Tên này **shadow** biến `settings` được destructure từ `useUserSettings()` ở dòng 43:

```ts
const { settings, updateSettings, isLoading: isSettingsLoading } = useUserSettings();
```

Đây là variable shadowing. TypeScript không báo lỗi vì hai biến thuộc hai scope khác nhau, nhưng gây ra:

- Người đọc code dễ nhầm `settings` trong callback đang refer đến user settings.
- Eslint với rule `no-shadow` sẽ warn.
- Maintenance risk khi refactor sau này.

### Fix đã apply bởi Sonnet

Đổi tên biến local từ `settings` thành `perm` trong toàn bộ thân của `refreshNotificationStatus`. Thay đổi gồm 4 dòng:

```diff
  const refreshNotificationStatus = useCallback(async () => {
-   const settings = await Notifications.getPermissionsAsync();
-   if (settings.granted) {
+   const perm = await Notifications.getPermissionsAsync();
+   if (perm.granted) {
      setNotifStatus('enabled');
      return;
    }
-   if (settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
+   if (perm.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
      setNotifStatus('provisional');
      return;
    }
-   if (settings.status === Notifications.PermissionStatus.DENIED) {
+   if (perm.status === Notifications.PermissionStatus.DENIED) {
      setNotifStatus('denied');
      return;
    }
    setNotifStatus('undetermined');
  }, []);
```

**Lý do chọn `perm`**: ngắn, rõ ràng đây là permission result, không xung đột với bất kỳ tên nào trong scope ngoài.

---

## Fix 2 — AppState listener để refresh notification status

File: `apps/mobile/app/(tabs)/profile.tsx`
Lines reviewed: `125–132`

### Nhận xét

Đúng hoàn toàn. Codex đã:

- Subscribe vào `AppState.addEventListener('change', ...)`.
- Chỉ refresh khi `state === 'active'` — đúng, tránh gọi thừa ở các state khác như `background`, `inactive`.
- Cleanup bằng `return () => subscription.remove()` trong `useEffect` — đúng pattern, không leak listener.
- Dependency array `[refreshNotificationStatus]` — đúng, vì `refreshNotificationStatus` là `useCallback` với stable ref.

Không có gì cần sửa thêm ở fix này.

---

## Fix 3 — Auth navigate timeout cleanup

File: `apps/mobile/app/auth.tsx`
Lines reviewed: `52`, `74–80`, `82–92`, `113–116`, `137–140`

### Nhận xét

Đúng và sạch. Codex đã:

- Khai báo `navigateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)` — type-safe, tránh hardcode `number` (vì trên React Native `setTimeout` trả về `NodeJS.Timeout`).
- Thêm cleanup `useEffect` unmount để `clearTimeout` nếu timeout còn pending.
- Cập nhật `navigateBack()` để `clearTimeout` timeout cũ trước khi navigate — đúng, tránh double-navigate nếu user bấm thủ công trong khi timeout đang chạy.
- Lưu timeout id qua `navigateTimeoutRef.current = setTimeout(...)` thay vì bỏ qua return value.

Không có gì cần sửa thêm ở fix này.

---

## Tổng kết review

| Fix | Verdict | Ghi chú |
|---|---|---|
| Notification permission state (P2) | ✅ Đúng hướng | Có 1 variable shadowing đã được sửa bởi Sonnet |
| AppState refresh on foreground (P2) | ✅ Correct, clean | Không cần sửa thêm |
| Auth timeout cleanup (P3) | ✅ Correct, clean | Không cần sửa thêm |

Sau fix của Codex + 1 cleanup bổ sung của Sonnet:

- `P1`: không có
- `P2`: đã resolved
- `P3`: đã resolved

Code hiện tại sạch. Không còn issue tồn đọng ở phạm vi đã review.
---
