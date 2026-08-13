# Canonical propagation method detail — bilingual content plan

Date: 2026-08-13  
Status: **PROPOSED — NOT APPROVED FOR RUNTIME OR PRODUCTION**  
Scope: the 18 stable codes in `packages/shared/src/plantPropagation.ts`

## 1. Decision summary

Keep the existing 18 stable codes unchanged. They are already persisted and
shared by API, Convex, dashboard, and mobile. This content work must not rename
or reinterpret a code through localization.

The repository currently has localized short labels, but no canonical,
source-backed detail record for any method and no implemented
`richfarm://propagation/<stable-code>` route. Method detail must therefore be a
new, versioned content contract, not generated from plant-specific
`propagationMethods` tags or `careContent`.

The initial content set below intentionally leaves method-specific timing and
unsupported safety claims as `deferred`. A detail record may be published only
when every displayed fact is covered by its `sourceRefs` and both English and
Vietnamese have passed review.

## 2. Taxonomy review

Canonical order and codes:

`seed`, `stem_cutting`, `leaf_cutting`, `root_cutting`, `division`,
`air_layering`, `ground_layering`, `grafting`, `budding`, `bulb`, `corm`,
`tuber`, `rhizome`, `runner`, `offset`, `sucker`, `spore`, `tissue_culture`.

No code addition, split, alias, or deletion is proposed. Before publication,
content review must resolve these label issues without changing stable codes:

| Code | Current mobile VI | Proposed canonical VI title | Review note |
|---|---|---|---|
| `ground_layering` | Uốn cành | Chiết áp cành | Align with the plan and distinguish the method from training/bending a branch. |
| `bulb` | Củ hành | Nhân giống bằng thân hành | Avoid making the method sound onion-specific. Botanical terminology needs Vietnamese horticultural review. |
| `corm` | Thân hành | Nhân giống bằng thân củ đặc | Must remain distinct from a true bulb; terminology needs review. |
| `runner` | Cành bò | Tách ngó | Align with the plan; confirm the most natural cross-crop term. |
| `offset` | Chồi bên | Tách cây con | Describe separation of a naturally formed daughter plant, not merely any lateral shoot. |

English labels already match the stable-code meanings. The remaining 13
Vietnamese labels can be retained as titles, subject to one final horticultural
language review.

Important boundary: `tuber` currently covers a storage-organ category whose
plant data may mean a stem tuber or a tuberous root. The generic detail must not
claim that every tuber has eyes/nodes. Plant-specific guidance must identify
the organ before giving cutting instructions.

## 3. Minimum detail-page and deep-link contract

Canonical URI: `richfarm://propagation/<stable-code>`.

- `<stable-code>` is exactly one member of `PROPAGATION_METHODS`.
- Codes are ASCII, lowercase, and case-sensitive. They are never localized.
- Unknown, missing, or extra path segments return the app's normal not-found
  state; they must not silently fall back to another method.
- Locale selection follows the app locale. A missing translation must not mix
  fields from two locales on one page. Until an explicit fallback policy is
  approved, show an unavailable/needs-review state.
- A plant may link to a generic method detail, but the page must state that
  suitability and exact timing depend on the species/cultivar. Generic content
  must never override plant-specific, reviewed care guidance.

Proposed data shape:

```ts
type PropagationMethodContentStatus =
  | "draft"
  | "needs_review"
  | "approved"
  | "deferred";

type LocalizedPropagationMethodDetail = {
  title: string;
  summary: string;
  whenSuitable: string[];
  steps: string[];
  timing?: {
    text: string;
    scope: "generic" | "taxon_specific";
  };
  risksAndSafety?: string[];
  translatorNote?: string;
};

type PropagationMethodSourceRef = {
  sourceName: string;
  sourceUrl: string;
  sourceLocator: string;
  supports: Array<
    "summary" | "whenSuitable" | "steps" | "timing" | "risksAndSafety"
  >;
  accessedAt: string; // ISO date
};

type CanonicalPropagationMethodDetail = {
  code: PropagationMethod;
  contentVersion: number;
  status: PropagationMethodContentStatus;
  locales: {
    en: LocalizedPropagationMethodDetail;
    vi: LocalizedPropagationMethodDetail;
  };
  sourceRefs: PropagationMethodSourceRef[];
  reviewedBy?: string;
  reviewedAt?: string; // ISO datetime; required for approved
  reviewNotes?: string[];
};
```

