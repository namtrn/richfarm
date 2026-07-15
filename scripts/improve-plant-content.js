#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "packages/convex/convex/data/plantI18nSource");
const placeholderPatterns = [
  /for (?:a )?broader (?:plant mix|garden planning coverage|library coverage)/i,
  /for diversified seed coverage/i,
  /with stable growth profile/i,
  /is a popular plant for home gardens and small farms/i,
  /giống phổ biến của .+ sinh trưởng ổn định/i,
  /giong .+ sinh truong on dinh/i,
  /giúp mở rộng lựa chọn trong thư viện cây/i,
  /giong .+ giup mo rong lua chon trong thu vien cay/i,
  /là cây phổ biến trong vườn nhà và nông trại nhỏ/i,
];

const curated = {
  en: {
    "Allium cepa": "Onion is a cool-season allium grown for its layered bulbs and edible young leaves. Give it full sun, loose well-drained soil, and steady moisture while the bulb is forming; reduce watering as the tops begin to fall. Bulbs are ready to cure when the foliage yellows and bends over.",
    "Allium sativum": "Garlic is grown from individual cloves for its pungent, kitchen-ready bulbs. Plant in fertile, well-drained soil during the cool season, keep weeds down, and avoid waterlogged ground. Harvest when the lower leaves brown while several upper leaves remain green, then cure the bulbs before storage.",
    "Capsicum annuum": "Sweet pepper is a warm-season plant grown for crisp, mild fruit that can be harvested green or allowed to color fully. It performs best with strong sun, warm soil, even moisture, and shelter from cold wind. Avoid large swings between dry and saturated soil, which can reduce fruit quality.",
    "Citrullus lanatus": "Watermelon is a heat-loving trailing vine grown for large, sweet fruit. Give vines full sun, ample room, rich well-drained soil, and consistent water during early growth and fruit set. Fruit maturity is better judged from several signs together, including a drying tendril near the stem and a duller rind.",
    "Cucumis sativus": "Cucumber is a fast-growing warm-season vine grown for crisp immature fruit. Provide full sun, fertile soil, steady moisture, and a trellis where space or airflow is limited. Pick frequently while fruit is firm; over-mature cucumbers slow continued production.",
    "Daucus carota": "Carrot is a cool-season root crop whose best roots form in deep, loose soil without stones or fresh clumps of manure. Keep the seedbed evenly moist through the slow germination period, then thin seedlings so roots have room to expand. Harvest young for tenderness or leave suitable cultivars to size up.",
    "Fragaria × ananassa": "Garden strawberry is a low perennial grown for aromatic berries and spreading runners. It prefers sun, fertile well-drained soil, good airflow, and consistent moisture without wetting ripe fruit repeatedly. Keep berries off bare soil and remove damaged fruit promptly to limit rot.",
    "Lactuca sativa": "Lettuce is a quick cool-season leafy crop harvested as baby leaves or mature heads. Grow it in fertile, moisture-retentive soil and use afternoon shade when conditions turn hot. Heat and drought encourage bitterness and bolting, so harvest promptly once plants reach the desired size.",
    "Mentha × piperita": "Peppermint is a vigorous perennial herb grown for strongly aromatic leaves used in drinks, cooking, and teas. It likes moist, fertile soil and tolerates partial shade, but its spreading underground stems can overrun nearby plants. Growing it in a container keeps it easier to manage.",
    "Ocimum basilicum": "Basil is a tender warm-season herb grown for fragrant leaves used fresh or cooked. Give it warmth, bright sun, fertile well-drained soil, and regular moisture without leaving the roots waterlogged. Pinch growing tips and harvest often to encourage branching; cold weather quickly damages the plant.",
    "Raphanus sativus": "Radish is a fast cool-season crop grown for crisp roots, edible leaves, and—in some types—seed pods. Sow directly into loose soil, keep moisture even, and thin early so roots do not crowd. Harvest promptly because oversized roots can become pithy or sharply flavored.",
    "Solanum lycopersicum": "Tomato is a warm-season crop grown for fruit used fresh, cooked, or preserved. It needs strong sun, fertile well-drained soil, support for indeterminate growth, and consistent watering at the root zone. Monitor new growth and fruit for pests or disease, and harvest when color and firmness suit the cultivar.",
    "Solanum tuberosum": "Potato is a cool-to-mild season crop that forms edible tubers below ground. Plant certified seed pieces in loose, well-drained soil and hill soil or mulch around stems as they grow to protect developing tubers from light. Let the canopy mature for storage potatoes, or harvest earlier for tender new potatoes.",
  },
  vi: {
    "Allium cepa": "Hành tây là cây họ hành ưa thời tiết mát, được trồng lấy củ nhiều lớp và lá non ăn được. Cây cần nhiều nắng, đất tơi xốp thoát nước và độ ẩm ổn định trong giai đoạn tạo củ; giảm tưới khi lá bắt đầu đổ. Có thể thu hoạch để hong khô khi phần lớn lá vàng và nằm xuống.",
    "Allium sativum": "Tỏi được trồng từ từng tép để tạo củ có mùi vị đậm dùng trong bếp. Nên trồng vào mùa mát trên đất màu mỡ, thoát nước tốt, giữ luống sạch cỏ và tránh úng. Thu hoạch khi các lá dưới đã nâu nhưng phía trên vẫn còn vài lá xanh, sau đó hong củ trước khi bảo quản.",
    "Capsicum annuum": "Ớt chuông là cây vụ ấm cho quả giòn, vị dịu; có thể hái khi còn xanh hoặc để chín đổi màu. Cây phát triển tốt khi có nắng mạnh, đất ấm, độ ẩm đều và được che gió lạnh. Tránh để đất luân phiên quá khô rồi quá ướt vì dễ làm giảm chất lượng quả.",
    "Citrullus lanatus": "Dưa hấu là dây leo ưa nóng, được trồng lấy quả lớn và ngọt. Cây cần nhiều nắng, khoảng trống cho dây bò, đất giàu dinh dưỡng thoát nước và tưới đều trong giai đoạn sinh trưởng, đậu quả. Khi xác định quả chín nên kết hợp nhiều dấu hiệu như tua gần cuống khô và vỏ bớt bóng.",
    "Cucumis sativus": "Dưa leo là dây leo vụ ấm, sinh trưởng nhanh và được thu hoạch khi quả còn non, giòn. Cây cần nhiều nắng, đất màu mỡ, độ ẩm ổn định; làm giàn giúp tiết kiệm diện tích và tăng thông thoáng. Hái quả thường xuyên vì quả để quá già sẽ làm cây giảm đợt ra trái tiếp theo.",
    "Daucus carota": "Cà rốt là cây lấy củ vụ mát, tạo củ đẹp nhất trong đất sâu, tơi và không có đá hoặc phân chuồng tươi vón cục. Giữ mặt luống ẩm đều trong thời gian hạt nảy mầm khá chậm, sau đó tỉa cây để củ có chỗ lớn. Có thể thu non để ăn mềm hoặc để giống phù hợp phát triển đủ kích thước.",
    "Fragaria × ananassa": "Dâu tây vườn là cây lâu năm thân thấp, cho quả thơm và lan bằng ngó. Cây ưa nắng, đất màu mỡ thoát nước, không khí thông thoáng và độ ẩm đều nhưng không nên làm ướt quả chín liên tục. Phủ gốc để quả không chạm đất và loại bỏ quả hỏng sớm để hạn chế thối.",
    "Lactuca sativa": "Xà lách là rau ăn lá vụ mát, có thể thu lá non hoặc cả cây khi tạo búp. Trồng trên đất màu mỡ giữ ẩm tốt và che nắng chiều khi thời tiết nóng. Nóng và thiếu nước làm lá đắng, cây lên ngồng sớm, vì vậy nên thu đúng lúc đạt kích thước mong muốn.",
    "Mentha × piperita": "Bạc hà Âu là cây thảo lâu năm phát triển mạnh, được trồng lấy lá thơm dùng cho đồ uống, món ăn và trà. Cây thích đất ẩm, màu mỡ và chịu được bóng bán phần, nhưng thân ngầm lan nhanh có thể lấn cây bên cạnh. Trồng trong chậu giúp kiểm soát cây dễ hơn.",
    "Ocimum basilicum": "Húng quế là cây gia vị vụ ấm, được trồng lấy lá thơm dùng tươi hoặc nấu chín. Cây cần thời tiết ấm, nhiều ánh sáng, đất màu mỡ thoát nước và tưới đều nhưng không để úng rễ. Bấm ngọn và thu lá thường xuyên để cây phân nhánh; nhiệt độ lạnh làm cây suy nhanh.",
    "Raphanus sativus": "Củ cải là cây vụ mát sinh trưởng nhanh, được trồng lấy củ giòn; lá và quả non của một số giống cũng ăn được. Gieo thẳng trên đất tơi, giữ ẩm đều và tỉa sớm để củ không chen chúc. Thu hoạch đúng lúc vì củ quá lớn dễ xốp hoặc có vị cay gắt.",
    "Solanum lycopersicum": "Cà chua là cây vụ ấm được trồng lấy quả để ăn tươi, nấu chín hoặc chế biến. Cây cần nắng mạnh, đất màu mỡ thoát nước, giá đỡ với giống sinh trưởng vô hạn và lượng nước ổn định tại vùng rễ. Theo dõi chồi non, lá và quả để phát hiện sâu bệnh; thu khi màu sắc và độ cứng phù hợp với từng giống.",
    "Solanum tuberosum": "Khoai tây là cây vụ mát đến ôn hòa, tạo củ ăn được dưới mặt đất. Trồng miếng củ giống sạch bệnh trong đất tơi thoát nước và vun đất hoặc phủ gốc khi thân lớn để củ không gặp ánh sáng. Có thể đào sớm lấy khoai non, hoặc chờ tán lá già tự nhiên nếu cần củ bảo quản.",
  },
};

