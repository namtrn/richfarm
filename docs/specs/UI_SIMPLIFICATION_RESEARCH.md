# Nghiên cứu: Tối giản UI cho Gardener / Hobbyist

> **Mục tiêu**: Phân tích khả thi và so sánh 2 hướng tiếp cận — (A) tối giản UI trong cùng 1 app với 2 mode (🌾 **Farmer** / 🌿 **Gardener**) vs (B) xây app riêng cho Gardener.

---

## 1. Bối cảnh hiện tại

### App Richfarm đang hướng tới:
- **Farm / Food Production / Off-grid / Homestead** — hệ thống quản lý farm chuyên nghiệp.
- Onboarding 5 bước phân loại user (mục tiêu farm, quy mô, kinh nghiệm…).
- Schema đã có field `userSettings.onboarding` lưu `goals`, `experience`, `scaleEnvironment`.

### Cấu trúc tabs hiện tại:

| Tab | Chức năng | Dùng cho Gardener? |
|-----|-----------|:---:|
| **Home** | Dashboard, overview reminders, weather | ✅ Dùng được |
| **Garden** | Quản lý garden → bed → plant hierarchy | ⚠️ Quá phức tạp cho hobbyist |
| **Library** | Browse/search cây, pests & diseases | ✅ Dùng được |
| **Reminder** | Nhắc tưới, bón, thu hoạch | ✅ Dùng được |
| **Profile** | Settings, paywall, preferences | ✅ Dùng được |

### Hidden routes (truy cập từ trong app):
- **Planning** — Thêm cây, scan AI, lifecycle planning
- **Growing** — Theo dõi cây đang trồng, harvest
- **Explorer** — Tìm kiếm nâng cao

### Convex backend tables:
`users`, `gardens`, `beds`, `userPlants`, `reminders`, `plantsMaster`, `plantI18n`, `plantPhotos`, `logs`, `harvestRecords`, `preservationRecipes`, `pestsDiseases`, `plantGroups` — **13 tables chính**.

---

## 2. Gardener/Hobbyist cần gì?

Người trồng cây hobby/ban công/indoor chỉ cần:

| Feature | Mô tả |
|---------|--------|
| **Thêm cây** | Nhanh, 1-2 trường, hoặc scan ảnh |
| **Nhắc tưới** | Đơn giản, không cần recurrence phức tạp |
| **Xem thông tin cây** | Care tips, ánh sáng, đất, nước |
| **Theo dõi cây** | Danh sách cây tôi đang trồng |

**KHÔNG cần**: Garden → Bed hierarchy, harvest logging, preservation recipes, farm analytics, business module, sensor integrations, planting calendar phức tạp.

---

## 3. So sánh 2 hướng tiếp cận

### Hướng A: Tối giản UI trong cùng 1 app (Adaptive UI)

**Cách làm**: App có **2 mode rõ ràng** — 🌾 **Farmer** và 🌿 **Gardener**. User chọn mode trong onboarding hoặc chuyển đổi bất kỳ lúc nào trong Profile.

```
🌿 Gardener mode (hobby, ban công, indoor, người mới):
→ My Plants (flat list), Simple Reminders, Library, Plant Scanner
→ Ẩn: Garden/Bed hierarchy, harvest records, business module

🌾 Farmer mode (farm, food production, off-grid, homestead):
→ Full: Garden → Bed → Plant, Planning, Growing, Harvest, Analytics
→ Tất cả tính năng nâng cao
```

#### Chi phí ước tính:

| Hạng mục | Effort | Chi tiết |
|----------|--------|----------|
| Thêm field `appMode: "farmer" \| "gardener"` | 🟢 Thấp | 1 field trong `userSettings` |
| Conditional rendering tabs theo mode | 🟢 Thấp | `_layout.tsx` kiểm tra `appMode` |
| Đơn giản hóa Planning screen | 🟡 Trung bình | Ẩn bed selection, advanced fields |
| Đơn giản hóa Reminder form | 🟡 Trung bình | Preset templates thay vì full form |
| Feature flags cho hidden routes | 🟢 Thấp | Redirect hoặc ẩn nút |
| Testing 2 mode paths | 🟡 Trung bình | Cần test cả Farmer + Gardener mode |
| **Tổng** | **~3-5 ngày** | Phần lớn là UI conditional + testing |

#### Ưu điểm:
- ✅ **Một codebase duy nhất** — dễ maintain
- ✅ **User có thể chuyển mode** Gardener ↔ Farmer bất kỳ lúc nào
- ✅ **Shared backend** — không duplicate API, schema, auth
- ✅ **Ít effort hơn nhiều** so với app riêng
- ✅ **Onboarding data đã có sẵn** trong schema