Contract rules:

1. `en` and `vi` have identical field presence and step count. Corresponding
   items carry the same facts in natural language, not word-for-word calques.
2. `approved` requires non-empty title, summary, suitability, steps,
   `sourceRefs`, `reviewedBy`, and `reviewedAt` for both locales.
3. `timing` and `risksAndSafety` are optional, evidence-gated fields. UI omits
   them when absent; it does not synthesize filler.
4. `sourceLocator` must name the source section that supports the fact.
5. Sources and review metadata are editorial provenance. Whether source links
   are user-visible is a separate product decision; provenance must remain in
   the canonical record either way.
6. The detail page must resolve by `code`, never by a translated title.
7. Content changes increment `contentVersion`; code identity remains stable.

## 4. Proposed bilingual content set

All entries below are `needs_review`. “Timing: deferred” means no generic
timing should be rendered. “Risk” is included only where the cited general
source supports it.

### `seed` — Seed / Gieo hạt

- **EN summary:** Grow a new plant from seed; offspring can differ genetically
  from the parent plant.
- **VI summary:** Tạo cây mới từ hạt; cây con có thể khác cây bố mẹ về di truyền.
- **Suitable (EN/VI):** Use only for plants known to produce viable seed / Chỉ
  dùng cho cây được xác nhận có hạt sống và có thể nảy mầm.
- **Steps EN:** Check species-specific dormancy or pretreatment needs; sow in a
  clean suitable medium; provide the moisture, light, and temperature required
  by that species; transplant after seedlings are established.
- **Các bước VI:** Kiểm tra yêu cầu ngủ nghỉ hoặc xử lý trước gieo của loài; gieo
  trong giá thể sạch, phù hợp; duy trì độ ẩm, ánh sáng và nhiệt độ đúng cho loài;
  chuyển cây khi cây con đã ổn định.
- **Risk EN/VI:** Seed may not preserve cultivar traits / Cây từ hạt có thể không
  giữ đặc tính của cultivar.
- Timing: `deferred` (species-specific).

### `stem_cutting` — Stem cutting / Giâm cành

- **EN summary:** Root a detached stem section to produce a new plant.
- **VI summary:** Làm cho một đoạn thân hoặc cành đã cắt ra rễ và phát triển thành cây mới.
- **Suitable (EN/VI):** For species documented to root from stems / Dùng cho loài
  đã được xác nhận có thể ra rễ từ thân hoặc cành.
- **Steps EN:** Take healthy stem material with the required nodes; use clean,
  sharp tools; place the cutting in an appropriate clean rooting medium; keep
  it moist but not waterlogged and prevent drying while roots form.
- **Các bước VI:** Chọn đoạn thân khỏe có đủ mắt theo yêu cầu của loài; dùng dụng
  cụ sắc, sạch; cắm vào giá thể ra rễ sạch, phù hợp; giữ ẩm nhưng không úng và
  hạn chế mất nước trong thời gian ra rễ.
- **Risk EN/VI:** Dirty tools/media and excessive moisture increase propagation
  failure and disease risk / Dụng cụ hoặc giá thể bẩn và độ ẩm quá cao làm tăng
  nguy cơ bệnh và thất bại.
- Timing: `deferred`.

### `leaf_cutting` — Leaf cutting / Giâm lá

- **EN summary:** Use a whole leaf or a suitable leaf section to regenerate a new plant.
- **VI summary:** Dùng nguyên lá hoặc phần lá phù hợp để tái sinh cây mới.
- **Suitable (EN/VI):** Only for species whose leaves can form both roots and new
  shoots / Chỉ dùng cho loài mà lá có thể tạo cả rễ lẫn chồi mới.
