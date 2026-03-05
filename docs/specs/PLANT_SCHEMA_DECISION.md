# Plant Schema Decision — Cách xử lý, Discussion, Solution

> Date: 2026-03-04  
> Status: Agreed direction  
> Scope: plantsMaster, plantI18n, seed/admin/sync, library/search/scanner

## 1) Tóm tắt discussion

1. `Roma` và `Beefsteak` là **2 giống khác nhau** (cultivar), nhưng cùng **1 loài** cà chua.
2. Vì vậy nếu chỉ lưu scientific name ở mức loài thì có thể đụng trùng khi thêm nhiều giống.
3. `commonName` là dữ liệu theo ngôn ngữ, không nên nằm trong master table.
4. Hướng thống nhất: master giữ dữ liệu khoa học; tên hiển thị nằm ở bảng i18n.

## 2) Cách xử lý (đã thống nhất)

### 2.1 Data model — Flat single table

Giữ **1 table `plantsMaster`** cho cả species lẫn cultivar (không tách table riêng).

`plantsMaster` chỉ giữ dữ liệu phi ngôn ngữ:
- `genus` (chi) — e.g. `"Solanum"`
- `species` (loài) — e.g. `"lycopersicum"`
- `cultivar` (giống, optional) — e.g. `"Cherry"`, `"Roma"`, `null` cho base
- các thông số trồng: days to harvest, spacing, watering frequency, yield, ...
- quan hệ cây trồng: companion/avoid/pests

Không lưu `commonName/commonNames` trong `plantsMaster`.

**Convention base vs variant:**
- `cultivar = null` → đây là **base species** (e.g. "Tomato" nói chung)
- `cultivar = "Cherry"` → đây là **variant** thuộc cùng `(genus, species)`
- Library UI group variants dưới base bằng query `(genus, species)` match

### 2.2 I18n

`plantI18n` là nguồn **duy nhất** cho dữ liệu ngôn ngữ:
- `plantId` — FK → `plantsMaster`
- `locale` — `"en"`, `"vi"`, ...
- `commonName` — tên hiển thị (e.g. "Cherry Tomato" / "Cà chua cherry")
- `description`
- `careContent`, `contentVersion`

### 2.3 Schema example

```typescript
plantsMaster: defineTable({
  // Taxonomy (thay scientificName đơn lẻ)
  genus: v.string(),
  species: v.string(),
  cultivar: v.optional(v.string()),

  // Normalized fields cho dedupe
  genusNormalized: v.string(),
  speciesNormalized: v.string(),
  cultivarNormalized: v.string(),  // "__default__" nếu null

  // Giữ scientificName cho backward compat (computed: "Genus species")
  scientificName: v.string(),

  // Classification
  group: v.string(),
  family: v.optional(v.string()),
  purposes: v.array(v.string()),

  // Growing info (mỗi cultivar có thể khác nhau)
  typicalDaysToHarvest: v.optional(v.number()),
  germinationDays: v.optional(v.number()),
  lightRequirements: v.optional(v.string()),
  spacingCm: v.optional(v.number()),
  wateringFrequencyDays: v.optional(v.number()),
  fertilizingFrequencyDays: v.optional(v.number()),
  // ...other growing params...

  // Relationships
  companionPlants: v.optional(v.array(v.id("plantsMaster"))),
  avoidPlants: v.optional(v.array(v.id("plantsMaster"))),
  pestsDiseases: v.optional(v.array(v.string())),

  // Media
  imageUrl: v.optional(v.string()),
  source: v.optional(v.string()),
})
  .index("by_scientific_name", ["scientificName"])
  .index("by_group", ["group"])
  .index("by_genus_species", ["genusNormalized", "speciesNormalized"])
  .index("by_genus_species_cultivar", ["genusNormalized", "speciesNormalized", "cultivarNormalized"])
```

### 2.4 Data ví dụ

