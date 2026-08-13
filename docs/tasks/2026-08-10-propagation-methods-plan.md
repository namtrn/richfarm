# Kế hoạch bổ sung `propagationMethods`

Ngày: 2026-08-10
Trạng thái: Draft
Phạm vi: master plant, care profile, sync, API, dashboard, mobile và nội dung đa ngôn ngữ

Đã rà soát code-vs-plan: 2026-08-10 (xem §13 Nhật ký rà soát cuối tài liệu).

## 1. Mục tiêu

Bổ sung trường có cấu trúc `propagationMethods` để mô tả các phương pháp có thể dùng để tạo cây mới, ví dụ gieo hạt, giâm cành, chiết cành hoặc ghép cây.

Trường này phục vụ:

- hiển thị nhanh các phương pháp nhân giống trong Plant Detail;
- tạo nền tảng cho tìm kiếm và lọc theo phương pháp nhân giống ở giai đoạn sau;
- kiểm tra sự nhất quán giữa dữ liệu có cấu trúc và `careContent`;
- hỗ trợ nội dung đa ngôn ngữ mà không lưu tên hiển thị trực tiếp trong master data;
- mở đường cho hướng dẫn theo từng phương pháp trong các giai đoạn sau.

## 2. Phân biệt trách nhiệm dữ liệu

### `propagationMethods`

Danh sách tag chuẩn, không phụ thuộc ngôn ngữ:

```json
{
  "propagationMethods": ["seed", "stem_cutting"]
}
```

### `careContent`

Hướng dẫn Markdown chi tiết bằng từng locale, ví dụ cách ngâm hạt, chuẩn bị cành giâm và chăm sóc sau khi trồng.

### `growthStage`

Giai đoạn phát triển của cây như cây con, sinh trưởng thân lá, ra hoa hoặc thu hoạch. Đây không phải phương pháp nhân giống.

### `source`

Nguồn dữ liệu và provenance. Không dùng `source` để lưu hoặc hiển thị phương pháp nhân giống.

Nguồn thông tin là metadata dành cho biên tập và kiểm duyệt. Mobile không hiển thị tên tổ chức, URL hoặc citation trong `careContent` ở v1; chỉ hiển thị ngày cập nhật gần nhất của bản đã review/publish.

### Vì sao `source` hiện gây nhầm lẫn?

Trong dữ liệu và giao diện cũ, `source` từng được dùng với nghĩa **nguồn vật liệu hoặc cách bắt đầu cây**:

```ts
source: "seed"     // trồng từ hạt
source: "cutting"  // trồng từ cành giâm
source: "bulb"     // trồng từ thân hành
```

Vì vậy, mobile hiện vẫn lấy `currentPlant.source` và hiển thị giá trị này dưới nhãn “Propagation”. Theo thiết kế cũ, cách dùng đó có chủ đích.

Sau đó, kiến trúc dữ liệu bổ sung provenance và đặt `source` trong nhóm metadata với nghĩa **nguồn cung cấp thông tin**. Các field provenance hiện không giống nhau giữa hai bảng:

```ts
// plantsMaster
source: "University of Guam"
sourceSystem: "uog-extension"
sourceId: "basella-alba"
sourceUrl: "https://..."

// plantCare
source: "University of Guam"
sourceUrl: "https://..."
```

`sourceSystem` và `sourceId` hiện thuộc `plantsMaster`; `plantCare` chỉ có `source` và `sourceUrl`. Plan này không giả định hai bảng đã có cùng một provenance schema.

Dashboard hiện cũng hiểu `source` theo nghĩa metadata, với ví dụ nhập liệu như một seed catalog. Do dữ liệu cũ chưa được tách hoặc migration hoàn toàn, cùng một field đang mang hai nghĩa:

| Dữ liệu hiện tại | Ý nghĩa thực tế |
|---|---|
| `source: "seed"` | Phương pháp nhân giống bằng hạt |
| `source: "cutting"` | Phương pháp nhân giống bằng cành giâm |
| `source: "bulb"` | Phương pháp nhân giống bằng thân hành |
| `source: "University of Guam"` | Tổ chức cung cấp thông tin |
| `sourceSystem` | Hệ thống cung cấp dữ liệu |
| `sourceUrl` | URL của nguồn thông tin |

Đây không phải trường hợp `source` ban đầu hoàn toàn sai. Nó là thiết kế cũ dành cho cách bắt đầu cây, sau đó bị chồng thêm trách nhiệm provenance mà chưa có migration tách nghĩa.

Quy ước sau khi triển khai plan này:

```ts
propagationMethods: ["seed", "stem_cutting"]
```

chỉ mô tả phương pháp nhân giống; còn:

```ts
source: "University of Guam"
sourceSystem: "uog-extension"
sourceUrl: "https://..."
```

chỉ mô tả provenance trên `plantsMaster`; provenance của `plantCare` tiếp tục dùng `source` và `sourceUrl`. Mobile không được tiếp tục lấy `plantsMaster.source` để hiển thị dưới nhãn “Propagation”.

## 3. Danh mục phương pháp chuẩn

