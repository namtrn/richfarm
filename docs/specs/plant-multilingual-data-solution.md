# Plant Multilingual Data Solution

## 1) Muc tieu

Thiet ke du lieu da ngon ngu cho cay trong app, trong do:

- Ten khoa hoc Latin (`scientificName`) la canonical, luon giu nguyen.
- Ten hien thi, mo ta, nhan "loai/giong" theo tung ngon ngu.
- De mo rong locale, de fallback khi thieu ban dich.
- Tranh trung lap va lech du lieu giua `plantsMaster` va `userPlants`.

## 2) Nguyen tac du lieu

- `scientificName` la nguon su that duy nhat cho dinh danh khoa hoc.
- Cac field khoa hoc khong phu thuoc ngon ngu luu o bang master.
- Cac field hien thi theo locale luu o bang i18n rieng.
- `userPlants` chi tham chieu `plantMasterId`, khong copy noi dung da ngon ngu.

## 3) Data model de xuat

### 3.1 Bang `plantsMaster` (canonical, non-localized)

Luu thong tin khoa hoc va ky thuat cham soc:

- `scientificName: string` (bat buoc, unique)
- `family?: string`
- `genus?: string`
- `species?: string`
- `variety?: string` (botanical variety)
- `cultivar?: string` (giong thuong mai, vd `Genovese`)
- `group: string` (ma noi bo, vd `herbs`, `leafy_greens`)
- `purposes: string[]` (ma noi bo, khong phai text hien thi)
- Cac field care profile: `lightRequirements`, `wateringFrequencyDays`, `spacingCm`, ...

### 3.2 Bang `plantI18n` (localized content)

Moi record la 1 ngon ngu cho 1 plant:

- `plantId: Id<"plantsMaster">`
- `locale: string` (vd `vi`, `en`, `fr`)
- `commonName: string`
- `description?: string`
- `typeLabel?: string` (nhan hien thi "loai")
- `cultivarLabel?: string` (nhan hien thi "giong", neu can)
- `usesLabel?: string[]` (text hien thi, neu khong dung code map)
- `seoSlug?: string` (tuỳ chon, neu can web/SEO sau nay)

Rang buoc quan trong:

- Unique composite: `(plantId, locale)`.
- Khong cho tao 2 ban dich cung `locale` cho 1 plant.

### 3.3 Bang `userPlants` (instance cua nguoi dung)

Giu nhu hien tai:

- `plantMasterId?: Id<"plantsMaster">`
- `nickname?: string`
- `notes?: string`
- `status`, `bedId`, timeline...

Khong luu lai `commonName`, `description` da ngon ngu trong bang nay.

## 4) Convex schema goi y

```ts
plantsMaster: defineTable({
  scientificName: v.string(),
  group: v.string(),
  family: v.optional(v.string()),
  purposes: v.array(v.string()),
  lightRequirements: v.optional(v.string()),
  wateringFrequencyDays: v.optional(v.number()),
  spacingCm: v.optional(v.number()),
  imageUrl: v.optional(v.string()),
})
  .index("by_scientific_name", ["scientificName"])
  .index("by_group", ["group"]);

plantI18n: defineTable({
  plantId: v.id("plantsMaster"),
  locale: v.string(),
  commonName: v.string(),
  description: v.optional(v.string()),
  typeLabel: v.optional(v.string()),
  cultivarLabel: v.optional(v.string()),
  usesLabel: v.optional(v.array(v.string())),
})
  .index("by_plant_locale", ["plantId", "locale"])
  .index("by_locale_common_name", ["locale", "commonName"]);
```

Luu y:

- Convex khong co unique constraint native theo SQL, can enforce uniqueness trong mutation.
- Co the them internal check de ngan duplicate `(plantId, locale)`.

## 5) Query va fallback hien thi

Thu tu fallback de UI on dinh:

1. Ban dich theo `userLocale`
2. Ban dich `en`
3. Ban dich dau tien co san
4. `scientificName` (Latin)

Helper goi y:

```ts
type PlantLocalized = {
  displayName: string;
  scientificName: string;
  description?: string;
};

function localizePlant(
  i18nRows: Array<{ locale: string; commonName: string; description?: string }>,
  userLocale: string,
  scientificName: string
): PlantLocalized {
  const exact = i18nRows.find((r) => r.locale === userLocale);
  const en = i18nRows.find((r) => r.locale === "en");
  const first = i18nRows[0];
  const picked = exact ?? en ?? first;

  return {
    displayName: picked?.commonName ?? scientificName,
    scientificName,
    description: picked?.description,
  };
}
```