#### Nhược điểm:
- ⚠️ Code phức tạp hơn do nhiều conditional
- ⚠️ Rủi ro "feature creep" — Gardener mode dần trở nên phức tạp
- ⚠️ UI có thể không tối ưu 100% cho hobbyist (vẫn kế thừa layout farm-centric)

---

### Hướng B: Xây app riêng cho Gardener

**Cách làm**: Tạo 1 Expo project mới, UI nhẹ hơn, chỉ giữ những tính năng core.

#### Chi phí ước tính:

| Hạng mục | Effort | Chi tiết |
|----------|--------|----------|
| Setup Expo project mới | 🟡 Trung bình | Config, navigation, theme, i18n |
| Auth + Convex setup | 🟡 Trung bình | Có thể reuse backend nhưng vẫn cần config |
| UI screens (4-5 màn) | 🔴 Cao | Home, My Plants, Add Plant, Plant Detail, Reminders |
| Reuse hooks/lib | 🟡 Trung bình | Extract shared package hoặc copy |
| Plant Library UI | 🟡 Trung bình | Rebuild search/filter/detail |
| App Store submission riêng | 🔴 Cao | Review, metadata, screenshots × 2 platforms |
| Maintain 2 codebases | 🔴 Rất cao | Bug fixes, updates, API changes cần sync |
| **Tổng** | **~3-6 tuần** | Gấp 5-8x effort so với Hướng A |

#### Ưu điểm:
- ✅ **UI tối ưu hoàn toàn** cho gardener
- ✅ **Codebase sạch**, không có conditional phức tạp
- ✅ **Brand riêng** — marketing/positioning rõ ràng hơn
- ✅ **App nhẹ hơn** (bundle size nhỏ hơn)

#### Nhược điểm:
- ❌ **Cost gấp 5-8x** so với adaptive UI
- ❌ **2 codebase maintain** — mọi bug fix / API change cần làm 2 lần
- ❌ **2 App Store listings** — review, update, screenshots
- ❌ **User phải chuyển app** nếu muốn nâng cấp
- ❌ **Backend chia sẻ phức tạp** — cần monorepo hoặc shared package
- ❌ **Không tận dụng được code đã viết** (home, library, reminder đã hoàn thiện)

---

## 4. Ma trận quyết định

| Tiêu chí | Hướng A (Adaptive UI) | Hướng B (App riêng) |
|----------|:---:|:---:|
| Effort phát triển | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| Effort bảo trì | ⭐⭐⭐⭐ | ⭐⭐ |
| UX tối ưu cho gardener | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Upgrade path cho user | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| Tách biệt brand | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| Tận dụng code hiện tại | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| Thời gian ra mắt | ⭐⭐⭐⭐⭐ | ⭐⭐ |

---

## 5. Đề xuất

> [!IMPORTANT]
> **Khuyến nghị: Hướng A — Adaptive UI trong cùng 1 app.**

### Lý do:
1. **Effort thấp hơn 5-8 lần** — 3-5 ngày vs 3-6 tuần.
2. **Schema đã sẵn sàng** — `userSettings.onboarding` đã có `goals`, `experience`, `scaleEnvironment`.
3. **Screens đã có** — Home, Library, Reminder hoạt động tốt cho cả 2 đối tượng.
4. **Switch mode tự nhiên** — user có thể chuyển giữa 🌿 Gardener ↔ 🌾 Farmer bất kỳ lúc nào.
5. **Một codebase** = một lần fix bug, một lần submit App Store.

### Khi nào nên chọn Hướng B?
Chỉ cân nhắc tách app riêng khi **đồng thời** đạt các điều kiện sau:
- Gardener cohort có **retention/LTV đủ mạnh**, chứng minh sản phẩm độc lập.
- Cần **brand/positioning tách biệt** rõ ràng (kênh acquisition khác hẳn).
- Có đủ **nguồn lực vận hành 2 codebase** dài hạn.

### Cách triển khai đề xuất:

```
userSettings.appMode = "gardener" | "farmer" (default: dựa trên onboarding)
```

#### 🌿 Gardener Mode (hobby, người mới, ban công, indoor)

```
├── Home (giữ nguyên — weather + today's tasks)
├── My Plants (flat list, không cần garden/bed hierarchy)
│   ├── Thêm cây nhanh (tên + scan ảnh)
│   └── Xem care info cơ bản
├── Library (giữ nguyên — browse/search/filter)
├── Reminder (simplified — preset templates, không RRULE)
└── Profile (thêm toggle 🌿 Gardener ↔ 🌾 Farmer)
```

