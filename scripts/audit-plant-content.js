#!/usr/bin/env node

// Phase 3.1 content audit. Measures seed-source rows across the locked
// Giai đoạn 0 dimensions: identity, care range, placeholder/near-duplicate,
// computed contentTier, Vietnamese-name fallback, content origin, source
// coverage, review coverage and record-level care status. The externalDataGate
// is wired to the source manifest and fails closed.

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const strictQuality = process.argv.includes("--strict");
const sourceDir = path.join(root, "packages/convex/convex/data/plantI18nSource");
const priorityListFile = path.join(root, "packages/convex/convex/data/plantPriorityList.v1.json");
const manifestFile = path.join(root, "packages/convex/convex/data/plantSourceManifest.json");
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

// Taxonomy-token normalization mirrors the app layer exactly
// (packages/convex/convex/lib/plantTaxonomy.ts normalizeTaxonomyToken):
// diacritics removed, lowercased, whitespace collapsed, punctuation kept.
const taxonomyNormalize = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLowerCase()
  .replace(/\s+/g, " ");
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

// ── Giai đoạn 0 artifacts ───────────────────────────────────────────────
const priorityList = fs.existsSync(priorityListFile)
  ? JSON.parse(fs.readFileSync(priorityListFile, "utf8"))
  : null;
const priorityFullDetail = new Set(
  (priorityList?.entries ?? [])
    .filter((entry) => entry.targetCoverage === "full_detail")
    .map((entry) => {
      const identity = entry.canonicalIdentity;
      return `${identity.genusNormalized}|${identity.speciesNormalized}|${identity.cultivarNormalized}`;
    }),
);
const priorityDenominator = priorityFullDetail.size;

// Mirrors packages/convex/convex/lib/plantTaxonomy.ts identity computation.
function taxonomyIdentity(row) {
  const tokens = String(row.scientificName ?? "")
    .trim()
    .replace(/[,;]+/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/[()]/g, "").trim())
    .filter(Boolean);
  if (tokens.length < 2) return null;
  let speciesIndex = 1;
  if ((tokens[1] === "x" || tokens[1] === "×") && tokens.length >= 3) speciesIndex = 2;
  const rawSpecies = tokens[speciesIndex].replace(/^[x×]+/i, "").trim();
  if (!/^[A-Za-z.-]+$/.test(tokens[0]) || !/^[A-Za-z.-]+$/.test(rawSpecies)) return null;
  let cultivar = String(row.cultivar ?? "").trim();
  if (!cultivar && tokens.length >= 3) {
    const inferredIndex = (tokens[1] === "x" || tokens[1] === "×") && tokens.length >= 4 ? 2 : 1;
    const remainder = tokens.slice(inferredIndex + 1);
    const rankToken = (remainder[0] ?? "").toLowerCase();
    if (["subsp.", "subsp", "ssp.", "ssp", "var.", "var", "f.", "f"].includes(rankToken)) {
      cultivar = remainder.join(" ").trim();
    }
  }
  return {
    genusNormalized: taxonomyNormalize(tokens[0]),
    speciesNormalized: taxonomyNormalize(rawSpecies),
    cultivarNormalized: taxonomyNormalize(cultivar) || "__default__",
  };
}

const priorityKey = (identity) =>
  `${identity.genusNormalized}|${identity.speciesNormalized}|${identity.cultivarNormalized}`;

// Record-level care status mirror of packages/shared/src/plantCareStatus.ts.
const REQUIRED_CARE_FIELDS = [
  "wateringFrequencyDays", "fertilizingFrequencyDays", "lightRequirements", "lightHours",
  "soilPhMin", "soilPhMax", "moistureTarget", "typicalDaysToHarvest", "germinationDays",
];
function careStatusOf(care) {
  if (!care || typeof care !== "object") return "missing";
  const evidence = care.careFieldEvidence || care.care_field_evidence || {};
  if (evidence["__profile__"]?.status === "not_applicable") return "not_applicable";
  for (const field of REQUIRED_CARE_FIELDS) {
    const fieldStatus = evidence[field]?.status;
    if (fieldStatus === "not_applicable") continue;
    if (fieldStatus === "verified") {
      const value = care[field];
      if (value !== undefined && value !== null && value !== "") continue;
    }
    return "awaiting_review";
  }
  return "verified";
}

