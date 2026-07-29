# RichFarm — Spec và Edge Cases

## Tổng quan
**Mục tiêu**: Tài liệu Markdown này tổng hợp yêu cầu, tính năng, và phân tích **edge cases** cho ứng dụng **RichFarm** (tabs: **Planning**, **Growing**, **Reminder**).

**Tech Stack**:
- **Backend**: Convex (Auth + Database + Real-time + Storage)
- **Frontend**: React Native + Expo + Tamagui (Universal UI)
- **Theme**: Garden-inspired green palette ([`theme.ts`](../theme.ts), [`tamagui.config.ts`](../tamagui.config.ts))

---

## Nhu cầu ngườI dùng
- **Nhanh, trực quan**: thêm cây bằng ảnh hoặc nhập tay; thấy lịch chăm sóc ngay.  
- **Đáng tin cậy**: lịch dựa trên vùng khí hậu, frost dates, thờI gian nảy mầm, khoảng cách trồng.  
- **Tùy chỉnh & tự động**: nhắc tướI/bón/prune; cho phép chỉnh tần suất.  
- **Hỗ trợ quyết định**: companion planting, luân canh, lựa chọn giống theo mục đích.  
- **Giá trị gia tăng**: mẹo bảo quản (phơi khô, muối, ủ, làm mắm), công thức, lưu trữ harvest.  
- **Offline & local**: cơ sở dữ liệu cơ bản offline; cập nhật online cho ID/disease.

---

## Tính năng theo tab

### Planning
- **Add plant**: *Scan hình* (photo ID), *Upload hình*, *Nhập tay* (search by name + autocomplete).  
- **Garden layout**: bed/pot canvas; square‑foot grid; kéo‑thả cây; companion warnings.  
- **Planting calendar**: auto-calc theo zone, frost dates, seed‑start, transplant, harvest.  
- **Templates**: kitchen herbs, hydroponics, regrow-from-scraps, fastest-growing.

### Growing
- **Plant profile**: species, variety, photo history, soil, light, spacing, companion list.  
- **Health checks**: upload photo cho disease/pest suggestions; manual symptom logging.  
- **Environment tracking**: optional sensor input hoặc manual logs.  
- **Harvest log**: record harvest dates, weight/qty, liên kết tớI preservation recipes.

### Reminder
- **Smart reminders**: watering, fertilizing, pruning, pest checks, harvest; auto-schedule.  
- **Custom rules**: snooze, repeat intervals, group reminders theo bed/plant type.  
- **Notifications**: actionable cards, batch theo bed.

### Extras
- **Preservation recipes**: phơi khô, muối, ủ, làm mắm; mapping tớI loạI cây.  
- **Regrow workflows**: hướng dẫn step‑by‑step.  
- **Community / Tips**: optional feed, user contributed profiles.

---

## Database Schema
> **Đã tách sang file riêng**: [convex-schema.ts](./convex-schema.ts)

Tóm tắt các tables chính:
- `users` - Thông tin ngườI dùng (đồng bộ vớI Convex Auth)
- `plants_master` - Database tham khảo cây (seed data)
- `user_plants` - Cây ngườI dùng đang trồng
- `beds` - Luống/chậu trồng
- `reminders` - Nhắc nhở
- `logs` - Nhật ký hoạt động
- `plant_photos` - Lịch sử ảnh
- `preservation_recipes` - Công thức bảo quản

---

## Convex Architecture

### Auth Flow
```
User → Convex Auth (Clerk/Auth0) → JWT token → Convex Client
                                    ↓
                              Trigger: user.created
                                    ↓
                              Create user profile trong `users` table
```

### Data Flow
```
Client (React/Vue/RN) 
    ↕ (WebSocket - real-time)
Convex Functions (queries, mutations, actions)
    ↕
Convex Database / Storage
```

