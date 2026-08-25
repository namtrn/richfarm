/**
 * The versioned canonical plant identity contract.
 *
 * This module intentionally has no dependency on a taxonomy catalogue or a
 * display/localisation layer.  A caller must provide structured genus/species
 * values; a common name (or a scientific-name string) is never parsed here.
 */

export const CANONICAL_IDENTITY_VERSION = "canonical_identity_v1" as const;
export const CANONICAL_IDENTITY_TUPLE_VERSION = "v1" as const;

export const CANONICAL_INFRASPECIFIC_RANKS = ["subsp", "var", "f"] as const;
export type CanonicalInfraspecificRank = (typeof CANONICAL_INFRASPECIFIC_RANKS)[number];
export type CanonicalScope = "base" | "cultivar";

type NullableString = string | null;

/**
 * Structured identity input.  The nullable optional components are required
 * at runtime (and should be sent explicitly as null when absent) so an
 * importer cannot silently infer a scope or cultivar from a display value.
 */
export interface CanonicalPlantIdentityInput {
  genus: string;
  species: string;
  rank: NullableString;
  infraspecificName: NullableString;
  cultivar: NullableString;
  scope: CanonicalScope;
  /** Stable key of the base plant for cultivar-scoped identities. */
  parentCanonicalKey?: NullableString;
  /** Optional database reference used by API/database validators. */
  parentMasterPlantId?: number | null;
  /** Structured parent identity, when available to validate species linkage. */
  parentIdentity?: CanonicalPlantIdentityInput | null;
}

/** A normalized identity and its exact six-element serialization tuple. */
export interface CanonicalPlantIdentity {
  identityVersion: typeof CANONICAL_IDENTITY_VERSION;
  tupleVersion: typeof CANONICAL_IDENTITY_TUPLE_VERSION;
  genus: string;
  species: string;
  rank: CanonicalInfraspecificRank | "";
  infraspecificName: string;
  cultivar: string;
  scope: CanonicalScope;
  canonicalKey: string;
  tuple: readonly [
    typeof CANONICAL_IDENTITY_TUPLE_VERSION,
    string,
    string,
    CanonicalInfraspecificRank | "",
    string,
    string,
  ];
  /** Parent is validation metadata and never participates in canonicalKey. */
  parentCanonicalKey: string | null;
  parentMasterPlantId: number | null;
}

export type CanonicalIdentityIssueCode =
  | "CANONICAL_IDENTITY_INCOMPLETE"
  | "CANONICAL_IDENTITY_INVALID_SCOPE"
  | "CANONICAL_IDENTITY_INVALID_FIELD"
  | "CANONICAL_IDENTITY_INVALID_RANK"
  | "CANONICAL_IDENTITY_INFRASPECIFIC_PAIR"
  | "CANONICAL_IDENTITY_PARENT_REQUIRED"
  | "CANONICAL_IDENTITY_PARENT_FORBIDDEN"
  | "CANONICAL_IDENTITY_PARENT_INVALID"
  | "CANONICAL_IDENTITY_PARENT_SCOPE"
  | "CANONICAL_IDENTITY_PARENT_MISMATCH";

export interface CanonicalIdentityIssue {
  code: CanonicalIdentityIssueCode;
  path: string;
  message: string;
}

export interface CanonicalIdentityValidationSuccess {
  ok: true;
  identity: CanonicalPlantIdentity;
  canonicalKey: string;
  issues: readonly [];
}

export interface CanonicalIdentityValidationFailure {
  ok: false;
  code: CanonicalIdentityIssueCode;
  issues: readonly CanonicalIdentityIssue[];
}

export type CanonicalIdentityValidationResult =
  | CanonicalIdentityValidationSuccess
  | CanonicalIdentityValidationFailure;

export class CanonicalIdentityValidationError extends Error {
  readonly code: CanonicalIdentityIssueCode;
  readonly issues: readonly CanonicalIdentityIssue[];

  constructor(failure: CanonicalIdentityValidationFailure) {
    super(failure.issues[0]?.message ?? failure.code);
    this.name = "CanonicalIdentityValidationError";
    this.code = failure.code;
    this.issues = failure.issues;
  }
}

