// Giai đoạn 1 curation: authored care content for Basella alba (base) and a
// precise, markdown-formatted overview for the rare cultivar Basella alba
// 'Ceylon', whose care content is copied verbatim from the base species.
// Mirrors the API PATCH flow. Run after curate-phase1-db.ts.
//
// Usage: npx tsx scripts/curate-basella-care-ceylon.ts

import path from "node:path";
import { createDatabase } from "../apps/api/src/db";
import {
  fetchI18n,
  normalizeMasterPlant,
  upsertMasterPlantRow,
  withSourceIdentity,
} from "../apps/api/src/master-plants";

// ── Authored care content for the base species (en + vi) ────────────────
const CARE = {
  en: {
    watering: {
      intro: "Keep the soil consistently moist; this tropical vine dislikes drying out.",
      items: [
        "Water daily in hot, dry weather, especially in containers.",
        "Mulch around the roots to hold moisture.",
        "Ease off watering when temperatures cool.",
      ],
    },
    fertilizing: {
      intro: "Feed lightly to sustain continuous leaf production.",
      items: [
        "Apply a balanced liquid feed every 2–3 weeks during active growth.",
        "Avoid heavy nitrogen doses late in the season.",
      ],
    },
    location: {
      intro: "A sun-loving climber for warm-season gardens.",
      items: [
        "Full sun to light shade; more sun means denser growth.",
        "Provide a trellis, fence or teepee — it climbs quickly.",
        "Grows well in large containers with support.",
      ],
    },
    soil: {
      intro: "Prefers rich, well-drained soil that holds moisture.",
      items: [
        "Soil pH 5.5–7.0.",
        "Mix in compost before planting.",
        "Ensure drainage; avoid waterlogged soil.",
      ],
    },
    nutrition: {
      intro: "A moderate feeder; soil quality matters more than quantity.",
      items: [
        "Compost-rich beds usually need little extra feeding.",
        "If leaves turn pale, add a mild nitrogen source.",
      ],
    },
    propagation: {
      intro: "Easy to grow from seed or cuttings.",
      items: [
        "Sow seeds after the last frost in warm soil (20–30°C).",
        "Soak seeds overnight to speed germination.",
        "Stem cuttings root readily in moist soil or water.",
      ],
    },
    temperature: {
      intro: "A warm-season plant that stalls in cold weather.",
      items: [
        "Grows best between 20–35°C.",
        "Growth slows below 15°C; frost kills the vine.",
        "In cool climates, start early indoors or under cover.",
      ],
    },
    toxicity: {
      intro: "A standard food crop; wash and cook as usual.",
      items: [
        "Leaves and shoots are eaten cooked throughout tropical Asia.",
        "The leaves contain oxalates like many leafy greens; cooking reduces them.",
      ],
    },
  },
  vi: {
    watering: {
      intro: "Giữ đất luôn ẩm đều; mồng tơi không chịu được đất khô lâu.",
      items: [
        "Tưới hằng ngày khi trời nóng, khô, nhất là trồng chậu.",
        "Phủ rơm hoặc mùn quanh gốc để giữ ẩm.",
        "Giảm tưới khi trời mát.",
      ],
    },
    fertilizing: {
      intro: "Bón nhẹ để cây ra lá liên tục.",
      items: [
        "Bón phân cân đối 2–3 tuần một lần trong thời kỳ sinh trưởng.",
        "Không bón đạm quá nhiều vào cuối vụ.",
      ],
    },
    location: {
      intro: "Cây ưa nắng, leo khỏe, hợp trồng vụ ấm.",
      items: [
        "Nắng đầy đủ đến bóng nhẹ; càng nắng cây càng rậm lá.",
        "Làm giàn, hàng rào hoặc tháp cho dây leo.",
        "Trồng chậu lớn có giàn vẫn sinh trưởng tốt.",
      ],
    },
    soil: {
      intro: "Ưa đất giàu mùn, thoát nước tốt và giữ ẩm.",
      items: [
        "pH đất 5,5–7,0.",
        "Trộn phân hữu cơ trước khi trồng.",
        "Tránh để đất bị úng nước.",
      ],
    },
    nutrition: {
      intro: "Nhu cầu dinh dưỡng vừa phải.",
      items: [
        "Đất nhiều mùn thường không cần bón thêm.",
        "Lá vàng nhạt thì bổ sung đạm nhẹ.",
      ],
    },
    propagation: {
      intro: "Dễ nhân giống bằng hạt hoặc giâm cành.",
      items: [
        "Gieo hạt sau đợt rét cuối trong đất ấm 20–30°C.",
        "Ngâm hạt qua đêm cho nảy mầm nhanh hơn.",
        "Giâm cành ra rễ dễ trong đất ẩm hoặc nước.",
      ],
    },
    temperature: {
      intro: "Cây mùa ấm, trời lạnh ngừng sinh trưởng.",
      items: [
        "Thích hợp nhất trong khoảng 20–35°C.",
        "Dưới 15°C cây chậm phát triển; sương giá làm chết dây.",
        "Vùng lạnh nên gieo sớm trong nhà hoặc có che chắn.",
      ],
    },
    toxicity: {
      intro: "Rau ăn thông thường; rửa sạch và nấu chín như các loại rau khác.",
      items: [
        "Lá và ngọn được ăn chín phổ biến ở các vùng nhiệt đới châu Á.",
        "Lá chứa oxalat như nhiều loại rau xanh; nấu chín giúp giảm bớt.",
      ],
    },
  },
};

