// Phase 3.1 care-status contract, shared by the Convex layer and the API/SQLite
// mirror so the record-level aggregate is computed with one implementation.

export const CARE_STATUSES = [
  "missing",
  "awaiting_review",
  "verified",
  "not_applicable",
] as const;
export type CareStatus = (typeof CARE_STATUSES)[number];

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
  sourceUrl?: string;
  sourceLocator?: string;
  fetchedAt?: number;
  reviewedAt?: number;
  reviewedBy?: string;
};

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
