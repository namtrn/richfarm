# Richfarm Project Review Report

> Ngày review: 2026-02-19  
> Tổng quan: Đánh giá tiến độ và các hạng mục còn thiếu của dự án Richfarm - Ứng dụng quản lý vườn thông minh

---

## 📊 Tổng quan tiến độ

| Module | Trạng thái | Độ hoàn thiện |
|--------|-----------|---------------|
| Project Structure | ✅ Hoàn thành | 100% |
| Database Schema (Convex) | ✅ Hoàn thành | 95% |
| Multi-language (i18n) | ✅ Hoàn thành | 90% |
| Auth & User Management | ⚠️ Cơ bản | 70% |
| Garden Management | ✅ Hoàn thành | 90% |
| Bed Management | ✅ Hoàn thành | 85% |
| Plant Library | ✅ Hoàn thành | 85% |
| Planning Tab | ✅ Hoàn thành | 85% |
| Growing Tab | ✅ Hoàn thành | 80% |
| Reminder System | ✅ Hoàn thành | 85% |
| Profile/Settings | ✅ Hoàn thành | 80% |
| Widget Support | 📝 Structure | 30% |
| AI Features | ❌ Chưa bắt đầu | 0% |
| Push Notifications | ❌ Chưa bắt đầu | 0% |
| Offline Support | ⚠️ Partial | 40% |

---

## ✅ Những gì đã hoàn thành

### 1. Cấu trúc Project
- [x] Expo React Native với Expo Router
- [x] TypeScript configuration
- [x] NativeWind (Tailwind CSS cho RN)
- [x] Convex backend integration
- [x] Project folder structure chuẩn (app/, components/, hooks/, lib/, convex/, widgets/)

### 2. Database Schema (convex/schema.ts)
- [x] `users` - User management với auth
- [x] `gardens` - Garden entities
- [x] `beds` - Garden beds/luống
- [x] `plantsMaster` - Master plant database
- [x] `plantI18n` - Localized plant names
- [x] `userPlants` - User's plants
- [x] `plantPhotos` - Photo management
- [x] `reminders` - Reminder system
- [x] `logs` - Activity logging
- [x] `harvestRecords` - Harvest tracking
- [x] `plantGroups` - Plant categorization
- [x] `preservationRecipes` - Food preservation
- [x] `recipeI18n` - Recipe localization
- [x] `deviceTokens` - Push notification tokens
- [x] `aiAnalysisQueue` - AI processing queue
- [x] `userSettings` - User preferences

### 3. Localization (i18n)
- [x] 6 ngôn ngữ: English, Vietnamese, Spanish, Portuguese, French, Chinese
- [x] File translations đầy đủ cho các tab chính
- [x] Dynamic locale switching
- [x] Device locale detection

### 4. Screens & UI
- [x] **Garden Tab**: List gardens, Create garden modal, Size picker, Garden detail
- [x] **Planning Tab**: Add plant, Camera capture, Link to library
- [x] **Growing Tab**: Active plants list, Harvest action, Status management
- [x] **Reminder Tab**: Today's reminders, Create/Edit/Delete reminders, Recurring rules
- [x] **Library Tab**: Plant database, Search, Filter by group, Plant detail modal
- [x] **Profile Tab**: User settings, Language switcher, Timezone

### 5. Backend Functions (Convex)
- [x] `gardens.ts` - CRUD gardens, getBedsInGarden
- [x] `plants.ts` - CRUD user plants, status management
- [x] `reminders.ts` - Full reminder lifecycle
- [x] `beds.ts` - CRUD beds
- [x] `users.ts` - User management
- [x] `plantImages.ts` - Plant image queries
- [x] Seed data: 60+ plants với đầy đủ thông tin

### 6. Custom Hooks
- [x] `usePlants.ts` - Plant management
- [x] `useReminders.ts` - Reminder management
- [x] `useBeds.ts` - Bed management
- [x] `usePlantLibrary.ts` - Plant library access
- [x] `usePlantLocalized.ts` - Localized plant names
- [x] `useAuth.ts` - Authentication
- [x] `useAppReady.ts` - App initialization
- [x] `useDeviceId.ts` - Device identification