Quy uoc UI:

- Dong chinh: `displayName`.
- Dong phu: `scientificName` in nghieng.
- Luon show Latin de giu tinh chuan hoa khoa hoc.

## 6) Tim kiem

Tim theo:

- `scientificName` (chinh xac)
- `plantI18n.commonName` theo locale hien tai
- Co the mo rong: tim cross-locale khi user nhap ten EN trong UI VI

Chien luoc:

- Query `plantI18n` theo locale truoc de lay candidate IDs.
- Join sang `plantsMaster` bang `plantId`.
- Neu khong du ket qua, fallback tim EN.

## 7) Migration tu model hien tai

Da hoan tat migration sang `plantI18n`:

1. Them bang `plantI18n`.
2. Dual-read giai doan chuyen tiep.
3. Cap nhat query API doc tu `plantI18n`.
4. Xoa truong legacy `commonNames` va `description` khoi `plantsMaster`.

## 8) Validation va governance

Rules nen enforce trong mutation:

- `scientificName` bat buoc, khong rong.
- Normalize `locale` ve lowercase (`vi`, `en`, ...).
- Khong cho sua `scientificName` tu luong user thuong (chi admin/content pipeline).
- Moi `plantId` phai co it nhat 1 locale (khuyen nghi bat buoc co `en`).
- Chan duplicate `(plantId, locale)`.

## 9) API contracts de team app dung chung

De xuat tra ve shape da localize san:

```ts
{
  _id: Id<"plantsMaster">,
  scientificName: string,
  displayName: string,
  description?: string,
  groupCode: string,
  imageUrl?: string,
  localeUsed: string
}
```

Loi ich:

- UI don gian, khong can tu xu ly fallback moi man.
- Tranh logic trung lap giua `library`, `plant detail`, widget.

## 10) Performance va index

- `plantsMaster.by_group_code` cho filter theo nhom.
- `plantI18n.by_plant_locale` cho lookup nhanh theo plant + locale.
- `plantI18n.by_locale_common_name` cho search ten thuong.
- Neu du lieu lon: them precomputed search key (`commonNameNormalized`).

## 11) Test checklist

- Unit test helper fallback locale.
- Test duplicate locale bi chan.
- Test query khi thieu locale user.
- Test case khong co ban dich nao -> van show `scientificName`.
- Regression test cac man: Library, Plant Detail, Add-to-plan flow.

## 12) Rollout de xuat

1. Add schema + mutations cho `plantI18n`.
2. Migrate data cu.
3. Cap nhat API query localize.
4. Cap nhat UI dung `displayName` + `scientificName`.
5. Theo doi log missing locale, bo sung translation.
6. Don dep field legacy sau khi stable.

## 13) Ket luan

Model 2 lop (`plantsMaster` canonical + `plantI18n` localized) la cach toan dien va ben vung:

- Dam bao Latin luon dung va on dinh.
- Ho tro da ngon ngu day du cho ten, mo ta, loai/giong.
- De mo rong du lieu va giam rui ro lech du lieu theo thoi gian.

---

# BỔ SUNG — Đánh giá từ codebase thực tế

> Các phần dưới đây được bổ sung sau khi audit toàn bộ codebase hiện tại
> (`schema.ts`, `plants.ts`, `seed.ts`, `i18n.ts`, `library.tsx`, `plantGroups`).

## 14) Kiểm tra hiện trạng (Current State Audit)

### 14.1 `schema.ts` — `plantsMaster` hiện tại

Hiện tại **không còn embedded i18n** trong `plantsMaster`.

- `commonNames` va `description` da duoc tach sang `plantI18n`.
- `plantsMaster` chi giu field canonical va care profile.

### 14.2 `seed.ts` — Dữ liệu seed hiện tại

- Seed `plantsMaster` chi con canonical data.
- English content (ten + mo ta) nam trong `plantI18n` (locale `en`).

### 14.3 `plants.ts` — Query hiện tại

- Query plant library da resolve locale tu `plantI18n` (qua `plantImages` query).
- UI nhan `displayName`, `description`, `localeUsed` san sang.