/**
 * Normalize one identity token according to canonical_identity_v1.
 * NFKC is deliberately followed by Unicode White_Space handling, lowercase,
 * and hybrid-sign normalization in this order.
 */
export function normalizeCanonicalIdentityToken(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .normalize("NFKC")
    .trim()
    .replace(/\p{White_Space}+/gu, " ")
    .toLowerCase()
    .replace(/×/g, "x");
}

/** Normalize a rank alias, retaining an explicit rank boundary. */
export function normalizeCanonicalInfraspecificRank(value: unknown): CanonicalInfraspecificRank | "" {
  const rank = normalizeCanonicalIdentityToken(value).replace(/\.$/, "");
  if (!rank) {
    return "";
  }

  if (rank === "ssp" || rank === "subsp") {
    return "subsp";
  }
  if (rank === "var") {
    return "var";
  }
  if (rank === "f") {
    return "f";
  }

  return "";
}

/**
 * Legacy identity extraction shared by SQLite backfill and the read-only
 * audit.  Older seed rows stored an infraspecific rank in `metadata.cultivar`
 * (for example `subsp. chinensis`).  That value is taxonomy, not a cultivar:
 * the extractor promotes it to the explicit rank/name pair and clears the
 * cultivar component.  This helper is migration evidence only; normal create
 * paths still require structured fields at their public boundary.
 */
export interface LegacyCanonicalIdentityFields {
  genus: string | null;
  species: string | null;
  rank: string | null;
  infraspecificName: string | null;
  cultivar: string | null;
  scope: CanonicalScope;
  parentMasterPlantId: number | null;
  parentCanonicalKey: string | null;
  identitySource: "structured" | "scientific_name" | "missing";
}

function legacyRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || value.trim() === "") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function legacyValue(record: Record<string, unknown>, names: readonly string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(record, name)) return record[name];
  }
  return undefined;
}