```
plantsMaster: genus="Solanum", species="lycopersicum", cultivar=null
  → scientificName="Solanum lycopersicum", cultivarNormalized="__default__"
  → plantI18n: {locale:"en", commonName:"Tomato"}, {locale:"vi", commonName:"Cà chua"}

plantsMaster: genus="Solanum", species="lycopersicum", cultivar="Cherry"
  → scientificName="Solanum lycopersicum", cultivarNormalized="cherry"
  → plantI18n: {locale:"en", commonName:"Cherry Tomato"}, {locale:"vi", commonName:"Cà chua cherry"}

plantsMaster: genus="Solanum", species="lycopersicum", cultivar="Roma"
  → scientificName="Solanum lycopersicum", cultivarNormalized="roma"
  → plantI18n: {locale:"en", commonName:"Roma Tomato"}, {locale:"vi", commonName:"Cà chua Roma"}
```

## 3) Solution kỹ thuật chống trùng

### 3.1 Canonical + normalize

Thêm field normalize để dedupe ổn định:
- `genusNormalized` — lowercase, trimmed
- `speciesNormalized` — lowercase, trimmed
- `cultivarNormalized` — lowercase, trimmed; map `null/empty` về `"__default__"`

### 3.2 Unique rules

Unique key: **`(genusNormalized, speciesNormalized, cultivarNormalized)`**

Rules:
- Chỉ cho phép đúng **1 row** với `cultivarNormalized = "__default__"` cho mỗi `(genus, species)` — đây là base
- Mỗi cultivar name phải unique trong cùng species

> **Lưu ý Convex:** Convex DB **không có compound unique constraint**. Unique phải enforce bằng **mutation guard code**:
>
> ```typescript
> // Trong mutation create/upsert:
> const existing = await ctx.db
>   .query("plantsMaster")
>   .withIndex("by_genus_species_cultivar", (q) =>
>     q.eq("genusNormalized", gNorm)
>      .eq("speciesNormalized", sNorm)
>      .eq("cultivarNormalized", cNorm)
>   )
>   .unique();
> if (existing) throw new Error("Duplicate plant entry");
> ```

### 3.3 Synonym table (defer — implement khi cần)

Bảng `taxonSynonyms` để map tên cũ/đồng nghĩa về bản chuẩn:
- `nameNormalized` → `targetPlantId`
- Ví dụ: `"Rosmarinus officinalis"` → plant._id của `"Salvia rosmarinus"`

> **Defer lý do:** Chỉ cần khi bắt đầu import data từ nhiều external sources (USDA, plant.id API, community). Không block migration hiện tại.

### 3.4 Companion / Avoid — cách reference giữa các plants

`companionPlants` và `avoidPlants` lưu bằng **Convex `_id`** (auto-generated, random string):

```typescript
companionPlants: v.optional(v.array(v.id("plantsMaster"))),
avoidPlants: v.optional(v.array(v.id("plantsMaster"))),
```

Khi display, app join qua `plantI18n` để lấy tên theo locale:

```
Basil (_id: "abc123")
  companionPlants: ["xyz789"]  ← _id của Tomato base

// Display flow:
// 1. Đọc companionPlants → ["xyz789"]
// 2. Query plantI18n(plantId="xyz789", locale="vi") → "Cà chua"
// 3. Hiển thị: "Cây bạn đồng hành: Cà chua"
```

> **`_id` là auto-generated** — Convex tự tạo, random string, **không derive từ tên hay taxonomy**. Business key để tìm đúng plant là `(genusNorm, speciesNorm, cultivarNorm)`, còn `_id` chỉ là internal reference.

### 3.5 Companion / Avoid — species level, variant kế thừa

Quan hệ companion/avoid là **đặc tính sinh học của loài**, không phải giống. Vì vậy:

- **Lưu ở base plant** (`cultivar = null`) — e.g. Basil companion với Tomato base
- **Variant tự động kế thừa** từ base — Cherry Tomato kế thừa companion từ Tomato