// ── Ceylon cultivar overview (standard markdown, precise content) ───────
const CEYLON_OVERVIEW = {
  en: [
    "**Ceylon Malabar Spinach** is a selected cultivar of *Basella alba*, a tropical climbing vegetable grown for its tender leaves and shoot tips. Its name traces to Sri Lanka — the island once called Ceylon — where related basella types have long been grown.",
    "Like the species, it is a fast-climbing vine grown for its tender, slightly mucilaginous leaves and shoot tips, and it stays productive through hot, humid summers when true spinach bolts.",
    "**Growing at a glance**",
    "- **Support:** trellis, fence or teepee — it climbs quickly",
    "- **Sun:** full sun to light shade",
    "- **Water:** keep the soil consistently moist, daily in hot weather",
    "- **Harvest:** pick young leaves and shoot tips regularly",
    "- **Season:** warm-season; growth stalls below 15°C, frost kills the vine",
  ].join("\n"),
  vi: [
    "**Mồng tơi Ceylon** là giống được chọn lọc của cây dây leo nhiệt đới *Basella alba* (mồng tơi). Tên giống gắn với Sri Lanka — hòn đảo từng được gọi là Ceylon — nơi các giống basella liên quan được trồng lâu đời.",
    "Như loài gốc, giống này là dây leo sinh trưởng nhanh, trồng lấy lá non và ngọn mềm hơi nhớt, và vẫn xanh tốt trong mùa hè nóng ẩm khi các loại rau ôn đới dễ lên ngồng.",
    "**Trồng trong nháy mắt**",
    "- **Giàn đỡ:** cần giàn, hàng rào hoặc tháp leo — dây leo rất nhanh",
    "- **Nắng:** đầy đủ đến bóng nhẹ",
    "- **Nước:** giữ đất ẩm đều, ngày nóng tưới hằng ngày",
    "- **Thu hoạch:** hái lá non và ngọn thường xuyên",
    "- **Mùa vụ:** vụ ấm; dưới 15°C cây chậm phát triển, sương giá làm chết dây",
  ].join("\n"),
};

const db = createDatabase(path.resolve(__dirname, "../apps/api/data/richfarm.db"));
try {
  for (const rowId of [459, 983]) {
    const row = db.prepare("SELECT * FROM master_plants WHERE id = ?").get(rowId) as any;
    if (!row) throw new Error(`row ${rowId} not found`);
    const isBase = rowId === 459;

    const i18n = fetchI18n(db, rowId);
    if (isBase) {
      // Base species: authored care content (en + vi).
      i18n.en = { ...i18n.en, care_content_json: CARE.en };
      i18n.vi = { ...i18n.vi, care_content_json: CARE.vi };
    } else {
      // Ceylon cultivar: precise overview + exact copy of the base care text.
      i18n.en = {
        ...i18n.en,
        description: CEYLON_OVERVIEW.en,
        care_content_json: CARE.en,
        content_origin: "authored",
        content_status: "needs_review",
        review_status: "in_review",
      };
      i18n.vi = {
        ...i18n.vi,
        description: CEYLON_OVERVIEW.vi,
        care_content_json: CARE.vi,
        content_origin: "authored",
        content_status: "needs_review",
        review_status: "in_review",
      };
    }

    const payload = withSourceIdentity({
      ...normalizeMasterPlant(row),
      source_system: "richfarm-seed",
      source_id: isBase ? "basella-alba" : "basella-alba-ceylon",
      i18n,
      content_status: "needs_review",
      review_status: "in_review",
      care_field_evidence: isBase
        ? {
            typicalDaysToHarvest: { status: "awaiting_review", sourceSystem: "richfarm-seed" },
            germinationDays: { status: "awaiting_review", sourceSystem: "richfarm-seed" },
          }
        : undefined,
    } as any);

    const id = db.transaction(() => upsertMasterPlantRow(db, payload as any))();
    const afterI18n = fetchI18n(db, id);
    console.log(
      `[${id}] ${isBase ? "base care" : "ceylon"} | care.en.items=${afterI18n.en?.care_content_json?.watering?.items?.length ?? 0} | desc.en=${(afterI18n.en?.description ?? "").length} chars`,
    );
  }
} finally {
  db.close();
}
