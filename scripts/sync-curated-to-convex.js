#!/usr/bin/env node
// Sync curated rows from SQLite to Convex through the running API pipeline:
// PATCH /api/master-plants/:id triggers syncUpsert (masterSync:upsertPlantFromBackend)
// with the full merged row state. Prints per-row status and any outbox queueing.

const fs = require("fs");

const BASE = process.env.API_BASE ?? "http://localhost:4000";
const token = fs.readFileSync("/tmp/rf-token", "utf8").trim();
const dbPath = process.env.DB_PATH ?? "apps/api/data/richfarm.db";

const Database = require("better-sqlite3");
const db = new Database(dbPath, { readonly: true });
const rows = db.prepare(
  `SELECT id FROM master_plants WHERE source_system = 'richfarm-seed' ORDER BY id`,
).all();
db.close();

async function patch(id) {
  const res = await fetch(`${BASE}/api/master-plants/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content_version: 1 }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, retryable: body.retryable, outbox: body.outbox, error: body.error };
}

(async () => {
  let ok = 0;
  let failed = 0;
  for (const { id } of rows) {
    const result = await patch(id);
    if (result.status === 200) {
      ok += 1;
      console.log(`[${id}] OK`);
    } else {
      failed += 1;
      console.log(`[${id}] FAIL ${result.status} ${result.error ?? ""} retryable=${result.retryable} outbox=${result.outbox}`);
    }
  }
  console.log(`\ntotal=${rows.length} ok=${ok} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