| Giá trị chuẩn | Tiếng Việt | English | Ghi chú |
|---|---|---|---|
| `seed` | Gieo hạt | Seed | Nhân giống hữu tính bằng hạt |
| `stem_cutting` | Giâm cành | Stem cutting | Tạo cây mới từ một đoạn thân hoặc cành |
| `leaf_cutting` | Giâm lá | Leaf cutting | Tạo cây mới từ lá hoặc phần của lá |
| `root_cutting` | Giâm rễ | Root cutting | Tạo cây mới từ một đoạn rễ |
| `division` | Tách bụi | Division | Chia cây hoặc bụi cây đã trưởng thành |
| `air_layering` | Chiết cành | Air layering | Kích thích cành ra rễ khi vẫn còn gắn với cây mẹ |
| `ground_layering` | Chiết áp cành | Ground layering | Cho một phần cành tiếp xúc với đất để ra rễ |
| `grafting` | Ghép cây | Grafting | Ghép cành hoặc phần thân lên gốc ghép |
| `budding` | Ghép mắt | Budding | Ghép một mắt chồi lên gốc ghép |
| `bulb` | Trồng bằng thân hành | Bulb propagation | Ví dụ hành, tỏi và một số cây cảnh thân hành |
| `corm` | Trồng bằng thân củ | Corm propagation | Nhân giống bằng thân củ đặc |
| `tuber` | Trồng bằng củ | Tuber propagation | Nhân giống bằng thân củ hoặc rễ củ theo dữ liệu cây |
| `rhizome` | Tách thân rễ | Rhizome division | Nhân giống bằng cách chia thân rễ |
| `runner` | Tách ngó | Runner propagation | Tách cây con hình thành trên thân bò |
| `offset` | Tách cây con | Offset propagation | Tách cây con mọc sát cây mẹ |
| `sucker` | Tách chồi | Sucker propagation | Tách chồi mọc từ gốc hoặc hệ rễ |
| `spore` | Gieo bào tử | Spore propagation | Dùng cho dương xỉ và nhóm cây sinh sản bằng bào tử |
| `tissue_culture` | Nuôi cấy mô | Tissue culture | Nhân giống trong điều kiện nuôi cấy kiểm soát |

### Quy tắc danh mục

1. Giá trị chuẩn dùng `snake_case`, chỉ chứa ký tự ASCII và không được dịch.
2. Tên hiển thị nằm trong hệ thống i18n của ứng dụng.
3. Không dùng giá trị chung chung như `other`. Phương pháp chưa có trong danh mục phải đi qua review trước khi bổ sung enum.
4. Chỉ gắn tag khi phương pháp đã được xác nhận cho chính loài hoặc cultivar đó.
5. Không suy ra phương pháp từ cây cùng chi, cùng họ hoặc từ một tên phổ thông tương tự.
6. Base species và cultivar có thể có danh sách khác nhau. Không tự động kế thừa nếu cultivar có hạn chế nhân giống riêng.
7. Thứ tự lưu không mang ý nghĩa ưu tiên. UI chịu trách nhiệm sắp xếp theo thứ tự hiển thị chuẩn.

## 4. Schema đề xuất

### Vị trí dữ liệu

Đề xuất lưu `propagationMethods` trong `plantCare` vì đây là thuộc tính chăm sóc/canh tác, cùng nhóm với gieo trồng, khoảng cách và thời gian nảy mầm. Không lưu trong `plantI18n` hoặc `plantCareI18n` vì giá trị chuẩn không phụ thuộc ngôn ngữ.

```ts
const propagationMethod = v.union(
  v.literal("seed"),
  v.literal("stem_cutting"),
  v.literal("leaf_cutting"),
  v.literal("root_cutting"),
  v.literal("division"),
  v.literal("air_layering"),
  v.literal("ground_layering"),
  v.literal("grafting"),
  v.literal("budding"),
  v.literal("bulb"),
  v.literal("corm"),
  v.literal("tuber"),
  v.literal("rhizome"),
  v.literal("runner"),
  v.literal("offset"),
  v.literal("sucker"),
  v.literal("spore"),
  v.literal("tissue_culture"),
);

plantCare: defineTable({
  // Existing fields...
  propagationMethods: v.optional(v.array(propagationMethod)),
});
```

### Quy tắc validation

- Không chấp nhận phần tử trùng trong cùng một mảng.
- Mảng rỗng và trường bị thiếu đều có nghĩa là chưa có dữ liệu; write path nên chuẩn hóa mảng rỗng thành `undefined` nếu contract hiện tại cho phép.
- Không dùng `null` làm một phương pháp.
- Không lưu label đã dịch như `Gieo hạt` hoặc `Stem cutting` vào mảng.
- Giới hạn số phần tử theo số enum hiện có để ngăn payload bất thường.
- Mọi write path phải dùng chung một validator và hàm normalize.

### Quyết định về `careStatus` và evidence đa nguồn

- Không thêm `propagationMethods` vào `REQUIRED_CARE_FIELDS` trong `packages/shared/src/plantCareStatus.ts` ở v1.
- Vì vậy, việc thêm, sửa hoặc thiếu tag không làm thay đổi kết quả `recomputeCareStatus`.
- Khi có bằng chứng, dùng một entry `careFieldEvidence.propagationMethods` áp dụng cho toàn danh sách phương pháp trong v1.
- Một care field có thể được xác nhận từ nhiều tài liệu. Mở rộng evidence để dùng `sourceRefs[]` thay vì giả định một `sourceSystem/sourceUrl/sourceLocator` duy nhất.
- Không ép toàn bộ care profile hoặc toàn bộ `careContent` dùng chung một nguồn.
- Mỗi source ref phải gắn với thông tin mà nó chứng minh và có `sourceLocator` khi tài liệu hỗ trợ trang/mục/đoạn.
- `plantCareI18n` cũng cần `sourceRefs[]` cho Markdown tổng hợp từ nhiều tài liệu. Các field đơn `source/sourceUrl` hiện tại được giữ làm compatibility input trong giai đoạn migration.
- Mâu thuẫn giữa tag và `careContent` chỉ tạo cảnh báo biên tập, không chặn `careStatus=verified` trong v1.