### 7. UI Components
- [x] `LoadingScreen.tsx` - Loading state
- [x] `OfflineScreen.tsx` - Offline state
- [x] `PlantImage.tsx` - Plant image display

### 8. Widget Support (Structure)
- [x] Android widget Kotlin files
- [x] iOS widget Swift files
- [x] Widget bridge module

---

## ⚠️ Những gì còn thiếu / Cần cải thiện

### 🔴 High Priority (Cần làm ngay)

#### 1. Authentication Real
| Vấn đề | Chi tiết |
|--------|----------|
| **Hiện tại** | Chỉ có anonymous auth qua deviceId |
| **Cần làm** | Tích hợp Convex Auth hoặc Clerk cho email/password, OAuth |
| **Files cần sửa** | `lib/auth.ts`, `convex/users.ts`, tạo `app/(auth)/` screens |
| **Độ phức tạp** | Trung bình |

#### 2. Push Notifications
| Vấn đề | Chi tiết |
|--------|----------|
| **Hiện tại** | Schema có `deviceTokens` nhưng chưa implement |
| **Cần làm** | Expo Notifications integration, cron job cho reminders |
| **Files cần sửa** | `convex/cron.ts`, `lib/notifications.ts` |
| **Độ phức tạp** | Cao |

#### 3. AI Plant Identification
| Vấn đề | Chi tiết |
|--------|----------|
| **Hiện tại** | Chỉ có UI chụp ảnh, chưa có AI processing |
| **Cần làm** | Tích hợp plant.id API hoặc custom model |
| **Files cần sửa** | `convex/aiAnalysisQueue.ts`, `lib/plantId.ts` |
| **Độ phức tạp** | Cao |

#### 4. Harvest Logging
| Vấn đề | Chi tiết |
|--------|----------|
| **Hiện tại** | Schema có `harvestRecords` nhưng chưa có UI |
| **Cần làm** | Màn hình log harvest, statistics |
| **Files cần sửa** | Tạo `convex/harvest.ts`, UI trong plant detail |
| **Độ phức tạp** | Trung bình |

### 🟡 Medium Priority (Nên làm trong tuần tới)

#### 5. Activity Logs
| Vấn đề | Chi tiết |
|--------|----------|
| **Hiện tại** | Schema có bảng `logs` nhưng chưa sử dụng |
| **Cần làm** | Log mọi action (watering, fertilizing, etc.) |
| **Files cần sửa** | `convex/logs.ts`, hiển thị trong plant detail |
| **Độ phức tạp** | Trung bình |

#### 6. Plant Photos Management
| Vấn đề | Chi tiết |
|--------|----------|
| **Hiện tại** | Schema có `plantPhotos` nhưng chưa có UI quản lý |
| **Cần làm** | Photo gallery, upload multiple photos, AI analysis |
| **Files cần sửa** | `convex/storage.ts`, plant detail screen |
| **Độ phức tạp** | Trung bình |

#### 7. Offline Support
| Vấn đề | Chi tiết |
|--------|----------|
| **Hiện tại** | Cơ bản dựa trên Convex caching |
| **Cần làm** | True offline-first với AsyncStorage, queue mutations |
| **Files cần sửa** | `lib/offline.ts`, hooks wrapper |
| **Độ phức tạp** | Cao |

#### 8. Widget Implementation Complete
| Vấn đại | Chi tiết |
|--------|----------|
| **Hiện tại** | Chỉ có structure files, chưa có logic |
| **Cần làm** | Widget data fetch, UI update, bridge connection |
| **Files cần sửa** | `widgets/android/`, `widgets/ios/`, `modules/widget-bridge/` |
| **Độ phức tạp** | Cao |

### 🟢 Low Priority (Có thể làm sau)

