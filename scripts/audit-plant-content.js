#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const strictQuality = process.argv.includes("--strict");
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
const words = (value) => new Set(normalize(value).split(/\s+/).filter(Boolean));
const similarity = (left, right) => {
  const leftWords = words(left);
  const rightWords = words(right);
  if (!leftWords.size || !rightWords.size) return 0;
  let intersection = 0;
  for (const word of leftWords) if (rightWords.has(word)) intersection += 1;
  return intersection / new Set([...leftWords, ...rightWords]).size;
};

const reports = [];
for (const locale of locales) {
  const file = path.join(sourceDir, `${locale}.json`);
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  const identities = new Map();
  const descriptions = new Map();
  const descriptionRows = [];
  const invalidCareRanges = [];
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
    if (description) descriptionRows.push({ row, description });

    const care = row.care || row.careContent || row.care_content_json;
    if (care && typeof care === "object") {
      const phMin = Number(care.soilPhMin ?? care.soil_ph_min);
      const phMax = Number(care.soilPhMax ?? care.soil_ph_max);
      const moisture = Number(care.moistureTarget ?? care.moisture_target);
      const lightHours = Number(care.lightHours ?? care.light_hours);
      if (Number.isFinite(phMin) && (phMin < 0 || phMin > 14)) invalidCareRanges.push({ identity: identity(row), field: "soilPhMin", value: phMin });
      if (Number.isFinite(phMax) && (phMax < 0 || phMax > 14)) invalidCareRanges.push({ identity: identity(row), field: "soilPhMax", value: phMax });
      if (Number.isFinite(phMin) && Number.isFinite(phMax) && phMin > phMax) invalidCareRanges.push({ identity: identity(row), field: "soilPhRange", value: [phMin, phMax] });
      if (Number.isFinite(moisture) && (moisture < 0 || moisture > 100)) invalidCareRanges.push({ identity: identity(row), field: "moistureTarget", value: moisture });
      if (Number.isFinite(lightHours) && (lightHours < 0 || lightHours > 24)) invalidCareRanges.push({ identity: identity(row), field: "lightHours", value: lightHours });
    }
  }
  const nearDuplicatePairs = [];
  for (let index = 0; index < descriptionRows.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < descriptionRows.length; otherIndex += 1) {
      const left = descriptionRows[index];
      const right = descriptionRows[otherIndex];
      if (identity(left.row) === identity(right.row)) continue;
      const score = similarity(left.description, right.description);
      if (score >= 0.82) {
        nearDuplicatePairs.push({ left: identity(left.row), right: identity(right.row), similarity: Number(score.toFixed(3)) });
      }
      if (nearDuplicatePairs.length >= 100) break;
    }
    if (nearDuplicatePairs.length >= 100) break;
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
    nearDuplicateDescriptionPairs: nearDuplicatePairs.length,
    invalidCareRanges: invalidCareRanges.length,
  });
}

console.table(reports);
const identityFailures = reports.reduce((sum, report) => sum + report.duplicateIdentities, 0);
const careFailures = reports.reduce((sum, report) => sum + report.invalidCareRanges, 0);
const contentDebtFailures = reports.reduce(
  (sum, report) => sum + report.placeholderDescriptions + report.nearDuplicateDescriptionPairs,
  0,
);
if (identityFailures > 0) {
  console.error(`Plant content audit failed: ${identityFailures} duplicate locale identities.`);
  process.exitCode = 1;
}
if (careFailures > 0) {
  console.error(`Plant content audit failed: ${careFailures} invalid care ranges.`);
  process.exitCode = 1;
}
if (strictQuality && contentDebtFailures > 0) {
  console.error(`Strict plant content gate failed: ${contentDebtFailures} placeholder/near-duplicate findings.`);
  process.exitCode = 1;
}

console.log(JSON.stringify({
  externalDataGate: {
    status: "not_run",
    reason: "This audit only evaluates repository data; no external source/curation data was invented or fetched.",
    requiredBeforeBulkCuration: true,
    strictQuality,
  },
}, null, 2));