Ví dụ:

```ts
careFieldEvidence: {
  propagationMethods: {
    status: "verified",
    sourceRefs: [
      {
        sourceSystem: "uog-extension",
        sourceUrl: "https://...",
        sourceLocator: "Propagation and planting",
      },
      {
        sourceSystem: "world-vegetable-center",
        sourceUrl: "https://...",
        sourceLocator: "Page 9, Basella",
      },
    ],
    reviewedAt: 0,
    reviewedBy: "reviewer-id",
  },
}
```

Để tương thích dữ liệu hiện có, read path phải chấp nhận evidence legacy có các field đơn `sourceSystem/sourceUrl/sourceLocator` và project chúng thành một phần tử trong `sourceRefs`. Với `plantCareI18n`, adapter tương tự chuyển `source/sourceUrl` thành `sourceRefs`. Write path mới chỉ ghi mảng; việc xóa field legacy thực hiện sau khi migration và audit hoàn tất.

## 5. Mẫu dữ liệu Mồng tơi

Mồng tơi (*Basella alba*) có thể nhân giống bằng hạt và giâm cành:

```json
{
  "propagationMethods": ["seed", "stem_cutting"]
}
```

Tag chỉ trả lời “có thể nhân giống bằng cách nào”. Các bước thực hiện vẫn nằm trong `careContent` Markdown:

```markdown
## Gieo trồng và nhân giống

Có thể trồng mồng tơi bằng hạt hoặc bằng cách giâm cành...
```

## 6. Thay đổi theo module

### 6.1. Shared contract

- Tạo một module dùng chung cho enum, type, label key và normalize/dedupe.
- Mở rộng shared `CareFieldEvidence` để hỗ trợ `sourceRefs[]` và adapter đọc evidence legacy dạng nguồn đơn.
- Convex, API, dashboard và mobile phải import contract chung khi kiến trúc package cho phép.
- Không định nghĩa lại danh sách enum độc lập ở nhiều nơi.

Vị trí dự kiến:

- `packages/shared/src/plantPropagation.ts`

### 6.2. Convex

- Thêm `propagationMethods` vào `plantCare` schema.
- Mở rộng type `PlantCareProfile`.
- Mở rộng hàm merge care profile vào canonical plant projection.
- Mở rộng admin create/update và master sync.
- Bảo toàn semantics của partial patch: payload không chứa trường này không được xóa dữ liệu đang có.
- Project `careSourceRefs` từ `plantCareI18n.sourceRefs`. Giữ `careSource`/`careSourceUrl` hiện có làm compatibility projection trong thời gian migration; không thêm field gần nghĩa `careSourceLabel`.
- Với provenance của thông số có cấu trúc, project `careFieldEvidence`/`sourceRefs` thay vì dùng `plantsMaster.source`.
- `useAddPlantFlow.sourceLabel` dùng giá trị ổn định `library:plantCare` để chỉ nguồn tạo care plan. Citation thực tế nằm trong `careSourceRefs`/`careFieldEvidence`, không ép nhiều nguồn vào một string label.

Vị trí dự kiến:

- `packages/convex/convex/schema.ts`
- `packages/convex/convex/lib/plantCare.ts`
- `packages/convex/convex/plantAdmin.ts`
- `packages/convex/convex/masterSync.ts`
- các query/projection trả Plant Detail

### 6.3. SQLite và API

- Thêm cột `propagation_methods_json TEXT NOT NULL DEFAULT '[]'` theo convention SQLite hiện tại.
- Parse thành `string[]` khi đọc và serialize khi ghi; mọi read path phải chuẩn hóa `[]` thành `undefined` trước khi tạo canonical projection.
- Áp dụng cùng quy tắc `[] → undefined` trong API response, SQLite mirror và sync projection để không tạo khác biệt giữa các nguồn đọc.
- Thêm Zod validator sử dụng đúng tập enum.
- Mở rộng DTO, create, patch, sync và import/export.
- Bổ sung `propagation_methods` vào mapping snake_case ↔ camelCase dùng chung với các care field hiện có.
- Persist và project `sourceRefs[]` mà không làm mất evidence legacy trong giai đoạn chuyển tiếp.
- Partial update không được ghi đè dữ liệu nếu field bị omit.

Vị trí dự kiến:

- `apps/api/src/db.ts`
- `apps/api/src/master-plants.ts`
- `apps/api/src/convex-sync.ts`
- các test API và sync liên quan

### 6.4. Dashboard