function legacyText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function legacyPositiveInteger(value: unknown): number | null {
  const numeric = typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : value;
  return typeof numeric === "number" && Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

export interface LegacyScientificName {
  genus: string;
  species: string;
  rank: string | null;
  infraspecificName: string | null;
}

/** Parse only a structured scientific-name display; common names are ignored. */
export function parseLegacyScientificName(value: unknown): LegacyScientificName | null {
  if (typeof value !== "string") return null;
  const tokens = value
    .normalize("NFKC")
    .trim()
    .replace(/\p{White_Space}+/gu, " ")
    .split(" ")
    .filter(Boolean);
  if (tokens.length < 2) return null;
  let speciesIndex = 1;
  let species = tokens[1];
  if ((species === "×" || species.toLowerCase() === "x") && tokens[2]) {
    species = `${species} ${tokens[2]}`;
    speciesIndex = 2;
  }
  const rank = tokens[speciesIndex + 1];
  const infraspecificName = tokens[speciesIndex + 2];
  return {
    genus: tokens[0],
    species,
    rank: rank && infraspecificName && normalizeCanonicalInfraspecificRank(rank) ? rank : null,
    infraspecificName: rank && infraspecificName && normalizeCanonicalInfraspecificRank(rank)
      ? infraspecificName
      : null,
  };
}

function legacyRankQualifier(value: unknown): { rank: CanonicalInfraspecificRank; name: string } | null {
  const text = legacyText(value);
  if (!text) return null;
  const match = /^(subsp|ssp|var|f)\.?\s+(.+)$/iu.exec(text);
  if (!match) return null;
  const rank = normalizeCanonicalInfraspecificRank(match[1]);
  return rank ? { rank, name: match[2] } : null;
}

/** Extract deterministic legacy fields from a SQLite/Convex-shaped row. */
export function extractLegacyCanonicalIdentityFields(input: unknown): LegacyCanonicalIdentityFields {
  const row = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const metadata = legacyRecord(legacyValue(row, ["metadata_json", "metadataJson", "metadata"]));
  const directGenus = legacyValue(row, ["genus", "accepted_genus", "acceptedGenus"]);
  const directSpecies = legacyValue(row, ["species", "accepted_species", "acceptedSpecies"]);
  let genus = legacyText(directGenus) ?? legacyText(legacyValue(metadata, ["genus", "accepted_genus", "acceptedGenus"]));
  let species = legacyText(directSpecies) ?? legacyText(legacyValue(metadata, ["species", "accepted_species", "acceptedSpecies"]));
  let rank = legacyText(legacyValue(row, ["infraspecific_rank", "infraspecificRank", "rank"]))
    ?? legacyText(legacyValue(metadata, ["infraspecific_rank", "infraspecificRank", "rank"]));
  let infraspecificName = legacyText(legacyValue(row, ["infraspecific_name", "infraspecificName"]))
    ?? legacyText(legacyValue(metadata, ["infraspecific_name", "infraspecificName"]));
  let identitySource: LegacyCanonicalIdentityFields["identitySource"] = genus && species ? "structured" : "missing";
  const parsed = parseLegacyScientificName(legacyValue(row, ["scientific_name", "scientificName"]));
  if ((!genus || !species) && parsed) {
    genus = parsed.genus;
    species = parsed.species;
    rank = rank ?? parsed.rank;
    infraspecificName = infraspecificName ?? parsed.infraspecificName;
    identitySource = "scientific_name";
  }

  // The additive CID-3 columns are present as null on legacy rows.  Treat a
  // null/blank direct value as absent so the legacy metadata remains visible;
  // otherwise every old metadata cultivar would be silently discarded after
  // schema installation.
  const directCultivar = legacyValue(row, ["cultivar", "cultivar_name", "cultivarName"]);
  const cultivarRaw = legacyText(directCultivar) !== null
    ? directCultivar
    : legacyValue(metadata, ["cultivar", "cultivar_name", "cultivarName"]);
  const normalizedRaw = legacyValue(row, ["cultivar_normalized", "cultivarNormalized"])
    ?? legacyValue(metadata, ["cultivar_normalized", "cultivarNormalized"]);
  const qualifier = legacyRankQualifier(cultivarRaw) ?? (
    cultivarRaw === undefined || cultivarRaw === null ? legacyRankQualifier(normalizedRaw) : null
  );
  if (qualifier) {
    rank = rank ?? qualifier.rank;
    infraspecificName = infraspecificName ?? qualifier.name;
  }
  const rawCultivar = qualifier
    ? null
    : legacyText(cultivarRaw) ?? legacyText(normalizedRaw);
  const normalizedCultivar = rawCultivar && normalizeCanonicalIdentityToken(rawCultivar) !== "__default__"
    ? rawCultivar
    : null;

  const explicitScope = normalizeCanonicalIdentityToken(
    legacyText(legacyValue(row, ["identity_scope", "identityScope", "scope"]))
      ?? legacyText(legacyValue(metadata, ["identity_scope", "identityScope", "scope"]))
      ?? "",
  );
  const scope = explicitScope === "base" || explicitScope === "cultivar"
    ? explicitScope
    : qualifier ? "base" : normalizedCultivar ? "cultivar" : "base";
  const parentMasterPlantId = legacyPositiveInteger(
    legacyValue(row, ["parent_master_plant_id", "parentMasterPlantId", "parent_id", "parentId"])
      ?? legacyValue(metadata, ["parent_master_plant_id", "parentMasterPlantId", "parent_id", "parentId"]),
  );
  const parentCanonicalKey = legacyText(
    legacyValue(row, ["parent_canonical_key", "parentCanonicalKey", "parent_key", "parentKey"])
      ?? legacyValue(metadata, ["parent_canonical_key", "parentCanonicalKey", "parent_key", "parentKey"]),
  );
  return {
    genus,
    species,
    rank,
    infraspecificName,
    cultivar: normalizedCultivar,
    scope,
    parentMasterPlantId,
    parentCanonicalKey,
    identitySource,
  };
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function firstProvided(input: Record<string, unknown>, names: readonly string[]): unknown {
  for (const name of names) {
    if (hasOwn(input, name)) {
      return input[name];
    }
  }
  return undefined;
}

function firstProvidedString(input: Record<string, unknown>, names: readonly string[]): string | null | undefined {
  const value = firstProvided(input, names);
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? value : String(value);
}

/**
 * Accept the camelCase contract plus the snake_case spellings used by the
 * SQLite/API boundary.  Aliases are input conveniences only; output always
 * uses the canonical camelCase shape above.
 */
function readInput(input: unknown): {
  source: Record<string, unknown> | null;
  genus: unknown;
  species: unknown;
  rank: string | null | undefined;
  infraspecificName: string | null | undefined;
  cultivar: string | null | undefined;
  scope: unknown;
  parentCanonicalKey: string | null | undefined;
  parentMasterPlantId: unknown;
  parentIdentity: unknown;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      source: null,
      genus: undefined,
      species: undefined,
      rank: undefined,
      infraspecificName: undefined,
      cultivar: undefined,
      scope: undefined,
      parentCanonicalKey: undefined,
      parentMasterPlantId: undefined,
      parentIdentity: undefined,
    };
  }

  const source = input as Record<string, unknown>;
  return {
    source,
    genus: firstProvided(source, ["genus", "acceptedGenus", "accepted_genus"]),
    species: firstProvided(source, ["species", "acceptedSpecies", "accepted_species"]),
    rank: firstProvidedString(source, ["rank", "infraspecificRank", "infraspecific_rank"]),
    infraspecificName: firstProvidedString(source, [
      "infraspecificName",
      "infraspecific_name",
    ]),
    cultivar: firstProvidedString(source, ["cultivar", "cultivarName", "cultivar_name"]),
    scope: firstProvided(source, ["scope", "identityScope", "identity_scope"]),
    parentCanonicalKey: firstProvidedString(source, [
      "parentCanonicalKey",
      "parent_canonical_key",
      "parentKey",
      "parent_key",
    ]),
    parentMasterPlantId: firstProvided(source, ["parentMasterPlantId", "parent_master_plant_id"]),
    parentIdentity: firstProvided(source, ["parentIdentity", "parent_identity"]),
  };
}

