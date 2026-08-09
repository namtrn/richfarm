#!/usr/bin/env node

// Phase 3.1 Giai đoạn 0 — build the versioned priority list artifact.
//
// The artifact (packages/convex/convex/data/plantPriorityList.v1.json) is the
// frozen curation intent: which canonical identities get full-detail
// investment first. Entries are NOT invented here — every entry is validated
// against the existing seed identities, and the identity fields are computed
// with the same normalization the taxonomy layer uses, so list/search/detail
// projection and the audit measure the same keys.
//
// Usage: node scripts/build-plant-priority-list.js

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "packages/convex/convex/data/plantI18nSource");
const outFile = path.join(root, "packages/convex/convex/data/plantPriorityList.v1.json");

const stripDiacritics = (value) =>
  String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalizeToken = (value) =>
  stripDiacritics(value).trim().toLowerCase().replace(/\s+/g, " ");

// Mirrors packages/convex/convex/lib/plantTaxonomy.ts parsing rules so the
// artifact identities exactly match the canonical projection identities.
function taxonomyIdentity(row) {
  const tokens = String(row.scientificName ?? "")
    .trim()
    .replace(/[,;]+/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/[()]/g, "").trim())
    .filter(Boolean);
  if (tokens.length < 2) return null;

  let speciesIndex = 1;
  if ((tokens[1] === "x" || tokens[1] === "×") && tokens.length >= 3) {
    speciesIndex = 2;
  }
  const rawSpecies = tokens[speciesIndex].replace(/^[x×]+/i, "").trim();
  const isWord = (token) => /^[A-Za-z.-]+$/.test(token);
  if (!isWord(tokens[0]) || !isWord(rawSpecies)) return null;

  let cultivar = String(row.cultivar ?? "").trim();
  if (!cultivar && tokens.length >= 3) {
    const inferredIndex = (tokens[1] === "x" || tokens[1] === "×") && tokens.length >= 4 ? 2 : 1;
    const remainder = tokens.slice(inferredIndex + 1);
    const rankToken = (remainder[0] ?? "").toLowerCase();
    const looksLikeRank = ["subsp.", "subsp", "ssp.", "ssp", "var.", "var", "f.", "f"].includes(rankToken);
    if (looksLikeRank) cultivar = remainder.join(" ").trim();
  }

  return {
    genusNormalized: normalizeToken(tokens[0]),
    speciesNormalized: normalizeToken(rawSpecies),
    cultivarNormalized: normalizeToken(cultivar) || "__default__",
  };
}