### Function Types
| Type | Use Case | Example |
|------|----------|---------|
| `query` | Read data, real-time subscription | `getUserPlants`, `getPlantById` |
| `mutation` | Write data, transactional | `createUserPlant`, `updateReminder` |
| `action` | Side effects, external APIs | `identifyPlantPhoto`, `sendNotification` |

### Real-time Subscriptions
- Tự động sync khi data thay đổI
- Optimistic updates trên client
- Không cần polling hoặc manual refresh

### File Storage (Convex Storage)
| Feature | Implementation |
|---------|----------------|
| Plant photos | Upload → Convex Storage → Generate URL |
| Thumbnails | Action tạo thumbnail sau upload |
| EXIF stripping | Action xử lý trước khi lưu |
| Public access | URLs có expiration hoặc public read |

---

## Security & Privacy

### Authentication
- **Convex Auth**: Tích hợp Clerk/Auth0
- **JWT tokens**: Tự động handle bởi Convex
- **Session management**: Convex tự quản lý

### Authorization (Convex)
```typescript
// Mẫu: Check ownership trong mutation
export const updateUserPlant = mutation({
  args: { id: v.id("user_plants"), data: v.object({...}) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    
    const plant = await ctx.db.get(args.id);
    if (!plant || plant.userId !== identity.subject) {
      throw new Error("Not authorized");
    }
    // ... update
  }
});
```

### Data Privacy
| Feature | Implementation |
|---------|----------------|
| EXIF stripping | Action `processPhotoUpload` strip GPS trước khi lưu |
| Photo access control | Storage rules: owner read, public optional |
| Consent tracking | Field `aiConsent` trong `users` table |
| Data export | Action `exportUserData` generate JSON download |
| Data deletion | Mutation `deleteAccount` cascade xóa all user data |

### Rate Limiting
- Convex tự handle rate limiting ở function level
- Custom rate limiting cho AI API calls (identify photo)

---

## Offline Strategy vớI Convex

### Convex on Offline
- **Automatic**: Convex client tự queue mutations khi offline
- **Sync**: Tự động retry khi có connection
- **Optimistic UI**: Update UI ngay, rollback nếu fail

### Conflict Resolution
- Convex mutations là **atomic transactions**
- **Last-writer-wins** mặc định
- Custom conflict: Dùng `version` field + compare-and-swap

```typescript
// Optimistic update pattern
const updatePlant = useMutation(api.userPlants.update);

// Client: Update UI ngay
setLocalPlant(newData);

// Background: Send mutation
updatePlant({ id, data: newData, version: currentVersion })
  .catch(() => {
    // Rollback nếu conflict
    refreshData();
  });
```

---

## Error Handling

### Convex Error Categories
| Error | Cause | Handling |
|-------|-------|----------|
| `ConvexError("Not authenticated")` | Auth hết hạn | Redirect login |
| `ConvexError("Not authorized")` | Không có quyền | Show permission denied |
| `ConvexError("Plant not found")` | Record không tồn tạI | 404 UI |
| `ConvexError("Invalid data")` | Validation fail | Show field errors |
| `ConvexError("Rate limited")` | Quá nhiều requests | Retry sau |

### Client Error Handling
```typescript
try {
  await createPlant({ ... });
} catch (error) {
  if (error.message.includes("Not authenticated")) {
    router.push("/login");
  } else if (error.message.includes("Rate limited")) {
    toast.error("Quá nhiều yêu cầu, thử lạI sau");
  }
}
```

---

## Performance Requirements

### App Performance
| Metric | Target |
|--------|--------|
| Cold start | < 3 giây |
| Query response | < 100ms (cache hit), < 500ms (DB) |
| Mutation apply | < 50ms optimistic, < 1s confirm |
| Photo upload | < 5 giây (WiFi) |
| AI identification | < 3 giây |