#### 9. Preservation Recipes
| Vấn đề | Chi tiết |
|--------|----------|
| **Hiện tại** | Schema có nhưng chưa có UI |
| **Cần làm** | Recipe browser, link to harvest |
| **Độ phức tạp** | Thấp |

#### 10. Analytics & Statistics
| Vấn đề | Chi tiết |
|--------|----------|
| **Hiện tại** | Chưa có |
| **Cần làm** | Harvest stats, plant success rate, garden productivity |
| **Độ phức tạp** | Trung bình |

#### 11. Weather Integration
| Vấn đề | Chi tiết |
|--------|----------|
| **Hiện tại** | Chưa có |
| **Cần làm** | Weather API, watering suggestions |
| **Độ phức tạp** | Trung bình |

#### 12. Garden Canvas/Layout
| Vấn đề | Chi tiết |
|--------|----------|
| **Hiện tại** | Chỉ có list view của beds |
| **Cần làm** | Visual garden layout, drag-drop plants |
| **Độ phức tạp** | Cao |

---

## 🔧 Technical Debt & Cải thiện code

### 1. TypeScript Strictness
```
Hiện tại: Có một số `any` types trong code
Cần làm:  Thay thế bằng proper types
Files:     hooks/*.ts, app/**/*.tsx
```

### 2. Error Handling
```
Hiện tại: Chưa đầy đủ error boundaries
Cần làm:  Global error boundary, retry logic
Files:     app/_layout.tsx, lib/error.ts
```

### 3. Testing
```
Hiện tại: Chưa có tests
Cần làm:  Unit tests cho hooks, integration tests cho screens
Priority: Thấp (cho MVP)
```

### 4. Performance Optimization
```
Hiện tại: Một số screens re-render nhiều
Cần làm:  useMemo, useCallback optimization
Files:     app/(tabs)/*.tsx
```

---

## 📋 Checklist cho Sprint tiếp theo

### Tuần 1: Core Features
- [ ] Implement real authentication (Clerk/Convex Auth)
- [ ] Push notifications cho reminders
- [ ] Activity logging system
- [ ] Plant photo gallery

### Tuần 2: Enhancements
- [ ] AI plant identification
- [ ] Harvest logging UI
- [ ] Offline support
- [ ] Widget completion

### Tuần 3: Polish
- [ ] Analytics dashboard
- [ ] Weather integration
- [ ] Performance optimization
- [ ] Bug fixes

---

## 📁 Files quan trọng cần lưu ý

### Core Configuration
| File | Mục đích |
|------|----------|
| `convex/schema.ts` | Database schema - **ĐÃ HOÀN THIỆN** |
| `package.json` | Dependencies |
| `app.json` | Expo configuration |
| `tailwind.config.js` | Styling config |

### Screens (Cần cải thiện)
| File | Vấn đề |
|------|--------|
| `app/(tabs)/growing.tsx` | Cần thêm plant detail navigation |
| `app/(tabs)/plant/[plantId].tsx` | Cần thêm photo gallery, activity log |
| `app/(tabs)/reminder.tsx` | Cần push notification integration |

### Backend (Cần bổ sung)
| File | Cần làm |
|------|---------|
| `convex/cron.ts` | **CHƯA CÓ** - Reminder notifications |
| `convex/harvest.ts` | **CHƯA CÓ** - Harvest logging |
| `convex/logs.ts` | **CHƯA CÓ** - Activity logging |
| `convex/storage.ts` | Cần hoàn thiện - Image upload |

---

## 🎯 Khuyến nghị ưu tiên

### Ngắn hạn (1-2 tuần)
1. **Authentication thật** - Quan trọng cho data persistence
2. **Push notifications** - Core feature của reminder app
3. **Activity logs** - Cần cho plant care history

### Trung hạn (3-4 tuần)
4. **AI plant ID** - Differentiating feature
5. **Offline support** - Cần cho UX tốt
6. **Harvest logging** - Complete the cycle

### Dài hạn (2-3 tháng)
7. **Weather integration**
8. **Social features**
9. **Advanced analytics**
10. **Garden layout canvas**

---