- Thêm multi-select “Propagation methods” trong phần Growing/Care.
- Hiển thị label theo locale quản trị nhưng gửi giá trị enum chuẩn.
- Cho phép bỏ chọn từng phương pháp.
- Không dùng input free text cho trường này.
- Hiển thị cảnh báo nếu `careContent` nói đến một phương pháp chưa có tag hoặc ngược lại; cảnh báo không tự động sửa dữ liệu.
- Cho phép người quản lý thêm nhiều source ref cho `propagationMethods`, gồm source system/name, URL và locator.
- Cho phép quản lý nhiều source ref cho `careContent` theo locale.
- Nguồn chỉ phục vụ quản trị và kiểm duyệt, không được tự động chèn vào Markdown.
- Label `propagation: "Nhân giống"` hiện tại là heading của section `careContent`; không đổi hoặc xóa key này khi thêm multi-select.

Vị trí dự kiến:

- `apps/dashboard/src/types.ts`
- `apps/dashboard/src/constants.ts`
- `apps/dashboard/src/hooks/usePlants.ts`
- `apps/dashboard/src/components/PlantManager.tsx`

### 6.5. Mobile

- Hiển thị các tag trong Plant Detail dưới nhãn “Phương pháp nhân giống” / “Propagation methods”.
- Label lấy từ i18n, không hiển thị enum raw.
- Chỉ render section khi có ít nhất một phương pháp.
- Detail page: thay hàng đang đọc `currentPlant.source` bằng danh sách tag từ `currentPlant.propagationMethods`.
- List/card view: thay hàng đang đọc `plant.source` bằng các tag phương pháp. V1 hiển thị tối đa hai label; nếu nhiều hơn, hiển thị `+N` thay vì kéo dài card.
- Thêm key mới `library.propagation_methods` cho nhãn section. Không đổi nghĩa `library.detail_propagation` vì key này đang được dùng ở nhiều consumer.
- Thêm label enum theo namespace riêng, ví dụ `library.propagation_method_seed` và `library.propagation_method_stem_cutting`.
- Chỉ retire `library.source_*` khỏi mọi locale sau khi tìm kiếm xác nhận không còn consumer nào sử dụng.
- Khi tạo user plant/care plan, `sourceLabel` dùng giá trị ổn định `library:plantCare`. Không lấy `plantsMaster.source` legacy và không gộp nhiều citation thành một string.
- Không hiển thị source name, URL, locator hoặc citation trong `careContent` ở v1.
- Hiển thị `Cập nhật lần cuối` / `Last updated` từ `reviewedAt` của bản published hiện hành; chỉ fallback sang timestamp publish/update của chính phiên bản đang hiển thị, không dùng ngày của tài liệu nguồn.
- `careContent` tiếp tục cung cấp hướng dẫn chi tiết và không được tạo tự động từ tag.

Vị trí dự kiến:

- `apps/mobile/app/(tabs)/library/[masterPlantId].tsx`
- `apps/mobile/app/(tabs)/library/index.tsx`
- `apps/mobile/hooks/useAddPlantFlow.ts`
- `apps/mobile/lib/locales/vi.json`
- `apps/mobile/lib/locales/en.json`
- các locale còn lại
- type/projection của Plant Library

### 6.6. Tìm kiếm và lọc

V1 chỉ lưu, chỉnh sửa và hiển thị `propagationMethods`. Tìm kiếm/lọc theo phương pháp chưa được triển khai trong task này vì cần quyết định riêng về index Convex, filter dashboard và UX mobile.

Contract và canonical projection vẫn phải đưa field ra đầy đủ để một giai đoạn sau có thể bổ sung:

- index hoặc query filter trong Convex;
- filter multi-select trong dashboard;
- filter chips trong Plant Library mobile.

### 6.7. Seed data

Seed source phải được migration cùng runtime database để fresh database và database đã migrate có cùng kết quả:

- Cập nhật `packages/convex/convex/data/plantsMasterSeed.ts`.
- Xóa legacy `source: "seed"`, `source: "cutting"`, `source: "bulb"` khỏi các row mà field này chỉ mang nghĩa propagation.
- Gắn `propagationMethods` vào care fields tương ứng; ít nhất Mồng tơi phải có `["seed", "stem_cutting"]`.
- Cập nhật `packages/convex/convex/seed.ts` để destructure `propagationMethods` khỏi master payload và truyền vào `upsertPlantCareProfile`.
- Re-seed row đã tồn tại phải có khả năng cập nhật care profile, không chỉ patch `family`.
- Fresh seed và re-seed phải tạo cùng canonical projection, không tái sinh `plantsMaster.source` legacy.
- Annotate fixture test: `packages/convex/convex/plantLibraryPhase3.test.ts` line 256-258 dùng `source_system: "seed"` + `source: "seed"` làm identity argument cho `deletePlantFromBackend` (test xóa base plant có variants) — đây là giá trị `source_system`, KHÔNG phải fixture `plantsMaster.source` legacy. Giữ nguyên nếu chỉ là identity sync; test mới cho `propagationMethods` không được lấy nguồn dữ liệu từ `source` legacy, mà phải ghi enum mới trực tiếp vào care profile fixture.

## 7. Migration và backfill

### Giai đoạn 1 — Additive

1. Thêm enum contract và trường optional end-to-end.
2. Deploy read path có khả năng xử lý field bị thiếu.
3. Deploy write path và dashboard editor, nhưng chưa chuyển mobile khỏi legacy display.
4. Sửa `plantsMasterSeed.ts` và `seed.ts` để fresh seed không tái tạo dữ liệu legacy.
5. Chưa backfill dữ liệu hàng loạt ngoài tập legacy cần cho cutover.