### 14.4 `library.tsx` — UI hiện tại

- Da dung `usePlantDisplayName` va `displayName` tu API.
- String hardcode da duoc dua vao `t()` va key i18n.

### 14.5 `plantGroups` — Approach khác

`plantGroups` đã dùng **`v.record(v.string(), v.string())`** cho i18n:

```ts
displayName: v.record(v.string(), v.string()), // { vi: "Rau thơm", en: "Herbs" }
```

→ Đây là approach **inline map** (khác với `plantI18n` separate table).

## 15) Đồng bộ chiến lược i18n giữa các bảng

Hiện có 2 approach i18n khác nhau trong codebase:

| Bảng | Approach hiện tại | Đề xuất |
|------|-------------------|---------|
| `plantsMaster` | Separate `plantI18n` (da ap dung) | → Giữ `plantI18n` |
| `plantGroups` | Inline `v.record` | → Giữ nguyên (ít record, hiếm thay đổi) |
| `preservationRecipes` | `recipeI18n` (da ap dung) | → Giữ `recipeI18n` |

**Quy tắc quyết định:**
- **Dữ liệu ít, ít thay đổi** (plantGroups, enums, labels) → inline `v.record` OK.
- **Dữ liệu nhiều, content dài** (plants, recipes, descriptions) → separate i18n table.
- **Mục tiêu**: nhất quán trong cùng 1 category, không buộc phải dùng 1 approach cho tất cả.

## 16) `preservationRecipes` cần i18n

Bảng `preservationRecipes` hiện tại có nhiều field text:

```ts
name: v.string(),           // ← cần localize
steps: v.array(v.string()), // ← cần localize
safetyNotes: v.optional(v.string()), // ← cần localize
```

Da them bảng `recipeI18n`:

```ts
recipeI18n: defineTable({
  recipeId: v.id("preservationRecipes"),
  locale: v.string(),
  name: v.string(),
  steps: v.array(v.string()),
  safetyNotes: v.optional(v.string()),
})
  .index("by_recipe_locale", ["recipeId", "locale"]);
```

**Trạng thái**: Đã implement.

## 17) Seed data — Kế hoạch bổ sung bản dịch

### 17.1 Locales cần bổ sung

App hỗ trợ 6 locale: `en`, `vi`, `es`, `pt`, `fr`, `zh`.
Seed data hiện chỉ có `vi` + `en`.

Kế hoạch:
1. Tạo file JSON mapping `scientificName → { es, pt, fr, zh }` cho 40+ plants.
2. Nguồn dữ liệu: Wikipedia API (tên cây theo ngôn ngữ), hoặc manual review.
3. Viết migration script đọc JSON → insert `plantI18n` records.

### 17.2 Description cần i18n

Hiện `description` da duoc luu trong `plantI18n`.
- Locale mac dinh dang co: `en`.
- Co the bo sung `es`, `pt`, `fr`, `zh` theo content pipeline.

## 18) Shared localization hook — `usePlantLocalized`

Thay vì lặp logic fallback trong mỗi component, tạo hook dùng chung:

```ts
// hooks/usePlantLocalized.ts

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';

type PlantLocalized = {
  displayName: string;
  scientificName: string;
  description?: string;
  localeUsed: string;
};

/**
 * Resolve tên hiển thị cho plant theo locale hiện tại.
 * Fallback: userLocale → en → first available → scientificName.
 */
export function localizePlant(
  i18nRows: Array<{ locale: string; commonName: string; description?: string }>,
  userLocale: string,
  scientificName: string
): PlantLocalized {
  const exact = i18nRows.find((r) => r.locale === userLocale);
  const en = i18nRows.find((r) => r.locale === 'en');
  const first = i18nRows[0];
  const picked = exact ?? en ?? first;

  return {
    displayName: picked?.commonName ?? scientificName,
    scientificName,
    description: picked?.description,
    localeUsed: picked?.locale ?? 'latin',
  };
}

/**
 * Hook wrapper — gọi trong component.
 * Dung cho model hien tai (plantI18n).
 */
export function usePlantDisplayName(plant: any): PlantLocalized {
  const { i18n } = useTranslation();
  const locale = i18n.language;

  return useMemo(() => {
    if (plant.displayName) {
      return {
        displayName: plant.displayName,
        scientificName: plant.scientificName,
        description: plant.description,
        localeUsed: plant.localeUsed ?? 'latin',
      };
    }
    return {
      displayName: plant.scientificName,
      scientificName: plant.scientificName,
      localeUsed: 'latin',
    };
  }, [plant, locale]);
}
```