**Ẩn**: Garden/Bed management, Planning screen nâng cao, Growing/Harvest tracking, Explorer, Preservation recipes, Business analytics.

#### 🌾 Farmer Mode (farm, food production, off-grid, homestead)

```
├── Home (giữ nguyên + farm dashboard mở rộng)
├── Garden → Bed → Plant (full hierarchy)
│   ├── Garden layout canvas
│   ├── Bed management (raised, container, in-ground…)
│   └── Plant lifecycle (planning → growing → harvested)
├── Library (giữ nguyên + companion planting info)
├── Reminder (full form — RRULE, bed-level, smart batching)
├── Planning / Growing / Explorer (full access)
├── Harvest log + preservation recipes
└── Profile (full settings + farm analytics)
```

**Tất cả tính năng** đều available.

### Cụ thể file cần thay đổi:

| File | Thay đổi |
|------|----------|
| `convex/schema.ts` | Thêm `appMode: "farmer" \| "gardener"` vào `userSettings` |
| `convex/userSettings.ts` | Mutation update `appMode` |
| `app/(tabs)/_layout.tsx` | Hiện/ẩn tabs dựa trên Farmer vs Gardener mode |
| `app/(tabs)/planning.tsx` | Ẩn bed selection, advanced fields khi Gardener |
| `app/(tabs)/reminder.tsx` | Simplified form cho Gardener mode |
| `app/(tabs)/garden/index.tsx` | Đổi thành flat "My Plants" khi Gardener |
| `app/(tabs)/profile.tsx` | Toggle 🌿 Gardener ↔ 🌾 Farmer |
| Onboarding screens | Auto-set `appMode` dựa trên answers |
| Analytics events | Track `mode_switch`, `unassigned_count`, `bed_reminder_completed_in_gardener` |

---

## 6. Xử lý xung đột khi chuyển Farmer → Gardener

> [!WARNING]
> Khi user chuyển từ 🌾 Farmer sang 🌿 Gardener, dữ liệu Garden/Bed **không bị xóa** — chỉ **ẩn khỏi UI**. Đây là nguyên tắc cốt lõi: **mode chỉ thay đổi giao diện, không thay đổi dữ liệu**.

### 6.1. Nguyên tắc chung

| Nguyên tắc | Mô tả |
|-------------|--------|
| **Không xóa dữ liệu** | Gardens, beds, harvest records vẫn giữ nguyên trong DB |
| **Ẩn, không phá** | UI Gardener chỉ ẩn phần Garden/Bed hierarchy, không alter data |
| **Chuyển lại bất kỳ lúc nào** | User switch về Farmer → thấy lại toàn bộ dữ liệu cũ |
| **Reminder vẫn chạy** | Ngay cả khi ẩn bed, reminders liên kết với bed vẫn hoạt động |
| **Invariants rõ ràng** | `bedId` là optional trong Gardener; mọi query Gardener không filter theo `bedId` |

### 6.2. Cây (userPlants) — từ Garden/Bed sang flat list

Khi Gardener mode, tab "My Plants" hiển thị **flat list tất cả cây**, bỏ qua hierarchy:

```
Farmer mode:                          Gardener mode:
Garden A                              My Plants (flat list)
├── Bed 1                             ├── 🌿 Basil
│   ├── 🌿 Basil                     ├── 🍅 Cà chua
│   └── 🍅 Cà chua                   ├── 🌶️ Ớt
├── Bed 2                             ├── 🥬 Rau muống
│   └── 🌶️ Ớt                       └── 🌸 Hoa hồng
Garden B
├── Bed 3
│   └── 🥬 Rau muống
└── (no bed)
    └── 🌸 Hoa hồng
```

**Xử lý cụ thể:**

| Tình huống | Giải pháp |
|------------|-----------|
| Cây có `bedId` | Vẫn giữ `bedId` trong DB, nhưng UI không hiển thị bed info |
| Cây thuộc nhiều garden (qua bed) | Query tất cả `userPlants` theo `userId`, ignore garden/bed grouping |
| Thêm cây mới ở Gardener mode | Tạo `userPlant` **không có** `bedId` — cây "loose" |
| Chuyển về Farmer | Cây loose hiển thị ở section **"Unassigned Plants" (Chưa phân bổ)** |

### 6.3. Reminders — bed-level vs plant-level

| Loại reminder | Gardener mode |
|---------------|---------------|
| Reminder gắn với `userPlantId` | ✅ Hiển thị bình thường |
| Reminder gắn với `bedId` | ⚠️ Vẫn hiển thị, nhưng **ẩn label bed** — chỉ hiện title + danh sách cây (rút gọn nếu nhiều) |
| Reminder chưa gắn plant/bed | ✅ Hiển thị bình thường |
| Tạo reminder mới (Gardener) | Chỉ cho chọn plant, **không cho chọn bed** |
| Format push message | Dựa trên `userSettings.appMode` tại **thời điểm gửi**, không phải lúc tạo |