### Giai đoạn 2 — Backfill có bằng chứng

1. Migrate/backfill toàn bộ row `plantsMaster.source` legacy đủ điều kiện auto-map trước khi đổi UI.
2. Verify coverage và canonical projection của tập legacy; không còn row đủ điều kiện nhưng thiếu `propagationMethods`.
3. Backfill danh sách cây ưu tiên đã có nội dung nhân giống được kiểm duyệt.
4. Với Mồng tơi, ghi `seed` và `stem_cutting` kèm `careFieldEvidence.propagationMethods.sourceRefs`.
5. Không dùng parser keyword để tự động publish tag từ `careContent`.
6. Parser có thể tạo candidate report, nhưng mỗi candidate phải được review trước khi ghi.

### Giai đoạn 3 — Mobile cutover

Chỉ deploy mobile switch sau khi Giai đoạn 2 đã pass:

1. Detail page và list/card view chuyển từ `source` sang `propagationMethods`.
2. `useAddPlantFlow.sourceLabel` chuyển sang giá trị ổn định `library:plantCare`; provenance chi tiết tiếp tục nằm trong source refs.
3. Nếu cần một giai đoạn chuyển tiếp trước khi backfill hoàn tất, giữ legacy display fallback và bổ sung tạm `library.source_bulb` cho mọi locale phát hành.
4. Sau khi không còn consumer, xóa fallback và retire toàn bộ `library.source_*`.

### Migration riêng cho `source` legacy

Legacy propagation nằm ở `plantsMaster.source`, không nằm ở `plantCare.source` hoặc `plantCareI18n.source`. Migration phải đọc `plantsMaster`, sau đó ghi tag mới vào care profile tương ứng. Không quét hoặc xóa provenance trên hai bảng care.

Discriminator dùng cặp `(source, sourceSystem/sourceId)`, không chỉ dùng giá trị `source`:

- Chỉ auto-map khi `plantsMaster.source` thuộc tập legacy đã khóa và cả `sourceSystem`, `sourceId` đều bị thiếu.
- Nếu có `sourceSystem` hoặc `sourceId` (ngoại trừ đúng chữ ký backfill bên dưới), coi row là provenance hoặc dữ liệu nhập nhằng và đưa vào manual review, kể cả khi `source` có giá trị `seed`, `cutting` hoặc `bulb`.
- Ngoại lệ chữ ký backfill: row có `sourceSystem === "convex"` và `sourceId === String(_id)` (đúng cặp giá trị mà `backfillCanonicalMetadata` ghi khi thiếu identity — masterSync.ts:542-543) vẫn được coi là legacy-eligible để auto-map, vì cặp identity này không phải provenance thật.
- Tên tổ chức, catalog, URL hoặc giá trị khác không được tự chuyển thành propagation tag.

Ràng buộc thứ tự và chống mất dữ liệu trước khi migration chạy:

- Chạy migration propagation TRƯỚC khi chạy `backfillCanonicalMetadata` (masterSync.ts:524) và trước bất kỳ backend write/sync nào chạm vào row legacy. Lý do: mutation này gán `sourceSystem="convex"` + `sourceId=String(_id)` cho MỌI row `plantsMaster` thiếu chúng; nếu chạy trước migration, toàn bộ row legacy bị đẩy sang nhóm manual review và tập auto-map trở thành rỗng, dù `sourceSystem="convex"` chỉ là giá trị backfill giả.
- `upsertPlantFromBackend` ghi đè `source = "backend:${sourceSystem}:id_${sourceId}"` cho mọi row sync từ SQLite (masterSync.ts:294). Nếu một row legacy từng được sửa từ dashboard và sync ngược trước khi migration chạy, giá trị `source:"seed"/"cutting"/"bulb"` bị hủy vĩnh viễn và không thể auto-map. Vì vậy migration phải chạy trong cửa sổ không có write; nếu không thể đóng write, snapshot danh sách row legacy (id + source) trước khi deploy bất kỳ thứ gì có thể rewrite `source`.
- Trong quá trình triển khai, backend write path không được phép xóa giá trị `plantsMaster.source` legacy khi row chưa được migrate (thêm guard trong `upsertPlantFromBackend` hoặc ghi rõ ràng trong runbook trước khi mở write lại).
- Không chạm `plantCare.source`/`plantCareI18n.source` (theo bảng xử lý bên dưới).

Bảng xử lý:

| Bảng | Điều kiện | Dữ liệu mới | Xử lý dữ liệu cũ |
|---|---|---|---|
| `plantsMaster` | `source="seed"`, thiếu `sourceSystem` và `sourceId` | `plantCare.propagationMethods: ["seed"]` | xóa `plantsMaster.source` sau khi verify |
| `plantsMaster` | `source="cutting"`, thiếu `sourceSystem` và `sourceId` | `plantCare.propagationMethods: ["stem_cutting"]` | xóa `plantsMaster.source` sau khi verify |
| `plantsMaster` | `source="bulb"`, thiếu `sourceSystem` và `sourceId` | `plantCare.propagationMethods: ["bulb"]` | xóa `plantsMaster.source` sau khi verify |
| `plantsMaster` | có `sourceSystem` hoặc `sourceId` | không auto-map | giữ nguyên và đưa giá trị nhập nhằng vào review |
| `plantsMaster` | tên tổ chức, catalog hoặc tài liệu | không auto-map | giữ làm provenance và review cách chuẩn hóa |
| `plantsMaster` | giá trị không nhận diện được | không auto-map | đưa vào báo cáo manual review |
| `plantCare` | mọi `source`/`sourceUrl` | không tạo propagation tag | giữ nguyên provenance |
| `plantCareI18n` | mọi `source`/`sourceUrl` | không tạo propagation tag | giữ nguyên provenance |