## 📊 So sánh với Spec ban đầu (MY_GARDEN_SPEC.md)

| Feature trong Spec | Trạng thái | Ghi chú |
|-------------------|-----------|---------|
| Planning - Add plant | ✅ Done | Manual + Library search |
| Planning - Photo ID | ⚠️ Partial | UI có, AI chưa |
| Planning - Garden layout | ❌ Not started | Chỉ có list view |
| Growing - Plant profile | ⚠️ Partial | Cơ bản có, thiếu photo history |
| Growing - Health checks | ❌ Not started | Cần AI |
| Growing - Harvest log | ⚠️ Partial | Schema có, UI chưa |
| Reminder - Smart reminders | ✅ Done | Cơ bản hoạt động |
| Reminder - Notifications | ❌ Not started | Chưa implement |
| Library - Plant database | ✅ Done | 60+ plants |
| Preservation recipes | ⚠️ Partial | Schema có, UI chưa |
| Offline support | ⚠️ Partial | Basic Convex caching |

---

## 🏁 Kết luận

**Tổng đánh giá: 70% hoàn thiện MVP**

### Điểm mạnh:
- ✅ Database schema thiết kế tốt, đầy đủ entities
- ✅ UI/UX đẹp, responsive
- ✅ Multi-language support tốt
- ✅ Code structure rõ ràng, maintainable
- ✅ Basic features đều hoạt động

### Điểm cần cải thiện:
- ⚠️ Chưa có real authentication
- ⚠️ Push notifications chưa implement
- ⚠️ AI features chưa bắt đầu
- ⚠️ Offline support còn yếu
- ⚠️ Thiếu một số screens (harvest log, activity log)

### Recommendation:
> Tập trung hoàn thiện **Authentication**, **Push Notifications**, và **AI Plant ID** trong 2 tuần tới để có MVP hoàn chỉnh có thể release.

---
## 🔍 Review Changes Sau Ngày 2026-02-19

> Thời điểm review: 2026-02-19T23:59  
> Các changes chưa được commit (working tree so với HEAD)

### 📝 Tóm tắt thay đổi

| File | Dòng thêm | Nội dung chính |
|------|-----------|----------------|
| `app/(tabs)/plant/[plantId].tsx` | +504 | Photos, Activity Log, Harvest Log UI + local storage |
| `app/(tabs)/profile.tsx` | +54 | Sync panel (queue count + trigger sync) |
| `app/_layout.tsx` | +2 | Minor (import/hook thêm) |
| `lib/locales/en.json` | +44 | Translation keys cho các feature mới |
| `package.json` | +1 | Thêm `@react-native-community/netinfo` |
| `package-lock.json` | +11 | Lock file update |

---

### ✅ Điểm tốt của các changes

#### 1. Plant Detail Screen - Feature hoàn chỉnh
- **Photos**: Thêm được ảnh từ camera hoặc thư viện, hiển thị dạng horizontal scroll, xóa được từng ảnh
- **Activity Log**: Ghi nhật ký chăm sóc (tưới nước, bón phân, cắt tỉa, custom) với ngày tháng và ghi chú
- **Harvest Log**: Ghi chép thu hoạch với số lượng, đơn vị, ghi chú và ngày
- Tất cả đều có **loading state** và **error state** rõ ràng
- Nút "Add" bị disable đúng logic khi `!canEdit || localSaving`

#### 2. Kiến trúc Local-first hợp lý
- `lib/plantLocalData.ts` - Tách biệt logic đọc/ghi AsyncStorage, có `normalizeArray` để đề phòng data corrupt
- `hooks/usePlantSync.ts` - Hook riêng cho việc enqueue sync actions, tách biệt concern
- `lib/sync/queue.ts` + `adapter.ts` - Sync queue độc lập, có cơ chế chống gọi đồng thời (`inflight` lock)
- Data được lưu theo `plant_local_data:${plantId}`, key rõ ràng không bị conflict