```typescript
// Helper: lấy companion plants (variant fallback lên base)
async function getCompanionPlants(ctx, plant) {
  // Nếu plant có companion riêng → dùng
  if (plant.companionPlants?.length) return plant.companionPlants;

  // Nếu là variant → fallback lên base
  if (plant.cultivar) {
    const base = await ctx.db
      .query("plantsMaster")
      .withIndex("by_genus_species_cultivar", (q) =>
        q.eq("genusNormalized", plant.genusNormalized)
         .eq("speciesNormalized", plant.speciesNormalized)
         .eq("cultivarNormalized", "__default__")
      )
      .unique();
    return base?.companionPlants ?? [];
  }

  return [];
}
```

### 3.6 Seed data — 2-pass pattern cho circular references

Vì `_id` auto-generated, khi Basil cần `_id` của Tomato và ngược lại → **chicken-and-egg problem**.

Giải pháp: **insert trước, patch sau**:

```typescript
// === Pass 1: Insert tất cả plants (chưa có companion/avoid) ===
const tomatoId = await ctx.db.insert("plantsMaster", {
  genus: "Solanum", species: "lycopersicum", /* ... */
  companionPlants: [],
  avoidPlants: [],
});
const basilId = await ctx.db.insert("plantsMaster", {
  genus: "Ocimum", species: "basilicum", /* ... */
  companionPlants: [],
  avoidPlants: [],
});

// === Pass 2: Patch relationships (giờ có đủ _id) ===
await ctx.db.patch(tomatoId, { companionPlants: [basilId] });
await ctx.db.patch(basilId, { companionPlants: [tomatoId] });
```

Seed data nên define relationships dạng **lookup map** để dễ maintain:

```typescript
// Seed config (dùng scientificName làm key tạm)
const companionMap = {
  "Solanum lycopersicum": ["Ocimum basilicum", "Allium sativum"],
  "Ocimum basilicum": ["Solanum lycopersicum"],
};

// Sau khi insert hết → resolve names thành _id → patch
```

## 4) Impacted tables & FKs

Các table reference `plantsMaster._id` — **FK vẫn valid** (không đổi _id), nhưng cần aware:

| Table | Field | Impact |
|---|---|---|
| `userPlants` | `plantMasterId` | Không đổi — vẫn trỏ tới đúng plant row |
| `userFavorites` | `plantMasterId` | Không đổi |
| `plantI18n` | `plantId` | Không đổi |
| `preservationRecipes` | `suitablePlants[]` | Không đổi |
| `plantsMaster` | `companionPlants[]`, `avoidPlants[]` | Không đổi |

> **Lưu ý:** Khi thêm variants mới (e.g. Cherry Tomato), user cũ đang link tới base Tomato vẫn giữ nguyên. User mới có thể chọn variant cụ thể.

## 5) Migration plan (an toàn, ít rủi ro)

### Phase 1 — Additive changes
1. Thêm `genus`, `species`, `cultivar` + normalized fields vào schema.
2. Backfill từ `scientificName` hiện tại: parse `"Solanum lycopersicum"` → genus + species.
3. Set `cultivarNormalized = "__default__"` cho tất cả rows hiện tại.
4. Cập nhật mutation code: normalize + unique check.
5. Vẫn giữ `commonNames` tạm thời để tránh break.

### Phase 2 — Read path switch
1. Library/Scanner/Search chỉ đọc tên từ `plantI18n`.
2. Seed/Admin/Sync upsert theo key `(genusNorm, speciesNorm, cultivarNorm)`.
3. Thêm test: tạo 2 cultivars cùng species → verify unique check hoạt động.
4. Library UI: group variants dưới base bằng `by_genus_species` index.

### Phase 3 — Cleanup
1. Xóa hoàn toàn `commonNames` khỏi `plantsMaster` schema.
2. Xóa `migratePlantsMasterToI18n` migration function.
3. Chạy kiểm tra regression: add/search/favorite/recipe links/scanner.

## 6) Quy tắc vận hành dữ liệu

