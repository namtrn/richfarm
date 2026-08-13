/**
 * Canonical adaptation-vocabulary contract (design doc §5, source plan §6).
 *
 * Terms are the plant-level suitability signals: each belongs to exactly one
 * dimension, codes are language-neutral immutable machine identifiers, and
 * labels/definitions are the localized display strings carried here so API,
 * Convex, dashboard, and mobile render the same vocabulary.
 *
 * Publication rule: a term may only be set `active` once it has both a vi and
 * an en label — the catalog below always satisfies this by construction.
 * `hot_humid`-style combined terms are prohibited (combine independent
 * dimensions instead); editors cannot create free-form assignments.
 */
export const ADAPTATION_DIMENSIONS = ["temperature", "moisture", "climate", "season"] as const;
export type AdaptationDimension = (typeof ADAPTATION_DIMENSIONS)[number];

export interface AdaptationTerm {
  code: string;
  dimension: AdaptationDimension;
  labelVi: string;
  labelEn: string;
  definitionVi: string;
  definitionEn: string;
}

export const ADAPTATION_TERMS = [
  // temperature
  { code: "cool", dimension: "temperature", labelVi: "Mát", labelEn: "Cool", definitionVi: "Thích hợp với điều kiện mát, nhiệt độ thấp hơn ôn hòa; sinh trưởng chậm hơn khi nắng nóng kéo dài.", definitionEn: "Suited to cool conditions with lower temperatures; growth slows during extended heat." },
  { code: "mild", dimension: "temperature", labelVi: "Ôn hòa", labelEn: "Mild", definitionVi: "Thích hợp với nhiệt độ trung bình, không quá nóng hoặc quá lạnh.", definitionEn: "Suited to moderate temperatures, neither very hot nor very cold." },
  { code: "warm", dimension: "temperature", labelVi: "Ấm", labelEn: "Warm", definitionVi: "Thích hợp với nhiệt độ ấm, trên mức ôn hòa nhưng chưa đến mức nóng gay gắt.", definitionEn: "Suited to warm temperatures above mild but below intense heat." },
  { code: "hot", dimension: "temperature", labelVi: "Nóng", labelEn: "Hot", definitionVi: "Thích hợp với nhiệt độ cao, sinh trưởng tốt trong mùa nóng.", definitionEn: "Suited to high temperatures; performs well in hot seasons." },
  // moisture
  { code: "dry", dimension: "moisture", labelVi: "Khô", labelEn: "Dry", definitionVi: "Chịu được điều kiện khô, ít nước; không ưa đất ngập úng.", definitionEn: "Tolerates dry conditions and low water; dislikes waterlogging." },
  { code: "moderate", dimension: "moisture", labelVi: "Vừa phải", labelEn: "Moderate", definitionVi: "Cần độ ẩm trung bình, đất ẩm đều nhưng không quá ướt.", definitionEn: "Needs average moisture: evenly damp soil without waterlogging." },
  { code: "humid", dimension: "moisture", labelVi: "Ẩm", labelEn: "Humid", definitionVi: "Thích hợp với độ ẩm không khí và đất cao.", definitionEn: "Suited to high air and soil moisture." },
  // climate
  { code: "tropical", dimension: "climate", labelVi: "Nhiệt đới", labelEn: "Tropical", definitionVi: "Thích hợp với khí hậu nhiệt đới nóng ẩm quanh năm.", definitionEn: "Suited to hot, humid tropical climates year-round." },
  { code: "subtropical", dimension: "climate", labelVi: "Cận nhiệt đới", labelEn: "Subtropical", definitionVi: "Thích hợp với khí hậu cận nhiệt đới, mùa hè nóng và mùa đông ôn hòa.", definitionEn: "Suited to subtropical climates with hot summers and mild winters." },
  { code: "temperate", dimension: "climate", labelVi: "Ôn đới", labelEn: "Temperate", definitionVi: "Thích hợp với khí hậu ôn đới, bốn mùa rõ rệt.", definitionEn: "Suited to temperate climates with distinct seasons." },
  // season
  { code: "short_season", dimension: "season", labelVi: "Vụ ngắn", labelEn: "Short season", definitionVi: "Hoàn thành vòng đời trong thời gian ngắn, phù hợp vụ gối hoặc vụ ngắn ngày.", definitionEn: "Completes its cycle quickly; suits short or succession plantings." },
  { code: "long_season", dimension: "season", labelVi: "Vụ dài", labelEn: "Long season", definitionVi: "Cần thời gian sinh trưởng dài để đạt năng suất tốt nhất.", definitionEn: "Needs a long growing period for best yield." },
  { code: "frost_free", dimension: "season", labelVi: "Không sương giá", labelEn: "Frost-free", definitionVi: "Nhạy cảm với sương giá; cần trồng trong mùa không sương.", definitionEn: "Sensitive to frost; plant only in frost-free periods." },
] as const satisfies readonly AdaptationTerm[];