function incomplete(path: string, message: string): CanonicalIdentityIssue {
  return { code: "CANONICAL_IDENTITY_INCOMPLETE", path, message };
}

function issue(
  code: Exclude<CanonicalIdentityIssueCode, "CANONICAL_IDENTITY_INCOMPLETE">,
  path: string,
  message: string,
): CanonicalIdentityIssue {
  return { code, path, message };
}

function firstIssueCode(issues: readonly CanonicalIdentityIssue[]): CanonicalIdentityIssueCode {
  return issues[0]?.code ?? "CANONICAL_IDENTITY_INCOMPLETE";
}

function canonicalTuple(
  genus: string,
  species: string,
  rank: CanonicalInfraspecificRank | "",
  infraspecificName: string,
  cultivar: string,
): CanonicalPlantIdentity["tuple"] {
  return [
    CANONICAL_IDENTITY_TUPLE_VERSION,
    genus,
    species,
    rank,
    infraspecificName,
    cultivar,
  ];
}

function parseCanonicalKey(value: string): CanonicalPlantIdentity["tuple"] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 6) {
    return null;
  }
  if (!parsed.every((part) => typeof part === "string")) {
    return null;
  }
  const [version, genus, species, rank, infraspecificName, cultivar] = parsed;
  if (
    version !== CANONICAL_IDENTITY_TUPLE_VERSION ||
    !genus ||
    !species ||
    (rank !== "" && !CANONICAL_INFRASPECIFIC_RANKS.includes(rank as CanonicalInfraspecificRank)) ||
    (Boolean(rank) !== Boolean(infraspecificName))
  ) {
    return null;
  }
  return parsed as unknown as CanonicalPlantIdentity["tuple"];
}

function compareParent(
  parent: CanonicalPlantIdentityInput,
  expected: {
    genus: string;
    species: string;
    rank: CanonicalInfraspecificRank | "";
    infraspecificName: string;
  },
): CanonicalIdentityIssue[] {
  const normalized = validateCanonicalPlantIdentity(parent);
  if (!normalized.ok) {
    return [issue("CANONICAL_IDENTITY_PARENT_INVALID", "parentIdentity", "parent identity is invalid")];
  }
  if (normalized.identity.scope !== "base" || normalized.identity.cultivar !== "") {
    return [issue("CANONICAL_IDENTITY_PARENT_SCOPE", "parentIdentity", "cultivar parent must be a base identity")];
  }
  if (
    normalized.identity.genus !== expected.genus ||
    normalized.identity.species !== expected.species ||
    normalized.identity.rank !== expected.rank ||
    normalized.identity.infraspecificName !== expected.infraspecificName
  ) {
    return [issue("CANONICAL_IDENTITY_PARENT_MISMATCH", "parentIdentity", "cultivar parent taxonomy does not match")];
  }
  return [];
}

