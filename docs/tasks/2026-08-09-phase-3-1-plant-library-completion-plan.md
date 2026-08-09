# Kế hoạch hoàn thiện Plant Library — Phase 3.1

Ngày: 2026-08-09
Phụ thuộc: Phase 3.0 — Backend Plant Library

## Mục tiêu

Hoàn thiện Plant Library thành thư viện có thể mở rộng, có provenance rõ ràng và nội dung Plant Detail tự nhiên, hữu ích, đa ngôn ngữ. Không coi một bản ghi là đã hoàn thiện chỉ vì bản ghi đã được seed vào SQLite/Convex.

## Hiện trạng và điểm xuất phát

- Repository hiện có khoảng **1.550 bản ghi nội dung ở `en` và 1.550 ở `vi`**; các locale `es`, `fr`, `pt`, `zh` chưa có rows.
- `npm run audit:plant-content` đang đạt identity/care-range gate, nhưng vẫn còn placeholder, mô tả ngắn và repeated description.
- `npm run audit:plant-content -- --strict` hiện **FAIL với 475 phát hiện placeholder/near-duplicate**; external data gate chưa chạy.
- Taxonomy canonical dùng `genusNormalized`, `speciesNormalized`, `cultivarNormalized`; `plantI18n` là nguồn chính cho tên và nội dung hiển thị.

## Mô hình phát hành hai tầng

- **`taxonomy_only`**: bản ghi có canonical identity, taxonomy và provenance đủ để list/search/match. Plant Detail được phép hiển thị tên khoa học, tên đã xác minh hoặc scientific-name fallback, nhưng không được giả vờ có hướng dẫn chăm sóc.
- **`full_detail`**: chỉ áp dụng cho các canonical identity trong priority list đã đóng băng phiên bản. Bản ghi phải có mô tả, provenance, review metadata và care evidence đủ cho các trường được publish.
- Care field thiếu hoặc mâu thuẫn phải để rỗng (`null`/`{}` theo schema); record-level persisted `careStatus` tuân theo ordered derivation algorithm ở Giai đoạn 0, trong đó whole-profile N/A được kiểm tra trước field aggregate. Tuyệt đối không điền default suy diễn từ tên cây, nhóm cây hoặc mô hình sinh ngôn ngữ.
- `contentTier` với giá trị `taxonomy_only` hoặc `full_detail` là classification **tính trong canonical projection/audit**, không phải persisted field. UI/API chỉ hiển thị `contentTier` được tính lại cùng `careStatus` và trạng thái fallback.

## Hai workstream chính

### Workstream A — Tăng số lượng cây có kiểm soát

#### Mục tiêu số lượng

Tiến theo các mốc có thể kiểm chứng:

1. **3.000 canonical plants** — mốc đầu tiên để mở rộng coverage.
2. **5.000 canonical plants** — mốc sản phẩm trung hạn.
3. **10.000 canonical plants** — mốc dài hạn, chỉ thực hiện khi pipeline provenance/review ổn định.

Số lượng tính theo canonical identity `(genusNormalized, speciesNormalized, cultivarNormalized)`, không tính bản dịch hoặc synonym là cây mới.

#### Nguồn và provenance

- Chọn nguồn có giấy phép sử dụng và URL truy xuất được; ưu tiên nguồn taxonomy/thực vật học uy tín như GBIF, Catalogue of Life, POWO/Kew và nguồn nông nghiệp chính thống phù hợp với trường chăm sóc.
- Lưu `sourceSystem`, `sourceId`, `sourceUrl` và thời điểm nhập/đối chiếu khi nguồn cung cấp được.
- Không bulk-import dữ liệu không rõ nguồn, không suy diễn công dụng/độc tính/chăm sóc từ tên cây.

#### Nguồn care và quy trình evidence

Taxonomy source không mặc nhiên là care source. Care evidence được ưu tiên theo thứ tự sau, và từng nguồn vẫn phải qua kiểm tra license/field-level applicability trước khi dùng:

1. Cơ quan nông nghiệp, khuyến nông, trạm nghiên cứu hoặc hướng dẫn cây trồng chính thức của cơ quan nhà nước.
2. University extension/experiment station và cơ sở thực vật học, làm vườn uy tín (ví dụ RHS, vườn thực vật) khi nội dung cụ thể và license cho phép.
3. Công bố nghiên cứu hoặc sổ tay kỹ thuật của nhà chuyên môn có thể truy xuất.
4. Dataset thương mại có license rõ ràng cho phép lưu trữ và tái phân phối.

Không dùng blog SEO, nội dung cộng đồng không kiểm chứng, scraping không rõ license hoặc văn bản do AI tự tạo làm bằng chứng. Mỗi trường care phải có evidence và `sourceRefs` tối thiểu gồm `sourceSystem`, `sourceUrl`, `sourceLocator` (mục/bảng/trang hoặc định danh tương đương), cùng thời điểm truy xuất và `reviewedBy` trước khi publish. Nếu các nguồn mâu thuẫn hoặc không đủ cụ thể cho species/cultivar, giữ trường care rỗng và record-level `awaiting_review` khi profile đã tồn tại; nếu chưa có profile thì `missing`; không chọn giá trị “có vẻ hợp lý”.

#### Pipeline nhập dữ liệu

1. Thu thập bản ghi nguồn và lưu raw reference bất biến.
2. Chuẩn hóa family/genus/species/cultivar và tạo canonical identity.
3. Chuẩn hóa synonym; một synonym trỏ về canonical record thay vì tạo bản ghi trùng.
4. Kiểm tra base species trước khi thêm cultivar/variety.
5. Dedupe theo taxonomy identity, synonym và scientific-name normalization.
6. Đưa bản ghi mới vào `draft`/`needs_review`; không publish trực tiếp.
7. Chạy quality/provenance gates, sau đó mới review và publish.

#### Phân bổ coverage

Ưu tiên theo nhu cầu người dùng và vùng trồng: rau củ, cây gia vị, cây ăn quả, cây hoa/cây cảnh, cây bản địa và các cultivar phổ biến. Mỗi batch phải ghi rõ phạm vi taxonomy, nguồn, số bản ghi trước/sau dedupe và số bản ghi bị đưa vào manual review.

### Workstream B — Hoàn thiện Plant Detail tự nhiên, đa ngôn ngữ

#### Dữ liệu định danh và nội dung

Mỗi Plant Detail `full_detail` được publish cần có:

- Scientific name, family, genus, species và cultivar/variety nếu có.
- Common name theo locale, synonym và group.
- Phân bố/native range hoặc khu vực nguồn khi có bằng chứng.
- Mô tả tổng quan viết riêng cho bản ghi, đặc điểm nhận biết, môi trường sống và công dụng có nguồn.
- Structured care được đánh giá theo từng field: ánh sáng, nước/độ ẩm, nhiệt độ, đất/pH, bón phân, cắt tỉa, nhân giống, tốc độ phát triển, mùa hoa/thu hoạch và độ khó. Mỗi field có evidence/sourceRefs riêng; field chưa có evidence để rỗng và mang trạng thái chờ review.
- Cảnh báo độc tính/an toàn chỉ khi có nguồn đáng tin cậy; nếu chưa xác minh thì để trạng thái cần review, không đoán.

Bản ghi `taxonomy_only` được list/search/match nhưng không được coi là đã có Plant Detail đầy đủ. Priority list quyết định bản ghi nào được đầu tư `full_detail` trước; không dùng việc tăng số rows để che thiếu care evidence.

#### Chuẩn tự nhiên, không “AI slop”

- Mỗi mô tả phải nêu chi tiết riêng của species/cultivar; không dùng đoạn chung có thể dán cho mọi cây.
- Không placeholder, không nhồi từ khóa, không lặp cùng một mở đầu hoặc cùng một template trên nhiều bản ghi.
- Không sao chép nguyên văn nguồn; biên tập lại bằng ngôn ngữ tự nhiên và giữ provenance cho các khẳng định quan trọng.
- Bản tiếng Việt phải được biên tập như nội dung tiếng Việt tự nhiên; các locale khác cũng phải được bản địa hóa, không dịch máy từng chữ.
- Nội dung do công cụ hỗ trợ tạo chỉ là draft, phải qua kiểm tra nguồn và review trước khi publish.

