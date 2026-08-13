/**
 * careContentLegacy.ts
 *
 * Temporary legacy converter for localized care content.
 *
 * Used ONLY by migration and compatibility reads (plan: "a temporary legacy
 * converter used only by migration and compatibility reads; it must not remain
 * in the normal write path"). Converts the legacy structured care JSON shapes
 * stored in `master_plant_i18n.care_content_json` / Convex
 * `plantCareI18n.careContent` into canonical Markdown:
 *
 * - `{ "text": string }` → the string itself, byte-for-byte (authored
 *   free-form content produced by the old dashboard fallback).
 * - A section object → localized Markdown headings, `intro` as a paragraph,
 *   `items[]` as bullets, preserving section order and any Markdown already
 *   present inside intro/items.
 * - Anything else (malformed JSON, arrays, scalars, unknown keys) →
 *   `unsupported`, so the caller records it in a migration report and leaves
 *   `care_content` unset rather than inventing prose.
 */

/** Known legacy care section keys and their localized headings. */
export const CARE_SECTION_LABELS: Record<string, Record<string, string>> = {
  en: {
    watering: "Watering",
    fertilizing: "Fertilizing",
    location: "Location & light",
    soil: "Soil",
    nutrition: "Nutrition",
    propagation: "Propagation",
    temperature: "Temperature",
    toxicity: "Safety",
  },
  vi: {
    watering: "Tưới nước",
    fertilizing: "Bón phân",
    location: "Vị trí & ánh sáng",
    soil: "Đất trồng",
    nutrition: "Dinh dưỡng",
    propagation: "Nhân giống",
    temperature: "Nhiệt độ",
    toxicity: "An toàn",
  },
};

const KNOWN_SECTION_KEYS = new Set([
  "watering",
  "fertilizing",
  "location",
  "soil",
  "nutrition",
  "propagation",
  "temperature",
  "toxicity",
]);

export type LegacyCareConversion =
  | { kind: "markdown"; markdown: string }
  | { kind: "empty" }
  | { kind: "unsupported"; reason: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * True when the parsed value is the system-produced legacy dashboard fallback
 * shape `{ "text": string }` (authored free-form content).
 */
export function isLegacyTextShape(value: unknown): value is { text: string } {
  return (
    isPlainObject(value) &&
    Object.keys(value).length === 1 &&
    typeof value.text === "string"
  );
}

function sectionHeading(key: string, locale: string): string {
  const labelsForLocale = CARE_SECTION_LABELS[locale] ?? CARE_SECTION_LABELS.en;
  return labelsForLocale[key] ?? CARE_SECTION_LABELS.en[key] ?? key;
}

/** Convert an already-parsed legacy value into Markdown. */
export function legacyCareObjectToMarkdown(
  value: unknown,
  locale: string,
): LegacyCareConversion {
  if (!isPlainObject(value)) {
    return { kind: "unsupported", reason: "not a plain object" };
  }

  const keys = Object.keys(value);

  // System-produced legacy shape from the dashboard fallback: { "text": string }.
  if (keys.length === 1 && keys[0] === "text" && typeof value.text === "string") {
    return { kind: "markdown", markdown: value.text };
  }

  if (keys.length === 0) {
    return { kind: "empty" };
  }

  // Section object: every key must be a known section key.
  const unknownKeys = keys.filter((key) => !KNOWN_SECTION_KEYS.has(key));
  if (unknownKeys.length > 0) {
    return {
      kind: "unsupported",
      reason: `unknown section key(s): ${unknownKeys.join(", ")}`,
    };
  }

  const blocks: string[] = [];
  for (const key of keys) {
    const section = value[key];
    if (!isPlainObject(section)) {
      return {
        kind: "unsupported",
        reason: `section "${key}" is not an object`,
      };
    }
    const intro = typeof section.intro === "string" ? section.intro.trim() : "";
    const items = Array.isArray(section.items)
      ? section.items.filter((item): item is string => typeof item === "string")
      : [];
    if (items.length !== (Array.isArray(section.items) ? section.items.length : 0)) {
      return {
        kind: "unsupported",
        reason: `section "${key}" contains non-string items`,
      };
    }
    if (!intro && items.length === 0) {
      continue;
    }
    const lines = [`## ${sectionHeading(key, locale)}`];
    if (intro) {
      lines.push("", intro);
    }
    if (items.length > 0) {
      lines.push("", ...items.map((item) => `- ${item}`));
    }
    blocks.push(lines.join("\n"));
  }

  if (blocks.length === 0) {
    return { kind: "empty" };
  }
  return { kind: "markdown", markdown: blocks.join("\n\n") };
}

/** Parse a stored JSON string and convert it into Markdown. */
export function legacyCareJsonToMarkdown(
  raw: string | null | undefined,
  locale: string,
): LegacyCareConversion {
  if (raw === null || raw === undefined || raw.trim() === "" || raw.trim() === "{}") {
    return { kind: "empty" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "unsupported", reason: "malformed JSON" };
  }
  return legacyCareObjectToMarkdown(parsed, locale);
}