/**
 * Validate and normalize a structured identity.  This is the non-throwing
 * boundary intended for API/import/migration validators.
 */
export function validateCanonicalPlantIdentity(input: unknown): CanonicalIdentityValidationResult {
  const values = readInput(input);
  const issues: CanonicalIdentityIssue[] = [];

  if (!values.source) {
    return {
      ok: false,
      code: "CANONICAL_IDENTITY_INCOMPLETE",
      issues: [incomplete("identity", "structured canonical identity is required")],
    };
  }

  // Missing genus/species are deliberately not repaired from scientific_name
  // or a localized common name.
  if (typeof values.genus !== "string") {
    issues.push(incomplete("genus", "genus is required as a structured field"));
  }
  if (typeof values.species !== "string") {
    issues.push(incomplete("species", "species is required as a structured field"));
  }
  if (values.scope === undefined) {
    issues.push(incomplete("scope", "scope must be explicitly 'base' or 'cultivar'"));
  }
  if (values.rank === undefined) {
    issues.push(incomplete("rank", "rank must be explicitly null or a supported rank"));
  }
  if (values.infraspecificName === undefined) {
    issues.push(incomplete("infraspecificName", "infraspecificName must be explicitly null or a value"));
  }
  if (values.cultivar === undefined) {
    issues.push(incomplete("cultivar", "cultivar must be explicitly null or a value"));
  }
  if (issues.length > 0) {
    return { ok: false, code: firstIssueCode(issues), issues };
  }

  const genus = normalizeCanonicalIdentityToken(values.genus);
  const species = normalizeCanonicalIdentityToken(values.species);
  const rankInput = values.rank === null ? "" : normalizeCanonicalIdentityToken(values.rank);
  const infraspecificName = values.infraspecificName === null
    ? ""
    : normalizeCanonicalIdentityToken(values.infraspecificName);
  const cultivar = values.cultivar === null ? "" : normalizeCanonicalIdentityToken(values.cultivar);
  const normalizedRank = normalizeCanonicalInfraspecificRank(rankInput);

  if (!genus) {
    issues.push(issue("CANONICAL_IDENTITY_INVALID_FIELD", "genus", "genus must be non-empty"));
  }
  if (!species) {
    issues.push(issue("CANONICAL_IDENTITY_INVALID_FIELD", "species", "species must be non-empty"));
  }
  if (rankInput && !normalizedRank) {
    issues.push(issue("CANONICAL_IDENTITY_INVALID_RANK", "rank", "rank must be subsp, var, or f (aliases are accepted)"));
  }
  if (Boolean(rankInput) !== Boolean(infraspecificName)) {
    issues.push(issue(
      "CANONICAL_IDENTITY_INFRASPECIFIC_PAIR",
      "infraspecificName",
      "rank and infraspecificName must both be absent or both be present",
    ));
  }

  const scope = values.scope;
  if (scope !== "base" && scope !== "cultivar") {
    issues.push(issue("CANONICAL_IDENTITY_INVALID_SCOPE", "scope", "scope must be 'base' or 'cultivar'"));
  }

  const parentCanonicalKey = values.parentCanonicalKey === null || values.parentCanonicalKey === undefined
    ? null
    : normalizeCanonicalIdentityToken(values.parentCanonicalKey);
  const parentMasterPlantId = values.parentMasterPlantId === null || values.parentMasterPlantId === undefined
    ? null
    : typeof values.parentMasterPlantId === "number" && Number.isSafeInteger(values.parentMasterPlantId)
      ? values.parentMasterPlantId
      : NaN;

  if (scope === "base") {
    if (cultivar) {
      issues.push(issue("CANONICAL_IDENTITY_INVALID_SCOPE", "cultivar", "base scope cannot carry a cultivar"));
    }
    if (parentCanonicalKey || parentMasterPlantId !== null || values.parentIdentity !== null && values.parentIdentity !== undefined) {
      issues.push(issue("CANONICAL_IDENTITY_PARENT_FORBIDDEN", "parent", "base scope cannot carry a parent"));
    }
  } else if (scope === "cultivar") {
    if (!cultivar) {
      issues.push(issue("CANONICAL_IDENTITY_PARENT_REQUIRED", "cultivar", "cultivar scope requires a non-empty cultivar"));
    }
    if (
      !parentCanonicalKey &&
      parentMasterPlantId === null &&
      (values.parentIdentity === null || values.parentIdentity === undefined)
    ) {
      issues.push(issue("CANONICAL_IDENTITY_PARENT_REQUIRED", "parent", "cultivar scope requires a base parent"));
    }
    if (Number.isNaN(parentMasterPlantId) || (typeof parentMasterPlantId === "number" && parentMasterPlantId <= 0)) {
      issues.push(issue("CANONICAL_IDENTITY_PARENT_INVALID", "parentMasterPlantId", "parentMasterPlantId must be a positive integer or null"));
    }
    if (parentCanonicalKey) {
      const parentTuple = parseCanonicalKey(parentCanonicalKey);
      if (!parentTuple || parentTuple[5] !== "") {
        issues.push(issue("CANONICAL_IDENTITY_PARENT_INVALID", "parentCanonicalKey", "parentCanonicalKey must identify a base tuple"));
      } else if (
        parentTuple[1] !== genus ||
        parentTuple[2] !== species ||
        parentTuple[3] !== normalizedRank ||
        parentTuple[4] !== infraspecificName
      ) {
        issues.push(issue("CANONICAL_IDENTITY_PARENT_MISMATCH", "parentCanonicalKey", "cultivar parent taxonomy does not match"));
      }
    }
    if (values.parentIdentity !== null && values.parentIdentity !== undefined) {
      if (!values.parentIdentity || typeof values.parentIdentity !== "object") {
        issues.push(issue("CANONICAL_IDENTITY_PARENT_INVALID", "parentIdentity", "parentIdentity must be structured"));
      } else {
        issues.push(...compareParent(values.parentIdentity as CanonicalPlantIdentityInput, {
          genus,
          species,
          rank: normalizedRank,
          infraspecificName,
        }));
      }
    }
  }

  if (issues.length > 0) {
    return { ok: false, code: firstIssueCode(issues), issues };
  }

  const tuple = canonicalTuple(genus, species, normalizedRank, infraspecificName, cultivar);
  const canonicalKey = JSON.stringify(tuple);
  const identity: CanonicalPlantIdentity = {
    identityVersion: CANONICAL_IDENTITY_VERSION,
    tupleVersion: CANONICAL_IDENTITY_TUPLE_VERSION,
    genus,
    species,
    rank: normalizedRank,
    infraspecificName,
    cultivar,
    scope: scope as CanonicalScope,
    canonicalKey,
    tuple,
    parentCanonicalKey,
    parentMasterPlantId: parentMasterPlantId === null ? null : parentMasterPlantId,
  };

  return { ok: true, identity, canonicalKey, issues: [] };
}

/** Throwing convenience for code paths that require a valid identity. */
export function normalizeCanonicalPlantIdentity(input: unknown): CanonicalPlantIdentity {
  const result = validateCanonicalPlantIdentity(input);
  if (!result.ok) {
    throw new CanonicalIdentityValidationError(result);
  }
  return result.identity;
}

/** Return the exact JSON six-tuple key, or throw a structured validation error. */
export function canonicalKeyFromPlantIdentity(input: unknown): string {
  return normalizeCanonicalPlantIdentity(input).canonicalKey;
}

/** Short aliases used by API/tooling call sites. */
export const canonicalIdentityV1 = normalizeCanonicalPlantIdentity;
export const canonicalKeyV1 = canonicalKeyFromPlantIdentity;
export const validateCanonicalIdentity = validateCanonicalPlantIdentity;
