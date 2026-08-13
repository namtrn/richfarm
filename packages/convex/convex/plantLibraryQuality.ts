import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { isDisplayBasePlant } from "../../shared/src/plantBase";
import { requireAdminServiceToken } from "./lib/adminAuth";
import {
  isPlaceholderPlantDescription,
  plantDescriptionSimilarity,
} from "./lib/plantContentQuality";
import { DEFAULT_CULTIVAR_NORMALIZED, taxonomyIdentityFromPlant } from "./lib/plantTaxonomy";

const sampleLimitValidator = v.optional(v.number());

function keyForSource(plant: any) {
  if (!plant.sourceSystem || !plant.sourceId) return null;
  return `${plant.sourceSystem}:${plant.sourceId}`;
}

function keyForTaxonomy(plant: any) {
  const identity = taxonomyIdentityFromPlant(plant);
  if (!identity.genusNormalized || !identity.speciesNormalized || !identity.cultivarNormalized) return null;
  return `${identity.genusNormalized}|${identity.speciesNormalized}|${identity.cultivarNormalized}`;
}

async function buildQualityReport(ctx: any, sampleLimit: number) {
  const plants = await ctx.db.query("plantsMaster").collect();
  const i18nRows = await ctx.db.query("plantI18n").collect();
  const careRows = await ctx.db.query("plantCare").collect();
  const adaptationTermRows = await ctx.db.query("adaptationTerms").collect();
  const adaptationI18nRows = await ctx.db.query("adaptationTermI18n").collect();
  const sourceIds = new Map<string, string[]>();
  const taxonomyIds = new Map<string, string[]>();
  const plantById = new Map<string, any>(plants.map((plant: any) => [String(plant._id), plant]));
  for (const plant of plants) {
    const sourceKey = keyForSource(plant);
    if (sourceKey) sourceIds.set(sourceKey, [...(sourceIds.get(sourceKey) ?? []), String(plant._id)]);
    const taxonomyKey = keyForTaxonomy(plant);
    if (taxonomyKey) taxonomyIds.set(taxonomyKey, [...(taxonomyIds.get(taxonomyKey) ?? []), String(plant._id)]);
  }

  const missingLocale: Array<{ plantId: any; missing: string[] }> = [];
  const placeholders: Array<{ plantId: any; locale: string }> = [];
  const descriptionsByLocale = new Map<string, Array<{ plantId: any; description: string }>>();
  const rowsByPlant = new Map<string, any[]>();
  for (const row of i18nRows) {
    const list = rowsByPlant.get(String(row.plantId)) ?? [];
    list.push(row);
    rowsByPlant.set(String(row.plantId), list);
    const description = row.description?.trim() ?? "";
    if (description && isPlaceholderPlantDescription(description)) {
      placeholders.push({ plantId: row.plantId, locale: row.locale });
    }
    if (description) {
      const entries = descriptionsByLocale.get(row.locale) ?? [];
      entries.push({ plantId: row.plantId, description });
      descriptionsByLocale.set(row.locale, entries);
    }
  }
  for (const plant of plants) {
    const locales = new Set((rowsByPlant.get(String(plant._id)) ?? []).map((row) => row.locale));
    const missing = ["vi", "en"].filter((locale) => !locales.has(locale));
    if (missing.length) missingLocale.push({ plantId: plant._id, missing });
  }

  const nearDuplicates: Array<{ locale: string; plantId: any; otherPlantId: any; similarity: number }> = [];
  for (const [locale, rows] of descriptionsByLocale) {
    for (let index = 0; index < rows.length; index += 1) {
      const left = rows[index];
      const leftPlant = plantById.get(String(left.plantId));
      for (let otherIndex = index + 1; otherIndex < rows.length; otherIndex += 1) {
        const right = rows[otherIndex];
        if (String(left.plantId) === String(right.plantId)) continue;
        const rightPlant = plantById.get(String(right.plantId));
        if (!leftPlant || !rightPlant) continue;
        const leftSpecies = `${leftPlant.genusNormalized ?? ""}:${leftPlant.speciesNormalized ?? ""}`;
        const rightSpecies = `${rightPlant.genusNormalized ?? ""}:${rightPlant.speciesNormalized ?? ""}`;
        if (leftSpecies !== ":" && leftSpecies !== rightSpecies) continue;
        const similarity = plantDescriptionSimilarity(left.description, right.description);
        if (similarity >= 0.82) nearDuplicates.push({ locale, plantId: left.plantId, otherPlantId: right.plantId, similarity });
        if (nearDuplicates.length >= sampleLimit * 4) break;
      }
      if (nearDuplicates.length >= sampleLimit * 4) break;
    }
  }

  const invalidCare: Array<{ plantId: any; field: string; value: unknown }> = [];
  for (const row of careRows) {
    if (row.soilPhMin != null && (row.soilPhMin < 0 || row.soilPhMin > 14)) invalidCare.push({ plantId: row.plantId, field: "soilPhMin", value: row.soilPhMin });
    if (row.soilPhMax != null && (row.soilPhMax < 0 || row.soilPhMax > 14)) invalidCare.push({ plantId: row.plantId, field: "soilPhMax", value: row.soilPhMax });
    if (row.soilPhMin != null && row.soilPhMax != null && row.soilPhMin > row.soilPhMax) invalidCare.push({ plantId: row.plantId, field: "soilPhRange", value: [row.soilPhMin, row.soilPhMax] });
    if (row.moistureTarget != null && (row.moistureTarget < 0 || row.moistureTarget > 100)) invalidCare.push({ plantId: row.plantId, field: "moistureTarget", value: row.moistureTarget });
    if (row.lightHours != null && (row.lightHours < 0 || row.lightHours > 24)) invalidCare.push({ plantId: row.plantId, field: "lightHours", value: row.lightHours });
  }

  const duplicateSources = Array.from(sourceIds.entries()).filter(([, ids]) => ids.length > 1);
  const duplicateTaxonomy = Array.from(taxonomyIds.entries()).filter(([, ids]) => ids.length > 1);
  const variantsWithoutBase = plants.filter((plant: any) => {
    if (isDisplayBasePlant(plant)) return false;
    const identity = taxonomyIdentityFromPlant(plant);
    if (!identity.genusNormalized || !identity.speciesNormalized) return false;
    return !plants.some((candidate: any) => {
      const candidateIdentity = taxonomyIdentityFromPlant(candidate);
      return candidateIdentity.genusNormalized === identity.genusNormalized &&
        candidateIdentity.speciesNormalized === identity.speciesNormalized &&
        candidateIdentity.cultivarNormalized === DEFAULT_CULTIVAR_NORMALIZED;
    });
  });
  const missingSourceMetadata = plants.filter((plant: any) =>
    (plant.contentStatus ?? "published") === "published" && (!plant.source || !plant.sourceUrl),
  );

  // vi/en publication gate for the adaptation taxonomy: every active term must
  // have both a Vietnamese and an English label (design doc §5, §6.4).
  const termI18nByCodeLocale = new Map<string, any>();
  for (const row of adaptationI18nRows) {
    termI18nByCodeLocale.set(`${row.termCode}:${row.locale}`, row);
  }
  const missingAdaptationTranslation: Array<{ termCode: string; missing: string[] }> = [];
  for (const term of adaptationTermRows) {
    if (term.status !== "active") continue;
    const vi = termI18nByCodeLocale.get(`${term.code}:vi`);
    const en = termI18nByCodeLocale.get(`${term.code}:en`);
    const missing = [
      ...(!vi?.label?.trim() ? ["vi"] : []),
      ...(!en?.label?.trim() ? ["en"] : []),
    ];
    if (missing.length) missingAdaptationTranslation.push({ termCode: term.code, missing });
  }

  return {
    totals: { plants: plants.length, i18n: i18nRows.length, care: careRows.length },
    issues: {
      duplicateSourceIdentityCount: duplicateSources.length,
      duplicateTaxonomyCount: duplicateTaxonomy.length,
      missingRequiredLocaleCount: missingLocale.length,
      placeholderDescriptionCount: placeholders.length,
      nearDuplicateDescriptionCount: nearDuplicates.length,
      invalidCareRangeCount: invalidCare.length,
      variantsWithoutBaseCount: variantsWithoutBase.length,
      missingSourceMetadataCount: missingSourceMetadata.length,
      missingMandatoryAdaptationTranslationCount: missingAdaptationTranslation.length,
    },
    samples: {
      duplicateSourceIdentity: duplicateSources.slice(0, sampleLimit),
      duplicateTaxonomy: duplicateTaxonomy.slice(0, sampleLimit),
      missingRequiredLocale: missingLocale.slice(0, sampleLimit),
      placeholderDescriptions: placeholders.slice(0, sampleLimit),
      nearDuplicateDescriptions: nearDuplicates.slice(0, sampleLimit),
      invalidCareRanges: invalidCare.slice(0, sampleLimit),
      variantsWithoutBase: variantsWithoutBase.slice(0, sampleLimit).map((plant: any) => plant._id),
      missingSourceMetadata: missingSourceMetadata.slice(0, sampleLimit).map((plant: any) => plant._id),
      missingMandatoryAdaptationTranslation: missingAdaptationTranslation.slice(0, sampleLimit),
    },
  };
}