- **Steps EN:** Select a healthy leaf in the form required by the species; make
  a clean cut; place the correct surface or petiole in clean medium; maintain
  moisture and humidity without saturating the medium until plantlets form.
- **Các bước VI:** Chọn lá khỏe theo đúng dạng mà loài yêu cầu; tạo vết cắt sạch;
  đặt đúng mặt cắt hoặc cuống lá vào giá thể sạch; duy trì ẩm và độ ẩm không khí
  nhưng không làm giá thể sũng nước cho đến khi cây con hình thành.
- **Risk EN/VI:** A leaf without the regenerative structures required by that
  species may root poorly or never make a shoot / Lá không có cấu trúc tái sinh
  cần thiết của loài có thể khó ra rễ hoặc không tạo chồi.
- Timing: `deferred`.

### `root_cutting` — Root cutting / Giâm rễ

- **EN summary:** Use a detached root section capable of producing shoots and roots.
- **VI summary:** Dùng một đoạn rễ có khả năng tạo chồi và rễ mới.
- **Suitable (EN/VI):** Only for species documented to regenerate from root
  pieces / Chỉ dùng cho loài được xác nhận có thể tái sinh từ đoạn rễ.
- **Steps EN:** Lift healthy root material at the species-appropriate time;
  divide it into correctly oriented sections; place sections in clean medium at
  the required depth; keep evenly moist until shoots establish.
- **Các bước VI:** Lấy rễ khỏe vào thời điểm phù hợp với loài; chia thành đoạn và
  giữ đúng chiều nếu quy trình yêu cầu; đặt vào giá thể sạch ở độ sâu thích hợp;
  giữ ẩm đều đến khi chồi ổn định.
- **Risk EN/VI:** Removing too much root can damage the parent / Lấy quá nhiều rễ
  có thể làm cây mẹ suy yếu.
- Timing: `deferred`.

### `division` — Division / Tách bụi

- **EN summary:** Split an established clump or crown into independently viable plants.
- **VI summary:** Chia bụi hoặc tán gốc đã phát triển thành các phần có thể sống độc lập.
- **Suitable (EN/VI):** For clump-forming plants or divisible crowns/rhizomes / Dùng
  cho cây tạo bụi hoặc có tán gốc/thân rễ có thể chia.
- **Steps EN:** Lift or unpot the plant; separate or cut it into sections that
  retain viable growth and roots; replant promptly; water during establishment.
- **Các bước VI:** Đào hoặc lấy cây khỏi chậu; tách hay cắt thành các phần còn mầm
  sinh trưởng và rễ sống; trồng lại sớm; tưới trong giai đoạn hồi phục.
- **Risk EN/VI:** Poorly equipped divisions may fail; damaged tissue can dry or
  decay / Phần tách thiếu rễ hoặc mầm có thể chết; mô bị thương có thể khô hoặc thối.
- Timing: `deferred` because fall/early-spring guidance is not universal.

### `air_layering` — Air layering / Chiết cành

- **EN summary:** Induce roots on an aerial stem while it remains attached to the parent.
- **VI summary:** Kích thích một đoạn cành trên không ra rễ khi vẫn còn nối với cây mẹ.
- **Suitable (EN/VI):** For compatible woody or difficult-to-root plants with a
  suitable stem / Dùng cho cây gỗ hoặc cây khó giâm đã được xác nhận phù hợp và
  có cành thích hợp.
- **Steps EN:** Select a healthy stem; wound or prepare it as required; enclose
  the site in moist rooting medium and retain moisture; detach below the rooted
  area only after adequate roots form; pot or plant promptly.
- **Các bước VI:** Chọn cành khỏe; khoanh hay xử lý vị trí chiết theo yêu cầu;
  bọc vị trí đó bằng giá thể ra rễ ẩm và giữ ẩm; chỉ cắt dưới bầu khi đã có đủ rễ;
  trồng vào chậu hoặc đất sớm.