1. **Không dùng display name để dedupe** — chỉ dùng taxonomy fields.
2. **Mọi import/create bắt buộc qua normalize + unique check** trong mutation code.
3. **`plantI18n` là single source of truth** cho tên đa ngôn ngữ.
4. **Fallback locale chain:** `exact → en → first → scientificName`.
5. **Base vs variant convention:** `cultivar = null` → base, `cultivar != null` → variant.
6. **`scientificName` field giữ lại** cho backward compat, computed từ `genus + species`.

## 7) Kết luận

Hướng được chọn:
- **Flat single table** — giữ `plantsMaster` cho cả species và cultivar
- **Giữ master thuần khoa học** (`genus + species + cultivar`)
- **Đưa toàn bộ common name sang `plantI18n`**
- **Unique enforce bằng mutation guard** + normalized index
- **Synonym table defer** — implement khi cần import external data
- **Zero FK breaking change** — tất cả existing references vẫn valid

## 8) Re-check 4 issues (sau khi chốt DB-first)

| # | Issue | Còn tồn tại với DB mới? | Có fix được không? | Cách fix chốt |
|---|---|---|---|---|
| 1 | Backfill parse từ `scientificName` legacy | Có | Có | Không ép parse 100%: thêm `parseStatus` (`ok` / `manual_review`), cho phép hàng legacy chưa parse vào hàng đợi review |
| 2 | Lookup theo `scientificName` gây mơ hồ khi nhiều cultivar | Có (trong giai đoạn chuyển tiếp) | Có | Chuyển identity/read-write sang `(genusNorm, speciesNorm, cultivarNorm)`, chỉ giữ `scientificName` cho display/backward compat |
| 3 | Invariant base/variant (xóa base khi còn variants) | Có | Có | Thêm mutation guard: cấm xóa base khi còn variant, cấm tạo variant nếu chưa có base |
| 4 | Rollout required fields quá sớm | Có | Có | Rollout theo phase: `optional` → backfill + verify → mới chuyển `required` |

### 8.1 Quyết định thực thi

1. 4 issue trên được giữ trong checklist migration bắt buộc trước khi seed variants diện rộng.
2. Ưu tiên đóng #2 và #4 trước khi rollout production, vì ảnh hưởng trực tiếp tới tính đúng của read/write path.
3. #1 cần thêm bước vận hành (manual review queue) để tránh làm fail migration hàng loạt.

## 9) Refactor plan (execution-ready)

Mục tiêu: chuyển từ model cũ (`scientificName`-centric + `commonNames`) sang model DB-first (`genus/species/cultivar` + i18n-only common name) mà không break dữ liệu hiện có.

### Phase 0 — Freeze scope và guard rollout

1. Tạm thời **không seed thêm variants mới** cho đến khi xong Phase 3.
2. Chốt invariants bắt buộc:
   - Business key: `(genusNormalized, speciesNormalized, cultivarNormalized)`
   - `cultivarNormalized="__default__"` là base species
   - Không xóa base nếu còn variants
3. Chuẩn bị feature flag nếu cần rollback read-path (`useTaxonomyIdentity`).

Exit criteria:
- Team đồng ý invariants + rollout order.

### Phase 1 — Schema additive (không breaking)

File chính:
- `convex/schema.ts`

Việc cần làm:
1. Thêm fields mới vào `plantsMaster` (để `optional` ở phase này):
   - `genus`, `species`, `cultivar`
   - `genusNormalized`, `speciesNormalized`, `cultivarNormalized`
   - `taxonomyParseStatus` (`ok` | `manual_review`) (optional)
2. Thêm indexes:
   - `by_genus_species`
   - `by_genus_species_cultivar`
3. Giữ tạm:
   - `scientificName` (backward compat)
   - `commonNames` (legacy read/write tạm thời)

Exit criteria:
- Deploy schema thành công, chưa cần đổi behavior app.

### Phase 2 — Backfill + normalize pipeline

File chính:
- `convex/plantI18n.ts` (hoặc file migration mới, ví dụ `convex/plantTaxonomyMigration.ts`)

