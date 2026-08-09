// Giai đoạn 1 example: complete the Basella alba (Mồng tơi) base row through
// the locked API contract — natural descriptions, provenance, honest care
// evidence and review workflow state. Mirrors the API PATCH /:id flow without
// the Convex sync (no service credentials in this local demonstration).
//
// Usage: npx tsx scripts/curate-example-basella.ts

import path from "node:path";
import { createDatabase } from "../apps/api/src/db";
import {
  fetchI18n,
  normalizeMasterPlant,
  upsertMasterPlantRow,
  withSourceIdentity,
} from "../apps/api/src/master-plants";

const EN_DESCRIPTION =
  "Malabar spinach is a tropical vining plant grown for its tender young leaves and shoot tips, which cook down with a mild, slightly mucilaginous texture. It is one of the few leafy greens that stays productive through hot, humid summers, when true spinach bolts. Plant it at the base of a trellis, fence, or teepee in fertile, moisture-retentive soil and keep the canopy well watered. Harvest tips regularly to force dense, soft regrowth; the red-stemmed forms are equally edible and add color to the garden.";

const VI_DESCRIPTION =
  "Mồng tơi là cây dây leo nhiệt đới trồng lấy lá non và ngọn, khi nấu chín có vị ngọt nhẹ và hơi nhớt tự nhiên, thường dùng nấu canh với cua, tôm hoặc thịt. Đây là một trong số ít rau ăn lá vẫn xanh tốt trong mùa hè nóng ẩm, thời điểm các loại rau ôn đới dễ lên ngồng. Nên gieo dưới chân giàn, hàng rào hoặc tháp leo trong đất tơi xốp, giàu mùn và giữ ẩm đều. Thường xuyên thu ngọn non để cây ra nhánh mềm đều; dạng thân đỏ cũng ăn ngon và tạo màu cho vườn.";

const db = createDatabase(path.resolve(__dirname, "../apps/api/data/richfarm.db"));
try {
  const row = db.prepare(
    `SELECT * FROM master_plants WHERE id = 459`,
  ).get() as any;
  if (!row) throw new Error("Basella alba base row (id 459) not found");

  const i18n = fetchI18n(db, row.id);
  i18n.en = {
    ...i18n.en,
    common_name: i18n.en.common_name || "Malabar Spinach",
    description: EN_DESCRIPTION,
    content_origin: "authored",
  };
  i18n.vi = {
    ...i18n.vi,
    common_name: i18n.vi.common_name || "Mồng tơi",
    description: VI_DESCRIPTION,
    content_origin: "authored",
  };

  const merged = withSourceIdentity({
    ...normalizeMasterPlant(row),
    i18n,
    // Provenance: legacy mirror rows carry no stable upstream identity, so the
    // curation assigns one under the registered richfarm-seed source.
    source_system: "richfarm-seed",
    source_id: "basella-alba",
    source: "richfarm-seed",
    content_status: "needs_review",
    review_status: "in_review",
    // Care: the only value present on this row (typical_days_to_harvest) gets
    // an awaiting_review evidence entry — the value exists but no source has
    // been verified yet. No fabricated values, no defaults.
    care_field_evidence: {
      typicalDaysToHarvest: {
        status: "awaiting_review",
        sourceSystem: "richfarm-seed",
        sourceLocator: "packages/convex/convex/data/plantI18nSource/en.json",
      },
    },
  } as any);

  const id = db.transaction(() => upsertMasterPlantRow(db, merged as any))();
  const after = db.prepare(`SELECT * FROM master_plants WHERE id = ?`).get(id) as any;
  const afterI18n = fetchI18n(db, id);
  console.log("care_status:", after.care_status);
  console.log("content_status:", after.content_status, "review_status:", after.review_status);
  console.log("en description:", (afterI18n.en.description ?? "").slice(0, 90) + "…");
  console.log("vi description:", (afterI18n.vi.description ?? "").slice(0, 90) + "…");
  console.log("en origin:", afterI18n.en.content_origin, "| vi origin:", afterI18n.vi.content_origin);
} finally {
  db.close();
}
