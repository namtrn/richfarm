# Git Changes Review — 2026-02-25

> **Branch:** `main` (up-to-date with `origin/main`)
> **Last commit:** `bb25238` — feat: Add Maestro test for library deep links …
> **Scope:** 34 files changed — **+1 270 / −831 lines** (net +439)

---

## Tổng quan thay đổi

| Chủ đề | Mức độ | Files |
|---|---|---|
| RevenueCat / Subscription | ⭐ Major | 8 files (4 new) |
| Delete Account | ⭐ Major | 2 files |
| Premium access & limits | 🔶 Medium | 4 files |
| Pests & Diseases data | 🔶 Medium | 3 files |
| Growing-plant reminders seed | 🔶 Medium | 1 file |
| Profile UI overhaul | 🔶 Medium | 1 file |
| Auth flow (sign-up / sign-in) | 🔸 Minor | 1 file |
| iOS config & pods | 🔸 Minor | 3 files |
| Locales (6 languages) | 🔸 Minor | 6 files |
| Misc cleanup | 🔸 Minor | 5+ files |

---

## 1. RevenueCat / Subscription Integration ⭐

### New files
| File | Mô tả |
|---|---|
| `lib/revenuecat.ts` | Config helper — lấy API key theo platform & environment (test/production), tạo appUserId từ tokenIdentifier hoặc deviceId |
| `lib/access.ts` | Utility `isPremiumActive(user)` — kiểm tra premium dựa trên `user.subscription` |
| `hooks/useSubscription.tsx` | Context provider + hook — configure Purchases SDK, lắng nghe `CustomerInfo`, expose `isPremium`, `refresh()` |
| `hooks/usePaywall.ts` | Hook hiển thị paywall qua RevenueCatUI — xử lý kết quả purchased / restored / cancelled / error |

### Modified files
| File | Thay đổi |
|---|---|
| `app/_layout.tsx` | Wrap app với `<SubscriptionProvider>` |
| `hooks/useAppReady.ts` | Expose thêm `deviceId` cho subscription init |
| `package.json` | Thêm `react-native-purchases` + `react-native-purchases-ui` v8.11.3 |
| `ios/Podfile.lock` | Thêm pods: `RevenueCat 5.32.0`, `RevenueCatUI`, `PurchasesHybridCommon`, `RNPurchases`, `RNPaywalls` |

### Review notes
- ✅ Environment switching (test vs production) được handle tốt
- ✅ Graceful fallback khi API key missing — chỉ warn ở DEV
- ⚠️ `usePaywall.ts` cast `as any` ở 2 chỗ khi gọi `presentPaywallIfNeeded` / `presentPaywall` — có thể do mismatch type definitions giữa SDK versions. Nên verify lại với phiên bản SDK hiện tại.
- ⚠️ `lib/access.ts` sử dụng `any` type cho user — nên define interface rõ ràng hoặc reuse type từ schema.

---

## 2. Delete Account ⭐

### `convex/users.ts` — new mutation `deleteAccount`
Xóa cascade toàn bộ data user:
1. `userPlants` → `plantPhotos` (+ xóa storage file) → `aiAnalysisQueue`
2. `logs`, `harvestRecords` (theo từng plant)
3. `reminders`, `userFavorites`, `beds`, `gardens`
4. `userSettings`, `deviceTokens`
5. `preservationRecipes` + `recipeI18n`
6. Cuối cùng xóa `users` record

### `app/(tabs)/profile.tsx` — "Delete Account" button
- Hiển thị confirmation alert trước khi xóa
- Gọi `api.users.deleteAccount`

### Review notes
- ✅ Cascade xóa thủ công đầy đủ — cover tất cả bảng liên quan
- ⚠️ Mutation chạy nhiều queries tuần tự → với user có nhiều data, có thể timeout. Suggest: batch hoặc dùng `ctx.scheduler` cho heavy work.
- ⚠️ Không có soft-delete / cooldown period — user xóa là mất hết. Cân nhắc thêm grace period cho production.

---

## 3. Premium Access & Limits

### `convex/gardens.ts`
- **Removed** toàn bộ logic check premium khi tạo garden (19 dòng). Free users giờ tạo garden không giới hạn ở backend.

### `convex/plants.ts` — Notes validation
- `addPlant`: throw error nếu gửi `notes` (notes chỉ cho plants đang growing)
- `updatePlantStatus`: clear `notes` khi chuyển khỏi status "growing"
- `updatePlant`: chặn update notes nếu plant không ở status "growing"

### Locales (6 files)
- Cập nhật message `error_limit_free` → thêm "Upgrade to Premium" CTA
- Thêm key mới `error_limit_free_beds` cho giới hạn 3 beds (free users)

