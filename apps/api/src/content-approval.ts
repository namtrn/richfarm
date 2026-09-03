type AuthoringRecord = Record<string, unknown>;

const APPROVAL_FIELDS = [
  "content_status",
  "review_status",
  "reviewed_at",
  "reviewed_by",
] as const;

function hasOwn(record: AuthoringRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function normalizeCareContent(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function markNeedsReview(record: AuthoringRecord): void {
  record.content_status = "needs_review";
  record.review_status = "unreviewed";
  record.reviewed_at = null;
  record.reviewed_by = null;
}

function restoreApprovalMetadata(record: AuthoringRecord, previous: AuthoringRecord): void {
  record.content_status = previous.content_status;
  record.review_status = previous.review_status;
  record.reviewed_at = previous.reviewed_at ?? null;
  record.reviewed_by = previous.reviewed_by ?? null;
}

function removeApprovalMetadata(record: AuthoringRecord): void {
  for (const field of APPROVAL_FIELDS) delete record[field];
}

/**
 * Sanitize an HTTP authoring write. Approval metadata is operational state,
 * not authored content: only the review service may create or change it.
 * Editing care content always returns the locale to the review queue.
 */
export function sanitizeAuthoringLocale(
  payload: AuthoringRecord,
  previous?: AuthoringRecord,
): { payload: AuthoringRecord; careChanged: boolean } {
  const next = { ...payload };
  const careProvided = hasOwn(payload, "care_content");
  const careChanged = careProvided &&
    normalizeCareContent(payload.care_content) !== normalizeCareContent(previous?.care_content);

  if (previous) {
    if (careChanged) markNeedsReview(next);
    else restoreApprovalMetadata(next, previous);
  } else if (careProvided && normalizeCareContent(payload.care_content) !== null) {
    markNeedsReview(next);
  } else {
    removeApprovalMetadata(next);
  }

  return { payload: next, careChanged };
}

function asRecord(value: unknown): AuthoringRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as AuthoringRecord
    : undefined;
}

/**
 * Apply the same boundary to the full master-plant HTTP writer. The returned
 * flag lets callers preserve approved metadata for unrelated edits while
 * forcing a fresh approval whenever a care locale changes.
 */
export function sanitizeAuthoringPlantPayload(
  payload: AuthoringRecord,
  previous?: AuthoringRecord,
): { payload: AuthoringRecord; careChanged: boolean } {
  const next = { ...payload };
  let careChanged = false;
  const nextI18n = asRecord(payload.i18n);
  const previousI18n = asRecord(previous?.i18n);

  if (nextI18n) {
    const sanitizedI18n: Record<string, AuthoringRecord> = {};
    for (const [locale, rawRow] of Object.entries(nextI18n)) {
      const row = asRecord(rawRow) ?? {};
      const result = sanitizeAuthoringLocale(row, asRecord(previousI18n?.[locale]));
      sanitizedI18n[locale] = result.payload;
      careChanged ||= result.careChanged;
    }
    next.i18n = sanitizedI18n;
  }

  if (previous) {
    if (careChanged) markNeedsReview(next);
    else restoreApprovalMetadata(next, previous);
  } else if (careChanged) {
    markNeedsReview(next);
  } else {
    removeApprovalMetadata(next);
  }

  return { payload: next, careChanged };
}