Migration phải tạo báo cáo theo bảng, gồm số lượng theo từng giá trị `source`, trạng thái `sourceSystem/sourceId`, kết quả mapping và danh sách cần kiểm tra thủ công. Chỉ xóa `plantsMaster.source` legacy sau khi đã ghi thành công `plantCare.propagationMethods`, đọc lại đúng giá trị và xác nhận row không mang provenance.

### Giai đoạn 4 — Kiểm tra nhất quán

- Tag có nhưng care guide không nhắc tới: cảnh báo biên tập.
- Care guide nhắc tới phương pháp nhưng thiếu tag: cảnh báo biên tập.
- Locale khác nhau mô tả các phương pháp mâu thuẫn: cảnh báo review.
- Không coi khác biệt cách diễn đạt là mâu thuẫn nếu các phương pháp chuẩn giống nhau.

## 8. API contract dự kiến

### Response

```json
{
  "scientificName": "Basella alba",
  "propagationMethods": ["seed", "stem_cutting"]
}
```

### Patch

```json
{
  "propagation_methods": ["seed", "stem_cutting"]
}
```

Tên field ở API phải tuân theo convention hiện tại. Nếu API canonical đang trả camelCase và SQLite endpoint dùng snake_case, cần test rõ cả hai projection thay vì thay đổi convention trong phạm vi task này.

## 9. Verification

### Unit tests

- Chấp nhận mọi enum hợp lệ.
- Từ chối giá trị không thuộc enum.
- Normalize và loại phần tử trùng mà không đổi thứ tự phần tử đầu tiên.
- Payload omit giữ nguyên dữ liệu cũ.
- Payload hợp lệ có thể thay thế danh sách hiện tại.
- Mảng rỗng được xử lý đúng theo contract đã chọn.
- SQLite `[]`, API projection và Convex field bị thiếu đều canonicalize thành `undefined`.
- Label `vi` và `en` tồn tại cho toàn bộ enum.
- `propagationMethods` không xuất hiện trong `REQUIRED_CARE_FIELDS`.
- `careFieldEvidence.propagationMethods` được chấp nhận mà không thay đổi aggregate `careStatus`.
- Evidence hỗ trợ nhiều `sourceRefs`; adapter legacy không làm mất nguồn đơn hiện có.

### Integration tests

- Dashboard ghi `seed` + `stem_cutting`, API và Convex đọc lại cùng giá trị.
- SQLite → outbox → Convex không mất hoặc đổi thứ tự dữ liệu.
- Convex → API mirror không đổi enum thành label.
- Mobile hiển thị “Gieo hạt”, “Giâm cành” ở locale `vi` và “Seed”, “Stem cutting” ở locale `en`.
- Detail page và list/card view đều đọc `propagationMethods`, không đọc `source` để hiển thị cách trồng.
- Plant không có dữ liệu không hiển thị section rỗng.
- `source` không còn xuất hiện dưới nhãn Propagation.
- Care plan mới dùng `sourceLabel="library:plantCare"`; migration propagation không làm nó âm thầm trở thành `seed`, `cutting` hoặc `bulb`.
- Không còn reference tới `library.source_*` trước khi xóa các key khỏi locale.
- Mobile không hiển thị source refs và hiển thị đúng `Cập nhật lần cuối` từ bản published/reviewed đang dùng.
- Fresh seed và database đã migrate trả cùng `propagationMethods` cho cùng một plant.
- Re-seed cập nhật care profile và không tái tạo `plantsMaster.source` legacy.

### Regression tests

- Các patch chỉ sửa taxonomy hoặc i18n không xóa `propagationMethods`.
- `careStatus` hiện tại không bị thay đổi vì `propagationMethods` không thuộc `REQUIRED_CARE_FIELDS` trong v1.
- Plant Library offline fallback vẫn hoạt động khi seed cũ chưa có field.
- Import dữ liệu cũ không có field vẫn thành công.
- Seed cũ chứa `source` legacy được báo cáo/migrate theo discriminator, không ghi đè provenance.

## 10. Acceptance criteria

