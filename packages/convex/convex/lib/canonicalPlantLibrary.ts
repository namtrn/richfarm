import { isDisplayBasePlant } from "../../../shared/src/plantBase";
import {
  isPlaceholderPlantDescription,
  shouldUseBasePlantDescription,
} from "./plantContentQuality";
import { withComputedPlantTaxonomy } from "./plantTaxonomy";
import { recomputeCareStatus } from "./plantCare";
import { countryName } from "../../../shared/src/countries";
import priorityListV1 from "../data/plantPriorityList.v1.json";

type CanonicalOptions = {
  locale?: string;
  group?: string;
  family?: string;
  purpose?: string;
  search?: string;
  limit?: number;
  includeInactive?: boolean;
};

// Giai đoạn 0 contract: the frozen priority list decides which canonical
// identities may be classified as full_detail. Entries with
// targetCoverage=full_detail form the denominator of the 90% coverage metric.
const PRIORITY_FULL_DETAIL_IDENTITIES = new Set(
  (priorityListV1.entries ?? [])
    .filter((entry: any) => entry.targetCoverage === "full_detail")
    .map((entry: any) => {
      const identity = entry.canonicalIdentity;
      return `${identity.genusNormalized}|${identity.speciesNormalized}|${identity.cultivarNormalized}`;
    }),
);

function priorityIdentityKey(plant: any) {
  return [
    plant.genusNormalized ?? "",
    plant.speciesNormalized ?? "",
    plant.cultivarNormalized ?? "",
  ].join("|");
}

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim();

const localeOf = (value?: string) => (value ?? "en").split("-")[0].toLowerCase() || "en";

function speciesKeyOf(plant: any) {
  if (plant.genusNormalized && plant.speciesNormalized) {
    return `${plant.genusNormalized}:${plant.speciesNormalized}`;
  }
  return normalize(plant.scientificName);
}

function isProductionPlant(plant: any, includeInactive: boolean) {
  if (!includeInactive && plant.isActive === false) return false;
  if (plant.contentStatus === "archived") return false;
  if (!includeInactive && plant.contentStatus && plant.contentStatus !== "published") return false;
  return true;
}

function chooseRow(rows: any[], locale: string, requireUsableDescription = false) {
  const usable = rows.filter((row) =>
    (row.contentStatus === undefined || row.contentStatus === "published") &&
    String(row.commonName ?? "").trim() &&
    (!requireUsableDescription || !isPlaceholderPlantDescription(row.description)),
  );
  return usable.find((row) => row.locale === locale) ??
    usable.find((row) => row.locale === "en") ??
    usable[0] ?? null;
}

function productionRows(rows: any[], includeInactive: boolean) {
  if (includeInactive) return rows;
  return rows
    .filter((row) =>
      (row.contentStatus === undefined || row.contentStatus === "published") &&
      String(row.commonName ?? "").trim(),
    )
    .map((row) => ({
      ...row,
      description: isPlaceholderPlantDescription(row.description)
        ? undefined
        : row.description,
    }));
}

function baseCandidate(plant: any, plants: any[]) {
  const explicitBaseId = plant.basePlantId;
  if (explicitBaseId) {
    const explicit = plants.find((candidate) => String(candidate._id) === String(explicitBaseId));
    if (explicit && isDisplayBasePlant(explicit) && isProductionPlant(explicit, false)) return explicit;
  }
  const key = speciesKeyOf(plant);
  return plants.find((candidate) =>
    candidate._id !== plant._id &&
    isDisplayBasePlant(candidate) &&
    isProductionPlant(candidate, false) &&
    speciesKeyOf(candidate) === key,
  ) ?? null;
}

/**
 * Category-level geography resolution (design doc §3.1): own rows win per
 * category; a cultivar with no own rows in a category inherits the base
 * plant's resolved rows. Missing geography stays absent from the arrays —
 * never a negative/unsuitable marker.
 */
function resolveGeographyCategory<T>(
  own: T[],
  inherited: T[] | undefined,
): { items: T[]; source: "own" | "inherited" | "none" } {
  if (own.length > 0) return { items: own, source: "own" };
  if (inherited && inherited.length > 0) return { items: inherited, source: "inherited" };
  return { items: [], source: "none" };
}

function resolveAdaptationLabel(
  labelByCodeLocale: Map<string, string>,
  code: string,
  locale: string,
): string {
  const requested = labelByCodeLocale.get(`${code}:${locale}`);
  if (requested?.trim()) return requested.trim();
  const english = labelByCodeLocale.get(`${code}:en`);
  if (english?.trim()) return english.trim();
  return code;
}