### Review notes
- ⚠️ Garden limit đã bị xóa ở backend nhưng bed limit message được thêm ở frontend → kiểm tra lại bed limit logic có còn enforce ở đâu không.
- ✅ Notes validation logic hợp lý — giữ data clean theo business rule.

---

## 4. Pests & Diseases Data

### `convex/data/pestsDiseasesSeed.ts`
- Thêm **5 bệnh mới**: Late Blight, Botrytis (Gray Mold), Bacterial Wilt, Damping-off, và 1 entry khác
- Thêm fallback `imageUrl` (mock images) cho entries thiếu ảnh
- Export `pestsDiseasesSeed` đã map với default images

### `convex/schema.ts`
- Thêm field `imageUrl: v.optional(v.string())` cho bảng `pestsDiseases`

### `convex/seed.ts`
- `seedPestsDiseases`: giờ cũng **update** entries đã tồn tại (trước chỉ insert)
- `seedAll`: tương tự — track cả `updated` count
- **New** `seedGrowingPlantReminders`: tạo mock timeline + reminders cho cây đang growing (planted date, expected harvest)

### Review notes
- ✅ Upsert pattern tốt — seed có thể chạy lại an toàn
- ✅ Mock reminders seeder hữu ích cho dev/demo
- ⚠️ `hashString` dùng unsigned right shift — output deterministic nhưng distribution không uniform. OK cho mock data.

---

## 5. Profile Screen Overhaul

### `app/(tabs)/profile.tsx`
- **Subscription card** mới: hiển thị status (Free/Premium/Not configured) + "Upgrade to Premium" button
- **Auth flow refactor**: tách sign-up và sign-in thành 2 mode riêng (trước hiển thị cả 2 button song song)
- **Delete Account** button (đỏ) với confirmation
- Cleanup: xóa redundant text lines (`current_language`, `unit_current`, `sync_queue_count`)

---

## 6. Các thay đổi khác

| File | Thay đổi |
|---|---|
| `app/(tabs)/health.tsx` | **Deleted** — 507 dòng. Health screen bị xóa hoàn toàn. |
| `app/(tabs)/_layout.tsx` | Xóa 1 dòng (likely health tab reference) |
| `app/(tabs)/bed/[bedId].tsx` | +59 dòng — UI improvements cho bed detail |
| `app/(tabs)/explorer.tsx` | Minor changes (5 lines) |
| `app/(tabs)/garden/[gardenId].tsx` | +68 dòng — garden detail enhancements |
| `app/(tabs)/garden/index.tsx` | +84 dòng — garden list improvements |
| `app/(tabs)/growing.tsx` | +36 dòng changes |
| `app/(tabs)/library.tsx` | +37 dòng changes |
| `app/(tabs)/planning.tsx` | Minor (7 lines) |
| `app/(tabs)/plant/[plantId].tsx` | +66 dòng — plant detail improvements |
| `app.json` | +8 lines — likely RevenueCat or camera config |
| `docs/reports/daily-report-2026-02-21.md` | **Deleted** — renamed/moved |
| `docs/specs/image-storage-strategy.md` | Minor update (5 lines) |
| `ios/MyGarden.xcodeproj/project.pbxproj` | +6 lines project config |
| `ios/MyGarden/Info.plist` | Reformatted + thêm `NSCameraUsageDescription` |
| `hooks/usePestsDiseases.ts` | Fix: bỏ `'skip'` khi không có type filter → always fetch |

### Untracked files (chưa commit)
| File | Mô tả |
|---|---|
| `docs/reports/2026-02-21-daily-report.md` | Daily report (renamed) |
| `docs/reports/2026-02-24-tasks.md` | Task notes |
| `docs/specs/Kotlin+NativeUI.md` | Kotlin migration spec |
| `docs/specs/PLANT_SCAN_RESEARCH.md` | Plant scan API research |
| `docs/specs/REVENUE_CAT-IMPLEMENT.md` | RevenueCat implementation spec |
| `hooks/usePaywall.ts` | (đã review ở trên) |
| `hooks/useSubscription.tsx` | (đã review ở trên) |
| `lib/access.ts` | (đã review ở trên) |
| `lib/revenuecat.ts` | (đã review ở trên) |

---

## ⚠️ Concerns & Solutions

### 1. Type safety — `as any` casts
**Vấn đề:** `usePaywall.ts` cast `as any` 2 chỗ, `lib/access.ts` dùng `any` cho user param, `convex/seed.ts` cast entry `as any`.

