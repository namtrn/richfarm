// Giai đoạn 1 curation examples — DB mirror updates through the locked API
// contract. Mirrors the API PATCH flow for every touched row: provenance
// identity, authored descriptions, Vietnamese diacritic names, honest care
// evidence (awaiting_review for values that have no verified source yet) and
// needs_review/in_review workflow state.
//
// Usage: npx tsx scripts/curate-phase1-db.ts

import path from "node:path";
import { createDatabase } from "../apps/api/src/db";
import {
  fetchI18n,
  normalizeMasterPlant,
  upsertMasterPlantRow,
  withSourceIdentity,
} from "../apps/api/src/master-plants";

const EN_DESCRIPTIONS: Record<string, string> = {
  "Valeriana locusta":
    "Corn salad is a low-growing cool-season green with small, spoon-shaped leaves in loose rosettes. It is prized for a mild, nutty flavor and for germinating and growing well in the short, chilly days of late autumn and early spring, when other salad leaves slow down. Sow in shallow drills in moist, cool soil and harvest whole rosettes or individual leaves; in mild regions it can be overwintered under a light mulch or cold frame. Plants bolt quickly once days lengthen and warm, so succession-sow in short intervals.",
  "Laurus nobilis":
    "Sweet bay is a slow-growing evergreen tree or shrub with glossy, aromatic leaves that are dried for seasoning soups, stews and stocks. It is grown in containers in cooler climates and trained as a standard or clipped hedge in mild ones. Give it full sun to part shade, well-drained soil and shelter from harsh wind and frost; potted plants must come indoors or into a protected spot below freezing. Leaves are best harvested after the new growth has hardened, then air-dried; the plant tolerates hard pruning and reshoots readily.",
  "Rubus idaeus":
    "Raspberry is a hardy, clump-forming bramble that spreads by underground runners and bears clusters of soft, aromatic berries on biennial canes. Summer-fruiting types crop on two-year-old canes in early summer; everbearing types add a fall crop on the current season's growth. Plant canes in full sun in well-drained, slightly acidic soil with a trellis or support, and keep the root zone evenly moist. Remove spent canes after harvest and tie in the new canes; ripening berries need protection from birds. The fruits are highly perishable and best picked when they slip easily off the white core.",
};

const VI_DESCRIPTIONS: Record<string, string> = {
  "Valeriana locusta":
    "Xà lách cúc (còn gọi là rau mầm trụ, corn salad) là loại rau ăn lá mọc thấp, lá nhỏ hình thìa xếp thành hoa thị lỏng lẻo, có vị ngọt bùi nhẹ. Điểm đáng giá của cây là nảy mầm và sinh trưởng tốt trong những ngày ngắn, se lạnh cuối thu và đầu xuân, khi các loại rau trộn khác chậm phát triển. Gieo theo hàng nông trong đất mát và ẩm; có thể thu cả hoa thị hoặc hái lá dần. Ở vùng khí hậu ôn hòa, cây sống qua đông dưới lớp phủ nhẹ. Cây nhanh ra ngồng khi ngày dài và ấm lên, nên gieo rải vụ theo từng đợt ngắn.",
  "Laurus nobilis":
    "Nguyệt quế là cây gỗ hoặc bụi thường xanh sinh trưởng chậm, lá bóng và thơm, phơi khô làm gia vị cho súp, món hầm và nước dùng. Ở vùng khí hậu mát, cây thường được trồng trong chậu và cắt tỉa thành dáng trụ, hoặc trồng làm hàng rào cắt tỉa ở vùng ấm áp. Cần nắng đầy đủ đến bóng bán phần, đất thoát nước tốt và tránh gió lạnh, sương giá; cây trồng chậu phải đưa vào nhà hoặc nơi có mái che khi nhiệt độ xuống dưới đóng băng. Lá thu hoạch tốt nhất sau khi đợt non đã già rồi phơi khô; cây chịu cắt tỉa mạnh và nảy chồi lại dễ dàng.",
  "Rubus idaeus":
    "Mâm xôi đỏ là cây bụi gai cứng cáp, lan rễ ngầm và cho chùm quả mọng mềm, thơm trên cành hai năm tuổi. Giống cho quả mùa hè chín trên cành của năm trước; giống cho quả quanh năm còn có thêm vụ thu trên chồi của mùa hiện tại. Trồng nơi đủ nắng, đất hơi chua và thoát nước tốt, cắm giàn hoặc cọc đỡ và giữ ẩm đều vùng rễ. Sau khi thu hoạch, cắt bỏ cành đã cho quả và buộc các chồi mới; quả chín cần lưới che chim. Quả rất dễ dập, nên hái khi chúng tách nhẹ khỏi lõi trắng.",
};

// Base-row curation targets: scientificName -> stable source_id.
const BASE_TARGETS: Record<string, { sourceId: string; enName: string; viName: string }> = {
  "Basella alba": { sourceId: "basella-alba", enName: "Malabar Spinach", viName: "Mồng tơi" },
  "Valeriana locusta": { sourceId: "valeriana-locusta", enName: "Corn Salad", viName: "Xà lách cúc" },
  "Laurus nobilis": { sourceId: "laurus-nobilis", enName: "Bay Laurel", viName: "Nguyệt quế" },
  "Rubus idaeus": { sourceId: "rubus-idaeus", enName: "Raspberry", viName: "Mâm xôi đỏ" },
};

const VI_PREFIX: Record<string, string> = {
  "Basella alba": "Mồng tơi ",
  "Valeriana locusta": "Xà lách cúc ",
  "Laurus nobilis": "Nguyệt quế ",
  "Rubus idaeus": "Mâm xôi đỏ ",
};

