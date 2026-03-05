# Plant Schema Review — Variants & Multilingual Support

> **Date:** 2026-03-04  
> **Status:** Proposal  
> **Scope:** `plantsMaster`, `plantI18n`, `userPlants`, `plantGroups`

---

## 1. Current Schema Overview

```
plantsMaster (1 row per species, keyed by scientificName)
  ├── scientificName          — unique identifier (e.g. "Solanum lycopersicum")
  ├── group                   — category key (→ plantGroups)
  ├── purposes[]              — ["cooking", "indoor", ...]
  ├── growing params          — typicalDaysToHarvest, spacingCm, wateringFrequencyDays, ...
  ├── relationships           — companionPlants[], avoidPlants[], pestsDiseases[]
  ├── commonNames[]           — ⚠️ LEGACY embedded {locale, name} array
  └── imageUrl, source

plantI18n (1 row per plantsMaster × locale)
  ├── plantId                 — FK → plantsMaster
  ├── locale                  — "en", "vi", ...
  ├── commonName              — localized display name
  ├── description             — localized description
  ├── careContent             — JSON string (watering, soil, etc.)
  └── contentVersion          — cache invalidation

plantGroups (category reference)
  ├── key                     — "herbs", "nightshades", ...
  ├── displayName             — { en: "Herbs", vi: "Cây gia vị" }
  └── sortOrder

userPlants (user's individual plants)
  ├── userId, plantMasterId   — FK → users, plantsMaster
  ├── status                  — "planning", "growing", "archived"
  ├── timeline                — plantedAt, expectedHarvestDate, ...
  └── bedId, positionInBed    — garden layout
```

### Localization Flow

```
Request(locale="vi") → plantI18n.by_plant_locale(plantId, "vi")
  → found? → use vi commonName + description
  → not found? → fallback to "en" → fallback to scientificName
```

Implemented in `convex/lib/localizePlant.ts` — logic tốt, fallback chain hợp lý.

---

## 2. What's Working Well

| Aspect | Assessment |
|---|---|
| `plantsMaster` + `plantI18n` separation | ✅ Đúng pattern — data khoa học tách khỏi translations |
| Index `by_plant_locale` | ✅ Cho phép query O(1) per (plant, locale) |
| Locale fallback chain | ✅ exact → en → first → scientificName |
| `plantGroups` dùng `record<string,string>` | ✅ OK cho small embedded i18n |
| `careContent` dạng JSON string + `contentVersion` | ✅ Tốt cho caching on device |

---

## 3. Identified Gaps

### 3.1 — Không hỗ trợ Variants

**Ví dụ thực tế:** "Cà chua" (`Solanum lycopersicum`) có nhiều variants:

| Variant | Tên khoa học | Days to Harvest | Đặc điểm |
|---|---|---|---|
| Cherry Tomato | *S. lycopersicum var. cerasiforme* | 50–65 | nhỏ, ngọt |
| Roma Tomato | *S. lycopersicum* (cultivar) | 70–80 | ít nước, làm sốt |
| Beefsteak | *S. lycopersicum* (cultivar) | 80–100 | to, nhiều thịt |
| Grape Tomato | *S. lycopersicum* (cultivar) | 55–70 | oval, ăn sống |

**Vấn đề hiện tại:**

1. `scientificName` là unique key → không thể thêm 2 variants cùng species
2. `typicalDaysToHarvest`, `spacingCm`, `yieldKgPerM2` khác nhau giữa variants nhưng không có chỗ phân biệt
3. Không có `cultivar` field → mất thông tin quan trọng
4. Không có `parentPlantId` → không thể group "tất cả loại cà chua"
5. Trong Library, user search "Tomato" chỉ thấy 1 kết quả thay vì danh sách variants

### 3.2 — Legacy `commonNames[]` vẫn còn trong schema

```typescript
// plantsMaster — dòng 87–94 trong schema.ts
commonNames: v.optional(v.array(v.object({
  locale: v.string(),
  name: v.string(),
})))
```

Field này đã được migrate sang `plantI18n` (via `migratePlantsMasterToI18n`) nhưng **vẫn tồn tại** trong schema → double source of truth, gây confusion cho dev.

### 3.3 — `plantI18n.commonName` thiếu variant context

Hiện tại `commonName = "Tomato"`. Nếu có variants:
- Base plant: commonName = "Tomato" / "Cà chua"  
- Cherry: commonName = "Cherry Tomato" / "Cà chua cherry"

→ Chỉ dùng 1 field `commonName` là OK cho display, nhưng **không có cách distinguish** giữa base name vs variant-specific name nếu cần.

