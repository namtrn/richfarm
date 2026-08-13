// Shared country-code utility: the single source of localized country names.
// Fallback chain (source plan §8): requested locale → English → machine code.
// The code itself is the last-resort dashboard safety fallback, never a label
// authored per locale.

import { COUNTRIES, type CountryInfo } from "./data/countries";

export { COUNTRIES, type CountryInfo };

export const SUPPORTED_COUNTRY_LOCALES = ["vi", "en"] as const;
export type CountryLocale = (typeof SUPPORTED_COUNTRY_LOCALES)[number];

const byCode = new Map<string, CountryInfo>(COUNTRIES.map((country) => [country.code, country]));

/** Strict ISO 3166-1 alpha-2 membership check (uppercase, in catalog). */
export function isValidCountryCode(code: string): boolean {
  return typeof code === "string" && /^[A-Z]{2}$/.test(code) && byCode.has(code);
}

/**
 * Localized country name. Unknown codes and unknown locales resolve safely:
 * requested locale → "en" → the code itself. Never returns an empty string.
 */
export function countryName(code: string, locale?: string): string {
  const country = byCode.get(code);
  if (!country) return code;
  const normalized = String(locale ?? "en").split("-")[0].toLowerCase();
  if (normalized === "vi") return country.nameVi;
  return country.nameEn;
}

export function listCountries(locale?: string): Array<{ code: string; name: string }> {
  return COUNTRIES.map((country) => ({
    code: country.code,
    name: countryName(country.code, locale),
  }));
}

/** Term-code shape used by plant assignments and taxonomy management. */
export const TERM_CODE_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

/** Subdivision codes are format-validated only until an ISO 3166-2 catalog is added. */
export const SUBDIVISION_CODE_PATTERN = /^[A-Z0-9]{1,6}$/;