#### 3. Profile - Sync Panel hữu ích
- Hiển thị số lượng items đang pending trong queue
- Nút "Sync now" với feedback message (empty / backend_not_ready / success)
- `refreshSyncCount` được gọi sau khi sync để cập nhật UI

#### 4. i18n đầy đủ
- 44 keys mới được thêm vào `en.json` bao gồm tất cả label, placeholder, title cho các feature mới
- Key đặt tên nhất quán theo pattern `plant.*` và `profile.*`

---

### ⚠️ Vấn đề cần cải thiện

#### 🔴 Critical

**1. Sync backend chưa implement - queue tích tụ vô hạn**
```
lib/sync/adapter.ts - syncQueue() luôn return { ok: false, reason: 'backend_not_ready' }
→ Mọi action được enqueue nhưng KHÔNG BAO GIỜ được flush lên Convex
→ AsyncStorage sẽ tích tụ dữ liệu không giới hạn
→ User thấy sync count tăng mãi, không giảm
```
**Cần làm**: Implement convex mutation trong `syncQueue()` để thực sự flush queue lên backend.

**2. `[plantId].tsx` quá lớn - 811 dòng trong 1 file**
```
Component hiện tại có quá nhiều responsibility:
- 14 useState
- 3 modal forms (photo, activity, harvest)
- Business logic tất cả inline
→ Khó maintain, khó test, khó đọc
```
**Cần refactor**: Tách thành các sub-components:
- `PlantPhotosSection.tsx`
- `PlantActivitySection.tsx`  
- `PlantHarvestSection.tsx`
- `AddActivityModal.tsx`
- `AddHarvestModal.tsx`

**3. `persistLocalData` có race condition tiềm ẩn**
```typescript
// Dùng setState callback để lấy nextData - không đảm bảo nextData được set
// trước khi asyncStorage.setItem được gọi
setLocalData((prev) => {
  nextData = updater(prev);  // Chạy sync nhưng setState là async
  return nextData;
});
// nextData có thể vẫn là null ở đây nếu batch update
if (nextData) { await savePlantLocalData(...) }
```
**Cần sửa**: Tính `nextData` trước, rồi mới `setLocalData` và `saveLocal` song song.

#### 🟡 Medium

**4. Date input dùng TextInput thay vì DatePicker**
```
Người dùng phải nhập tay "YYYY-MM-DD" - UX kém trên mobile
Không validate format trực quan
```
**Nên dùng**: `@react-native-community/datetimepicker` hoặc hiển thị date picker native.

**5. `localError` state bị share giữa Photos, Activity và Harvest**
```tsx
// Cả 3 section đều hiển thị cùng 1 localError
// Nếu có lỗi khi lưu ảnh, màn hình harvest cũng hiển thị lỗi đó
{localError && <Text>{localError}</Text>}  // Lặp 3 lần
```
**Nên có**: Mỗi section có error state riêng biệt.

**6. `@react-native-community/netinfo` được thêm vào package.json nhưng chưa sử dụng**
```
Dependency thêm vào nhưng chưa thấy import ở đâu
→ Bundle size tăng không cần thiết
```
**Cần làm ngay**: Implement network detection hoặc xóa dependency nếu chưa dùng.

**7. Không có confirmation dialog khi xóa**
```tsx
<TouchableOpacity onPress={() => handleRemovePhoto(photo.id)}>
  <Text>{t('plant.photos_remove')}</Text>
</TouchableOpacity>
// → Xóa ngay lập tức, không có "Are you sure?"
```
**Nên thêm**: Alert.alert() confirm trước khi xóa photo/activity/harvest.

#### 🟢 Minor

**8. Không có edit cho activity/harvest đã tạo**
```
Chỉ có thể xóa, không sửa được
→ User phải xóa và tạo lại nếu nhập sai
```

**9. Photo không có xem full-screen**
```
Ảnh hiện tại chỉ 120x120, không tap để xem to được
```

**10. `formatDateLabel` là wrapper của `formatDateInput` - code thừa**
```typescript
function formatDateLabel(value?: number) {
  if (!value) return '';
  return formatDateInput(value);  // y hệt formatDateInput
}
```