// ── externalDataGate wiring (fail closed) ───────────────────────────────
function evaluateExternalDataGate(rowsByLocale) {
  let manifest = null;
  let manifestError = null;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  } catch {
    manifestError = "Source manifest is missing or unreadable";
  }
  if (!manifest) {
    return { status: "fail", reason: manifestError, requiredBeforeBulkCuration: true };
  }

  const registered = new Map(
    (manifest.sources ?? []).map((source) => [source.sourceSystem, source]),
  );
  const referenced = new Set();
  for (const rows of Object.values(rowsByLocale)) {
    for (const row of rows) {
      const source = String(row.sourceSystem ?? row.source ?? "").trim();
      if (source) referenced.add(source);
    }
  }

  // Nothing references any source yet: the repository still runs on seed-only
  // data, so the gate stays not_run (blocker) until curation imports rows
  // against registered sources.
  if (referenced.size === 0) {
    return {
      status: "not_run",
      reason: "No rows reference a source system; seed-only data has no curation provenance.",
      requiredBeforeBulkCuration: true,
    };
  }

  const unregistered = [];
  const pendingLicense = [];
  for (const source of referenced) {
    const entry = registered.get(source);
    if (!entry) {
      unregistered.push(source);
      continue;
    }
    if (String(entry.license ?? "").startsWith("pending_license_check")) {
      pendingLicense.push(source);
    }
  }

  if (unregistered.length > 0 || pendingLicense.length > 0) {
    return {
      status: "fail",
      reason: `Referenced sources are not approved for import: unregistered=${unregistered.join(",") || "none"} pendingLicense=${pendingLicense.join(",") || "none"}`,
      unregistered,
      pendingLicense,
      requiredBeforeBulkCuration: true,
    };
  }

  return {
    status: "pass",
    reason: "All referenced sources are registered with a usable license.",
    requiredBeforeBulkCuration: true,
  };
}

const allRowsByLocale = {};
const reports = [];
for (const locale of locales) {
  const file = path.join(sourceDir, `${locale}.json`);
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  allRowsByLocale[locale] = rows;
  const identities = new Map();
  const descriptions = new Map();
  const descriptionRows = [];
  const invalidCareRanges = [];
  let missingBase = 0;
  let inheritedCultivar = 0;
  let short = 0;
  let placeholder = 0;
  let withSource = 0;
  let reviewed = 0;
  const originCounts = { authored: 0, inherited: 0, imported: 0, none: 0 };
  const careStatusCounts = { missing: 0, awaiting_review: 0, verified: 0, not_applicable: 0 };
  let inPriority = 0;
  let fullDetailTier = 0;
  let usableName = 0;
  for (const row of rows) {
    identities.set(identity(row), (identities.get(identity(row)) || 0) + 1);
    const description = (row.description || "").trim();
    if (!description && row.cultivar) inheritedCultivar += 1;
    if (!description && !row.cultivar) missingBase += 1;
    if (description.length > 0 && description.length < 120) short += 1;
    if (placeholders.some((pattern) => pattern.test(normalize(description)))) placeholder += 1;
    if (description) descriptions.set(normalize(description), (descriptions.get(normalize(description)) || 0) + 1);
    if (description) descriptionRows.push({ row, description });

    if (String(row.source ?? row.sourceSystem ?? "").trim()) withSource += 1;
    if (String(row.review_status ?? "").trim() === "reviewed") reviewed += 1;

    const origin = String(row.content_origin ?? "").trim();
    if (["authored", "inherited", "imported"].includes(origin)) originCounts[origin] += 1;
    else originCounts.none += 1;

    const care = row.care || row.careContent || row.care_content_json;
    const careStatus = careStatusOf(care);
    careStatusCounts[careStatus] += 1;
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

    const parsedIdentity = taxonomyIdentity(row);
    if (parsedIdentity && priorityFullDetail.has(priorityKey(parsedIdentity))) {
      inPriority += 1;
      const usableDescription = description.length > 0 && !placeholders.some((pattern) => pattern.test(normalize(description)));
      const reviewedEvidence = String(row.review_status ?? "").trim() === "reviewed";
      if (usableDescription && (careStatus === "verified" || careStatus === "not_applicable") && reviewedEvidence) {
        fullDetailTier += 1;
      }
    }
    if (String(row.commonName ?? "").trim()) usableName += 1;
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
    usableCommonNames: usableName,
    withSource: withSource,
    reviewed: reviewed,
    contentOrigin: originCounts,
    careStatus: careStatusCounts,
    inPriorityFullDetail: inPriority,
    fullDetailTier: fullDetailTier,
  });
}

const externalDataGate = evaluateExternalDataGate(allRowsByLocale);

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

// Priority coverage (Giai đoạn 0 numerator/denominator contract). Numerator:
// canonical identities that reach full_detail in en and verified vi (or vi
// fallback). Seed source rows carry no review evidence, so the honest
// numerator here is 0 until curation review evidence exists.
const en = allRowsByLocale.en ?? [];
const vi = allRowsByLocale.vi ?? [];
const numerator = new Set();
for (const row of en) {
  const parsed = taxonomyIdentity(row);
  if (!parsed || !priorityFullDetail.has(priorityKey(parsed))) continue;
  const description = (row.description || "").trim();
  const reviewedEvidence = String(row.review_status ?? "").trim() === "reviewed";
  if (!reviewedEvidence) continue;
  const viRow = vi.find((candidate) =>
    identity(candidate) === identity(row) &&
    String(candidate.commonName ?? "").trim(),
  );
  const viOk = Boolean(viRow) || String(row.commonName ?? "").trim() !== "";
  if (viOk) numerator.add(priorityKey(parsed));
}

console.log(JSON.stringify({
  externalDataGate,
  priorityCoverage: {
    listVersion: priorityList?.listVersion ?? null,
    priorityDenominator,
    priorityNumerator: numerator.size,
    coveragePercent: priorityDenominator > 0
      ? Number(((numerator.size / priorityDenominator) * 100).toFixed(1))
      : null,
    note: "Numerator requires review evidence; seed source rows are unreviewed by design.",
  },
}, null, 2));