**Solution:**
- `usePaywall.ts`: Tạo wrapper type hoặc dùng type assertion cụ thể thay vì `any`. Nếu SDK types chưa match, tạo `@types/overrides.d.ts` declare đúng signature.
- `lib/access.ts`: Define interface `UserWithSubscription` reuse từ Convex schema:
  ```ts
  import type { Doc } from '../convex/_generated/dataModel';
  export function isPremiumActive(user: Doc<'users'> | null): boolean { ... }
  ```
- `convex/seed.ts`: Cast thành `typeof pestsDiseases.$inferInsert` thay vì `any`.

---

### 2. Delete Account performance
**Vấn đề:** Cascade delete chạy tuần tự qua ~10 bảng — user có nhiều data có thể vượt mutation timeout (~10s).

**Solution:**
- **Option A (recommended):** Chuyển sang scheduled action — mutation chính chỉ set `user.status = "deleting"`, sau đó schedule `internalAction` chạy async xóa từng batch:
  ```ts
  // Step 1: Mark user as deleting (fast mutation)
  await ctx.db.patch(user._id, { status: 'deleting' });
  // Step 2: Schedule cleanup
  await ctx.scheduler.runAfter(0, internal.users.cleanupUserData, { userId: user._id });
  ```
- **Option B:** Batch delete — query max 100 records/lần, loop cho đến hết. Mỗi batch là 1 scheduled mutation riêng.
- Frontend: hiện loading state "Deleting your data…" và poll status.

---

### 3. Không có soft-delete / grace period
**Vấn đề:** Xóa tài khoản là permanent ngay lập tức — không có cơ hội khôi phục.

**Solution:**
- Thêm **30-day grace period**: mutation chỉ set `user.deletionRequestedAt = Date.now()`.
- Cron job chạy hàng ngày: xóa thật user nào có `deletionRequestedAt` > 30 ngày.
- User có thể cancel deletion bằng cách đăng nhập lại trong 30 ngày.
- Profile hiện banner cảnh báo: "Your account will be deleted on {date}. Tap to cancel."
- **App Store / Google Play requirement:** cả 2 store đều yêu cầu có account deletion, nhưng grace period là best practice.

---

### 4. Garden limit inconsistency
**Vấn đề:** Backend đã bỏ garden limit (xóa 19 dòng check premium ở `createGarden`), nhưng frontend vẫn có locale key `error_limit_free` và thêm `error_limit_free_beds`.

**Solution:**
- **Audit:** Grep toàn bộ codebase tìm nơi sử dụng `error_limit_free` và `GARDEN_LIMIT_FREE`:
  ```bash
  grep -r "error_limit_free\|GARDEN_LIMIT_FREE" --include="*.ts" --include="*.tsx"
  ```
- Nếu limit đã hoàn toàn move sang RevenueCat-based check ở frontend → xóa dead code locale keys cũ.
- Nếu limit cần enforce → thêm lại check ở backend dùng `isPremiumActive()` hoặc check RevenueCat entitlement server-side.
- Bed limit (`error_limit_free_beds`) cần có backend enforcement tương ứng trong `convex/beds.ts` — verify nó tồn tại.

---

### 5. Health screen đã xóa — cần xác nhận migration
**Vấn đề:** `health.tsx` (507 dòng) bị xóa, tab reference cũng bị xóa ở `_layout.tsx`. Không rõ content đã migrate hay feature bị retire.

**Solution:**
- **Check:** So sánh features trong `health.tsx` với các screen hiện tại:
  - Pests & Diseases list → đã có trong `explorer.tsx`?
  - Health tips / notifications → đã merge vào Home?
- Nếu feature bị retire: cập nhật documentation, xóa related dead code (components, hooks nếu còn reference).
- Nếu feature sẽ quay lại: tạo issue/task note để không quên.

---

### 6. Untracked files chưa commit
**Vấn đề:** 9 files chưa được `git add`, bao gồm 4 files RevenueCat core cần thiết cho app chạy.

**Solution:**
Commit theo 2 nhóm logic:
```bash
# Commit 1: RevenueCat integration
git add hooks/usePaywall.ts hooks/useSubscription.tsx lib/access.ts lib/revenuecat.ts
git commit -m "feat: add RevenueCat subscription hooks and utilities"

# Commit 2: Documentation
git add docs/reports/2026-02-21-daily-report.md docs/reports/2026-02-24-tasks.md \
       docs/specs/Kotlin+NativeUI.md docs/specs/PLANT_SCAN_RESEARCH.md \
       docs/specs/REVENUE_CAT-IMPLEMENT.md
git commit -m "docs: add daily reports and feature specs"
```

---