- **Risk EN/VI:** The wound can dry out or become infected; removing the layer
  before enough roots form can kill it / Vết xử lý có thể khô hoặc nhiễm bệnh;
  cắt bầu khi rễ chưa đủ có thể làm cành chiết chết.
- Timing: `deferred`.

### `ground_layering` — Ground layering / Chiết áp cành

- **EN summary:** Root part of a flexible stem in soil while it remains attached to the parent.
- **VI summary:** Cho một phần cành mềm tiếp xúc với đất để ra rễ khi cành vẫn nối với cây mẹ.
- **Suitable (EN/VI):** For plants with low, flexible stems that can reach the
  soil / Dùng cho cây có cành thấp, mềm và có thể uốn chạm đất.
- **Steps EN:** Bend a suitable stem to the ground; prepare the rooting point if
  required; pin and cover that section with soil while leaving the tip exposed;
  keep moist; sever and transplant after roots establish.
- **Các bước VI:** Uốn cành phù hợp xuống đất; xử lý điểm ra rễ nếu cần; ghim và
  phủ đất lên đoạn đó nhưng để ngọn lộ ra; giữ ẩm; cắt khỏi cây mẹ và chuyển trồng
  sau khi rễ đã ổn định.
- **Risk EN/VI:** Premature separation can leave too few roots / Tách quá sớm có
  thể khiến cây mới chưa đủ rễ.
- Timing: `deferred`.

### `grafting` — Grafting / Ghép cây

- **EN summary:** Join a scion to a compatible rootstock so their tissues unite and grow as one plant.
- **VI summary:** Nối cành ghép với gốc ghép tương hợp để mô liền lại và phát triển thành một cây.
- **Suitable (EN/VI):** For compatible plants where a cultivar, plant form, or
  rootstock trait must be retained / Dùng cho các cây tương hợp khi cần giữ
  cultivar, dáng cây hoặc đặc tính của gốc ghép.
- **Steps EN:** Select compatible, healthy scion and rootstock at the correct
  physiological stage; make clean matching cuts; align cambial tissue; bind and
  protect all cut surfaces from drying; provide method-specific aftercare.
- **Các bước VI:** Chọn cành ghép và gốc ghép khỏe, tương hợp, đúng giai đoạn sinh
  lý; tạo mặt cắt sạch và khớp; áp lớp tượng tầng; buộc cố định và bảo vệ toàn bộ
  vết cắt khỏi mất nước; chăm sóc sau ghép theo kỹ thuật đã chọn.
- **Risk EN/VI:** Incompatibility, poor cambial contact, contamination, or drying
  can prevent union; cutting tools can injure the user / Không tương hợp, lệch
  tượng tầng, nhiễm bẩn hoặc khô vết ghép có thể làm ghép thất bại; dụng cụ cắt
  có thể gây thương tích.
- Timing: `deferred`.

### `budding` — Budding / Ghép mắt

- **EN summary:** Graft a single bud from the desired plant onto a compatible rootstock.
- **VI summary:** Ghép một mắt chồi của cây mong muốn lên gốc ghép tương hợp.
- **Suitable (EN/VI):** For compatible plants and cultivars conventionally
  propagated by a bud graft / Dùng cho cây và cultivar tương hợp, có quy trình
  ghép bằng một mắt chồi.
- **Steps EN:** Select compatible stock and a mature healthy bud; make the
  method-specific clean cuts; place the bud with cambial contact; wrap to hold
  and protect the union; after healing, manage stock growth as prescribed.
- **Các bước VI:** Chọn gốc ghép tương hợp và mắt chồi khỏe, đã thành thục; tạo
  vết cắt sạch theo kiểu ghép; đặt mắt sao cho tượng tầng tiếp xúc; quấn cố định
  và bảo vệ mối ghép; sau khi liền, xử lý phần ngọn gốc ghép theo quy trình.
- **Risk EN/VI:** The same compatibility, contamination, drying, and sharp-tool
  hazards as grafting apply / Có cùng rủi ro về tương hợp, nhiễm bẩn, mất nước
  và dụng cụ sắc như các kỹ thuật ghép khác.