const normalizeWords = (value, ignored = []) => {
  let normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (const token of ignored) {
    const clean = token.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (clean) normalized = normalized.replaceAll(clean, " ");
  }
  return new Set(normalized.match(/[a-z0-9]+/g) || []);
};

const similarity = (left, right, ignored) => {
  const a = normalizeWords(left, ignored);
  const b = normalizeWords(right, ignored);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection += 1;
  return intersection / new Set([...a, ...b]).size;
};

for (const locale of ["en", "vi"]) {
  const file = path.join(sourceDir, `${locale}.json`);
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  const baseByScientificName = new Map(rows.filter((row) => !row.cultivar).map((row) => [row.scientificName, row]));
  let curatedCount = 0;
  let inheritedCount = 0;
  for (const row of rows) {
    if (!row.cultivar && curated[locale][row.scientificName]) {
      row.description = curated[locale][row.scientificName];
      curatedCount += 1;
      continue;
    }
    const base = baseByScientificName.get(row.scientificName);
    const duplicatesBase = row.cultivar && base?.description && similarity(
      row.description || "",
      base.description,
      [row.cultivar, row.commonName || "", base.commonName || ""],
    ) >= 0.82;
    if (row.cultivar && (
      placeholderPatterns.some((pattern) => pattern.test(row.description || "")) || duplicatesBase
    )) {
      delete row.description;
      inheritedCount += 1;
    }
  }
  fs.writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`);
  console.log(`${locale}: ${curatedCount} curated base descriptions; ${inheritedCount} cultivar placeholders now inherit base content`);
}