#### Kế thừa nội dung cultivar

`inheritedCultivarDescriptions` là projection hợp lệ khi cultivar không có khác biệt nội dung đã được xác nhận, base species đã published/reviewed, và không có source conflict. Persist localized content origin khi cần với `contentOrigin: authored|inherited|imported`; `imported` bắt buộc có provenance. API/UI phải gắn nhãn inherited và có thể expose `inheritedFromId` như quan hệ projection tính từ base, không yêu cầu persisted field riêng. Cultivar chỉ cần nội dung authored riêng khi đặc điểm/care khác base hoặc priority review yêu cầu.

Strict gate phải tách `authored` với `inherited`: near-duplicate/repeated-description chỉ fail đối với nội dung authored độc lập; số lượng inherited là coverage metric riêng. Hai cultivar cùng nhận inheritance không bị tính là duplicate authored, nhưng cùng một đoạn bị copy thành authored ở nhiều identity vẫn là lỗi.

#### Locale và fallback

- Phát hành theo từng locale độc lập: `draft` → `needs_review` → `published` → `archived`.
- Giai đoạn đầu ưu tiên `en` và `vi`; chỉ bật `es`, `fr`, `pt`, `zh` khi có dữ liệu thật và đã qua cùng quality gate.
- Tên tiếng Việt chỉ được tính là present khi là **verified Vietnamese name**. Nếu chưa có, dùng scientific-name fallback và expose computed projection flag `missingViCommonName: true`; cấm persist tên Việt tự bịa hoặc dịch máy.
- Fallback nội dung: locale yêu cầu → English → scientific name. UI phải biểu thị rõ locale fallback, computed `missingViCommonName` và nội dung inherited; không gắn nhãn bản dịch là đã review nếu chưa có bằng chứng.

#### Date/version/review metadata

Phân biệt rõ các mốc, không tạo ngày giả:

- `sourcePublishedAt`: ngày nguồn công bố nếu có.
- `importedAt`: ngày hệ thống nhập.
- `contentUpdatedAt`: lần nội dung thay đổi.
- `reviewedAt` và `reviewedBy`: bằng chứng review; đây là metadata truy vết, không phải taxonomy role.
- `lastVerifiedAt`: lần đối chiếu nguồn gần nhất.
- `contentVersion` và `recordVersion`: phiên bản nội dung/bản ghi.

Nếu schema hoặc projection còn thiếu **persisted** `careStatus`/`contentOrigin`, bổ sung end-to-end qua seed/sync/API/dashboard/mobile. Không thêm persisted `contentTier` hoặc `missingViCommonName`: hai giá trị này phải được tính lại trong projection/audit trước khi hiển thị.

## Các giai đoạn thực hiện

### Giai đoạn 0 — Chốt schema và quality contract

