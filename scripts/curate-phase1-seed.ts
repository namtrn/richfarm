// Giai đoạn 1 curation examples: apply authored descriptions, Vietnamese
// diacritics and provenance to the seed source rows (plantI18nSource/*.json).
// Run before build:plant-i18n. DB mirror updates happen in the tsx sibling
// script (curate-phase1-db.ts).

const fs = require("fs");
const path = require("path");

const sourceDir = path.resolve(__dirname, "../packages/convex/convex/data/plantI18nSource");

const EN_DESCRIPTIONS = {
  "Valeriana locusta":
    "Corn salad is a low-growing cool-season green with small, spoon-shaped leaves in loose rosettes. It is prized for a mild, nutty flavor and for germinating and growing well in the short, chilly days of late autumn and early spring, when other salad leaves slow down. Sow in shallow drills in moist, cool soil and harvest whole rosettes or individual leaves; in mild regions it can be overwintered under a light mulch or cold frame. Plants bolt quickly once days lengthen and warm, so succession-sow in short intervals.",
  "Laurus nobilis":
    "Sweet bay is a slow-growing evergreen tree or shrub with glossy, aromatic leaves that are dried for seasoning soups, stews and stocks. It is grown in containers in cooler climates and trained as a standard or clipped hedge in mild ones. Give it full sun to part shade, well-drained soil and shelter from harsh wind and frost; potted plants must come indoors or into a protected spot below freezing. Leaves are best harvested after the new growth has hardened, then air-dried; the plant tolerates hard pruning and reshoots readily.",
  "Rubus idaeus":
    "Raspberry is a hardy, clump-forming bramble that spreads by underground runners and bears clusters of soft, aromatic berries on biennial canes. Summer-fruiting types crop on two-year-old canes in early summer; everbearing types add a fall crop on the current season's growth. Plant canes in full sun in well-drained, slightly acidic soil with a trellis or support, and keep the root zone evenly moist. Remove spent canes after harvest and tie in the new canes; ripening berries need protection from birds. The fruits are highly perishable and best picked when they slip easily off the white core.",
};

const VI_DESCRIPTIONS = {
  "Valeriana locusta":
    "Xà lách cúc (còn gọi là rau mầm trụ, corn salad) là loại rau ăn lá mọc thấp, lá nhỏ hình thìa xếp thành hoa thị lỏng lẻo, có vị ngọt bùi nhẹ. Điểm đáng giá của cây là nảy mầm và sinh trưởng tốt trong những ngày ngắn, se lạnh cuối thu và đầu xuân, khi các loại rau trộn khác chậm phát triển. Gieo theo hàng nông trong đất mát và ẩm; có thể thu cả hoa thị hoặc hái lá dần. Ở vùng khí hậu ôn hòa, cây sống qua đông dưới lớp phủ nhẹ. Cây nhanh ra ngồng khi ngày dài và ấm lên, nên gieo rải vụ theo từng đợt ngắn.",
  "Laurus nobilis":
    "Nguyệt quế là cây gỗ hoặc bụi thường xanh sinh trưởng chậm, lá bóng và thơm, phơi khô làm gia vị cho súp, món hầm và nước dùng. Ở vùng khí hậu mát, cây thường được trồng trong chậu và cắt tỉa thành dáng trụ, hoặc trồng làm hàng rào cắt tỉa ở vùng ấm áp. Cần nắng đầy đủ đến bóng bán phần, đất thoát nước tốt và tránh gió lạnh, sương giá; cây trồng chậu phải đưa vào nhà hoặc nơi có mái che khi nhiệt độ xuống dưới đóng băng. Lá thu hoạch tốt nhất sau khi đợt non đã già rồi phơi khô; cây chịu cắt tỉa mạnh và nảy chồi lại dễ dàng.",
  "Rubus idaeus":
    "Mâm xôi đỏ là cây bụi gai cứng cáp, lan rễ ngầm và cho chùm quả mọng mềm, thơm trên cành hai năm tuổi. Giống cho quả mùa hè chín trên cành của năm trước; giống cho quả quanh năm còn có thêm vụ thu trên chồi của mùa hiện tại. Trồng nơi đủ nắng, đất hơi chua và thoát nước tốt, cắm giàn hoặc cọc đỡ và giữ ẩm đều vùng rễ. Sau khi thu hoạch, cắt bỏ cành đã cho quả và buộc các chồi mới; quả chín cần lưới che chim. Quả rất dễ dập, nên hái khi chúng tách nhẹ khỏi lõi trắng.",
};

// Vietnamese common-name fixes (diacritics only, no renaming).
const VI_NAMES = {
  "Basella alba": { base: "Mồng tơi", prefix: "Mồng tơi " },
  "Laurus nobilis": { base: "Nguyệt quế", prefix: "Nguyệt quế " },
  "Rubus idaeus": { base: "Mâm xôi đỏ", prefix: "Mâm xôi đỏ " },
};

function main() {
  const enPath = path.join(sourceDir, "en.json");
  const viPath = path.join(sourceDir, "vi.json");
  const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
  const vi = JSON.parse(fs.readFileSync(viPath, "utf8"));

  for (const [scientificName, description] of Object.entries(EN_DESCRIPTIONS)) {
    const row = en.find((r) => r.scientificName === scientificName && !r.cultivar);
    if (!row) throw new Error(`en base row missing: ${scientificName}`);
    row.description = description;
    row.sourceSystem = "richfarm-seed";
    row.content_origin = "authored";
  }
  for (const [scientificName, description] of Object.entries(VI_DESCRIPTIONS)) {
    const row = vi.find((r) => r.scientificName === scientificName && !r.cultivar);
    if (!row) throw new Error(`vi base row missing: ${scientificName}`);
    row.description = description;
    row.sourceSystem = "richfarm-seed";
    row.content_origin = "authored";
  }

  // Vietnamese diacritic fixes: apply to the base row and every cultivar row.
  for (const [scientificName, names] of Object.entries(VI_NAMES)) {
    const rows = vi.filter((r) => r.scientificName === scientificName);
    if (rows.length === 0) throw new Error(`vi rows missing: ${scientificName}`);
    for (const row of rows) {
      const cultivar = String(row.cultivar ?? "");
      if (!cultivar) {
        row.commonName = names.base;
      } else {
        // Strip any existing cultivar label from the current name first.
        const current = String(row.commonName ?? "");
        const tokens = current.split(/\s+/);
        const cultivarLabel = tokens[tokens.length - 1];
        const known = /^(Ceylon|Green Stem|Green Tower|Malabar Giant|Red Stem|Rubra|Ruby Vine|Select|Vining Giant|Sweet Bay|Little Ragu|Saratoga|California Bay|Compacta|Heritage|Caroline|Tulameen|Joan J|Anne|Large Dutch|Vit|Medaillon|Favor|Gala)$/i;
        const suffix = known.test(cultivarLabel) ? cultivarLabel : cultivar;
        row.commonName = names.prefix + suffix;
      }
    }
  }

  fs.writeFileSync(enPath, `${JSON.stringify(en, null, 2)}\n`);
  fs.writeFileSync(viPath, `${JSON.stringify(vi, null, 2)}\n`);
  console.log("seed sources updated");
}

main();
