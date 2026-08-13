// Phase 3.1 care-status contract, shared by the Convex layer and the API/SQLite
// mirror so the record-level aggregate is computed with one implementation.

export const CARE_STATUSES = [
  "missing",
  "awaiting_review",
  "verified",
  "not_applicable",
] as const;
export type CareStatus = (typeof CARE_STATUSES)[number];

export type CareSourceRef = {
  sourceSystem?: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceLocator?: string;
};

export const CONTENT_ORIGINS = ["authored", "inherited", "imported"] as const;
export type ContentOrigin = (typeof CONTENT_ORIGINS)[number];

// Key that marks the whole care profile as genuinely not applicable.
export const PROFILE_EVIDENCE_KEY = "__profile__";

// Required care fields for full-detail content. These are the fields mobile
// care plans and reminders consume; evidence/review must cover all of them
// before a record can reach careStatus=verified.
export const REQUIRED_CARE_FIELDS = [
  "wateringFrequencyDays",
  "fertilizingFrequencyDays",
  "lightRequirements",
  "lightHours",
  "soilPhMin",
  "soilPhMax",
  "moistureTarget",
  "typicalDaysToHarvest",
  "germinationDays",
] as const;
export type RequiredCareField = (typeof REQUIRED_CARE_FIELDS)[number];

export type CareFieldEvidence = {
  status: CareStatus;
  sourceSystem?: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceLocator?: string;
  sourceRefs?: CareSourceRef[];
  fetchedAt?: number;
  reviewedAt?: number;
  reviewedBy?: string;
};

/**
 * Read both the current multi-source shape and the legacy single-source
 * fields. Legacy fields are retained on the returned object for compatibility,
 * while `sourceRefs` is always the canonical projection when any source data
 * exists.
 */
export function normalizeCareFieldEvidence(value: unknown): CareFieldEvidence | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const status = input.status;
  if (typeof status !== "string" || !CARE_STATUSES.includes(status as CareStatus)) return undefined;

  const refs: CareSourceRef[] = [];
  if (Array.isArray(input.sourceRefs)) {
    for (const candidate of input.sourceRefs) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const source = candidate as Record<string, unknown>;
      const ref: CareSourceRef = {
        ...(typeof source.sourceSystem === "string" && source.sourceSystem.trim()
          ? { sourceSystem: source.sourceSystem.trim() }
          : {}),
        ...(typeof source.sourceName === "string" && source.sourceName.trim()
          ? { sourceName: source.sourceName.trim() }
          : {}),
        ...(typeof source.sourceUrl === "string" && source.sourceUrl.trim()
          ? { sourceUrl: source.sourceUrl.trim() }
          : {}),
        ...(typeof source.sourceLocator === "string" && source.sourceLocator.trim()
          ? { sourceLocator: source.sourceLocator.trim() }
          : {}),
      };
      if (Object.keys(ref).length > 0) refs.push(ref);
    }
  }
  const legacyRef: CareSourceRef = {
    ...(typeof input.sourceSystem === "string" && input.sourceSystem.trim()
      ? { sourceSystem: input.sourceSystem.trim() }
      : {}),
    ...(typeof input.sourceName === "string" && input.sourceName.trim()
      ? { sourceName: input.sourceName.trim() }
      : {}),
    ...(typeof input.sourceUrl === "string" && input.sourceUrl.trim()
      ? { sourceUrl: input.sourceUrl.trim() }
      : {}),
    ...(typeof input.sourceLocator === "string" && input.sourceLocator.trim()
      ? { sourceLocator: input.sourceLocator.trim() }
      : {}),
  };
  if (Object.keys(legacyRef).length > 0 && refs.length === 0) refs.push(legacyRef);

  const normalized: CareFieldEvidence = {
    status: status as CareStatus,
    ...(typeof input.sourceSystem === "string" ? { sourceSystem: input.sourceSystem } : {}),
    ...(typeof input.sourceName === "string" ? { sourceName: input.sourceName } : {}),
    ...(typeof input.sourceUrl === "string" ? { sourceUrl: input.sourceUrl } : {}),
    ...(typeof input.sourceLocator === "string" ? { sourceLocator: input.sourceLocator } : {}),
    ...(refs.length > 0 ? { sourceRefs: refs } : {}),
    ...(typeof input.fetchedAt === "number" ? { fetchedAt: input.fetchedAt } : {}),
    ...(typeof input.reviewedAt === "number" ? { reviewedAt: input.reviewedAt } : {}),
    ...(typeof input.reviewedBy === "string" ? { reviewedBy: input.reviewedBy } : {}),
  };
  return normalized;
}

/** Project a single-source legacy evidence shape into canonical source refs. */
export function careFieldEvidenceSourceRefs(value: unknown): CareSourceRef[] | undefined {
  return normalizeCareFieldEvidence(value)?.sourceRefs;
}

/**
 * Derive the record-level careStatus from a care profile and its per-field
 * evidence. Resolution order (locked in Giai đoạn 0):
 *   1. No care profile at all                      -> missing
 *   2. Whole profile explicitly not applicable      -> not_applicable
 *   3. Any required field missing/awaiting_review   -> awaiting_review
 *   4. Every required field verified or n/a         -> verified
 * A required field is resolved when its evidence status is `verified` with a
 * value present, or when the field is explicitly `not_applicable`.
 */
export function recomputeCareStatus(
  profile: { [field: string]: unknown } | null | undefined,
  fieldEvidence?: Record<string, CareFieldEvidence>,
): CareStatus {
  if (!profile) return "missing";
  const evidence = fieldEvidence ?? {};
  if (evidence[PROFILE_EVIDENCE_KEY]?.status === "not_applicable") return "not_applicable";

  for (const field of REQUIRED_CARE_FIELDS) {
    const fieldStatus = evidence[field]?.status;
    if (fieldStatus === "not_applicable") continue;
    if (fieldStatus === "verified") {
      const value = profile[field];
      if (value !== undefined && value !== null && value !== "") continue;
    }
    // Any unresolved required field keeps the record waiting for review.
    return "awaiting_review";
  }
  return "verified";
}