### Optimization vớI Convex
- **Pagination**: Dùng `paginate` cho list queries
- **Indexes**: Định nghĩa trong schema cho frequent queries
- **Selective fields**: Dùng `.field()` để chỉ lấy cần thiết
- **Image optimization**: 
  - Client resize trước upload (max 2048px)
  - WebP format
  - Thumbnail generation (300x300)

### Query Patterns
```typescript
// Tốt: Có index
const plants = await ctx.db
  .query("user_plants")
  .withIndex("by_user", q => q.eq("userId", userId))
  .collect();

// Tốt: Pagination
const { page, continueCursor } = await ctx.db
  .query("logs")
  .withIndex("by_plant_date")
  .paginate({ cursor, numItems: 20 });
```

---

## Testing Strategy

### Unit Tests (Vitest/Jest)
- **Business logic**: Calendar calculations, validators
- **Utilities**: Date helpers, formatters

### Convex Tests (convex-test)
```typescript
// Mẫu test Convex function
const t = convexTest(schema);

it("should create user plant", async () => {
  const identity = { subject: "user_123", ... };
  await t.mutation(api.userPlants.create, { 
    name: "Basil",
    userId: identity.subject 
  }, identity);
  
  const plants = await t.query(api.userPlants.list, {}, identity);
  expect(plants).toHaveLength(1);
});
```

### E2E Tests (Playwright)
- **Critical flows**:
  1. Login → Add plant → Set reminder
  2. Upload photo → AI identify → Save
  3. Offline mode → Online sync
  4. Complete reminder → Verify log

### Edge Case Tests
- Network intermittency (Convex tự handle)
- Timezone changes
- Daylight saving transitions
- Large dataset (1000+ plants) - test pagination

---

## Edge Cases chi tiết và cách xử lý
> MỗI mục gồm **Vấn đề**, **Dấu hiệu**, **Tác động**, **GiảI pháp**.

### 1. Ảnh mờ hoặc model ID sai
- **Vấn đề**: Ảnh mờ, cây non, giai đoạn bệnh lý → ID sai.  
- **Dấu hiệu**: confidence thấp, user chỉnh tay nhiều.  
- **GiảI pháp**: hiển thị top‑3 kết quả kèm confidence; photo quality checks trước upload; fallback nhập tay; lưu ảnh để review.

### 2. Lịch tướI không phù hợp microclimate
- **Vấn đề**: ban công/nhà kính khác zone.  
- **Dấu hiệu**: nhắc quá thường/quá ít; cây úng/khô.  
- **GiảI pháp**: adaptive scheduling dựa trên logs; hỗ trợ sensor; allow user overrides.

### 3. Duplicate records khi thêm nhiều nguồn
- **Vấn đề**: cùng cây thêm bằng ảnh, nhập tay, template.  
- **Dấu hiệu**: profile trùng, nhắc chồng.  
- **GiảI pháp**: duplicate detection khi thêm; merge workflow; trường `mergedInto`.

### 4. Offline sync conflict
- **Vấn đề**: thao tác offline rồI sync gây xung đột.  
- **Dấu hiệu**: lịch bị ghi đè, ảnh mất.  
- **GiảI pháp**: Convex tự queue mutations; version-based conflict; last-writer-wins vớI audit; conflict UI cho user chọn.

### 5. Reminders quá nhiều gây fatigue
- **Vấn đề**: nhiều cây → nhiều thông báo.  
- **Dấu hiệu**: user tắt notification.  
- **GiảI pháp**: smart batching theo bed/ngày; user control mức chi tiết; quiet hours.

### 6. Ảnh chứa EXIF/geo và privacy
- **Vấn đề**: ảnh chứa vị trí hoặc vật dụng cá nhân.  
- **Dấu hiệu**: user lo ngạI upload.  
- **GiảI pháp**: strip EXIF trong Action `processPhotoUpload` trước khi lưu Storage; local-first xử lý; opt-in sharing; rõ consent.