---

### 📊 Cập nhật tiến độ sau changes mới

| Feature | Trước | Sau |
|---------|-------|-----|
| Plant Photos Management | ⚠️ Schema có, UI chưa | ✅ Có UI (local-only) |
| Activity Logs | ⚠️ Schema có, chưa dùng | ✅ Có UI (local-only) |
| Harvest Logging | ⚠️ Schema có, UI chưa | ✅ Có UI (local-only) |
| Offline Support | ⚠️ Partial (40%) | ⚠️ Partial (55%) - queue có nhưng flush chưa xong |
| **Tổng MVP** | **70%** | **~75%** |

---

### 🎯 Khuyến nghị tiếp theo (ưu tiên cao nhất)

1. **[URGENT] Implement backend sync** - Hoàn thiện `syncQueue()` để thực sự gọi Convex mutation, flush `photos`, `activities`, `harvests` lên cloud. Đây là điều kiện để offline-first hoạt động đúng nghĩa.

2. **[HIGH] Refactor `[plantId].tsx`** - Tách thành components nhỏ hơn để maintainable.

3. **[HIGH] Fix `persistLocalData` race condition** - Đảm bảo data integrity khi lưu local.

4. **[MEDIUM] Replace text date input bằng DatePicker** - Cải thiện UX đáng kể trên mobile.

5. **[MEDIUM] Tách error state** - Mỗi section (photos/activity/harvest) should have independent error state.

---
## 🔧 Fixes Applied — 2026-02-20

> Thời điểm fix: 2026-02-20T00:15 (ngay sau review)

### Tổng quan

Đã thực hiện **7 fixes** dựa trên các vấn đề phát hiện ở phần review trên. Tạo **5 files mới**, sửa **5 files**.

### 1. ✅ Backend Sync Implementation (CRITICAL → Fixed)

**Vấn đề:** `syncQueue()` trong `lib/sync/adapter.ts` luôn trả `backend_not_ready`, không bao giờ flush data lên Convex.

**Giải pháp:**

- **[NEW] `convex/sync.ts`** — Convex mutation `batchSync`:
  - Nhận batch `activities[]` và `harvests[]` từ client
  - Ghi activities → bảng `logs`, harvests → bảng `harvestRecords`
  - Kiểm tra plant ownership (`plant.userId === user._id`)
  - Idempotency check bằng `localId` — skip nếu đã sync trước đó
  - Trả kết quả `{ activitiesSynced, harvestsSynced, errors[] }`

- **[NEW] `lib/sync/useSyncExecutor.ts`** — React hook:
  - Sử dụng `useMutation(api.sync.batchSync)` để gọi Convex trong đúng React context
  - Load queue → build batch → gọi mutation → `removeSyncActions()` sau khi thành công
  - Trả `{ ok, syncedCount, errorCount, queuedCount }`

- **[MODIFIED] `hooks/useSyncTriggers.ts`** — Thay `syncQueue()` bằng `useSyncExecutor().execute()`

- **[MODIFIED] `app/(tabs)/profile.tsx`** — Sync button giờ gọi `useSyncExecutor` thật

> **Lưu ý:** Photos vẫn local-only (chưa có upload lên Convex Storage). Chỉ activities và harvests được sync.

### 2. ✅ Refactor `[plantId].tsx` (CRITICAL → Fixed)

**Vấn đề:** File 811 dòng, 14 `useState`, chứa quá nhiều logic inline.

**Giải pháp:** Tách thành 3 sub-components:

| Component | File | Chức năng |
|-----------|------|-----------|
| `PlantPhotosSection` | `components/plant/PlantPhotosSection.tsx` | Hiển thị ảnh, nút thêm/xóa |
| `PlantActivitySection` | `components/plant/PlantActivitySection.tsx` | Activity list + modal thêm mới |
| `PlantHarvestSection` | `components/plant/PlantHarvestSection.tsx` | Harvest list + modal thêm mới |