- Timing: `deferred`.

### `bulb` — Bulb propagation / Nhân giống bằng thân hành

- **EN summary:** Separate a true bulb or its naturally formed daughter bulbs to make new plants.
- **VI summary:** Tách thân hành thật hoặc thân hành con hình thành tự nhiên để tạo cây mới.
- **Suitable (EN/VI):** Only for true bulbs, which have a compressed stem and
  fleshy scales / Chỉ dùng cho thân hành thật, gồm thân co ngắn và các vảy lá mọng.
- **Steps EN:** Confirm the organ is a true bulb; lift or unpot at the
  species-appropriate stage; separate viable daughter bulbs without unnecessary
  damage; replant at the species-specific depth and season.
- **Các bước VI:** Xác nhận cơ quan là thân hành thật; đào hoặc lấy khỏi chậu vào
  giai đoạn phù hợp với loài; tách thân hành con còn sống và hạn chế gây thương
  tổn; trồng lại đúng độ sâu và mùa của loài.
- **Risk EN/VI:** Damaged or persistently wet storage tissue can decay / Mô dự
  trữ bị thương hoặc ẩm kéo dài có thể thối.
- Timing: `deferred`.

### `corm` — Corm propagation / Nhân giống bằng thân củ đặc

- **EN summary:** Separate a solid swollen stem or its daughter corms/cormels to make new plants.
- **VI summary:** Tách thân củ đặc hoặc thân củ con để tạo cây mới.
- **Suitable (EN/VI):** Only when the organ is a corm, not a true bulb / Chỉ dùng
  khi cơ quan là thân củ đặc, không phải thân hành thật.
- **Steps EN:** Identify the corm correctly; lift it at the species-appropriate
  stage; separate sound daughter structures; cure only when the plant-specific
  protocol requires it; store or replant under species-specific conditions.
- **Các bước VI:** Nhận diện đúng thân củ đặc; đào vào giai đoạn phù hợp; tách các
  thân củ con lành; chỉ hong khi hướng dẫn riêng của cây yêu cầu; bảo quản hoặc
  trồng lại theo điều kiện của loài.
- **Risk EN/VI:** Misidentification can lead to the wrong cutting, storage, or
  planting procedure / Nhận diện sai có thể dẫn đến cắt, bảo quản hoặc trồng sai cách.
- Timing: `deferred`.

### `tuber` — Tuber propagation / Nhân giống bằng củ

- **EN summary:** Propagate from a tuber or tuberous storage organ using the procedure documented for that plant.
- **VI summary:** Nhân giống từ củ hoặc cơ quan dự trữ dạng củ theo đúng quy trình đã xác nhận cho cây đó.
- **Suitable (EN/VI):** Only after identifying whether the plant has a stem
  tuber, tuberous root, or another structure / Chỉ dùng sau khi xác định cây có
  thân củ, rễ củ hay một cấu trúc khác.
- **Steps EN:** Identify the organ; retain the viable bud/crown tissue required
  by that plant; divide only if its reviewed protocol permits; protect cut
  surfaces as prescribed; replant under species-specific conditions.
- **Các bước VI:** Nhận diện cơ quan; giữ lại mắt hoặc mô tán gốc sống mà cây đó
  cần; chỉ chia củ nếu quy trình đã review cho phép; xử lý mặt cắt theo hướng dẫn;
  trồng lại trong điều kiện riêng của loài.
- **Risk EN/VI:** Not all tuberous organs carry buds in the same places; generic
  “cut into pieces” advice is unsafe for the plant / Các loại củ không mang mắt
  ở cùng vị trí; hướng dẫn chung “cắt thành miếng” có thể làm hỏng vật liệu giống.
- Timing: `deferred`.

### `rhizome` — Rhizome division / Tách thân rễ