### 7. Sensor báo sai hoặc mất tín hiệu
- **Vấn đề**: dữ liệu nhảy loạn hoặc offline.  
- **Dấu hiệu**: giá trị bất thường, không cập nhật.  
- **GiảI pháp**: sanity checks, flag suspect, fallback lịch dựa logs, health dashboard.

### 8. Sensor spoofing hoặc dữ liệu giả
- **Vấn đề**: thiết bị gửi dữ liệu giả.  
- **Dấu hiệu**: pattern lặp bất thường, mismatch logs.  
- **GiảI pháp**: device auth & signing; anomaly detection; tạm ngắt automation khi nghi ngờ.

### 9. Timezone và daylight saving
- **Vấn đề**: user di chuyển hoặc timezone sai.  
- **Dấu hiệu**: reminders xuất giờ lạ.  
- **GiảI pháp**: store timezone per user; detect drift; dùng `Intl.DateTimeFormat` cho display.

### 10. Legal risk cho preservation recipes
- **Vấn đề**: hướng dẫn bảo quản có rủI ro an toàn thực phẩm.  
- **Dấu hiệu**: user hỏI về an toàn hoặc báo sự cố.  
- **GiảI pháp**: disclaimers rõ ràng; nguồn vetting; opt‑in advanced tips.

### 11. Multi‑user access same garden
- **Vấn đề**: nhiều ngườI thao tác cùng bed.  
- **Dấu hiệu**: duplicate logs, reminders bị hoàn thành bởI ngườI khác.  
- **GiảI pháp**: shared garden model vớI roles; action attribution; claim task.

### 12. Long tail species no care data
- **Vấn đề**: loàI hiếm không có profile.  
- **Dấu hiệu**: app trả "no data".  
- **GiảI pháp**: community contributed profiles (unverified); similarity inference từ taxon gần nhất.

### 13. Model drift giảm accuracy
- **Vấn đề**: model ID/disease giảm hiệu năng theo thờI gian.  
- **Dấu hiệu**: tăng false positives/negatives.  
- **GiảI pháp**: continuous evaluation, human‑in‑loop feedback, retrain pipeline.

### 14. Billing và feature gating
- **Vấn đề**: upgrade/downgrade giữa thiết bị.  
- **Dấu hiệu**: feature mismatch, support requests.  
- **GiảI pháp**: entitlement trong `users` table; Convex query check subscription status; grace period.

### 15. Accessibility và cognitive load
- **Vấn đề**: quá nhiều tuỳ chọn làm novice users bốI rốI.  
- **Dấu hiệu**: dropoff onboarding.  
- **GiảI pháp**: progressive disclosure; guided tours; expert mode.

---

## Ưu tiên xử lý và Roadmap ngắn hạn
**Ưu tiên cao**
1. Photo quality checks + ID fallback.  
2. Privacy EXIF stripping + consent.  
3. Adaptive scheduling + sensor sanity checks.  
4. Convex indexes cho frequent queries.

**Ưu tiên trung bình**
1. Duplicate detection & merge UI.  
2. Smart reminder batching.  
3. Disease alert explainability.  
4. Localization của plant names và community vetting.

**MVP đề xuất (4–6 tuần)**
- Onboarding zone, plants_master seed data, add plant manual/search, planting calendar, reminders, user_plants CRUD.

**Phase 2**
- Photo ID, disease suggestion, garden layout canvas, harvest logging, preservation recipes.

**Phase 3**
- Community features, sensor integrations, advanced analytics.

---

## UI Architecture (Tamagui)

### Tamagui Setup
```typescript
// App root với TamaguiProvider
import { TamaguiProvider } from 'tamagui'
import { config } from '../tamagui.config'

export default function App() {
  return (
    <TamaguiProvider config={config}>
      <YourApp />
    </TamaguiProvider>
  )
}
```