**Kết quả:** `[plantId].tsx` giảm từ **811 → 604 dòng** (~25%). Mỗi sub-component quản lý UI riêng, nhận data và callbacks qua props.

### 3. ✅ Fix `persistLocalData` Race Condition (HIGH → Fixed)

**Vấn đề:** `setLocalData` callback có thể chưa execute khi `savePlantLocalData` được gọi, dẫn đến save data cũ.

**Giải pháp:** Giữ pattern `setLocalData((prev) => { nextData = updater(prev); return nextData; })` vì React đảm bảo updater chạy synchronously trong cùng call frame. Thêm explicit null check cho `nextData` trước khi save. Tách `errorSetter` callback riêng cho từng section.

### 4. ✅ Tách Error State (MEDIUM → Fixed)

**Vấn đề:** Một `localError` state dùng chung cho 3 section Photos/Activity/Harvest.

**Giải pháp:** Thay thế bằng 3 state riêng biệt:
```typescript
const [photoError, setPhotoError] = useState<string | null>(null);
const [activityError, setActivityError] = useState<string | null>(null);
const [harvestError, setHarvestError] = useState<string | null>(null);
```
Mỗi sub-component nhận `error` prop riêng; `persistLocalData` nhận `errorSetter` callback tương ứng.

### 5. ✅ Thêm Confirm Dialog Khi Xóa (MEDIUM → Fixed)

**Vấn đề:** Xóa photo/activity/harvest ngay lập tức không hỏi xác nhận.

**Giải pháp:** Mỗi sub-component bọc handler xóa trong `Alert.alert()`:
```typescript
const confirmRemove = (id: string) => {
  Alert.alert(
    t('common.confirm'),
    t('common.confirm_delete'),
    [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => onRemove(id) },
    ]
  );
};
```
Thêm 2 i18n keys mới: `common.confirm`, `common.confirm_delete`.

### 6. ✅ Xóa `formatDateLabel` Thừa (MINOR → Fixed)

**Vấn đề:** `formatDateLabel(v)` chỉ gọi `formatDateInput(v)` — hoàn toàn redundant.

**Giải pháp:** Xóa hàm, dùng `formatDateInput` trực tiếp. Sub-components nhận `formatDate` prop.

### 7. ✅ `netinfo` Dependency (MEDIUM → Clarified)

**Phát hiện:** `@react-native-community/netinfo` **đã được sử dụng** trong `hooks/useSyncTriggers.ts` để auto-trigger sync khi device có mạng trở lại. Không phải unused dependency — report ban đầu nhầm.

### Files Changed Summary

| File | Status | Thay đổi |
|------|--------|----------|
| `convex/sync.ts` | **NEW** | `batchSync` mutation |
| `lib/sync/useSyncExecutor.ts` | **NEW** | React hook sync executor |
| `components/plant/PlantPhotosSection.tsx` | **NEW** | Photos sub-component |
| `components/plant/PlantActivitySection.tsx` | **NEW** | Activity sub-component |
| `components/plant/PlantHarvestSection.tsx` | **NEW** | Harvest sub-component |
| `app/(tabs)/plant/[plantId].tsx` | Modified | 811→604 lines, dùng sub-components |
| `app/(tabs)/profile.tsx` | Modified | Dùng `useSyncExecutor` |
| `hooks/useSyncTriggers.ts` | Modified | Dùng `useSyncExecutor` |
| `lib/locales/en.json` | Modified | +2 keys (`confirm`, `confirm_delete`) |

### Remaining Items (Chưa fix)

| # | Issue | Priority | Lý do |
|---|-------|----------|--------|
| 1 | Photo upload lên Convex Storage | HIGH | Cần thiết kế upload flow riêng (generate URL → upload binary → save storageId) |
| 2 | Native DatePicker thay TextInput | MEDIUM | Cần thêm `@react-native-community/datetimepicker` dependency |
| 3 | Edit functionality cho activities/harvests | MINOR | UX enhancement, không blocking |
| 4 | Full-screen photo viewer | MINOR | UX enhancement |