- Xác nhận canonical identity, synonym, cultivar/base invariant và trạng thái publish.
- Chốt required fields, provenance contract, locale fallback và date/version semantics.
- Khóa schema contract tối thiểu: persist `careStatus` trên master/care record với enum chính thức `missing | awaiting_review | verified | not_applicable`; persist `contentOrigin` trên localized/authored content khi origin cần truy vết với enum `authored | inherited | imported`, trong đó `imported` bắt buộc có provenance. Exact enum values phải được chốt trước migration.
- Care là granular theo field: từng required care field có evidence/sourceRefs và trạng thái review riêng; record-level `careStatus` là aggregate persisted nhưng phải được recompute sau mọi thay đổi field/evidence. **Ordered derivation algorithm này là authoritative và whole-profile N/A check luôn đứng trước field aggregate:** (1) không có care profile ⇒ `missing`; (2) toàn bộ required care profile thực sự N/A, có evidence/review cho kết luận đó ⇒ `not_applicable`; (3) nếu không thuộc (1)/(2) và bất kỳ required field nào `missing` hoặc `awaiting_review` ⇒ `awaiting_review`; (4) còn lại ⇒ `verified`, tức tất cả required fields `verified` hoặc individually evidence-backed `not_applicable`. `not_applicable` không được suy ra từ việc mọi field tình cờ rỗng; `missing` chỉ là trạng thái chưa có profile/evidence.
- Định nghĩa `contentTier` là projection/audit computed classification `taxonomy_only | full_detail`, dựa trên canonical identity, required verified fields, record-level `careStatus` (`verified` hoặc `not_applicable` mới đủ full detail) và locale gates; `missing`/`awaiting_review` giữ bản ghi ở `taxonomy_only`. Tuyệt đối không persist field này. Định nghĩa `missingViCommonName` là projection flag từ việc không có verified Vietnamese common name; không persist flag này.
- Tạo priority list **versioned** trước khi curation: artifact machine-readable `packages/convex/convex/data/plantPriorityList.v1.json` (đổi version khi nội dung thay đổi). Admin quản lý assignment; editor thực hiện toàn bộ công việc Plant Library không phải delete, gồm taxonomy/content/locale/care review và publish. Metadata truy vết dùng `assignedTo`, `reviewedBy`, `reviewedAt` (batch owner cũng dùng `assignedTo`), không tạo role map riêng. Schema tối thiểu: `listVersion`, `createdAt`, `assignedTo`, `scope`, `criteria`, `entries[]`, trong đó mỗi entry có `canonicalIdentity`, `category`, `rank`, `rationale`, `targetLocales`, `targetCoverage`, `sourceRefs`, `assignedTo`, `reviewedBy`, `reviewedAt`; `targetCoverage` chỉ là ý định của priority list, không phải plant schema field.
- Tiêu chí chọn entry: phù hợp scope app và nhu cầu trồng phổ biến; ưu tiên rau, gia vị, cây ăn quả, hoa/cây cảnh và cây trồng phổ biến có tín hiệu từ search/Add Plant/scanner hoặc backlog hiện hữu. Không tự bịa danh sách hàng nghìn tên; entry phải có rationale và source/reference hoặc được người được assign ghi nhận là gap cần nghiên cứu.
- Chốt denominator đo coverage: `priorityDenominator` là số **canonical identities distinct** trong version list đã freeze với `targetCoverage=full_detail`, tính cả cultivar chỉ khi cultivar được liệt kê riêng; không tính locale rows, synonym, duplicate hoặc entries chỉ target taxonomy. `priorityNumerator` là số identity có computed `contentTier=full_detail`, đạt `en` và verified `vi` hoặc computed `missingViCommonName=true` với scientific-name fallback, care evidence/status và review hợp lệ (authored hoặc inherited hợp lệ). Mục tiêu 90% = `priorityNumerator / priorityDenominator`.
- Bổ sung audit output đủ để đo computed `contentTier`, locale/name fallback, source, review, persisted care status, content origin, placeholder, near-duplicate và care-range.
- Migration/backfill chỉ được ghi cho persisted `careStatus` và `contentOrigin`; không tạo cột/backfill cho computed `contentTier` hoặc `missingViCommonName`. Schema, Convex sync, API, dashboard và audit phải round-trip hai persisted fields và có test projection recompute.
- Authz role/delete work là **prerequisite carried forward từ Phase 3.0**, một scope addition để hỗ trợ vận hành Phase 3.1; không phải hạng mục curation nội dung. Trước khi đổi contract, chạy SQL `SELECT role, COUNT(*) AS count FROM users GROUP BY role;` và `SELECT COUNT(*) AS viewerRows FROM users WHERE role = 'viewer';`; chỉ bỏ viewer khỏi target sau khi xác nhận `viewerRows=0`.
- Code contract hiện vẫn cho phép viewer tại `apps/api/src/db.ts` (users CHECK) và `apps/api/src/auth.ts` (AuthUser/validation). Giai đoạn 0 phải có schema migration đổi users CHECK, auth validation/types và toàn bộ DTO/tests/UI assumptions thành chỉ `admin|editor`. Không cần backfill user rows chỉ khi SQL xác nhận viewer count bằng 0; schema migration vẫn bắt buộc.
- Chốt role contract chỉ gồm **`admin`** và **`editor`** sau migration; admin quản lý assignment. `editor` có toàn bộ quyền Plant Library không phải delete: create/read/update, import, curate, review và publish sau khi required review/quality gates pass, áp dụng cho plant, locale và group. Admin cũng có quyền publish; editor không được single delete, bulk delete, hard delete hoặc gọi bất kỳ delete path nào qua admin proxy/API/UI.
- Chỉ `admin` được single delete, bulk delete, hard delete và mọi delete qua admin proxy/API/UI. Giai đoạn 0 phải khóa rõ delete semantics: xóa locale chỉ tác động bản dịch locale đó và để fallback; xóa group phải nêu rõ xử lý membership/children; xóa plant mặc định là deactivate/soft-delete có guard user-plant/base-variant, còn hard delete là thao tác admin có xác nhận và cleanup phụ thuộc.
- Role enforcement phải chạy end-to-end ở backend/API, Convex functions và dashboard actions; UI ẩn nút chỉ là lớp phụ, không phải authorization.
- Wire `externalDataGate` vào source manifest/license/provenance check và fail closed. Vì `requiredBeforeBulkCuration=true`, mọi bulk import/curation phải dừng cho tới khi gate có trạng thái `pass`; trạng thái hiện tại `not_run` là blocker.