const PLACEHOLDER_NOTE = /là giống cây trong bộ sưu tập|for diversified seed coverage|for a broader plant mix|with stable growth profile/i;

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function evidence(status: string, locator: string) {
  return { status, sourceSystem: "richfarm-seed", sourceLocator: locator };
}

const db = createDatabase(path.resolve(__dirname, "../apps/api/data/richfarm.db"));
try {
  const curated: Array<{ id: number; scientificName: string; viName: string }> = [];

  for (const scientificName of Object.keys(BASE_TARGETS)) {
    const target = BASE_TARGETS[scientificName];
    const rows = db.prepare(
      "SELECT * FROM master_plants WHERE scientific_name = ? ORDER BY id",
    ).all(scientificName) as any[];
    if (rows.length === 0) throw new Error(`no DB rows for ${scientificName}`);

    for (const row of rows) {
      const isBase = row.id === rows[0].id;
      // Derive the cultivar label by removing the base species name as a
      // contiguous trailing suffix: "Sweet Bay Bay Laurel" -> "Sweet Bay",
      // "Malabar Giant Malabar Spinach" -> "Malabar Giant",
      // "Green Stem Malabar Spinach" -> "Green Stem". Stripping every base
      // token would eat cultivar words ("Sweet Bay" -> "Sweet").
      const enRow = db.prepare(
        "SELECT common_name FROM master_plant_i18n WHERE master_plant_id = ? AND locale = 'en'",
      ).get(row.id) as { common_name: string } | undefined;
      const baseSeq = (target.enName ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
      const enTokens = (enRow?.common_name ?? row.common_name ?? "").trim().split(/\s+/);
      let stripCount = 0;
      for (let start = 0; start < baseSeq.length; start += 1) {
        const suffixLen = baseSeq.length - start;
        const tail = enTokens.slice(enTokens.length - suffixLen).map((token) => token.toLowerCase());
        if (tail.join(" ") === baseSeq.slice(start).join(" ")) {
          stripCount = suffixLen;
          break;
        }
      }
      const cultivarDisplay = enTokens.slice(0, enTokens.length - stripCount).join(" ");
      const cultivarSlug = slugify(cultivarDisplay);
      const sourceId = isBase
        ? target.sourceId
        : `${target.sourceId}-${cultivarSlug || row.id}`;

      const i18n = fetchI18n(db, row.id);
      if (isBase) {
        i18n.en = {
          ...i18n.en,
          common_name: target.enName,
          description: EN_DESCRIPTIONS[scientificName],
          content_origin: "authored",
        };
        i18n.vi = {
          ...i18n.vi,
          common_name: target.viName,
          description: VI_DESCRIPTIONS[scientificName],
          content_origin: "authored",
        };
      } else {
        const prefix = VI_PREFIX[scientificName] ?? "";
        if (i18n.vi) {
          i18n.vi = {
            ...i18n.vi,
            common_name: prefix + cultivarDisplay,
            content_origin: i18n.vi.content_origin ?? "imported",
          };
        }
      }
      // i18n rows follow the master workflow state for the curated examples.
      for (const locale of ["en", "vi"]) {
        if (i18n[locale]) {
          i18n[locale] = {
            ...i18n[locale],
            content_status: "needs_review",
            review_status: "in_review",
          };
        }
      }

      // If the row carries a stale/mistaken source identity (e.g. from an
      // interrupted earlier run) that differs from the target identity, clear
      // it first so the legacy-adoption fallback in upsertMasterPlantRow picks
      // the row up by plant_code instead of colliding on INSERT. The API's
      // conservative adoption rule stays untouched.
      const staleIdentity = (row.source_id ?? "").trim() !== "" && row.source_id !== sourceId;
      if (staleIdentity) {
        const claimed = db.prepare(
          "SELECT id FROM master_plants WHERE source_system = ? AND source_id = ?",
        ).get("richfarm-seed", sourceId) as { id: number } | undefined;
        if (!claimed) {
          db.prepare("UPDATE master_plants SET source_system = 'sqlite', source_id = NULL WHERE id = ?").run(row.id);
        }
      }

      const payload = withSourceIdentity({
        ...normalizeMasterPlant(row),
        source_system: "richfarm-seed",
        source_id: sourceId,
        source: "richfarm-seed",
        i18n,
        // Clean the placeholder notes; never wipe real editorial notes.
        notes: PLACEHOLDER_NOTE.test(String(row.notes ?? "")) ? null : row.notes,
        content_status: "needs_review",
        review_status: "in_review",
        care_field_evidence: isBase
          ? {
              typicalDaysToHarvest: evidence("awaiting_review", "packages/convex/convex/data/plantI18nSource/en.json"),
              germinationDays: evidence("awaiting_review", "packages/convex/convex/data/plantI18nSource/en.json"),
            }
          : undefined,
      } as any);

      const id = db.transaction(() => upsertMasterPlantRow(db, payload as any))();
      curated.push({ id, scientificName, viName: isBase ? target.viName : i18n.vi?.common_name ?? "" });
    }
  }

  for (const item of curated) {
    const row = db.prepare("SELECT * FROM master_plants WHERE id = ?").get(item.id) as any;
    const i18n = fetchI18n(db, item.id);
    console.log(`[${item.id}] ${item.scientificName} | vi=${item.viName} | care=${row.care_status} | status=${row.content_status}/${row.review_status} | notes=${row.notes ?? "—"}`);
    console.log(`    en desc: ${(i18n.en.description ?? "").slice(0, 70)}…`);
    console.log(`    vi desc: ${(i18n.vi.description ?? "").slice(0, 70)}…`);
  }
} finally {
  db.close();
}
