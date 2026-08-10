// Diagnose the Convex sync error with the real env configuration.
// Usage: npx tsx scripts/diagnose-convex-sync.ts

import "dotenv/config";
import path from "node:path";
import { ConvexSyncService } from "../apps/api/src/convex-sync";
import { createDatabase } from "../apps/api/src/db";
import { fetchI18n, normalizeMasterPlant, withSourceIdentity } from "../apps/api/src/master-plants";

async function main() {
  const sync = new ConvexSyncService({
    deployUrl: process.env.CONVEX_URL,
    adminKey: process.env.CONVEX_ADMIN_KEY,
    serviceToken: process.env.CONVEX_ADMIN_FUNCTION_KEY,
    upsertMutation: "masterSync:upsertPlantFromBackend",
    deleteMutation: "masterSync:deletePlantFromBackend",
  });
  console.log("enabled:", sync.isEnabled());
  console.log("deployUrl set:", Boolean(process.env.CONVEX_URL?.trim()));
  console.log("serviceToken set:", Boolean(process.env.CONVEX_ADMIN_FUNCTION_KEY?.trim()));

  const db = createDatabase(path.resolve(__dirname, "../apps/api/data/richfarm.db"));
  const row = db.prepare("SELECT * FROM master_plants WHERE id = 459").get() as any;
  const payload = withSourceIdentity({ ...normalizeMasterPlant(row), i18n: fetchI18n(db, 459) } as any);
  db.close();

  try {
    await sync.syncUpsert(payload as unknown as Record<string, unknown>);
    console.log("SYNC OK");
  } catch (error) {
    console.log("SYNC ERROR:", error instanceof Error ? error.message : String(error));
    const cause = (error as { cause?: unknown }).cause;
    console.log("cause:", cause instanceof Error ? cause.message : JSON.stringify(cause ?? "n/a").slice(0, 500));
  }
}

main().catch((error) => console.error("unhandled:", error));
