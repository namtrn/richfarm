// Verify curated rows on the Convex deployment through the same path the API
// uses (ConvexSyncService.adminQuery -> masterSync:listAll).
// Usage: (cd apps/api && npx tsx ../../scripts/verify-convex-data.ts)

import "dotenv/config";
import { ConvexSyncService } from "../apps/api/src/convex-sync";

interface CareRow {
  sourceId?: string;
  careStatus?: string;
  contentStatus?: string;
  reviewStatus?: string;
  i18nRows?: Array<{ locale: string; commonName: string; description?: string; contentOrigin?: string }>;
}

async function main() {
  const sync = new ConvexSyncService({
    deployUrl: process.env.CONVEX_URL,
    adminKey: process.env.CONVEX_ADMIN_KEY,
    serviceToken: process.env.CONVEX_ADMIN_FUNCTION_KEY,
    upsertMutation: "masterSync:upsertPlantFromBackend",
    deleteMutation: "masterSync:deletePlantFromBackend",
  });
  const rows = (await sync.adminQuery<CareRow[]>("masterSync:listAll", { locale: "vi" })) ?? [];
  console.log("total convex rows:", rows.length);
  for (const sourceId of ["basella-alba", "valeriana-locusta", "laurus-nobilis", "rubus-idaeus"]) {
    const row = rows.find((r) => r.sourceId === sourceId);
    if (!row) {
      console.log(`== ${sourceId}: NOT FOUND`);
      continue;
    }
    const vi = row.i18nRows?.find((i) => i.locale === "vi");
    const en = row.i18nRows?.find((i) => i.locale === "en");
    console.log(`== ${sourceId} | care=${row.careStatus} | master=${row.contentStatus}/${row.reviewStatus}`);
    console.log(`   vi: ${vi?.commonName} | origin=${vi?.contentOrigin} | desc=${(vi?.description ?? "").length} chars`);
    console.log(`   en: ${en?.commonName} | origin=${en?.contentOrigin} | desc=${(en?.description ?? "").length} chars`);
  }
}

main().catch((e) => console.error("error:", e.message));

// Extra: check the Ceylon cultivar row specifically.
export async function checkCeylon() {
  const sync = new ConvexSyncService({
    deployUrl: process.env.CONVEX_URL,
    serviceToken: process.env.CONVEX_ADMIN_FUNCTION_KEY,
    upsertMutation: "x",
    deleteMutation: "y",
  });
  const rows = (await sync.adminQuery<Array<Record<string, any>>>("masterSync:listAll", { locale: "vi" })) ?? [];
  const row = rows.find((r) => r.sourceId === "basella-alba-ceylon");
  if (!row) return console.log("ceylon NOT FOUND on convex");
  const en = row.i18nRows?.find((i) => i.locale === "en");
  console.log("ceylon convex:", {
    careStatus: row.careStatus,
    descLen: en?.description?.length ?? 0,
    hasMarkdown: String(en?.description ?? "").includes("**Growing at a glance**"),
    hasCareContent: Boolean(en?.careContent),
    origin: en?.contentOrigin,
  });
}

if (process.argv.includes("--ceylon")) checkCeylon().catch((e) => console.error(e.message));
