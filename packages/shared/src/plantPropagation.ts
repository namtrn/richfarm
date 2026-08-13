/**
 * Canonical propagation-method contract shared by API, Convex, dashboard, and
 * mobile. Values are intentionally language-neutral; consumers resolve labels
 * through their own i18n layer.
 */
export const PROPAGATION_METHODS = [
  "seed",
  "stem_cutting",
  "leaf_cutting",
  "root_cutting",
  "division",
  "air_layering",
  "ground_layering",
  "grafting",
  "budding",
  "bulb",
  "corm",
  "tuber",
  "rhizome",
  "runner",
  "offset",
  "sucker",
  "spore",
  "tissue_culture",
] as const;

export type PropagationMethod = (typeof PROPAGATION_METHODS)[number];

const PROPAGATION_METHOD_SET: ReadonlySet<string> = new Set(PROPAGATION_METHODS);

/** Stable i18n key for each canonical enum value. */
export const PROPAGATION_METHOD_LABEL_KEYS: Record<PropagationMethod, string> =
  Object.fromEntries(
    PROPAGATION_METHODS.map((method) => [method, `library.propagation_method_${method}`]),
  ) as Record<PropagationMethod, string>;

export function isPropagationMethod(value: unknown): value is PropagationMethod {
  return typeof value === "string" && PROPAGATION_METHOD_SET.has(value);
}
/**
 * Canonicalize a persisted or user-supplied list.
 *
 * Unknown values are ignored at this boundary so legacy rows can still be
 * read safely; API/Convex write validators reject them before persistence.
 * The first occurrence wins and an empty/invalid list is represented as
 * `undefined` everywhere, avoiding `[]`/missing projection drift.
 */
export function normalizePropagationMethods(value: unknown): PropagationMethod[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<PropagationMethod>();
  const normalized: PropagationMethod[] = [];
  for (const candidate of value) {
    if (!isPropagationMethod(candidate) || seen.has(candidate)) continue;
    seen.add(candidate);
    normalized.push(candidate);
  }
  return normalized.length > 0 ? normalized : undefined;
}

/** Strict helper for callers that need to validate, rather than filter. */
export function assertPropagationMethods(value: unknown): PropagationMethod[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error("propagationMethods must be an array");
  for (const candidate of value) {
    if (!isPropagationMethod(candidate)) {
      throw new Error(`Invalid propagation method: ${String(candidate)}`);
    }
  }
  return normalizePropagationMethods(value);
}