### 7. iOS camera permission wording
**Vấn đề:** `NSCameraUsageDescription` = "Allow access to the camera to identify your plants." — cần đảm bảo phù hợp App Store guidelines.

**Solution:**
- Apple yêu cầu message **cụ thể** giải thích tại sao app cần camera. Current wording OK nhưng nên improve:
  ```
  "$(PRODUCT_NAME) uses your camera to scan and identify plants, detect diseases, and track your garden's health."
  ```
- Đảm bảo `NSPhotoLibraryUsageDescription` cũng có wording phù hợp (hiện tại: "Allow $(PRODUCT_NAME) to access your photos" — nên thêm lý do cụ thể).
- Test trên thiết bị thật: verify permission dialog hiển thị đúng trước khi submit App Store.

---

## ✅ Điểm tích cực

- RevenueCat integration thiết kế clean với separation of concerns tốt
- Delete account cascade thoroughness — cover all related tables
- Upsert pattern cho seed data — idempotent và an toàn
- Notes validation đảm bảo data integrity theo business logic
- Multi-language support cập nhật đồng bộ cho tất cả 6 languages

---

## ✅ Codex Assessment — Review Quality & Gaps

### Điểm mạnh của bản review
- Cấu trúc rõ ràng, chia theo chủ đề lớn, dễ đọc và dễ theo dõi impact.
- Đã nêu đúng các risk lớn (RevenueCat type safety, delete account performance, limit inconsistency).
- Có giải pháp cụ thể, khả thi (scheduled action, batch delete, grace period).

### Các điểm còn thiếu / cần làm rõ thêm
- **Server-side entitlement validation:** Review chưa nhắc việc kiểm tra premium ở backend theo RevenueCat entitlement (hoặc receipt validation). Nếu backend vẫn chấp nhận client flag, có risk bypass. Cần xác nhận nguồn truth phía server.
- **User identity linkage:** `appUserId` tạo từ `tokenIdentifier`/`deviceId` có thể gây vấn đề khi user login/logout hoặc đổi thiết bị. Review nên kiểm tra flow “anonymous → logged-in” có bị split/merge subscriptions không.
- **Lifecycle & listener cleanup:** `useSubscription` đăng ký listener `CustomerInfo` — cần kiểm tra có cleanup/unsubscribe khi unmount để tránh memory leak.
- **Testing/QA coverage:** Review chưa đề cập test plan (unit, e2e, Maestro), đặc biệt cho paywall flow, restore purchase, delete account.
- **Migration/rollout:** Với việc xóa `health` tab, review nên xác nhận release note và migration plan (feature retire vs relocate).
- **Build/CI readiness:** Untracked files bao gồm core RevenueCat code; review nên nhấn mạnh cần add vào git trước khi CI chạy.

### Đề xuất bổ sung vào report
- Thêm mục **"Backend enforcement"**: xác nhận mọi limit/premium gate được enforce server-side.
- Thêm mục **"RevenueCat identity strategy"**: document rõ cách link/restore subscription giữa anonymous và account.
- Thêm mục **"Testing checklist"** cho các flow mới (Purchase, Restore, Cancel, Delete Account).

---

## 📝 Phản hồi cho Codex Assessment

### RE: Server-side entitlement validation

Đúng — hiện tại backend (`convex/gardens.ts`) đã **xóa hoàn toàn** premium check, tức free user tạo garden không giới hạn. Các limit chỉ còn enforce ở frontend qua locale messages.

**Action plan:**
- Tạo shared utility `convex/lib/premium.ts`:
  ```ts
  export async function requirePremiumOrLimit(
    ctx: QueryCtx,
    userId: Id<"users">,
    table: string,
    freeLimit: number
  ) {
    const user = await ctx.db.get(userId);
    if (isPremiumActive(user)) return;
    const count = await ctx.db
      .query(table)
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
    if (count.length >= freeLimit) {
      throw new Error(`${table.toUpperCase()}_LIMIT_FREE`);
    }
  }
  ```
- Gọi `requirePremiumOrLimit(ctx, user._id, "gardens", 1)` trong `createGarden`
- Gọi `requirePremiumOrLimit(ctx, user._id, "beds", 3)` trong `createBed`
- **Không bao giờ** chỉ trust client-side check — server phải là source of truth.

---

### RE: User identity linkage (anonymous → logged-in)

Hiện tại `getRevenueCatAppUserId()` trả về:
1. `tokenIdentifier` nếu user đã đăng nhập
2. `device:{deviceId}` nếu anonymous

**Rủi ro:** Khi user anonymous mua subscription → login → `appUserId` thay đổi → RevenueCat coi là 2 user khác nhau → mất subscription.