---

## 4. Proposed Solutions

### Option A — Self-referencing `plantsMaster` (Recommended)

Thêm 2 fields vào `plantsMaster`:

```typescript
plantsMaster: defineTable({
  // ... existing fields ...

  // NEW: Variant support
  variantOf: v.optional(v.id("plantsMaster")),  // → base plant
  cultivar: v.optional(v.string()),              // "Cherry", "Roma", "Beefsteak"
})
  .index("by_scientific_name", ["scientificName"])
  .index("by_group", ["group"])
  .index("by_variant_of", ["variantOf"])  // NEW
```

**Data model:**

```
plantsMaster: "Solanum lycopersicum" (variantOf: null, cultivar: null)
  ├── plantsMaster: "S. lycopersicum var. cerasiforme"
  │     variantOf → tomato._id, cultivar = "Cherry"
  │     typicalDaysToHarvest = 55
  ├── plantsMaster: "S. lycopersicum" (Roma)
  │     variantOf → tomato._id, cultivar = "Roma"
  │     typicalDaysToHarvest = 75
  └── plantsMaster: "S. lycopersicum" (Beefsteak)
        variantOf → tomato._id, cultivar = "Beefsteak"
        typicalDaysToHarvest = 90
```

**i18n cho variants:**

```
plantI18n: { plantId: cherry._id, locale: "en", commonName: "Cherry Tomato" }
plantI18n: { plantId: cherry._id, locale: "vi", commonName: "Cà chua cherry" }
plantI18n: { plantId: roma._id, locale: "en", commonName: "Roma Tomato" }
plantI18n: { plantId: roma._id, locale: "vi", commonName: "Cà chua Roma" }
```

**Ưu điểm:**
- Ít breaking change — `userPlants.plantMasterId` vẫn hoạt động
- Variant kế thừa growing params từ base (app logic fallback)
- Library có thể group: "Tomato" → show sub-list variants
- `scientificName` vẫn là key chính, chỉ cần relax unique constraint cho variants

**Nhược điểm:**
- `scientificName` không còn globally unique → cần composite key `(scientificName, cultivar)`
- Logic query phức tạp hơn 1 chút (cần check `variantOf`)
- Chỉ hỗ trợ 1 level nesting (plant → variant), không deep hierarchy

### Option B — Tách thành `plantSpecies` + `plantVarieties`

```typescript
// NEW table: Species-level taxonomy
plantSpecies: defineTable({
  scientificName: v.string(),      // "Solanum lycopersicum" — unique
  family: v.optional(v.string()),   // "Solanaceae"
  genus: v.optional(v.string()),    // "Solanum"
  group: v.string(),                // "nightshades"
  purposes: v.array(v.string()),

  // Shared defaults (inherited by varieties)
  lightRequirements: v.optional(v.string()),
  soilPref: v.optional(v.string()),

  // Relationships
  companionSpecies: v.optional(v.array(v.id("plantSpecies"))),
  avoidSpecies: v.optional(v.array(v.id("plantSpecies"))),

  imageUrl: v.optional(v.string()),
})
  .index("by_scientific_name", ["scientificName"])
  .index("by_group", ["group"])

// RENAMED: plantsMaster → plantVarieties
plantVarieties: defineTable({
  speciesId: v.id("plantSpecies"),  // FK → species
  cultivar: v.optional(v.string()), // "Cherry", "Roma", null for default
  isDefault: v.boolean(),           // true = the "generic" variety

  // Growing params (override species defaults)
  typicalDaysToHarvest: v.optional(v.number()),
  germinationDays: v.optional(v.number()),
  spacingCm: v.optional(v.number()),
  wateringFrequencyDays: v.optional(v.number()),
  fertilizingFrequencyDays: v.optional(v.number()),
  maxPlantsPerM2: v.optional(v.number()),
  yieldKgPerM2: v.optional(v.number()),
  waterLitersPerM2: v.optional(v.number()),

  imageUrl: v.optional(v.string()),
  source: v.optional(v.string()),
})
  .index("by_species", ["speciesId"])
  .index("by_species_cultivar", ["speciesId", "cultivar"])

// i18n covers both levels
speciesI18n: defineTable({
  speciesId: v.id("plantSpecies"),
  locale: v.string(),
  commonName: v.string(),          // "Tomato" / "Cà chua"
  description: v.optional(v.string()),
})
  .index("by_species_locale", ["speciesId", "locale"])

varietyI18n: defineTable({
  varietyId: v.id("plantVarieties"),
  locale: v.string(),
  displayName: v.string(),         // "Cherry Tomato" / "Cà chua cherry"
  description: v.optional(v.string()),
  careContent: v.optional(v.string()),
  contentVersion: v.optional(v.number()),
})
  .index("by_variety_locale", ["varietyId", "locale"])

// userPlants now references variety
userPlants: defineTable({
  // CHANGE: plantMasterId → varietyId
  varietyId: v.optional(v.id("plantVarieties")),
  // ... rest stays the same
})
```

