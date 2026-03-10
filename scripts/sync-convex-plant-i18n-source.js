#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const convexDir = path.join(rootDir, "packages", "convex");
const sourceDir = path.join(convexDir, "data", "plantI18nSource");
const locales = ["en", "vi", "es", "fr", "pt", "zh"];

function extractJson(stdout) {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const objectStart = trimmed.indexOf("[");
    if (objectStart === -1) {
      throw new Error("Convex output did not contain JSON array");
    }
    return JSON.parse(trimmed.slice(objectStart));
  }
}

function runConvex(locale) {
  const rows = [];
  let offset = 0;
  const limit = 200;

  while (true) {
    const args = [
      "convex",
      "run",
      "plantAdmin:exportPlantI18nSource",
      JSON.stringify({ locale, offset, limit }),
    ];
    const stdout = execFileSync("npx", args, {
      cwd: convexDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const payload = extractJson(stdout);
    rows.push(...payload.rows);
    offset += payload.rows.length;
    if (rows.length >= payload.total || payload.rows.length === 0) break;
  }

  return rows;
}

function writeJson(locale, rows) {
  const filePath = path.join(sourceDir, `${locale}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(rows, null, 2)}\n`);
  console.log(`synced ${path.relative(rootDir, filePath)} (${rows.length} rows)`);
}

function main() {
  for (const locale of locales) {
    const rows = runConvex(locale);
    writeJson(locale, rows);
  }
}

main();