- **EN summary:** Divide a horizontal stem at or below the soil surface into viable sections.
- **VI summary:** Chia thân mọc ngang trên hoặc dưới mặt đất thành các đoạn có thể sống.
- **Suitable (EN/VI):** For rhizomatous plants with sections that retain a
  viable growth bud and roots as required / Dùng cho cây có thân rễ; mỗi phần
  phải giữ mầm sinh trưởng và rễ theo yêu cầu của loài.
- **Steps EN:** Expose or lift the rhizome; identify healthy growth points;
  divide into viable sections; remove only tissue a plant-specific guide marks
  as unsound; replant promptly at the correct orientation and depth.
- **Các bước VI:** Làm lộ hoặc đào thân rễ; xác định các điểm sinh trưởng khỏe;
  chia thành đoạn còn khả năng sống; chỉ bỏ mô được hướng dẫn riêng xác định là
  hỏng; trồng lại sớm, đúng chiều và độ sâu.
- **Risk EN/VI:** A section without a viable bud may not regrow / Đoạn không có
  mầm sống có thể không mọc lại.
- Timing: `deferred`.

### `runner` — Runner propagation / Tách ngó

- **EN summary:** Root or separate a daughter plant formed along a surface-running stem.
- **VI summary:** Cho cây con trên thân bò ra rễ hoặc tách cây con đó để trồng riêng.
- **Suitable (EN/VI):** For plants that naturally form runners/stolons with
  plantlets / Dùng cho cây tự tạo ngó hoặc thân bò mang cây con.
- **Steps EN:** Select a healthy plantlet; root it while attached if it lacks
  sufficient roots; keep the rooting point moist; sever the runner after roots
  establish; transplant promptly.
- **Các bước VI:** Chọn cây con khỏe; cho ra rễ khi còn nối với cây mẹ nếu rễ chưa
  đủ; giữ ẩm điểm ra rễ; cắt ngó sau khi rễ ổn định; chuyển trồng sớm.
- **Risk EN/VI:** Separating an unrooted plantlet too early can cause failure / Tách
  cây con chưa đủ rễ quá sớm có thể làm cây chết.
- Timing: `deferred`.

### `offset` — Offset propagation / Tách cây con

- **EN summary:** Separate a naturally formed daughter plant growing beside or on the parent.
- **VI summary:** Tách cây con hình thành tự nhiên bên cạnh hoặc trên cây mẹ.
- **Suitable (EN/VI):** For plants that produce separable offsets / Dùng cho cây
  tạo cây con có thể tách độc lập.
- **Steps EN:** Wait until the offset has the plant-specific minimum viable
  growth and roots; separate cleanly with minimal parent damage; plant in an
  appropriate clean medium; support establishment.
- **Các bước VI:** Chờ cây con đạt mức phát triển và bộ rễ tối thiểu theo loài;
  tách sạch, hạn chế tổn thương cây mẹ; trồng vào giá thể sạch, phù hợp; chăm sóc
  trong giai đoạn hồi phục.
- **Risk EN/VI:** Very small or rootless offsets may not establish / Cây con quá
  nhỏ hoặc chưa có rễ có thể không sống.
- Timing: `deferred`.

### `sucker` — Sucker propagation / Tách chồi

- **EN summary:** Separate a shoot arising from the base or root system when it can form an independent plant.
- **VI summary:** Tách chồi mọc từ gốc hoặc hệ rễ khi chồi có thể phát triển thành cây độc lập.
- **Suitable (EN/VI):** For species known to produce transplantable suckers / Dùng
  cho loài được xác nhận có chồi gốc hoặc chồi rễ có thể tách trồng.
- **Steps EN:** Identify a healthy sucker and its connection to the parent;
  expose the junction carefully; retain the roots required for establishment;
  make a clean separation; replant promptly.
- **Các bước VI:** Xác định chồi khỏe và điểm nối với cây mẹ; làm lộ điểm nối cẩn
  thận; giữ phần rễ cần cho cây hồi phục; cắt tách sạch; trồng lại sớm.
- **Risk EN/VI:** Root disturbance can damage the parent, and rootless shoots
  may fail / Xáo trộn rễ có thể hại cây mẹ, còn chồi thiếu rễ có thể chết.
