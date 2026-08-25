/**
 * Canonical runtime projection for pest/disease detail pages.
 *
 * The base issue is intentionally kept separate from localized Markdown. A
 * locale row is selected exactly first, then English; a different issue is
 * never used as a fallback. Unpublished/archived Markdown remains visible in
 * the projection metadata for admin/readback callers but is withheld from the
 * user-facing detailContent field.
 */

export type PestDiseaseLocalizedRow = {
  pestDiseaseKey: string;
  locale: string;
  name: string;
  description?: string;
  detailContent: string;
  contentVersion?: number;
  contentStatus?: "draft" | "published" | "needs_review" | "archived";
  reviewStatus?: "unreviewed" | "in_review" | "reviewed";
  contentOrigin?: "authored" | "inherited" | "imported";
  contentHash?: string;
  contentByteLength?: number;
  sourceRefs?: Array<{
    sourceSystem?: string;
    sourceName?: string;
    sourceUrl?: string;
    sourceLocator?: string;
  }>;
  reviewedAt?: number;
  reviewedBy?: string;
};

export type PestDiseaseBaseRow = {
  key: string;
  type: string;
  name: string;
  commonNameVi?: string;
  scientificNames?: string[];
  plantKeys?: string[];
  imageUrl?: string;
  identification: string[];
  damage: string[];
  prevention: string[];
  control: {
    physical: string[];
    organic: string[];
    chemical: string[];
  };
  plantsAffected: string[];
  sortOrder: number;
};

export type PestDiseaseDetailProjection = Omit<PestDiseaseBaseRow, "commonNameVi" | "scientificNames" | "plantKeys" | "imageUrl"> & {
  commonNameVi: string | null;
  scientificNames: string[];
  plantKeys: string[];
  imageUrl: string | null;
  detailLocale: string | null;
  localizedName: string;
  description: string | null;
  detailContent: string | null;
  contentVersion: number | null;
  contentStatus: "draft" | "published" | "needs_review" | "archived" | null;
  reviewStatus: "unreviewed" | "in_review" | "reviewed" | null;
  contentOrigin: "authored" | "inherited" | "imported" | null;
  contentHash: string | null;
  contentByteLength: number | null;
  sourceRefs: NonNullable<PestDiseaseLocalizedRow["sourceRefs"]>;
  reviewedAt: number | null;
  reviewedBy: string | null;
};

export function normalizePestDiseaseLocale(value: string): string {
  return value.trim().toLowerCase();
}

/** Select exact locale first, then English, without a cross-issue fallback. */
export function selectPestDiseaseLocale(
  rows: readonly PestDiseaseLocalizedRow[],
  locale: string,
): PestDiseaseLocalizedRow | null {
  const requested = normalizePestDiseaseLocale(locale);
  const exact = rows.find((row) => normalizePestDiseaseLocale(row.locale) === requested);
  if (exact) return exact;
  return rows.find((row) => normalizePestDiseaseLocale(row.locale) === "en") ?? null;
}

export function projectPestDisease(
  base: PestDiseaseBaseRow,
  localized: PestDiseaseLocalizedRow | null,
): PestDiseaseDetailProjection {
  const published = localized?.contentStatus === "published";
  return {
    ...base,
    commonNameVi: base.commonNameVi ?? null,
    scientificNames: base.scientificNames ?? [],
    plantKeys: base.plantKeys ?? [],
    imageUrl: base.imageUrl ?? null,
    detailLocale: localized?.locale ?? null,
    localizedName: localized?.name || base.name,
    description: localized?.description ?? null,
    detailContent: published ? localized?.detailContent ?? null : null,
    contentVersion: localized?.contentVersion ?? null,
    contentStatus: localized?.contentStatus ?? null,
    reviewStatus: localized?.reviewStatus ?? null,
    contentOrigin: localized?.contentOrigin ?? null,
    contentHash: localized?.contentHash ?? null,
    contentByteLength: localized?.contentByteLength ?? null,
    sourceRefs: localized?.sourceRefs ?? [],
    reviewedAt: localized?.reviewedAt ?? null,
    reviewedBy: localized?.reviewedBy ?? null,
  };
}