Lợi ích:
- **Một chỗ duy nhất** xử lý fallback logic.
- Hỗ trợ **dual-read** trong giai đoạn migration.
- Dễ test (unit test function `localizePlant` trực tiếp).

## 19) Kế hoạch refactor `library.tsx`

Sau khi có hook `usePlantLocalized`, refactor `library.tsx`:

### 19.1 Thay thế inline fallback

```diff
// PlantCard — TRƯỚC:
-const localName = plant.commonNames?.find(...)?.name ?? ...;
// PlantCard — SAU:
+const { displayName, scientificName } = usePlantDisplayName(plant);
```

### 19.2 i18n các string hardcode

Các label cần chuyển sang `t()`:

| Hardcode hiện tại | Key i18n đề xuất |
|---|---|
| `"Harvest"` | `library.stat_harvest` |
| `"Watering"` | `library.stat_watering` |
| `"Light"` | `library.stat_light` |
| `"Germination"` | `library.detail_germination` |
| `"Spacing"` | `library.detail_spacing` |
| `"Propagation"` | `library.detail_propagation` |
| `"Uses"` | `library.detail_uses` |
| `"Full Sun"` | `library.light_full_sun` |
| `"Part Shade"` | `library.light_partial_shade` |
| `"Shade"` | `library.light_shade` |
| `"Every Xd"` | `library.watering_every` (interpolation) |

### 19.3 Localize `purposes` display

Hiện tại dùng `p.replace(/_/g, ' ')` → nên map sang i18n key:

```ts
const purposeLabel = t(`purposes.${purpose}`, { defaultValue: purpose.replace(/_/g, ' ') });
```

## 20) Content pipeline / Admin tooling

Plan hiện tại chưa đề cập cách **thêm bản dịch mới** sau khi deploy:

### 20.1 Giai đoạn đầu (MVP)

- Dùng Convex Dashboard để insert/edit `plantI18n` trực tiếp.
- Viết mutation `upsertPlantI18n` có validate:
  ```ts
  export const upsertPlantI18n = mutation({
    args: {
      plantId: v.id("plantsMaster"),
      locale: v.string(),
      commonName: v.string(),
      description: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
      const normalized = args.locale.toLowerCase().trim();
      const existing = await ctx.db
        .query("plantI18n")
        .withIndex("by_plant_locale", (q) =>
          q.eq("plantId", args.plantId).eq("locale", normalized)
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          commonName: args.commonName,
          description: args.description,
        });
      } else {
        await ctx.db.insert("plantI18n", {
          plantId: args.plantId,
          locale: normalized,
          commonName: args.commonName,
          description: args.description,
        });
      }
    },
  });
  ```

### 20.2 Giai đoạn sau

- Admin UI đơn giản: danh sách plants, hiện status dịch cho từng locale (✅/❌).
- Bulk import từ CSV/JSON.
- Tích hợp translation API (Google Translate, DeepL) cho draft → human review.

## 21) Rollout ưu tiên (phased)

Bổ sung chi tiết hơn section 12:

| Phase | Task | Risk | Ước lượng |
|-------|------|------|-----------|
| **Phase 1** | Thêm `plantI18n` table + `upsertPlantI18n` mutation | Thấp | Done |
| **Phase 2** | Tạo `usePlantLocalized` hook + unit test | Thấp | Done (hook) |
| **Phase 3** | Migration script: `commonNames` → `plantI18n` | Trung bình | Done |
| **Phase 4** | Cập nhật query API trả `displayName` resolved | Trung bình | Done |
| **Phase 5** | Refactor `library.tsx` dùng hook mới | Trung bình | Done |
| **Phase 6** | i18n hardcoded strings trong `library.tsx` | Thấp | Done |
| **Phase 7** | Bổ sung bản dịch es/pt/fr/zh cho 40+ plants | Cao (cần content) | Pending |
| **Phase 8** | Dual-read period, monitoring, xóa `commonNames` cũ | Trung bình | Done |
| **Phase 9** | `recipeI18n` cho preservationRecipes | Thấp | Done |

**Tổng ước lượng**: ~16-28h (có thể chia thành nhiều sprint).
