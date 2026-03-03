import "dotenv/config";
import path from "path";

import { createApp } from "./app";
import { createDatabase } from "./db";

const port = Number(process.env.PORT ?? 4000);
const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), "data/richfarm.db");

const db = createDatabase(dbPath);
const app = createApp(db);

const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`RichFarm backend listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`Dashboard available at http://localhost:${port}/dashboard`);
  // eslint-disable-next-line no-console
  console.log(`Using database at: ${dbPath}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