- Timing: `deferred`.

### `spore` — Spore propagation / Gieo bào tử

- **EN summary:** Raise spore-producing plants, especially ferns, through their spore life cycle rather than from seed.
- **VI summary:** Tạo cây mới ở nhóm sinh bào tử, đặc biệt là dương xỉ, qua chu kỳ bào tử thay vì từ hạt.
- **Suitable (EN/VI):** For a species with a documented spore-propagation
  protocol; it is generally slow and technically demanding / Dùng cho loài có
  quy trình gieo bào tử đã được xác nhận; phương pháp thường chậm và khó.
- **Steps EN:** Collect mature spores without mixing batches; surface-sterilize
  the sowing medium; sow spores thinly and cover to retain humidity; keep in
  suitable indirect light; separate developing plants only at the documented stage.
- **Các bước VI:** Thu bào tử chín và tránh lẫn giữa các lô; khử trùng bề mặt giá
  thể gieo; rắc mỏng rồi che để giữ ẩm; đặt ở ánh sáng gián tiếp phù hợp; chỉ tách
  cây đang phát triển ở giai đoạn được hướng dẫn.
- **Risk EN/VI:** Fine spores contaminate or cross-contaminate easily; dry air
  can kill young stages / Bào tử mịn dễ nhiễm tạp hoặc lẫn lô; không khí khô có
  thể làm chết giai đoạn non.
- **Timing EN/VI:** For the cited general fern protocol, visible early stages
  take months and garden-size plants may take one to two years / Theo quy trình
  dương xỉ tổng quát được dẫn, các giai đoạn đầu cần nhiều tháng và cây đủ lớn
  để trồng ngoài vườn có thể cần một đến hai năm. Scope: `taxon_specific` (ferns).

### `tissue_culture` — Tissue culture / Nuôi cấy mô

- **EN summary:** Regenerate plants from very small plant parts in sterile culture under controlled conditions.
- **VI summary:** Tái sinh cây từ phần mô rất nhỏ trong môi trường nuôi cấy vô trùng và điều kiện kiểm soát.
- **Suitable (EN/VI):** Primarily for trained laboratory or nursery workflows,
  not a routine home method / Chủ yếu dành cho quy trình phòng thí nghiệm hoặc
  nhà vườn có chuyên môn, không phải phương pháp gia đình thông thường.
- **Steps EN:** Select and disinfect suitable plant tissue; establish it in a
  sterile vessel on a defined culture medium; control the environment and
  contamination through multiplication and rooting; acclimatize plantlets
  gradually before normal growing conditions.
- **Các bước VI:** Chọn và khử trùng mô phù hợp; đưa mô vào bình vô trùng chứa môi
  trường nuôi cấy xác định; kiểm soát điều kiện và nhiễm tạp trong các giai đoạn
  nhân chồi, ra rễ; thuần dưỡng cây con dần trước khi chuyển sang điều kiện trồng thường.
- **Risk EN/VI:** Contamination and poor acclimatization can cause major losses;
  the method requires specialized sterile practice / Nhiễm tạp và thuần dưỡng
  không đúng có thể gây hao hụt lớn; phương pháp cần kỹ thuật vô trùng chuyên biệt.
- Timing: `deferred`.

## 5. Provenance map for this proposal

These are candidate editorial sources, not an approval record:

1. **NC State Extension Gardener Handbook, Chapter 13: Propagation**  
   URL: https://content.ces.ncsu.edu/extension-gardener-handbook/13-propagation  
   Locators: “Sexual Propagation”, “Asexual Propagation—Cuttings”, “Layering”,
   “Separation and Division”, “Budding and Grafting”, “Micropropagation”.  
   Supports: general definitions, suitability, steps, and risks for `seed`, all
   three cutting codes, both layering codes, `division`, `grafting`, `budding`,
   `bulb`, `corm`, and `tissue_culture`.