### Theme System
Theme garden-inspired với palette xanh lá chủ đạo:

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `accent1-12` | Green scale | Darker green | Primary actions, CTAs |
| `color` | Dark brown | Off-white | Text content |
| `background` | Light sage | Dark forest | App background |
| `warning` | Yellow | Yellow dark | Alerts, cautions |
| `error` | Red | Red dark | Errors, deletions |
| `success` | Green | Green dark | Success states |

### Component Pattern
```typescript
import { YStack, XStack, Text, Button, Card, Image } from 'tamagui'
import { Leaf, Droplets, Sun } from '@tamagui/lucide-icons'

// Plant Card Example
<Card elevate size="$4" bordered>
  <Card.Header padded>
    <YStack space="$2">
      <Text fontSize="$6" fontWeight="bold" color="accent10">
        🌿 Basil
      </Text>
      <Text fontSize="$3" color="gray10">
        Rau húng quế
      </Text>
    </YStack>
  </Card.Header>
  <Card.Footer padded>
    <XStack space="$2">
      <Button icon={Droplets} theme="accent">
        Tưới
      </Button>
      <Button icon={Sun} variant="outlined">
        Chi tiết
      </Button>
    </XStack>
  </Card.Footer>
</Card>
```

### Key Components cần xây dựng
| Component | Mô tả |
|-----------|-------|
| `PlantCard` | Hiển thị thông tin cây, status, next action |
| `GardenGrid` | Canvas kéo-thả cho beds layout |
| `ReminderItem` | Reminder với snooze/complete actions |
| `CalendarView` | Lịch trồng cây (planting calendar) |
| `PhotoUploader` | Upload + preview + AI analysis status |
| `GrowthTimeline` | Timeline giai đoạn phát triển cây |

### Responsive với Tamagui
```typescript
// Media queries built-in
<YStack 
  $sm={{ flexDirection: 'column' }}
  $md={{ flexDirection: 'row' }}
  space="$4"
>
  {/* Content adapts to screen size */}
</YStack>
```

### Animation
```typescript
import { AnimatedYStack } from 'tamagui'

<AnimatedYStack 
  animation="lazy"
  enterStyle={{ opacity: 0, y: 10 }}
  exitStyle={{ opacity: 0, y: -10 }}
>
  <PlantCard />
</AnimatedYStack>
```

---

## Next steps đề xuất
- [x] Chuyển schema thành file [convex-schema.ts](./convex-schema.ts)  
- [x] Setup Tamagui theme ([`theme.ts`](../theme.ts), [`tamagui.config.ts`](../tamagui.config.ts))
- [ ] Setup Expo project + Tamagui
- [ ] Setup Convex project + Auth (Clerk)
- [ ] Viết Convex functions (queries, mutations, actions)
- [ ] Xây dựng core components (PlantCard, GardenGrid, ReminderItem)
- [ ] Thiết kế mock UI cho conflict/merge flows và reminder batching.  
- [ ] Thiết lập privacy policy snippet cho ảnh và model training opt‑in.

---

## Appendix

### Danh mục nhóm cây gợI ý
| Key | Display Name (VI) | Display Name (EN) |
|-----|-------------------|-------------------|
| alliums | Họ hành | Alliums |
| cole_crops | Họ cải | Cole Crops |
| flowers | Hoa | Flowers |
| fruit | Cây ăn quả | Fruit |
| grains | Ngũ cốc | Grains |
| greens | Rau xanh | Greens |
| herbs | Rau thơm | Herbs |
| legumes | Họ đậu | Legumes |
| melons_squashes | Bí/dưa | Melons & Squashes |
| nightshades | Cà/Solanaceae | Nightshades |
| others | Khác | Others |

### Danh mục mục đích
- `cooking_spices` - Gia vị nấu ăn
- `regrow_scraps` - Mọc lạI từ gốc
- `indoor` - Trồng trong nhà
- `hydroponics` - Thủy canh
- `fast_growing` - Mọc nhanh

---

**Hoàn tất**. TàI liệu này đã sẵn sàng để dùng cho team.
