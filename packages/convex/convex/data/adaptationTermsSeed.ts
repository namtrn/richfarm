// RichFarm — Adaptation taxonomy seed (design doc §2.4/§5, source plan §6)
// Convex remains the authoritative term store; the SQLite mirror is hydrated
// from `plantAdmin:listAdaptationTerms`. Seeding is idempotent by code.
import { ADAPTATION_TERMS, ADAPTATION_DIMENSIONS } from "../../../shared/src/adaptationTerms";

export interface AdaptationTermSeedEntry {
  code: string;
  dimension: string;
  status: "active" | "archived";
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface AdaptationTermI18nSeedEntry {
  termCode: string;
  locale: string;
  label: string;
  description: string;
  translationStatus: string;
  updatedAt: number;
}

// Fixed timestamp so repeated seeds are byte-stable.
const SEED_UPDATED_AT = 1786492800000;

const dimensionOrder = new Map<string, number>(ADAPTATION_DIMENSIONS.map((dimension, index) => [dimension, index]));
const withinDimension = new Map<string, number>();

export const adaptationTermsSeed: AdaptationTermSeedEntry[] = ADAPTATION_TERMS.map((term) => {
  const position = withinDimension.get(term.dimension) ?? 0;
  withinDimension.set(term.dimension, position + 1);
  return {
    code: term.code,
    dimension: term.dimension,
    status: "active",
    sortOrder: dimensionOrder.get(term.dimension)! * 100 + position,
    createdAt: SEED_UPDATED_AT,
    updatedAt: SEED_UPDATED_AT,
  };
});

export const adaptationTermI18nSeed: AdaptationTermI18nSeedEntry[] = ADAPTATION_TERMS.flatMap((term) => [
  {
    termCode: term.code,
    locale: "vi",
    label: term.labelVi,
    description: term.definitionVi,
    translationStatus: "human_reviewed",
    updatedAt: SEED_UPDATED_AT,
  },
  {
    termCode: term.code,
    locale: "en",
    label: term.labelEn,
    description: term.definitionEn,
    translationStatus: "human_reviewed",
    updatedAt: SEED_UPDATED_AT,
  },
]);