2. **Missouri Extension, Plants and Their Environment**  
   URL: https://extension.missouri.edu/publications/mg2  
   Locator: “Parts of belowground modified stems”.  
   Supports: morphological distinctions among `bulb`, `corm`, `tuber`, and
   `rhizome`.
3. **Missouri Extension, Home Propagation of Houseplants**  
   URL: https://extension.missouri.edu/publications/g6560  
   Locators: “Division”, “Layering”.  
   Supports: `offset`, natural plantlet separation, and rooting while attached.
4. **Penn State Extension, Propagating Houseplants**  
   URL: https://extension.psu.edu/propagating-houseplants  
   Locators: “Environmental Requirements”, “Cuttings”, “Division”, “Layering”.  
   Supports: clean tools/media, moisture/humidity cautions, cuttings, runners,
   offsets, and division.
5. **RHS, How to grow ferns**  
   URL: https://www.rhs.org.uk/plants/types/ferns/growing-guide  
   Locators: “Propagating — Spores”, “How to sterilise compost”, “How to sow spores”.  
   Supports: `spore` steps, difficulty, contamination/drying risks, and the
   explicitly fern-scoped timing statement.

`sucker` has only partial support in the candidate source set and remains
`needs_review`; add a direct extension source describing separation of rooted
suckers before approval. Vietnamese botanical terminology also requires a
named horticultural language reviewer.

## 6. Implementation plan and acceptance gates

1. **Approve taxonomy language:** resolve the five Vietnamese title issues and
   the generic `tuber` boundary; do not change codes.
2. **Approve the content contract:** decide storage module, runtime validator,
   source visibility, and locale fallback behavior. Prefer a dedicated shared
   content module/data file rather than expanding the enum utility's responsibility.
3. **Complete evidence:** add direct support for `sucker`; map each displayed
   bullet to at least one locator; remove or rewrite any unsupported bullet.
4. **Parallel bilingual review:** an English horticultural reviewer and a
   Vietnamese horticultural-language reviewer compare facts, field presence,
   and step order. Record names and timestamps.
5. **Implement read-only resolution:** add strict lookup by stable code and
   tests for all 18 codes, unknown codes, locale parity, source coverage, and
   approval invariants.
6. **Implement navigation:** register `richfarm://propagation/<stable-code>` and
   verify cold start, warm start, malformed paths, and both locales. This is a
   later implementation task, not performed by this content proposal.
7. **Publish only approved records:** `draft`, `needs_review`, and `deferred`
   records must not appear as finished guidance.

Acceptance requirements for the content artifact:

- exactly 18 unique records and exact equality with `PROPAGATION_METHODS`;
- 18/18 English and 18/18 Vietnamese titles, summaries, suitability lists, and
  step lists;
- structural parity between `en` and `vi` for every record;
- no plant-specific timing presented as universal;
- every rendered timing/risk/safety statement has a supporting source locator;
- `approved` is impossible without reviewer metadata;
- deep-link round-trip tests cover all stable codes and reject unknown codes;
- no production deploy, migration, commit, or push is part of this plan.

## 7. Coverage and open items

| Area | English | Vietnamese | State |
|---|---:|---:|---|
| Stable titles | 18/18 drafted | 18/18 drafted | 5 VI titles need terminology review |
| Summaries | 18/18 | 18/18 | `needs_review` |
| When suitable | 18/18 | 18/18 | `needs_review` |
| Steps | 18/18 | 18/18 | `needs_review` |
| Generic timing | 0/18 | 0/18 | deliberately `deferred` |
| Evidence-scoped timing | 1/18 (`spore`, ferns) | 1/18 (`spore`, ferns) | `needs_review` |
| Risks/safety | 18/18 drafted | 18/18 drafted | verify bullet-level source mapping; sharp-tool wording needs explicit safety source |
| Provenance metadata | shared candidate map | shared candidate map | direct `sucker` source missing |
| Named review metadata | 0/18 | 0/18 | required before approval |

Open product/engineering decisions: storage location, user-visible citations,
locale fallback, route registration, offline packaging/cache versioning, and
whether generic method pages should show plant-specific cautions when opened
from a plant context.