**Action plan:**
- Khi user login lần đầu (chuyển từ anonymous → authenticated):
  ```ts
  // Trong useSubscription, khi appUserId thay đổi:
  const { customerInfo } = await Purchases.logIn(newAppUserId);
  // RevenueCat sẽ tự transfer/merge subscriptions
  ```
- Hiện code đã có logic `Purchases.logIn(nextUserId)` trong `useEffect` — ✅ **đã handle đúng**.
- Tuy nhiên, cần verify edge case: user A login → user B login trên cùng device → subscription không bị leak giữa 2 account. RevenueCat `logIn` tự handle việc này → OK.
- **Restore purchases:** Thêm button "Restore Purchases" trong profile (gọi `Purchases.restorePurchases()`) cho user đổi device.

---

### RE: Lifecycle & listener cleanup

Đã kiểm tra code `useSubscription.tsx`:

```tsx
useEffect(() => {
  // ...
  purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    purchases.removeCustomerInfoUpdateListener?.(listener);
  };
}, [isConfigured, refresh]);
```

✅ **Cleanup đã có** — `removeCustomerInfoUpdateListener` được gọi trong cleanup function của `useEffect`. Optional chaining (`?.`) được dùng vì method có thể không tồn tại trên một số phiên bản SDK cũ → safe.

**Lưu ý nhỏ:** `SubscriptionProvider` wrap ở root `_layout.tsx` nên thực tế sẽ không unmount trong suốt lifecycle của app. Cleanup chỉ kích hoạt khi `isConfigured` hoặc `refresh` thay đổi (re-subscribe listener mới).

---

### RE: Testing/QA coverage

**Testing checklist cho các flow mới:**

| Flow | Test type | Mô tả | Priority |
|---|---|---|---|
| Purchase subscription | Manual / Sandbox | Mua qua RevenueCat sandbox, verify `isPremium` = true | 🔴 High |
| Restore purchases | Manual / Sandbox | Xóa app → cài lại → tap Restore → verify entitlement | 🔴 High |
| Cancel subscription | Manual / Sandbox | Cancel trong App Store settings → verify app reflect | 🟡 Medium |
| Paywall display | Maestro E2E | Tap "Upgrade" → paywall hiển thị đúng offering | 🟡 Medium |
| Delete account | Maestro E2E | Login → Delete → confirm → verify user data cleared | 🔴 High |
| Delete account (heavy data) | Load test | Tạo user với 100+ plants, 500+ photos → delete → no timeout | 🟡 Medium |
| Anonymous → Login subscription | Manual | Mua khi anonymous → login → subscription vẫn active | 🔴 High |
| Notes validation | Unit test | `addPlant` với notes → throw, `updatePlant` growing + notes → OK | 🟢 Low |
| Pests/Diseases seed idempotent | Unit test | Run `seedAll` 2 lần → no duplicates, updated count correct | 🟢 Low |

**Maestro test files cần tạo:**
- `tests/e2e/delete-account.yaml`
- `tests/e2e/paywall-display.yaml`

---

### RE: Migration/rollout — Health tab

`health.tsx` (507 dòng) đã bị xóa. Sau khi kiểm tra diff:

- **Pests & Diseases listing** → đã có trong `explorer.tsx` (tab Explorer hiển thị danh sách pests/diseases)
- **Health tab reference** → đã xóa khỏi `_layout.tsx`
- `usePestsDiseases` hook vẫn tồn tại và được cập nhật → data layer vẫn active

**Kết luận:** Feature đã **relocate** sang Explorer, không phải retire. Khuyến nghị:
- Thêm 1 dòng trong commit message hoặc CHANGELOG: _"Health tab merged into Explorer tab"_
- Verify: mở Explorer tab → pests/diseases content hiển thị đầy đủ

---

### RE: Build/CI readiness

9 untracked files **phải** được commit trước khi merge/CI chạy, đặc biệt:

| File | Impact nếu thiếu |
|---|---|
| `hooks/usePaywall.ts` | ❌ Build fail — imported by `profile.tsx` |
| `hooks/useSubscription.tsx` | ❌ Build fail — imported by `_layout.tsx` |
| `lib/access.ts` | ❌ Build fail — imported by screens |
| `lib/revenuecat.ts` | ❌ Build fail — imported by `useSubscription` |
| `docs/specs/*` | ⚠️ No build impact — documentation only |

**Immediate action:**
```bash
git add hooks/usePaywall.ts hooks/useSubscription.tsx lib/access.ts lib/revenuecat.ts
git add docs/
git commit -m "feat: add RevenueCat subscription system and documentation"
```