// Curated Phase 3.1 v1 priorities. Each entry references a real seed identity
// (validated below); the identity itself must not be fabricated.
const entries = [
  // ── Rau củ (vegetables) ───────────────────────────────────────────────
  { scientificName: "Solanum lycopersicum", category: "rau_cu", rank: 1, rationale: "Cà chua là rau ăn quả phổ biến nhất trong vườn nhà Việt Nam, có tín hiệu search/Add Plant cao nhất." },
  { scientificName: "Solanum melongena", category: "rau_cu", rank: 2, rationale: "Cà tím trồng phổ biến cả vụ mưa lẫn vụ nắng, nhu cầu care profile rõ ràng." },
  { scientificName: "Capsicum annuum", category: "rau_cu", rank: 3, rationale: "Ớt ngọt/ớt chuông phổ biến, nhiều cultivar cần phân tách rõ base-variant." },
  { scientificName: "Capsicum frutescens", category: "rau_cu", rank: 4, rationale: "Ớt chỉ thiên gắn với ẩm thực Việt, trồng sân thượng và ruộng đều có." },
  { scientificName: "Lactuca sativa", category: "rau_cu", rank: 5, rationale: "Xà lách là rau ăn lá có chu kỳ ngắn, người dùng trồng liên tục theo vụ." },
  { scientificName: "Daucus carota", category: "rau_cu", rank: 6, rationale: "Cà rốt phổ biến vụ đông xuân, cần care đất/pH chính xác." },
  { scientificName: "Solanum tuberosum", category: "rau_cu", rank: 7, rationale: "Khoai tây là cây lương thực vụ đông, cần hướng dẫn bón và luân canh." },
  { scientificName: "Ipomoea batatas", category: "rau_cu", rank: 8, rationale: "Khoai lang dễ trồng, lá và củ đều dùng được, hợp vườn nhỏ." },
  { scientificName: "Brassica oleracea var. italica", category: "rau_cu", rank: 9, rationale: "Bông cải xanh phổ biến vụ đông, đại diện nhóm brassica đông xuân." },
  { scientificName: "Brassica oleracea var. capitata", category: "rau_cu", rank: 10, rationale: "Bắp cải là rau vụ đông chủ lực, nhu cầu kho tàng và care đầy đủ." },
  { scientificName: "Brassica oleracea var. sabellica", category: "rau_cu", rank: 11, rationale: "Cải xoăn kale phổ biến với nhóm ăn healthy, tín hiệu tăng gần đây." },
  { scientificName: "Spinacia oleracea", category: "rau_cu", rank: 12, rationale: "Cải bó xôi vụ đông, care nước và nhiệt độ cần chính xác." },
  { scientificName: "Brassica rapa subsp. chinensis", category: "rau_cu", rank: 13, rationale: "Cải thìa là rau ăn lá trồng quanh năm tại Việt Nam." },
  { scientificName: "Ipomoea aquatica", category: "ban_dia", rank: 14, rationale: "Rau muống là rau bản địa trồng phổ biến nhất, gắn với vườn nhà Việt." },
  { scientificName: "Basella alba", category: "ban_dia", rank: 15, rationale: "Mồng tơi dễ trồng mùa hè, cây bản địa nhiệt đới." },
  { scientificName: "Momordica charantia", category: "ban_dia", rank: 16, rationale: "Khổ qua trồng giàn phổ biến, quả dùng trong bữa ăn hằng ngày." },
  { scientificName: "Allium cepa", category: "rau_cu", rank: 17, rationale: "Hành tây cần care khoảng cách/bón rõ ràng, vụ đông xuân." },
  { scientificName: "Allium sativum", category: "rau_cu", rank: 18, rationale: "Tỏi là gia vị lẫn rau, trồng vụ đông ở đồng bằng sông Hồng." },
  { scientificName: "Allium fistulosum", category: "rau_cu", rank: 19, rationale: "Hành lá trồng quanh năm, phổ biến mọi vườn nhà." },
  { scientificName: "Allium porrum", category: "rau_cu", rank: 20, rationale: "Tỏi tây ít phổ biến hơn nhưng thuộc nhóm rau vụ đông." },
  { scientificName: "Raphanus sativus", category: "rau_cu", rank: 21, rationale: "Củ cải trắng vụ đông, chu kỳ ngắn, dễ bắt đầu cho người mới." },
  { scientificName: "Cucumis sativus", category: "rau_cu", rank: 22, rationale: "Dưa chuột trồng giàn phổ biến, nhu cầu care nước cao." },
  { scientificName: "Cucurbita pepo", category: "rau_cu", rank: 23, rationale: "Bí xanh/zucchini vụ hè, đại diện nhóm bí trồng giàn." },
  { scientificName: "Cucurbita moschata", category: "rau_cu", rank: 24, rationale: "Bí đỏ trồng bò lan, phổ biến vụ mưa." },
  { scientificName: "Sechium edule", category: "ban_dia", rank: 25, rationale: "Su su là rau leo nhiệt đới quen thuộc ở miền Bắc." },
  { scientificName: "Abelmoschus esculentus", category: "rau_cu", rank: 26, rationale: "Đậu bắp ưa nắng nóng, trồng vụ hè, nhiều cultivar phổ biến." },
  { scientificName: "Phaseolus vulgaris", category: "rau_cu", rank: 27, rationale: "Đậu cô ve trồng leo, vụ thu đông và xuân." },
  { scientificName: "Vigna unguiculata", category: "rau_cu", rank: 28, rationale: "Đậu đũa là cây leo quen thuộc của vườn nhà Việt." },
  { scientificName: "Zea mays convar. saccharata", category: "rau_cu", rank: 29, rationale: "Ngô ngọt vụ xuân hè, cần care đất và thụ phấn." },
  { scientificName: "Apium graveolens", category: "rau_cu", rank: 30, rationale: "Cần tây vụ đông, phổ biến trong nấu ăn." },
  { scientificName: "Asparagus officinalis", category: "rau_cu", rank: 31, rationale: "Măng tây là cây trồng giá trị cao, nhiều năm." },
  { scientificName: "Beta vulgaris", category: "rau_cu", rank: 32, rationale: "Củ dền vụ đông, nhu cầu đất tơi xốp." },
  { scientificName: "Cichorium intybus", category: "rau_cu", rank: 33, rationale: "Rau diếp xoăn/radicchio phổ biến với nhóm ăn salad." },
  { scientificName: "Eruca vesicaria", category: "rau_cu", rank: 34, rationale: "Arugula/rocket phổ biến trong vườn rau sạch." },
  { scientificName: "Valeriana locusta", category: "rau_cu", rank: 35, rationale: "Rau mầm trụ/corn salad cho vụ đông ngắn ngày." },

  // ── Gia vị (herbs & spices) ───────────────────────────────────────────
  { scientificName: "Ocimum basilicum", category: "gia_vi", rank: 36, rationale: "Húng quế là gia vị Việt phổ biến nhất, trồng quanh năm." },
  { scientificName: "Ocimum tenuiflorum", category: "gia_vi", rank: 37, rationale: "Húng chanh/rau húng lủi gắn với ẩm thực và sức khỏe." },
  { scientificName: "Mentha × piperita", category: "gia_vi", rank: 38, rationale: "Bạc hà dễ trồng trong chậu, nhu cầu cao." },
  { scientificName: "Coriandrum sativum", category: "gia_vi", rank: 39, rationale: "Rau mùi là gia vị không thể thiếu trong bữa ăn Việt." },
  { scientificName: "Anethum graveolens", category: "gia_vi", rank: 40, rationale: "Thì là dùng cho món chả cá, trồng vụ đông." },
  { scientificName: "Petroselinum crispum", category: "gia_vi", rank: 41, rationale: "Mùi tây phổ biến trong vườn gia vị." },
  { scientificName: "Allium schoenoprasum", category: "gia_vi", rank: 42, rationale: "Hẹ trồng quanh năm, dễ nhân giống." },
  { scientificName: "Rosmarinus officinalis", category: "gia_vi", rank: 43, rationale: "Hương thảo phổ biến với người làm vườn hiện đại." },
  { scientificName: "Thymus vulgaris", category: "gia_vi", rank: 44, rationale: "Cỏ xạ hương là gia vị khô lâu, dễ trồng." },
  { scientificName: "Salvia officinalis", category: "gia_vi", rank: 45, rationale: "Xô thơm/cây xô thơm phổ biến vườn gia vị." },
  { scientificName: "Origanum vulgare", category: "gia_vi", rank: 46, rationale: "Kinh giới tây phổ biến trong nấu ăn Âu." },
  { scientificName: "Foeniculum vulgare", category: "gia_vi", rank: 47, rationale: "Thì là Ai Cập dùng lá và hạt." },
  { scientificName: "Cymbopogon citratus", category: "gia_vi", rank: 48, rationale: "Sả là gia vị Việt, trồng chậu được." },
  { scientificName: "Zingiber officinale", category: "gia_vi", rank: 49, rationale: "Gừng trồng phổ biến, gia vị lẫn thuốc dân gian." },
  { scientificName: "Curcuma longa", category: "gia_vi", rank: 50, rationale: "Nghệ dùng tươi lẫn bột, dễ trồng." },
  { scientificName: "Eryngium foetidum", category: "ban_dia", rank: 51, rationale: "Mùi tàu là gia vị bản địa Đông Nam Á." },
  { scientificName: "Perilla frutescens", category: "gia_vi", rank: 52, rationale: "Tía tô phổ biến trong món ăn Việt." },
  { scientificName: "Laurus nobilis", category: "gia_vi", rank: 53, rationale: "Nguyệt quế trồng chậu, lá dùng gia vị." },

  // ── Cây ăn quả (fruits) ───────────────────────────────────────────────
  { scientificName: "Fragaria x ananassa", category: "cay_an_qua", rank: 54, rationale: "Dâu tây trồng chậu phổ biến, nhu cầu care chi tiết." },
  { scientificName: "Vaccinium corymbosum", category: "cay_an_qua", rank: 55, rationale: "Việt quất cần đất chua đặc thù, care quan trọng." },
  { scientificName: "Citrullus lanatus", category: "cay_an_qua", rank: 56, rationale: "Dưa hấu vụ xuân hè, phổ biến." },
  { scientificName: "Carica papaya", category: "cay_an_qua", rank: 57, rationale: "Đu đủ trồng nhanh cho quả, phổ biến vườn nhà." },
  { scientificName: "Ananas comosus", category: "cay_an_qua", rank: 58, rationale: "Dứa/khóm dễ trồng, nhiệt đới." },
  { scientificName: "Musa acuminata", category: "cay_an_qua", rank: 59, rationale: "Chuối là cây ăn quả chủ lực." },
  { scientificName: "Mangifera indica", category: "cay_an_qua", rank: 60, rationale: "Xoài là cây ăn quả nhiệt đới phổ biến nhất." },
  { scientificName: "Persea americana", category: "cay_an_qua", rank: 61, rationale: "Bơ nhu cầu tăng mạnh, cần hướng dẫn trồng đúng giống." },
  { scientificName: "Psidium guajava", category: "cay_an_qua", rank: 62, rationale: "Ổi trồng khắp nơi, sai quả quanh năm." },
  { scientificName: "Ficus carica", category: "cay_an_qua", rank: 63, rationale: "Sung/fig phổ biến trồng chậu." },
  { scientificName: "Dimocarpus longan", category: "ban_dia", rank: 64, rationale: "Nhãn là cây ăn quả bản địa Đông Nam Á." },
  { scientificName: "Litchi chinensis", category: "ban_dia", rank: 65, rationale: "Vải thiều nổi tiếng vùng Bắc Giang." },
  { scientificName: "Passiflora edulis", category: "cay_an_qua", rank: 66, rationale: "Chanh dây trồng giàn, phổ biến Đà Lạt và miền Bắc." },
  { scientificName: "Selenicereus undatus", category: "cay_an_qua", rank: 67, rationale: "Thanh long là cây ăn quả xuất khẩu chủ lực." },
  { scientificName: "Punica granatum", category: "cay_an_qua", rank: 68, rationale: "Lựu trồng chậu và vườn, ưa nắng." },
  { scientificName: "Citrus aurantiifolia", category: "cay_an_qua", rank: 69, rationale: "Chanh ta không thể thiếu trong ẩm thực Việt." },
  { scientificName: "Citrus sinensis", category: "cay_an_qua", rank: 70, rationale: "Cam là cây ăn quả có múi chủ lực." },
  { scientificName: "Vitis vinifera", category: "cay_an_qua", rank: 71, rationale: "Nho trồng giàn, nhu cầu care tỉa cành." },
  { scientificName: "Malus domestica", category: "cay_an_qua", rank: 72, rationale: "Táo ôn đới, chăm sóc đặc thù." },
  { scientificName: "Pyrus communis", category: "cay_an_qua", rank: 73, rationale: "Lê ôn đới, care lạnh đông." },
  { scientificName: "Prunus persica", category: "cay_an_qua", rank: 74, rationale: "Đào trồng vùng lạnh, phổ biến vùng núi." },
  { scientificName: "Prunus domestica", category: "cay_an_qua", rank: 75, rationale: "Mận phổ biến vùng ôn đới nhiệt đới mát." },
  { scientificName: "Eriobotrya japonica", category: "cay_an_qua", rank: 76, rationale: "Sơn trà/loquat trồng vùng mát." },
  { scientificName: "Rubus idaeus", category: "cay_an_qua", rank: 77, rationale: "Mâm xôi vùng lạnh, nhu cầu tăng." },

  // ── Hoa và cây cảnh (ornamentals) ─────────────────────────────────────
  { scientificName: "Rosa chinensis", category: "hoa_cay_canh", rank: 78, rationale: "Hoa hồng là cây cảnh được trồng nhiều nhất." },
  { scientificName: "Tagetes erecta", category: "hoa_cay_canh", rank: 79, rationale: "Cúc vạn thọ trồng dịp Tết, phổ biến." },
  { scientificName: "Helianthus annuus", category: "hoa_cay_canh", rank: 80, rationale: "Hướng dương trồng phổ biến cảnh lẫn hạt." },
  { scientificName: "Chrysanthemum morifolium", category: "hoa_cay_canh", rank: 81, rationale: "Cúc là hoa cắm phổ biến." },
  { scientificName: "Lavandula angustifolia", category: "hoa_cay_canh", rank: 82, rationale: "Oải hương phổ biến với nhóm trồng thảo mộc." },
  { scientificName: "Aloe vera", category: "hoa_cay_canh", rank: 83, rationale: "Lô hội trồng chậu, dễ chăm, đa công dụng." },
  { scientificName: "Sansevieria trifasciata", category: "hoa_cay_canh", rank: 84, rationale: "Lưỡi hổ là cây cảnh nội thất phổ biến." },
  { scientificName: "Chlorophytum comosum", category: "hoa_cay_canh", rank: 85, rationale: "Cây nhện dễ trồng treo." },
  { scientificName: "Epipremnum aureum", category: "hoa_cay_canh", rank: 86, rationale: "Trầu bà vàng phổ biến nhất trong cây nội thất." },
  { scientificName: "Monstera deliciosa", category: "hoa_cay_canh", rank: 87, rationale: "Trầu bà nam mỹ/ monstera hot trend gần đây." },
  { scientificName: "Spathiphyllum wallisii", category: "hoa_cay_canh", rank: 88, rationale: "Vĩ hoa trắng/peace lily dễ trồng trong nhà." },
  { scientificName: "Bougainvillea glabra", category: "hoa_cay_canh", rank: 89, rationale: "Hoa giấy phổ biến ban công Việt." },
  { scientificName: "Hibiscus rosa-sinensis", category: "hoa_cay_canh", rank: 90, rationale: "Dâm bụt trồng hàng rào phổ biến." },
  { scientificName: "Jasminum sambac", category: "ban_dia", rank: 91, rationale: "Hoa nhài là hoa bản địa, dùng ướp trà." },
  { scientificName: "Dahlia pinnata", category: "hoa_cay_canh", rank: 92, rationale: "Thược dược phổ biến vùng mát." },
  { scientificName: "Begonia semperflorens", category: "hoa_cay_canh", rank: 93, rationale: "Thu hải đường trồng bồn phổ biến." },
  { scientificName: "Hydrangea macrophylla", category: "hoa_cay_canh", rank: 94, rationale: "Cẩm tú cầu phổ biến Đà Lạt." },
  { scientificName: "Zinnia elegans", category: "hoa_cay_canh", rank: 95, rationale: "Cúc xinh dễ trồng từ hạt." },
  { scientificName: "Tulipa gesneriana", category: "hoa_cay_canh", rank: 96, rationale: "Tulip trồng vụ đông lạnh, cần care củ." },
  { scientificName: "Viola tricolor", category: "hoa_cay_canh", rank: 97, rationale: "Pansy trồng vụ đông." },
];