### Giai đoạn 1 — Làm sạch 1.550 bản ghi hiện có

- Chạy normal và strict audit; xuất danh sách lỗi theo locale/identity.
- Sửa placeholder, mô tả ngắn, repeated/near-duplicate và bản ghi thiếu provenance.
- Tính `contentTier=taxonomy_only` hoặc `full_detail` từ projection/audit; chuyển bản ghi chưa xác minh sang `draft`/`needs_review`, không xóa dữ liệu nguồn để che lỗi.
- Care thiếu theo từng field để rỗng + evidence status tương ứng; recompute record `careStatus` theo đúng ordered algorithm authoritative (whole-profile N/A trước field aggregate) sau mỗi edit. Không tạo watering/fertilizer/harvest default để làm đầy trường.
- Mốc kết thúc: strict audit không còn lỗi publish-blocking trên batch được duyệt; inherited projection được báo riêng và không bị tính như duplicate authored.

### Giai đoạn 2 — Mở rộng có provenance lên 3.000

- Chỉ bắt đầu sau khi priority list v1 đã freeze và `externalDataGate.status=pass`. Nhập từng batch nhỏ theo taxonomy/nguồn; mỗi batch có dry-run, dedupe report và manual-review queue.
- Bản ghi được publish phải có verified Vietnamese name hoặc scientific-name fallback + computed `missingViCommonName`; không tăng số lượng bằng rows dịch, synonym hoặc tên Việt tự suy diễn.
- Chạy taxonomy, content audit và regression list/search/detail sau mỗi batch.

### Giai đoạn 3 — Hoàn thiện Plant Detail và locale coverage

- Hoàn thiện structured care, mô tả, cảnh báo và metadata cho các cây trong priority list; chỉ publish care field có evidence/review.
- Biên tập tiếng Việt và tiếng Anh tự nhiên; thêm locale mới theo coverage gate và không tạo tên Việt khi thiếu nguồn.
- Kiểm tra canonical projection dùng thống nhất cho list/search/detail/match, inherited badge và fallback hiển thị đúng.

### Giai đoạn 4 — Tăng lên 5.000 rồi 10.000

- Chỉ mở rộng khi batch 3.000 đạt DoD và không còn backlog chất lượng nghiêm trọng.
- Theo dõi capacity review trên batch chuẩn 100 canonical identities: backlog mở ≤200 identity (≤2 batch), p95 queue age ≤14 ngày, không có priority item quá 14 ngày, p90 batch turnaround ≤7 ngày, và throughput của editor được assign ≥ intake trong 4 tuần liên tiếp.
- **Go 10.000** chỉ khi các ngưỡng trên đạt trong 4 tuần và 3 batch liên tiếp, strict publish-blocker bằng 0 và tỷ lệ rework/reject do lỗi nguồn/nội dung ≤10%. **No-go** nếu bất kỳ ngưỡng nào fail hai kỳ liên tiếp, backlog tăng hai tuần, hoặc queue có priority item quá hạn; phải giảm intake và xử lý review trước.
- Mỗi mốc phải có report số liệu và quyết định go/no-go riêng; 10.000 không phải mục tiêu bắt buộc nếu capacity chưa đạt.

