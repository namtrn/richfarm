export const DEFAULT_CULTIVAR_NORMALIZED = "__default__";
const INFRASPECIFIC_PATTERN = /^(subsp|ssp|var|f)\.?\s+/i;

export type TaxonomyParseStatus = "ok" | "manual_review";

export type ParsedTaxonomy = {
  genus?: string;
  species?: string;
  parseStatus: TaxonomyParseStatus;
};

export type TaxonomyFields = {
  genus?: string;
  species?: string;
  cultivar?: string;
  genusNormalized?: string;
  speciesNormalized?: string;
  cultivarNormalized: string;
  taxonomyParseStatus: TaxonomyParseStatus;
};

export type TaxonomyIdentity = {
  genusNormalized: string;
  speciesNormalized: string;
  cultivarNormalized: string;
};

const stripDiacritics = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const normalizeTaxonomyToken = (value: string) =>
  stripDiacritics(value).trim().toLowerCase().replace(/\s+/g, " ");

export const normalizeCultivar = (cultivar?: string | null) => {
  const normalized = normalizeTaxonomyToken(cultivar ?? "");
  return normalized || DEFAULT_CULTIVAR_NORMALIZED;
};

export const isInfraspecificCultivar = (cultivarNormalized?: string | null) => {
  const token = normalizeTaxonomyToken(cultivarNormalized ?? "");
  if (!token || token === DEFAULT_CULTIVAR_NORMALIZED) return false;
  return INFRASPECIFIC_PATTERN.test(token);
};

export const formatGenus = (value: string) => {
  const normalized = normalizeTaxonomyToken(value);
  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

export const formatSpecies = (value: string) => normalizeTaxonomyToken(value);

export const buildScientificName = (genus: string, species: string) => {
  const g = formatGenus(genus);
  const s = formatSpecies(species);
  return `${g} ${s}`.trim();
};

const isTaxonomyWord = (token: string) => /^[A-Za-z.-]+$/.test(token);

const normalizeSpeciesTokenForParsing = (token: string) =>
  token.replace(/^[x×]+/i, "").trim();

const tokenizeScientificName = (scientificName?: string | null) =>
  (scientificName ?? "")
    .trim()
    .replace(/[,;]+/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/[()]/g, "").trim())
    .filter(Boolean);

const inferInfraspecificCultivarFromScientificName = (
  scientificName?: string | null
) => {
  const tokens = tokenizeScientificName(scientificName);
  if (tokens.length < 3) return undefined;

  let speciesIndex = 1;
  if ((tokens[1] === "x" || tokens[1] === "×") && tokens.length >= 4) {
    speciesIndex = 2;
  }

  const remainderTokens = tokens.slice(speciesIndex + 1);
  if (remainderTokens.length === 0) return undefined;

  // Preserve infraspecific qualifiers as cultivar-like discriminator
  // for uniqueness (e.g. "subsp. chinensis", "var. capitata").
  const rankToken = remainderTokens[0].toLowerCase();
  const looksLikeRank = ["subsp.", "subsp", "ssp.", "ssp", "var.", "var", "f.", "f"]
    .includes(rankToken);
  if (!looksLikeRank) return undefined;

  return remainderTokens.join(" ").trim() || undefined;
};

/**
 * Best-effort parse from legacy scientificName.
 * Returns manual_review when input is ambiguous (e.g. fallback labels like "Tomato (T01)").
 */
export const parseTaxonomyFromScientificName = (
  scientificName?: string | null
): ParsedTaxonomy => {
  const raw = (scientificName ?? "").trim();
  if (!raw) return { parseStatus: "manual_review" };

  const tokens = tokenizeScientificName(raw);

  if (tokens.length < 2) return { parseStatus: "manual_review" };

  const rawGenus = tokens[0];
  let rawSpecies = tokens[1];
  if ((rawSpecies === "x" || rawSpecies === "×") && tokens.length >= 3) {
    rawSpecies = tokens[2];
  }
  rawSpecies = normalizeSpeciesTokenForParsing(rawSpecies);

  if (!isTaxonomyWord(rawGenus) || !isTaxonomyWord(rawSpecies)) {
    return { parseStatus: "manual_review" };
  }

  const genus = formatGenus(rawGenus);
  const species = formatSpecies(rawSpecies);
  if (!genus || !species) return { parseStatus: "manual_review" };

  return { genus, species, parseStatus: "ok" };
};

export const buildTaxonomyFields = (args: {
  scientificName?: string | null;
  cultivar?: string | null;
}): TaxonomyFields => {
  const parsed = parseTaxonomyFromScientificName(args.scientificName);
  const inferredCultivar = inferInfraspecificCultivarFromScientificName(
    args.scientificName
  );
  const cultivar = (args.cultivar ?? "").trim() || inferredCultivar || undefined;
  const cultivarNormalized = normalizeCultivar(cultivar);

  if (!parsed.genus || !parsed.species) {
    return {
      cultivar,
      cultivarNormalized,
      taxonomyParseStatus: "manual_review",
    };
  }

  const genus = formatGenus(parsed.genus);
  const species = formatSpecies(parsed.species);

  return {
    genus,
    species,
    cultivar,
    genusNormalized: normalizeTaxonomyToken(genus),
    speciesNormalized: normalizeTaxonomyToken(species),
    cultivarNormalized,
    taxonomyParseStatus: parsed.parseStatus,
  };
};

export const requireTaxonomyIdentity = (
  taxonomy: TaxonomyFields,
  context: string
): TaxonomyIdentity => {
  if (
    !taxonomy.genusNormalized ||
    !taxonomy.speciesNormalized ||
    !taxonomy.cultivarNormalized
  ) {
    throw new Error(`${context}: taxonomy identity is required`);
  }

  return {
    genusNormalized: taxonomy.genusNormalized,
    speciesNormalized: taxonomy.speciesNormalized,
    cultivarNormalized: taxonomy.cultivarNormalized,
  };
};

export const taxonomyFieldsForStorage = (taxonomy: TaxonomyFields) => ({
  genus: taxonomy.genus,
  species: taxonomy.species,
  cultivar: taxonomy.cultivar,
  taxonomyParseStatus: taxonomy.taxonomyParseStatus,
});

export const taxonomyIdentityFromPlant = (plant: {
  genus?: string | null;
  species?: string | null;
  cultivar?: string | null;
}) => ({
  genusNormalized: normalizeTaxonomyToken(plant.genus ?? ""),
  speciesNormalized: normalizeTaxonomyToken(plant.species ?? ""),
  cultivarNormalized: normalizeCultivar(plant.cultivar),
});

export function withComputedPlantTaxonomy<T extends Record<string, any>>(plant: T): T & TaxonomyIdentity {
  return {
    ...plant,
    ...taxonomyIdentityFromPlant(plant),
  };
}

export const matchesTaxonomyIdentity = (
  plant: { genus?: string | null; species?: string | null; cultivar?: string | null },
  identity: TaxonomyIdentity,
) => {
  const current = taxonomyIdentityFromPlant(plant);
  return (
    current.genusNormalized === identity.genusNormalized &&
    current.speciesNormalized === identity.speciesNormalized &&
    current.cultivarNormalized === identity.cultivarNormalized
  );
};