function main() {
  const en = JSON.parse(fs.readFileSync(path.join(sourceDir, "en.json"), "utf8"));
  const vi = JSON.parse(fs.readFileSync(path.join(sourceDir, "vi.json"), "utf8"));
  const seedRows = [...en, ...vi];

  const byIdentity = new Map();
  for (const row of seedRows) {
    const identity = taxonomyIdentity(row);
    if (!identity) continue;
    const key = [identity.genusNormalized, identity.speciesNormalized, identity.cultivarNormalized].join("|");
    if (!byIdentity.has(key)) byIdentity.set(key, row);
  }

  const missing = [];
  const artifactEntries = [];
  for (const entry of entries) {
    const probe = taxonomyIdentity({ scientificName: entry.scientificName });
    const key = [probe.genusNormalized, probe.speciesNormalized, probe.cultivarNormalized].join("|");
    const seedRow = byIdentity.get(key);
    if (!seedRow) {
      missing.push(`${entry.scientificName} (${entry.category})`);
      continue;
    }
    artifactEntries.push({
      canonicalIdentity: {
        genusNormalized: probe.genusNormalized,
        speciesNormalized: probe.speciesNormalized,
        cultivarNormalized: probe.cultivarNormalized,
      },
      category: entry.category,
      rank: entry.rank,
      rationale: entry.rationale,
      targetLocales: ["en", "vi"],
      targetCoverage: "full_detail",
      sourceRefs: [
        {
          sourceSystem: "richfarm-seed",
          sourceUrl: "packages/convex/convex/data/plantI18nSource/en.json",
          locator: seedRow.scientificName,
        },
        {
          sourceSystem: "richfarm-seed",
          sourceUrl: "packages/convex/convex/data/plantI18nSource/vi.json",
          locator: seedRow.commonName,
        },
      ],
      assignedTo: null,
      reviewedBy: null,
      reviewedAt: null,
    });
  }

  if (missing.length > 0) {
    console.error("Priority entries missing from seed data (NOT emitted):");
    for (const name of missing) console.error(`  - ${name}`);
  }

  const artifact = {
    listVersion: "v1",
    createdAt: new Date().toISOString().split("T")[0],
    owner: "Plant Content Owner",
    assignees: {
      owner: "TBD",
      taxonomyReviewer: "TBD",
      localeReviewers: ["TBD"],
      careReviewers: ["TBD"],
    },
    scope: "Phase 3.1 full-detail investment; identity set cross-checked against repository seed.",
    criteria: [
      "Entry must exist in repository seed data (identity validated against plantI18nSource).",
      "Categories prioritized: rau_cu, gia_vi, cay_an_qua, hoa_cay_canh, ban_dia.",
      "Full-detail investment starts here; taxonomy-only coverage is independent.",
    ],
    entries: artifactEntries.sort((left, right) => left.rank - right.rank),
  };

  fs.writeFileSync(outFile, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Wrote ${outFile}`);
  console.log(`Entries: ${artifactEntries.length} (${missing.length} dropped: not in seed)`);
}

main();