## Quality gates và verification

Chạy tối thiểu cho mỗi batch:

```bash
npm run audit:plant-content
npm run audit:plant-content -- --strict
export CONVEX_ADMIN_FUNCTION_KEY=...
npm run check:taxonomy
```

`npm run check:taxonomy` chỉ có giá trị khi `CONVEX_ADMIN_FUNCTION_KEY` đã được set và Convex dev/deployment (URL/deployment context tương ứng) reachable; nếu không, gate là **blocked**, không được coi là pass. `externalDataGate` phải được wired và `status=pass` trước bulk import/curation vì `requiredBeforeBulkCuration=true`; `not_run` hoặc `fail` là blocker.

Plant Detail/list/search/match phải dùng cùng canonical projection; dashboard vẫn phải giữ được rows `draft`/`inactive` để quản trị. Không publish row có placeholder, duplicate identity, care range không hợp lệ, care evidence thiếu nhưng bị gắn `contentTier=full_detail`, locale rỗng hoặc provenance/review không đủ. `taxonomy_only` được publish độc lập với `full_detail` theo computed classification; UI/API phải hiển thị `contentTier`, persisted `careStatus` và fallback rõ ràng.

## Acceptance criteria / Definition of Done

- [ ] Đạt mốc **3.000 canonical plants** với dedupe identity bằng 0 và report nguồn cho từng batch.
- [ ] Có lộ trình và số liệu được kiểm chứng cho mốc 5.000; mốc 10.000 chỉ mở sau review capacity.
- [ ] 100% bản ghi có computed `contentTier=taxonomy_only` published có scientific name, taxonomy canonical, source/provenance và trạng thái review phù hợp.
- [ ] 100% bản ghi có computed `contentTier=full_detail` published có mô tả/provenance/review và required care fields ở `careStatus=verified|not_applicable`; care field thiếu evidence vẫn rỗng + record `careStatus=awaiting_review` và bản ghi đó không được xếp `full_detail`.
- [ ] Tên tiếng Việt của bản ghi published là verified Vietnamese name hoặc scientific-name fallback với computed `missingViCommonName=true`; không có tên dịch/bịa được coi là verified.
- [ ] Đạt **≥90% priority detail coverage** theo denominator đã freeze ở Giai đoạn 0: numerator là canonical identities có computed `contentTier=full_detail`, đạt `en` + verified `vi` hoặc computed `missingViCommonName=true` với scientific-name fallback, cùng care evidence/status/review hợp lệ; inherited content chỉ được tính khi persisted `contentOrigin=inherited` và base có provenance/review.
- [ ] Persisted `careStatus` chỉ dùng enum đã khóa ở Giai đoạn 0 (`missing|awaiting_review|verified|not_applicable`) trên master/care record; persisted `contentOrigin` chỉ dùng `authored|inherited|imported`, và `imported` luôn có provenance.
- [ ] Mỗi required care field có evidence/sourceRefs/sourceLocator và test đúng **ordered derivation algorithm**: (1) không profile ⇒ `missing`; (2) toàn profile N/A có evidence/review ⇒ `not_applicable` (boundary test all-required-fields N/A); (3) nếu không N/A, bất kỳ field `missing|awaiting_review` ⇒ `awaiting_review`; (4) còn lại, mọi field `verified` hoặc individually evidence-backed `not_applicable` ⇒ `verified`; mọi field/evidence edit đều cập nhật lại record status.
- [ ] Không có persisted `contentTier` hoặc `missingViCommonName`; API/UI/audit tính lại computed `contentTier` và `missingViCommonName` nhất quán từ canonical data.
- [ ] Schema → Convex sync → API → dashboard round-trip hai persisted fields, đồng thời có test end-to-end chứng minh computed projection không bị drift.
- [ ] Strict content audit không còn placeholder/near-duplicate publish-blocking findings.
- [ ] Strict audit phân biệt authored duplicate với inherited projection; inherited count được báo riêng và không tự tạo lỗi duplicate.
- [ ] Không có locale `published` nhưng thiếu nội dung; fallback được hiển thị rõ ràng.
- [ ] Plant Detail có structured care khi có evidence và date/version/review metadata trung thực, không có ngày giả hoặc care default suy diễn.
- [ ] List/search/detail/match nhất quán qua canonical projection trên backend, dashboard và mobile.
- [ ] Có staging regression cho Library, Plant Detail, scanner match và Add Plant; ghi lại command/output trong report.
- [ ] `externalDataGate` wired và pass trước bulk import/curation; `check:taxonomy` pass với Convex reachable và `CONVEX_ADMIN_FUNCTION_KEY` hợp lệ.
- [ ] Go 10.000 chỉ khi đạt đầy đủ review-capacity thresholds trong 4 tuần/3 batch liên tiếp; nếu không thì giữ mốc hiện tại và no-go.
- [ ] SQL xác nhận `viewerRows=0` trước khi role migration; users CHECK, auth validation/types, DTOs, tests và UI assumptions chuyển thống nhất sang `admin|editor`. Không backfill user rows chỉ khi count bằng 0; schema migration vẫn phải pass.
- [ ] Authz role/delete prerequisite từ Phase 3.0 được kiểm chứng end-to-end và không được coi là đã hoàn tất chỉ vì UI ẩn nút.
- [ ] `editor` thực hiện được create/read/update/import/curate/review/publish cho plant/locale/group sau khi required gates pass nhưng nhận **403** ở single delete, bulk delete, hard delete và mọi delete path qua API, Convex/admin proxy hoặc dashboard action.
- [ ] `admin` thực hiện được publish và các delete path nói trên; test xác nhận editor 403 và admin success ở backend/API, Convex và dashboard action.
- [ ] Delete semantics được ghi nhận và test riêng: locale delete chỉ xóa locale content và kích hoạt fallback; group delete xử lý membership/children theo contract đã khóa; plant soft-delete/deactivate giữ các guard user-plant/base-variant, còn hard delete admin-only và cleanup phụ thuộc.