function mergeLocaleContent(plant: any, rows: any[], base: any | null, baseRows: any[], locale: string) {
  const picked = chooseRow(rows, locale);
  const pickedContent = chooseRow(rows, locale, true);
  const pickedBase = base ? chooseRow(baseRows, locale) : null;
  const pickedBaseContent = base ? chooseRow(baseRows, locale, true) : null;
  let description = pickedContent?.description?.trim() || undefined;
  if (shouldUseBasePlantDescription({
    cultivarDescription: description,
    baseDescription: pickedBaseContent?.description,
    cultivar: plant.cultivar,
    cultivarCommonName: picked?.commonName,
    baseCommonName: pickedBase?.commonName,
  })) {
    description = isPlaceholderPlantDescription(pickedBaseContent?.description)
      ? undefined
      : pickedBaseContent?.description?.trim() || undefined;
  }

  const care = picked?.careContent
    ? picked
    : pickedBase?.careContent
      ? pickedBase
      : picked;
  return {
    displayName: picked?.commonName ?? plant.scientificName,
    description: isPlaceholderPlantDescription(description) ? undefined : description,
    localeUsed: pickedContent?.locale ?? picked?.locale ?? "latin",
    careContent: care?.careContent,
    contentUpdatedAt: care?.contentUpdatedAt,
    careSource: care?.careSource,
    careSourceUrl: care?.careSourceUrl,
    careSourceRefs: care?.careSourceRefs,
    contentVersion: care?.contentVersion,
    contentOrigin: picked?.contentOrigin ?? "imported",
    inheritedFromId: base?._id,
  };
}

