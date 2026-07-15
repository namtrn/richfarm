#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "packages/convex/convex/data/plantI18nSource");
const locales = ["en", "vi", "es", "fr", "pt", "zh"];
const placeholders = [
  /for (?:a )?broader (?:plant mix|garden planning coverage|library coverage)/i,
  /for diversified seed coverage/i,
  /with stable growth profile/i,
  /is a popular plant for home gardens and small farms/i,
  /giup mo rong lua chon trong thu vien cay/i,
  /sinh truong on dinh/i,
  /la cay pho bien trong vuon nha va nong trai nho/i,
];

const normalize = (value) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();
const identity = (row) => `${normalize(row.scientificName)}|${normalize(row.cultivar || "__base__")}`;

const reports = [];
for (const locale of locales) {
  const file = path.join(sourceDir, `${locale}.json`);
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  const identities = new Map();
  const descriptions = new Map();
  let missingBase = 0;
  let inheritedCultivar = 0;
  let short = 0;
  let placeholder = 0;
  for (const row of rows) {
    identities.set(identity(row), (identities.get(identity(row)) || 0) + 1);
    const description = (row.description || "").trim();
    if (!description && row.cultivar) inheritedCultivar += 1;
    if (!description && !row.cultivar) missingBase += 1;
    if (description.length > 0 && description.length < 120) short += 1;
    if (placeholders.some((pattern) => pattern.test(normalize(description)))) placeholder += 1;
    if (description) descriptions.set(normalize(description), (descriptions.get(normalize(description)) || 0) + 1);
  }
  reports.push({
    locale,
    rows: rows.length,
    duplicateIdentities: [...identities.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
    missingBaseDescriptions: missingBase,
    inheritedCultivarDescriptions: inheritedCultivar,
    shortDescriptions: short,
    placeholderDescriptions: placeholder,
    repeatedDescriptionRows: [...descriptions.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0),
    uniqueDescriptions: descriptions.size,
  });
}

console.table(reports);
const identityFailures = reports.reduce((sum, report) => sum + report.duplicateIdentities, 0);
if (identityFailures > 0) {
  console.error(`Plant content audit failed: ${identityFailures} duplicate locale identities.`);
  process.exitCode = 1;
}