**Không có data loss**: reminder bed-level vẫn fire đúng giờ, user vẫn thấy và complete được.

### 6.4. Harvest records & Activity logs

| Dữ liệu | Gardener mode |
|----------|---------------|
| `harvestRecords` | Ẩn section "Harvest Log" — dữ liệu giữ nguyên |
| `logs` (activity) | Ẩn detailed logs — giữ lại basic history nếu cần |
| `preservationRecipes` | Ẩn hoàn toàn |

Khi chuyển về Farmer → tất cả harvest history hiện lại, không mất gì.

### 6.5. Edge cases cần lưu ý

| Edge case | Rủi ro | Giải pháp |
|-----------|--------|-----------|
| User tạo cây ở Gardener (no bed), chuyển Farmer | Cây "lơ lửng" không thuộc bed nào | Hiện section "Unassigned Plants" trong Farmer mode, cho phép kéo vào bed |
| User có 50+ cây, flat list quá dài | UX kém khi scroll | Thêm search/filter trong My Plants + group theo status (planning/growing) |
| Reminder bed-level mất context ở Gardener | User không hiểu "Tưới Bed 2" là gì | Hiển thị kèm danh sách cây trong bed: "Tưới: Basil, Cà chua (2 cây)" |
| User xóa app data / logout rồi login lại | Mode preference mất? | Lưu `appMode` trên server (`userSettings`), không chỉ local |
| User đang ở Farmer, có nhiều gardens, chuyển Gardener | Cây từ nhiều gardens trộn lẫn | Flat list + optional garden badge nhỏ: "🌿 Basil · Garden A" (faded, subtle) |
| Notification push cho bed-level reminder | Push message đề cập bed mà Gardener không thấy | Format push message theo mode: Farmer → "Tưới Bed 2", Gardener → "Tưới Basil, Cà chua" |
| Bed bị xóa trong Farmer nhưng còn reminder | Reminder trở thành "orphaned" | Auto chuyển sang plant-level (nếu map được), hoặc vẫn chạy nhưng ẩn context |
| Bed có 0 cây nhưng còn reminder | Label hiển thị rỗng hoặc gây hiểu nhầm | Hiển thị "Tưới bed (0 cây)" hoặc "Tưới bed (chưa có cây)" |

### 6.6. Confirmation UX khi chuyển mode

```
┌─────────────────────────────────────┐
│  Chuyển sang 🌿 Gardener mode?     │
│                                     │
│  • Dữ liệu Gardens & Beds được     │
│    giữ nguyên, chỉ ẩn khỏi UI.     │
│  • Cây sẽ hiển thị dạng flat list. │
│  • Bạn có thể chuyển lại bất kỳ    │
│    lúc nào trong Settings.          │
│                                     │
│  [Hủy]              [Chuyển mode]   │
└─────────────────────────────────────┘
```

> [!TIP]
> **Quy tắc vàng**: Mode chỉ là "lens" (ống kính) nhìn vào cùng một bộ dữ liệu. Không bao giờ xóa, di chuyển, hoặc thay đổi structure của data khi switch mode.

### 6.7. Ghi chú kỹ thuật tối thiểu
- Mutation tạo cây ở Gardener: cho phép `bedId` null/undefined, validate server-side tương ứng.
- User cũ chưa có `appMode`: auto-derive từ onboarding hoặc prompt chọn mode lần đầu.

---

## 7. Kết luận

| | Hướng A | Hướng B |
|--|---------|---------|
| **Phức tạp?** | 🟢 Không phức tạp | 🔴 Rất phức tạp |
| **Thời gian** | 3-5 ngày | 3-6 tuần |
| **Khuyến nghị** | ✅ **Nên chọn** | ❌ Không khuyến nghị ở giai đoạn này |

App sẽ có **2 mode chính thức**: 🌾 **Farmer** (farm, food production, off-grid) và 🌿 **Gardener** (hobby, ban công, indoor). User chọn mode trong onboarding và có thể chuyển đổi bất kỳ lúc nào trong Profile. Nếu sau này có nhu cầu branding riêng, khi đó mới cần tách app.

---

*Tài liệu tạo: 2026-03-03*
*Tham khảo: `APP_FUNCTIONAL_PLAN.md`, `BA_REQUIREMENTS.md`, `onboarding implementation plan.md`, `convex/schema.ts`*