export const qualityReport = query({
  args: { sampleLimit: sampleLimitValidator },
  handler: async (ctx, args) => buildQualityReport(ctx, Math.max(1, Math.min(100, args.sampleLimit ?? 25))),
});

export const assertQualityGate = mutation({
  args: {
    serviceToken: v.string(),
    sampleLimit: sampleLimitValidator,
    failOnMetadata: v.optional(v.boolean()),
    failOnContentDebt: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const report = await buildQualityReport(ctx, Math.max(1, Math.min(100, args.sampleLimit ?? 25)));
    const critical = [
      report.issues.duplicateSourceIdentityCount,
      report.issues.duplicateTaxonomyCount,
      report.issues.invalidCareRangeCount,
      report.issues.variantsWithoutBaseCount,
    ];
    if (args.failOnMetadata) critical.push(report.issues.missingSourceMetadataCount);
    if (args.failOnContentDebt !== false) {
      critical.push(
        report.issues.placeholderDescriptionCount,
        report.issues.nearDuplicateDescriptionCount,
        report.issues.missingMandatoryAdaptationTranslationCount,
      );
    }
    if (critical.some((count) => count > 0)) {
      throw new Error(`Plant library quality gate failed: ${JSON.stringify(report.issues)}`);
    }
    return report;
  },
});