## Rủi ro và cách giảm thiểu

| Rủi ro | Giảm thiểu |
| --- | --- |
| Nguồn có license hoặc taxonomy không rõ | Chặn publish, lưu source URL/license, manual review |
| Care source không áp dụng cho species/cultivar hoặc các nguồn mâu thuẫn | Lưu source locator theo từng field; để care rỗng + `awaiting_review`, không suy diễn |
| Cultivar/synonym tạo duplicate | Dùng canonical normalized identity và base-before-variant invariant |
| Bulk content lặp hoặc giống AI | Strict audit, near-duplicate detector, viết riêng theo species/cultivar, human review |
| Dịch máy làm sai nghĩa | Locale review độc lập, không publish locale chưa được biên tập |
| Thiếu tên Việt bị che bằng bản dịch/bịa | Chỉ chấp nhận verified name hoặc scientific-name fallback + computed `missingViCommonName` |
| Ngày/version bị bịa hoặc mất khi sync | Tách từng timestamp, kiểm thử seed → Convex → API → UI |
| Tăng số lượng làm giảm chất lượng | Batch nhỏ, quality gate bắt buộc, go/no-go ở từng mốc |
| Review backlog vượt capacity khi tiến tới 10.000 | Theo dõi queue age/backlog/turnaround; áp dụng no-go và giảm intake theo ngưỡng đã chốt |
| List và Detail lệch dữ liệu | Bắt buộc dùng canonical projection và regression test cùng fixture |

## Ngoài phạm vi

- Không tạo care defaults, độc tính hoặc công dụng khi chưa có nguồn xác nhận.
- Không coi seed/mirror hiện tại là bằng chứng curation đã hoàn tất.
- Không bật thêm locale chỉ để tăng số lượng rows.
- Không deploy production trong task curation này; staging/production là gate xác nhận riêng sau khi local DoD đạt.