Việc cần làm:
1. Tạo internal mutation backfill taxonomy từ dữ liệu hiện có.
2. Parse `scientificName` theo rule an toàn:
   - parse được: set `taxonomyParseStatus="ok"`
   - không parse chắc chắn: set `taxonomyParseStatus="manual_review"`, không fail toàn migration
3. Với rows cũ chưa có cultivar:
   - `cultivar=null`
   - `cultivarNormalized="__default__"`
4. Sinh normalized fields và patch dần theo batch.

Exit criteria:
- 100% rows có normalized fields.
- Danh sách rows `manual_review` được xuất ra để xử lý tay.

### Phase 3 — Write-path refactor (enforce DB invariants)

Files:
- `convex/plantAdmin.ts`
- `convex/masterSync.ts`
- `convex/seed.ts`
- `convex/plantI18n.ts` (sync/upsert logic)

Việc cần làm:
1. Mọi create/update/upsert plant đều đi qua normalize helper chung.
2. Enforce duplicate guard bằng index `by_genus_species_cultivar`.
3. Không dùng `by_scientific_name` làm identity cho upsert nữa.
4. Guard nghiệp vụ:
   - cấm tạo variant khi chưa có base `__default__`
   - cấm xóa base khi vẫn còn variants
5. Seed áp dụng 2-pass như section 3.6 (insert trước, patch relations sau).

Exit criteria:
- Không còn write-path nào dựa vào `scientificName` để định danh bản ghi.

### Phase 4 — Read-path refactor (library/scanner/search)

Files:
- `convex/plantLibrary.ts`
- Các hooks/UI đọc library: `hooks/usePlantLibrary.ts`, `hooks/usePlants.ts`, màn `app/(tabs)/library/*`, `app/(tabs)/garden/*`

Việc cần làm:
1. Read identity theo plant `_id` + taxonomy fields, không assume `scientificName` unique.
2. Group variants dưới base bằng index `by_genus_species`.
3. Search/scan:
   - tên hiển thị lấy từ `plantI18n`
   - scientific lookup chỉ là tín hiệu phụ, không dùng để khẳng định unique
4. Fallback locale giữ nguyên: `exact -> en -> first -> scientificName`.

Exit criteria:
- UI hiển thị đúng nhóm base/variant.
- Scanner không trả sai plant khi có nhiều cultivar cùng loài.

### Phase 5 — Cleanup legacy

Files:
- `convex/schema.ts`
- `convex/plantI18n.ts`
- `convex/plantAdmin.ts`
- `convex/masterSync.ts`

Việc cần làm:
1. Xóa `commonNames` khỏi `plantsMaster` schema.
2. Xóa logic ghi/đọc `commonNames` trong admin/sync.
3. Xóa `migratePlantsMasterToI18n` khi xác nhận không còn dependency.
4. Giữ `scientificName` dạng computed/backward compat (không dùng làm unique).

Exit criteria:
- Không còn legacy path phụ thuộc `commonNames`.

### Phase 6 — Verification matrix

Test bắt buộc:
1. Tạo base + 2 cultivars cùng species (Roma/Beefsteak) thành công.
2. Tạo duplicate cultivar trong cùng species bị reject.
3. Tạo cùng cultivar ở species khác được phép.
4. Xóa base khi còn variant bị reject.
5. i18n fallback đúng khi thiếu locale.
6. Seed + sync chạy lại không tạo duplicate.
7. Recipe/favorite/userPlants links vẫn hoạt động với dữ liệu cũ.

### Rollback strategy

1. Nếu lỗi read-path: bật lại feature flag cũ, giữ schema additive.
2. Không rollback data đã backfill; chỉ rollback query path.
3. Cleanup (Phase 5) chỉ chạy sau khi qua full regression ở staging.

## 10) Runbook — taxonomy backfill

Lệnh chạy qua CLI:

```bash
# 1) Dry run 100 rows
npx convex run plantTaxonomyMigration:runTaxonomyBackfill '{"dryRun":true,"limit":100}'

# 2) Chạy thật 100 rows/batch (có confirm token)
npx convex run plantTaxonomyMigration:runTaxonomyBackfill '{"dryRun":false,"limit":100,"confirm":"BACKFILL_TAXONOMY"}'

# 3) Lặp lại step 2 đến khi scanned = 0

# 4) Xem danh sách cần manual review
npx convex run plantTaxonomyMigration:listTaxonomyManualReview '{"limit":200}'
```

Quy tắc vận hành:
1. Luôn chạy dry run trước mỗi đợt lớn.
2. Chạy batch nhỏ (100-300) để dễ rollback query path nếu có issue.
3. Chỉ sang Phase 3/4 khi số row `manual_review` đã được xử lý/chấp nhận rõ ràng.

## 11) Progress update (2026-03-05)

### 11.1 Đã hoàn thành

1. Detail plant đã hiển thị variants cùng species và cho phép chuyển variant trực tiếp trong màn detail.
2. Seed data đã thêm variants mẫu cho Tomato:
   - Base (`cultivar=null`)
   - `Roma`, `Beefsteak`, `Cherry`
3. Seed/i18n sync đã chuyển sang key theo taxonomy (`genus/species/cultivar`), không còn dùng `scientificName` làm identity cho write-path chính.
4. Đã thêm guard nghiệp vụ:
   - Variant cultivar thường phải có base species row (`cultivarNormalized="__default__"`).
   - Infraspecific taxa (`subsp./var./f.`) được allow không cần base row riêng.
   - Cấm xóa base khi còn variants (đã có từ trước, giữ nguyên).
5. Offline seed fallback trong app đã hỗ trợ key theo variant để không bị đè tên giữa các cultivar.
6. Đã cleanup legacy:
   - Xóa write-path `commonNames` khỏi admin/sync.
   - Xóa function `migratePlantsMasterToI18n`.
   - Drop `commonNames` khỏi schema sau khi dọn data thành công.
7. Đã bổ sung check functions dạng “test tự động”:
   - `plantTaxonomyChecks:taxonomyInvariantReport`
   - `plantTaxonomyChecks:assertTaxonomyInvariants`
   - `plantTaxonomyChecks:seedAlignmentReport`
8. Đã xử lý duplicate lịch sử do parse infraspecific:
   - Thêm logic infer cultivar từ `subsp./var./f.`
   - Merge + rewire + xóa legacy duplicates bằng `resolveLegacyInfraspecificDuplicates`.
9. Đã thêm CI workflow:
   - `.github/workflows/taxonomy-invariants.yml`
   - Chạy `npm run check:taxonomy` trên PR và push `main`.

### 11.2 Verify đã chạy

1. `seed:seedAll` chạy ổn định, không tiếp tục tạo duplicate (`plants.inserted = 0` ở lần chạy sau).
2. `plantImages:getPlantVariants` cho Tomato trả đúng 4 rows ở cả `en` và `vi`.
3. Convex typecheck pass: `npx tsc -p convex/tsconfig.json --noEmit`.
4. Invariant checks pass 100%:
   - duplicateIdentity = 0
   - missingIdentity = 0
   - variantWithoutBase = 0
   - missingI18nLocales = 0
   - orphanI18n = 0
5. Seed alignment pass:
   - missingSeedPlants = 0
   - duplicateSeedPlants = 0
   - missingSeedI18n = 0

### 11.3 Còn lại (phase tiếp theo)

1. Bổ sung CI hook để chạy `plantTaxonomyChecks:assertTaxonomyInvariants` theo lịch (hoặc trước release).
2. (Tùy chọn) chuẩn hóa thêm dictionary cho infraspecific rank nếu cần import dữ liệu học thuật rộng hơn.
3. Thiết lập GitHub secrets cho CI:
   - `CONVEX_DEPLOY_KEY` (bắt buộc)
   - `CONVEX_DEPLOYMENT` (khuyến nghị để cố định target deployment)