**Data flow ví dụ:**

```
plantSpecies: { scientificName: "Solanum lycopersicum", group: "nightshades" }
  ├── plantVarieties: { cultivar: null, isDefault: true, daysToHarvest: 70 }
  ├── plantVarieties: { cultivar: "Cherry", daysToHarvest: 55 }
  └── plantVarieties: { cultivar: "Roma", daysToHarvest: 75 }

speciesI18n:  { locale: "en", commonName: "Tomato" }
speciesI18n:  { locale: "vi", commonName: "Cà chua" }
varietyI18n:  { varietyId: cherry._id, locale: "en", displayName: "Cherry Tomato" }
varietyI18n:  { varietyId: cherry._id, locale: "vi", displayName: "Cà chua cherry" }
```

**Ưu điểm:**
- Chuẩn taxonomy — tách rõ species vs variety/cultivar
- Mở rộng dễ: sau này thêm subspecies, hybrid, v.v.
- i18n sạch: species-level name vs variety-level name tách biệt
- Query Library mạnh: search "Tomato" → hit speciesI18n → load all varieties
- Growing params inherit rõ ràng: variety → species default

**Nhược điểm:**
- **Breaking change lớn**: rename `plantsMaster` → `plantVarieties`, đổi FK
- Nhiều tables hơn → query phức tạp hơn (join species + variety + i18n)
- Migration data phức tạp
- Các table liên quan (`userFavorites`, `preservationRecipes.suitablePlants`, `companionPlants`) đều cần update FK

---

## 5. So sánh Option A vs B

| Tiêu chí | Option A | Option B |
|---|---|---|
| **Breaking changes** | Nhỏ — thêm 2 fields | Lớn — rename table, đổi FK |
| **Migration effort** | ~1 ngày | ~3–5 ngày |
| **Taxonomy accuracy** | OK cho 95% use cases | Chuẩn khoa học |
| **Query complexity** | Thêm 1 index | Thêm 2 tables + join |
| **Variant nesting** | 1 level (plant → variant) | Rõ ràng species → variety |
| **Future-proof** | Đủ dùng 2–3 năm | Đủ dùng lâu dài |
| **Library UX** | Group bằng `variantOf` query | Group tự nhiên bằng `speciesId` |
| **i18n granularity** | 1 level `plantI18n` | 2 level: species + variety |

---

## 6. Recommendation — Option A cho hiện tại

> [!IMPORTANT]
> **Khuyến nghị: Dùng Option A trước**, vì:
> 1. Richfarm đang ở giai đoạn sớm — chưa cần full taxonomy
> 2. Breaking change risk thấp — chỉ thêm fields, không đổi table structure
> 3. Có thể migrate lên Option B sau nếu cần (data transformation straightforward)
> 4. Giữ velocity cao — không block các feature khác

> [!NOTE]
> **Nếu sau này** app phát triển tới mức cần: subspecies, hybrids, botanical classification, community-contributed varieties → thì migrate lên Option B.

---

## 7. Action Items (nếu chọn Option A)

### Phase 1 — Schema Update
- [ ] Thêm `variantOf: v.optional(v.id("plantsMaster"))` vào `plantsMaster`
- [ ] Thêm `cultivar: v.optional(v.string())` vào `plantsMaster`  
- [ ] Thêm index `by_variant_of: ["variantOf"]`
- [ ] Relax `scientificName` unique constraint (cho phép variants cùng species)
- [ ] Xóa legacy `commonNames[]` field khỏi `plantsMaster` schema

### Phase 2 — Seed Data
- [ ] Thêm seed data cho common variants (Cherry Tomato, Thai Basil, v.v.)
- [ ] Thêm `plantI18n` rows cho variants × locales

### Phase 3 — App Integration
- [ ] Update Library screen: group variants dưới base plant
- [ ] Update Plant Scanner: khi AI identify "Cherry Tomato" → match variant
- [ ] Update Dashboard PlantManager: hiển thị variant hierarchy

### Phase 4 — Cleanup
- [ ] Remove `commonNames[]` field sau khi confirm 100% migrated
- [ ] Remove `migratePlantsMasterToI18n` migration function
