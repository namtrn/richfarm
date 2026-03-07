import "dotenv/config";
import path from "path";

import { ConvexSyncService } from "./convex-sync";
import { createApp } from "./app";
import { createDatabase, ensureBootstrapAdmin } from "./db";

const port = Number(process.env.PORT ?? 4000);
const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), "data/richfarm.db");
const jwtSecret = process.env.JWT_SECRET ?? "change-me-in-production";
const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? "12h";
const usingDefaultJwtSecret = jwtSecret === "change-me-in-production";

if (process.env.NODE_ENV === "production" && usingDefaultJwtSecret) {
  throw new Error("JWT_SECRET must be set in production");
}

if (usingDefaultJwtSecret) {
  // eslint-disable-next-line no-console
  console.warn("Using the default JWT secret. Set JWT_SECRET before any shared deployment.");
}

const db = createDatabase(dbPath);
ensureBootstrapAdmin(db, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);

const syncService = new ConvexSyncService({
  deployUrl: process.env.CONVEX_URL,
  adminKey: process.env.CONVEX_ADMIN_KEY,
  upsertMutation: process.env.CONVEX_UPSERT_MUTATION ?? "masterSync:upsertPlantFromBackend",
  deleteMutation: process.env.CONVEX_DELETE_MUTATION ?? "masterSync:deletePlantFromBackend",
});

const app = createApp(db, {
  auth: {
    jwtSecret,
    jwtExpiresIn,
  },
  syncService,
});

const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`RichFarm backend listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`Using database at: ${dbPath}`);
  // eslint-disable-next-line no-console
  console.log(`Convex sync: ${syncService.isEnabled() ? "enabled" : "disabled"}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