export type AdaptationTermCode = (typeof ADAPTATION_TERMS)[number]["code"];

const TERM_BY_CODE: ReadonlyMap<string, AdaptationTerm> = new Map(
  ADAPTATION_TERMS.map((term) => [term.code, term]),
);
const DIMENSION_SET: ReadonlySet<string> = new Set(ADAPTATION_DIMENSIONS);

/** Multi-word codes permitted by the catalog; anything else with `_` is a prohibited combined term. */
const ALLOWED_MULTI_WORD_CODES: ReadonlySet<string> = new Set([
  "short_season",
  "long_season",
  "frost_free",
]);

export function isAdaptationDimension(value: unknown): value is AdaptationDimension {
  return typeof value === "string" && DIMENSION_SET.has(value);
}

export function isAdaptationTerm(value: unknown): value is AdaptationTermCode {
  return typeof value === "string" && TERM_BY_CODE.has(value);
}

export function getAdaptationTerm(code: string): AdaptationTerm | undefined {
  return TERM_BY_CODE.get(code);
}

/** All terms, optionally scoped to one dimension (design doc §5 order preserved). */
export function listAdaptationTerms(dimension?: AdaptationDimension): readonly AdaptationTerm[] {
  if (dimension === undefined) return ADAPTATION_TERMS;
  return ADAPTATION_TERMS.filter((term) => term.dimension === dimension);
}

/**
 * Localized term label with the same fallback chain as country names:
 * requested locale → English → the code itself. Never returns an empty string.
 */
export function adaptationTermLabel(code: string, locale?: string): string {
  const term = TERM_BY_CODE.get(code);
  if (!term) return code;
  const normalized = String(locale ?? "en").split("-")[0].toLowerCase();
  if (normalized === "vi") return term.labelVi;
  return term.labelEn;
}

export function adaptationTermDefinition(code: string, locale?: string): string {
  const term = TERM_BY_CODE.get(code);
  if (!term) return "";
  const normalized = String(locale ?? "en").split("-")[0].toLowerCase();
  if (normalized === "vi") return term.definitionVi;
  return term.definitionEn;
}

/**
 * Canonicalize a persisted or user-supplied term-code list (mirrors
 * `normalizePropagationMethods`): unknown codes are dropped at read
 * boundaries, first occurrence wins, `[]`/missing collapses to `undefined`.
 */
export function normalizeAdaptationTermCodes(value: unknown): AdaptationTermCode[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<AdaptationTermCode>();
  const normalized: AdaptationTermCode[] = [];
  for (const candidate of value) {
    if (!isAdaptationTerm(candidate) || seen.has(candidate)) continue;
    seen.add(candidate);
    normalized.push(candidate);
  }
  return normalized.length > 0 ? normalized : undefined;
}

/** Strict helper for write validators that must reject, rather than filter. */
export function assertAdaptationTermCodes(value: unknown): AdaptationTermCode[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error("adaptationTermCodes must be an array");
  for (const candidate of value) {
    if (!isAdaptationTerm(candidate)) {
      throw new Error(`Invalid adaptation term code: ${String(candidate)}`);
    }
  }
  return normalizeAdaptationTermCodes(value);
}

export { ALLOWED_MULTI_WORD_CODES };