- [ ] Có một enum contract dùng chung cho toàn hệ thống.
- [ ] `propagationMethods` được lưu trong care profile và đi qua đầy đủ Convex, SQLite, API và sync.
- [ ] Dashboard có multi-select, không dùng free text.
- [ ] Mobile hiển thị label đa ngôn ngữ và không hiển thị enum raw.
- [ ] Cả detail page và list/card view đã ngừng dùng `source` làm propagation.
- [ ] `useAddPlantFlow` dùng `sourceLabel="library:plantCare"`; citation chi tiết không bị ép vào field string này.
- [ ] Không tạo thêm `careSourceLabel`; canonical projection dùng `careSourceRefs` và giữ `careSource/careSourceUrl` chỉ để tương thích migration.
- [ ] Mồng tơi có `seed` và `stem_cutting` sau khi provenance được review.
- [ ] `careContent` vẫn là Markdown và không bị tạo tự động từ tag.
- [ ] Không còn dùng `source` như dữ liệu phương pháp nhân giống.
- [ ] Partial update không làm mất danh sách hiện có.
- [ ] Có unit, integration và regression tests cho các luồng chính.
- [ ] Tất cả locale được phát hành có label cho toàn bộ enum.
- [ ] SQLite `[]` được canonicalize thành `undefined` giống các projection còn lại.
- [ ] `propagationMethods` không được thêm vào `REQUIRED_CARE_FIELDS` ở v1.
- [ ] Migration chỉ auto-map `plantsMaster.source` legacy khi thiếu cả `sourceSystem` và `sourceId`, hoặc mang đúng chữ ký backfill `sourceSystem === "convex"` với `sourceId === String(_id)`.
- [ ] Migration propagation chạy trước `backfillCanonicalMetadata` và trước bất kỳ backend write/sync chạm row legacy; giá trị `plantsMaster.source` legacy không bị ghi đè trước khi migrate.
- [ ] `plantsMasterSeed.ts` và `seed.ts` không tái tạo legacy source trên fresh seed hoặc re-seed.
- [ ] Mobile cutover chỉ diễn ra sau khi backfill legacy pass verification.
- [ ] Dashboard quản lý được nhiều `sourceRefs`; mobile không hiển thị URL/citation trong care guide.
- [ ] Mobile chỉ hiển thị thời điểm cập nhật của bản reviewed/published hiện hành.

## 11. Ngoài phạm vi

- Hướng dẫn từng bước riêng cho mỗi phương pháp.
- Lịch nhắc gieo hạt, giâm cành hoặc ghép cây.
- Tự động đề xuất phương pháp từ AI hoặc scanner.
- Chấm điểm phương pháp dễ nhất hoặc ưu tiên nhất.
- Lưu tỷ lệ thành công, thời gian ra rễ hoặc mùa thực hiện cho từng phương pháp.
- Tự động backfill toàn bộ thư viện cây chưa được kiểm duyệt.
- Tìm kiếm hoặc lọc theo propagation method trong Convex, dashboard hay mobile.
- Màn hình nguồn tham khảo dành cho người dùng cuối; v1 chỉ hiển thị thời điểm cập nhật gần nhất.

## 12. Câu hỏi cần khóa trước khi triển khai

1. Có cần lưu phương pháp ưu tiên riêng, ví dụ `preferredPropagationMethod`, hay thứ tự tag chỉ phục vụ hiển thị?
2. `tuber` có cần tách rõ `stem_tuber` và `root_tuber` trong phiên bản đầu?
3. Mobile detail sẽ hiển thị tag ở phần thông số nhanh hay ngay trước mục nhân giống trong `careContent`?

Khuyến nghị cho phiên bản đầu:

- field optional; SQLite lưu default `[]`, mọi canonical read path chuẩn hóa mảng rỗng thành field bị thiếu;
- không lưu phương pháp ưu tiên;
- evidence v1 dùng `careFieldEvidence.propagationMethods` cho toàn danh sách, không thêm field vào `REQUIRED_CARE_FIELDS`;
- mỗi evidence hỗ trợ nhiều `sourceRefs`; nguồn đơn legacy được đọc qua compatibility adapter;
- giữ `tuber` là một giá trị chung;
- hiển thị tag ngay trước phần hướng dẫn nhân giống trong Plant Detail.

## 13. Nhật ký rà soát

### 13.1. Rà soát 2026-08-10 — xác nhận các điểm còn thiếu đã được bổ sung

Ba mục từng bị báo thiếu nay đã được xử lý trong plan:

- **Seed data** — đã phủ ở §6.7: cập nhật `plantsMasterSeed.ts`, xóa legacy `source` mang nghĩa propagation, gắn `propagationMethods` vào care fields, seed Mồng tơi có `["seed", "stem_cutting"]`, `seed.ts` truyền enum vào `upsertPlantCareProfile` (chỉ chạy khi insert, không phá row đã tồn tại).
- **`careSource` vs `careSourceLabel`** — KHÔNG thêm `careSourceLabel`; giữ `careSource`/`careSourceUrl` cho tương thích. `canonicalPlantLibrary.ts` đã project `careSource`; plan §6.2/§8 không đổi contract này.
- **Thứ tự deploy** — mobile cutover dời sang Giai đoạn 3 (sau khi Giai đoạn 2 pass checks); transition thêm `library.source_bulb` cho MỌI locale.

### 13.2. Gap §7 phát hiện trong rà soát và cách vá

Rà soát code phát hiện discriminator §7 có thể match 0 rows vì hai code path phá legacy trước khi migration chạy:

- `masterSync.ts:294` ghi đè `source = "backend:${sourceSystem}:id_${sourceId}"` trên mọi backend re-sync → hủy `source:"seed"` legacy trước khi migration kịp chạy.
- `masterSync.ts:542-543` (`backfillCanonicalMetadata`) backfill `sourceSystem:"convex"` + `sourceId:String(_id)` cho mọi row thiếu → làm ~50 row legacy không còn đủ điều kiện theo discriminator cũ.

Đã vá trong plan:

- §7 thêm ràng buộc thứ tự: migration propagation chạy TRƯỚC `backfillCanonicalMetadata` và trước mọi backend write/sync chạm row legacy; nếu không đóng write được thì snapshot danh sách row legacy trước deploy; thêm guard trong `upsertPlantFromBackend`.
- §7 thêm ngoại lệ chữ ký backfill: row có `sourceSystem === "convex"` và `sourceId === String(_id)` (đúng cặp `backfillCanonicalMetadata` ghi) vẫn được coi là legacy-eligible để auto-map.
- §6.7 thêm annotation: fixture `plantLibraryPhase3.test.ts:256-258` dùng `source_system:"seed"` + `source:"seed"` làm identity argument cho `deletePlantFromBackend` — là giá trị `source_system`, KHÔNG phải fixture legacy `plantsMaster.source`.
- §10 thêm acceptance criteria tương ứng (discriminator + thứ tự migration).

### 13.3. Trạng thái sau rà soát

- Toàn bộ nội dung đã cập nhật nằm trong plan; chưa có code thay đổi cho plan này ở phiên này.
- Câu hỏi mở §12 vẫn còn: tách `tuber` thành `stem_tuber`/`root_tuber`?; vị trí tag trong Plant Detail (khuyến nghị: ngay trước hướng dẫn nhân giống).

### 13.4. Kết quả triển khai 2026-08-11

Trạng thái: **implementation complete, locally verified, Convex production functions/schema deployed; data migration/feature-screen QA gates pending**.

Đã hoàn thành và xác minh:

- Một shared contract gồm đủ 18 enum, type, label key, strict validation và normalize/dedupe; mảng rỗng canonicalize thành field bị thiếu.
- SQLite/API/outbox, Convex `plantCare`, admin writers, master sync và canonical library projection đều round-trip `propagationMethods`; partial update giữ dữ liệu khi field vắng mặt và explicit `[]` xóa danh sách.
- `CareFieldEvidence` và localized care provenance hỗ trợ `sourceRefs[]` cùng legacy single-source adapters; không thêm `careSourceLabel`.
- Dashboard dùng multi-select và editor nhiều source refs; mobile dùng label i18n, tối đa 2 tag +N trên card và đầy đủ ở detail; không dùng enum raw hoặc citation trong care guide.
- `useAddPlantFlow` luôn ghi `sourceLabel="library:plantCare"`.
- Basella seed fixture có `seed` và `stem_cutting`; fresh seed/re-seed cập nhật care profile mà không tái tạo legacy propagation source.
- Migration legacy source có dry-run, cursor pagination, discriminator, manual-review/failure buckets, readback trước cleanup và sync guard chống ghi đè source identity trước migration.
- Tất cả 6 locale phát hành có đủ 18 label.

Verification:

- Shared propagation tests: 3/3 PASS.
- API full suite: 51/51 PASS; API build PASS.
- Convex full suite: 82/82 PASS; Convex typecheck PASS.
- Dashboard focused tests: 3/3 PASS; production build PASS.
- Mobile focused cache tests: 3/3 PASS; mobile typecheck PASS.
- Locale validation: 6 locale × 18 labels PASS; `git diff --check` PASS.

Rollout/deployment evidence 2026-08-11:

- Convex functions/schema deployed successfully to production deployment `whimsical-dove-537` (`https://whimsical-dove-537.convex.cloud`). Deployment required replacing a Node-only `crypto` import in `plantCareContentMigration.ts` with Web Crypto so the function bundles in the default Convex runtime; focused Convex tests 14/14 and typecheck passed after the fix.
- No propagation or structured-care data migration mutation was run. Compatibility fields/readers and migration review gates remain active.
- Native iOS build succeeded, installed, bundled and rendered on an iPhone 17 Simulator (iOS 26.2). The smoke test found and fixed the Markdown renderer's missing runtime dependency `@react-native-vector-icons/common`; app-visible icons remain sourced from the existing Tabler registry.

Chưa được đánh dấu hoàn tất ở rollout:

- Chưa chạy migration trên Convex target hoặc production data. Phải dry-run/paginate, review manual/conflict/failure rows và đạt `remaining: 0` trước mobile production cutover hoặc xóa compatibility fields/fallbacks.
- Simulator sạch dừng ở onboarding, nên chưa xác nhận trực tiếp Library propagation tags, locale fallback và cached/offline behavior; real-device QA vẫn bắt buộc.
- Convex code/schema đã publish theo ủy quyền; không có production data mutation.

Dev publication follow-up 2026-08-11:

- Deployed the same functions/schema to dev deployment `fantastic-beagle-190` after the dev target rejected the new Markdown/source-reference payload shape.
- Published the four curated species groups from SQLite through the API outbox: `Basella alba` (10 rows), `Laurus nobilis` (6), `Rubus idaeus` (6), and `Valeriana locusta` (6). All 84 final master/i18n outbox operations are `applied` with no remaining failures.
- Canonical dev search now returns Mồng tơi for `mồng tơi`, `mong toi`, and `Basella alba`; the base row exposes `seed` + `stem_cutting`.
- Simulator cache verification confirmed the Convex subscription automatically persisted all 10 Basella rows into `plant_library_plants_v8_en`. A mobile search defect was fixed so an English-active UI also searches every localized `i18nRows[].commonName`; focused regression tests cover accented, unaccented, scientific, and English names.
