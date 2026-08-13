import { describe, expect, it } from "vitest";

import {
  COUNTRIES,
  SUPPORTED_COUNTRY_LOCALES,
  SUBDIVISION_CODE_PATTERN,
  TERM_CODE_PATTERN,
  countryName,
  isValidCountryCode,
  listCountries,
} from "./countries";

describe("country catalog", () => {
  it("contains the full ISO 3166-1 alpha-2 set with unique uppercase codes", () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(249);
    const codes = COUNTRIES.map((country) => country.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => /^[A-Z]{2}$/.test(code))).toBe(true);
  });

  it("has non-empty Vietnamese and English names for every code", () => {
    for (const country of COUNTRIES) {
      expect(country.nameVi.trim(), country.code).toBeTruthy();
      expect(country.nameEn.trim(), country.code).toBeTruthy();
    }
  });

  it("covers the pilot-relevant codes", () => {
    for (const code of ["VN", "US", "AU", "TH", "JP"]) {
      expect(isValidCountryCode(code)).toBe(true);
    }
    expect(COUNTRIES.find((c) => c.code === "VN")?.nameVi).toBe("Việt Nam");
    expect(COUNTRIES.find((c) => c.code === "US")?.nameVi).toBe("Hoa Kỳ");
  });
});

describe("isValidCountryCode", () => {
  it("accepts catalog members and rejects unknown or malformed codes", () => {
    expect(isValidCountryCode("VN")).toBe(true);
    expect(isValidCountryCode("XX")).toBe(false);
    expect(isValidCountryCode("vn")).toBe(false);
    expect(isValidCountryCode("V")).toBe(false);
    expect(isValidCountryCode("VNM")).toBe(false);
    expect(isValidCountryCode("")).toBe(false);
  });
});

describe("countryName fallback chain", () => {
  it("returns Vietnamese and English names for the active locales", () => {
    expect(countryName("VN", "vi")).toBe("Việt Nam");
    expect(countryName("VN", "en")).toBe("Viet Nam");
    expect(countryName("AU", "vi")).toBe("Úc");
    expect(countryName("AU", "en")).toBe("Australia");
  });

  it("normalizes locale prefixes and falls back to English for unknown locales", () => {
    expect(countryName("VN", "vi-VN")).toBe("Việt Nam");
    expect(countryName("VN", "es")).toBe("Viet Nam");
    expect(countryName("VN", "")).toBe("Viet Nam");
    expect(countryName("VN")).toBe("Viet Nam");
  });

  it("never returns an empty string; unknown codes resolve to the code itself", () => {
    expect(countryName("XX", "vi")).toBe("XX");
    expect(countryName("XX", "en")).toBe("XX");
    for (const country of COUNTRIES) {
      expect(countryName(country.code, "vi").length).toBeGreaterThan(0);
    }
  });
});

describe("listCountries", () => {
  it("returns the full catalog localized for a locale", () => {
    const vi = listCountries("vi");
    const en = listCountries("en");
    expect(vi).toHaveLength(COUNTRIES.length);
    expect(en).toHaveLength(COUNTRIES.length);
    expect(vi.find((c) => c.code === "VN")?.name).toBe("Việt Nam");
    expect(en.find((c) => c.code === "VN")?.name).toBe("Viet Nam");
  });

  it("supports exactly vi and en for content", () => {
    expect(SUPPORTED_COUNTRY_LOCALES).toEqual(["vi", "en"]);
  });
});

describe("code patterns", () => {
  it("validates term-code shape", () => {
    expect(TERM_CODE_PATTERN.test("hot")).toBe(true);
    expect(TERM_CODE_PATTERN.test("frost_free")).toBe(true);
    expect(TERM_CODE_PATTERN.test("Hot")).toBe(false);
    expect(TERM_CODE_PATTERN.test("hot_humid")).toBe(true); // shape allows it; vocabulary forbids it
    expect(TERM_CODE_PATTERN.test("")).toBe(false);
    expect(TERM_CODE_PATTERN.test("a")).toBe(false); // min length 2
  });

  it("validates subdivision-code shape without a catalog yet", () => {
    expect(SUBDIVISION_CODE_PATTERN.test("HCM")).toBe(true);
    expect(SUBDIVISION_CODE_PATTERN.test("US-CA")).toBe(false);
    expect(SUBDIVISION_CODE_PATTERN.test("1234567")).toBe(false); // max 6
    expect(SUBDIVISION_CODE_PATTERN.test("")).toBe(false);
  });
});