export async function loadCanonicalPlantLibrary(ctx: any, options: CanonicalOptions = {}) {
  const locale = localeOf(options.locale);
  const includeInactive = options.includeInactive === true;
  const allPlants = (await ctx.db.query("plantsMaster").collect()).map(withComputedPlantTaxonomy);
  const allI18n = await ctx.db.query("plantI18n").collect();
  const allCare = await ctx.db.query("plantCare").collect();
  const allCareI18n = await ctx.db.query("plantCareI18n").collect();
  const allOrigins = await ctx.db.query("plantOriginCountries").collect();
  const allProvenRegions = await ctx.db.query("plantProvenRegions").collect();
  const allAdaptationTerms = await ctx.db.query("plantAdaptationTerms").collect();
  const adaptationTermDocs = await ctx.db.query("adaptationTerms").collect();
  const adaptationTermI18n = await ctx.db.query("adaptationTermI18n").collect();
  const i18nByPlant = new Map<string, any[]>();
  const careI18nByPlantLocale = new Map<string, any>();
  const careByPlant = new Map<string, any>();
  const originByPlant = new Map<string, string[]>();
  const provenByPlant = new Map<string, Array<{ countryCode: string; subdivisionCode?: string }>>();
  const termsByPlant = new Map<string, string[]>();
  for (const row of allI18n) {
    const rows = i18nByPlant.get(String(row.plantId)) ?? [];
    rows.push({ ...row, locale: localeOf(row.locale) });
    i18nByPlant.set(String(row.plantId), rows);
  }
  for (const row of allCareI18n) {
    careI18nByPlantLocale.set(`${row.plantId}:${localeOf(row.locale)}`, row);
  }
  for (const row of allCare) careByPlant.set(String(row.plantId), row);
  for (const row of allOrigins) {
    const list = originByPlant.get(String(row.plantId)) ?? [];
    list.push(row.countryCode);
    originByPlant.set(String(row.plantId), list);
  }
  for (const row of allProvenRegions) {
    const list = provenByPlant.get(String(row.plantId)) ?? [];
    list.push({
      countryCode: row.countryCode,
      ...(row.subdivisionCode ? { subdivisionCode: row.subdivisionCode } : {}),
    });
    provenByPlant.set(String(row.plantId), list);
  }
  for (const row of allAdaptationTerms) {
    const list = termsByPlant.get(String(row.plantId)) ?? [];
    list.push(row.termCode);
    termsByPlant.set(String(row.plantId), list);
  }
  const adaptationTermByCode = new Map<string, any>(adaptationTermDocs.map((term: any) => [term.code, term]));
  const adaptationLabelByCodeLocale = new Map<string, string>();
  for (const row of adaptationTermI18n as any[]) {
    const existing = adaptationLabelByCodeLocale.get(`${row.termCode}:${row.locale}`);
    if (!existing || (row.locale === locale && row.translationStatus !== "missing")) {
      adaptationLabelByCodeLocale.set(`${row.termCode}:${row.locale}`, row.label);
    }
  }
  for (const [plantId, rows] of i18nByPlant) {
    for (const row of rows) {
      const care = careI18nByPlantLocale.get(`${plantId}:${row.locale}`);
      if (care && (includeInactive || care.contentStatus === undefined || care.contentStatus === "published")) {
      row.careContent = care.careContent;
      row.contentUpdatedAt = care.contentUpdatedAt;
      row.contentVersion = row.contentVersion ?? care.contentVersion;
      row.careSource = care.source;
      row.careSourceUrl = care.sourceUrl;
      row.careSourceRefs = care.sourceRefs;
      }
    }
  }

  const sourcePlants = allPlants.filter((plant: any) => {
    if (!isProductionPlant(plant, includeInactive)) return false;
    if (options.group && normalize(plant.group) !== normalize(options.group)) return false;
    if (options.family && normalize(plant.family) !== normalize(options.family)) return false;
    if (options.purpose && !(plant.purposes ?? []).some((purpose: string) => normalize(purpose) === normalize(options.purpose))) return false;
    return true;
  });

  const projected: any[] = sourcePlants.map((plant: any) => {
    const rows = productionRows(i18nByPlant.get(String(plant._id)) ?? [], includeInactive);
    const base = baseCandidate(plant, allPlants);
    const baseRows = base
      ? productionRows(i18nByPlant.get(String(base._id)) ?? [], includeInactive)
      : [];
    const localized = mergeLocaleContent(plant, rows, base, baseRows, locale);
    const careProfile = careByPlant.get(String(plant._id));
    const baseCare = base ? careByPlant.get(String(base._id)) : undefined;
    const isPublishedCare = (profile: any) => profile && (
      includeInactive || profile.contentStatus === undefined || profile.contentStatus === "published"
    );
    const care = isPublishedCare(careProfile)
      ? careProfile
      : isPublishedCare(baseCare)
        ? baseCare
        : undefined;

    // Phase 3.1 record-level care status: persisted aggregate when present,
    // otherwise recomputed from the profile + per-field evidence.
    const careStatus = care
      ? (care.careStatus ?? recomputeCareStatus(care, care.careFieldEvidence))
      : "missing";

    // computed missingViCommonName: no verified Vietnamese common name.
    // The vi row counts only when it is production-usable.
    const hasVerifiedViName = rows.some((row) =>
      row.locale === "vi" &&
      (row.contentStatus === undefined || row.contentStatus === "published") &&
      String(row.commonName ?? "").trim(),
    );
    const missingViCommonName = !hasVerifiedViName;

    // computed contentTier (never persisted): full_detail requires the
    // identity to be in the frozen priority list, a usable authored
    // description, a resolved care profile and review evidence.
    const inPriorityFullDetail = PRIORITY_FULL_DETAIL_IDENTITIES.has(priorityIdentityKey(plant));
    const fullDetailCare = careStatus === "verified" || careStatus === "not_applicable";
    const hasUsableDescription = Boolean(localized.description?.trim());
    // Review evidence requires both the reviewed status and a review timestamp;
    // a row marked unreviewed with a stray timestamp is not review evidence.
    const reviewed = plant.reviewStatus === "reviewed" && plant.reviewedAt !== undefined;
    const contentTier = inPriorityFullDetail && hasUsableDescription && fullDetailCare && reviewed
      ? "full_detail"
      : "taxonomy_only";

    const searchable = [
      localized.displayName,
      plant.scientificName,
      plant.cultivar,
      plant.family,
      plant.group,
      ...(plant.purposes ?? []),
      ...rows.map((row) => row.commonName),
    ].map(normalize).join(" ");

    // Geography (additive, design doc §3.1): own rows win per category;
    // cultivars inherit a category only when they have no own rows in it.
    const ownOrigins = originByPlant.get(String(plant._id)) ?? [];
    const ownProven = provenByPlant.get(String(plant._id)) ?? [];
    const ownTerms = termsByPlant.get(String(plant._id)) ?? [];
    const baseOrigins = base ? originByPlant.get(String(base._id)) : undefined;
    const baseProven = base ? provenByPlant.get(String(base._id)) : undefined;
    const baseTerms = base ? termsByPlant.get(String(base._id)) : undefined;
    const origin = resolveGeographyCategory(ownOrigins, baseOrigins);
    const proven = resolveGeographyCategory(ownProven, baseProven);
    const adaptation = resolveGeographyCategory(ownTerms, baseTerms);
    const geographyInherited =
      origin.source === "inherited" || proven.source === "inherited" || adaptation.source === "inherited";
    const geographySource = {
      origin: origin.source,
      provenRegions: proven.source,
      adaptation: adaptation.source,
    };
    const adaptationGrouped = { temperature: [], moisture: [], climate: [], season: [] } as Record<
      string,
      Array<{ code: string; label: string }>
    >;
    for (const code of adaptation.items) {
      const term = adaptationTermByCode.get(code);
      if (!term) continue;
      const group = adaptationGrouped[term.dimension];
      if (!group) continue;
      group.push({ code, label: resolveAdaptationLabel(adaptationLabelByCodeLocale, code, locale) });
    }

    return {
      _id: plant._id,
      scientificName: plant.scientificName,
      family: plant.family ?? undefined,
      genus: plant.genus ?? undefined,
      species: plant.species ?? undefined,
      genusNormalized: plant.genusNormalized ?? undefined,
      speciesNormalized: plant.speciesNormalized ?? undefined,
      taxonomyParseStatus: plant.taxonomyParseStatus,
      cultivar: plant.cultivar ?? null,
      cultivarNormalized: plant.cultivarNormalized,
      basePlantId: plant.basePlantId ?? (base?._id ?? undefined),
      commonNameGroupKey: plant.commonNameGroupKey ?? undefined,
      commonNameGroupVi: plant.commonNameGroupVi ?? undefined,
      commonNameGroupEn: plant.commonNameGroupEn ?? undefined,
      displayName: localized.displayName,
      commonName: localized.displayName,
      description: localized.description,
      localeUsed: localized.localeUsed,
      careContent: localized.careContent,
      contentUpdatedAt: localized.contentUpdatedAt,
      contentVersion: localized.contentVersion ?? plant.contentVersion,
      contentOrigin: localized.contentOrigin,
      inheritedFromId: localized.inheritedFromId,
      contentTier,
      careStatus,
      missingViCommonName,
      i18nRows: rows,
      group: plant.group,
      imageUrl: plant.imageUrl ?? null,
      hasImage: Boolean(plant.imageUrl),
      isBaseVariant: isDisplayBasePlant(plant),
      speciesKey: speciesKeyOf(plant),
      purposes: plant.purposes ?? [],
      source: plant.source,
      sourceSystem: plant.sourceSystem,
      sourceId: plant.sourceId,
      recordVersion: plant.recordVersion,
      sourceUrl: plant.sourceUrl,
      isActive: plant.isActive !== false,
      contentStatus: plant.contentStatus ?? "published",
      reviewStatus: plant.reviewStatus ?? "unreviewed",
      reviewedAt: plant.reviewedAt,
      reviewedBy: plant.reviewedBy,
      growthStage: plant.growthStage,
      notes: plant.notes,
      typicalDaysToHarvest: care?.typicalDaysToHarvest,
      germinationDays: care?.germinationDays,
      wateringFrequencyDays: care?.wateringFrequencyDays,
      fertilizingFrequencyDays: care?.fertilizingFrequencyDays,
      lightRequirements: care?.lightRequirements,
      lightHours: care?.lightHours ?? plant.lightHours,
      propagationMethods: care?.propagationMethods,
      careSourceRefs: localized.careSourceRefs,
      soilPhMin: care?.soilPhMin ?? plant.soilPhMin,
      soilPhMax: care?.soilPhMax ?? plant.soilPhMax,
      moistureTarget: care?.moistureTarget ?? plant.moistureTarget,
      spacingCm: care?.spacingCm,
      maxPlantsPerM2: care?.maxPlantsPerM2,
      seedRatePerM2: care?.seedRatePerM2,
      waterLitersPerM2: care?.waterLitersPerM2,
      yieldKgPerM2: care?.yieldKgPerM2,
      originCountries: origin.items.map((code) => ({ code, name: countryName(code, locale) })),
      provenRegions: proven.items.map((region) => ({
        code: region.countryCode,
        ...(region.subdivisionCode ? { subdivisionCode: region.subdivisionCode } : {}),
        name: countryName(region.countryCode, locale),
      })),
      adaptation: adaptationGrouped,
      geographySource,
      geographyInheritedFromId: geographyInherited ? base?._id : undefined,
      _searchText: searchable,
    };
  }).filter((plant: any) => Boolean(plant.description?.trim()));

  const searched = options.search
    ? projected.filter((plant) => plant._searchText.includes(normalize(options.search)))
    : projected;
  const sorted = searched.sort((left: any, right: any) => {
    const groupCompare = String(left.group ?? "").localeCompare(String(right.group ?? ""));
    if (groupCompare !== 0) return groupCompare;
    if (left.isBaseVariant !== right.isBaseVariant) return left.isBaseVariant ? -1 : 1;
    return String(left.displayName).localeCompare(String(right.displayName));
  });
  return sorted
    .map(({ _searchText, ...plant }: any) => plant)
    .slice(0, Math.max(1, Math.min(options.limit ?? 10000, 10000)));
}

export async function getCanonicalPlantById(ctx: any, plantId: any, locale?: string, includeInactive = false) {
  const plants = await loadCanonicalPlantLibrary(ctx, { locale, includeInactive, limit: 10000 });
  return plants.find((plant: any) => String(plant._id) === String(plantId)) ?? null;
}
