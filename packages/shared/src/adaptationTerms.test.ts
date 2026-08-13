import { describe, expect, it } from "vitest";

import {
  ADAPTATION_DIMENSIONS,
  ADAPTATION_TERMS,
  ALLOWED_MULTI_WORD_CODES,
  adaptationTermDefinition,
  adaptationTermLabel,
  assertAdaptationTermCodes,
  getAdaptationTerm,
  isAdaptationDimension,
  isAdaptationTerm,
  listAdaptationTerms,
  normalizeAdaptationTermCodes,
} from "./adaptationTerms";

describe("adaptation vocabulary catalog", () => {
  it("keeps the design-doc set: 13 terms across 4 fixed dimensions", () => {
    expect(ADAPTATION_DIMENSIONS).toEqual(["temperature", "moisture", "climate", "season"]);
    expect(ADAPTATION_TERMS).toHaveLength(13);
    expect(new Set(ADAPTATION_TERMS.map((term) => term.code)).size).toBe(13);
    expect(new Set(ADAPTATION_TERMS.map((term) => term.dimension)).size).toBe(4);
  });

  it("keeps one term per dimension and the documented dimension split", () => {
    expect(listAdaptationTerms("temperature").map((t) => t.code)).toEqual([
      "cool", "mild", "warm", "hot",
    ]);
    expect(listAdaptationTerms("moisture").map((t) => t.code)).toEqual(["dry", "moderate", "humid"]);
    expect(listAdaptationTerms("climate").map((t) => t.code)).toEqual([
      "tropical", "subtropical", "temperate",
    ]);
    expect(listAdaptationTerms("season").map((t) => t.code)).toEqual([
      "short_season", "long_season", "frost_free",
    ]);
  });

  it("has non-empty vi/en labels and definitions for every term", () => {
    for (const term of ADAPTATION_TERMS) {
      expect(term.labelVi.trim(), term.code).toBeTruthy();
      expect(term.labelEn.trim(), term.code).toBeTruthy();
      expect(term.definitionVi.trim(), term.code).toBeTruthy();
      expect(term.definitionEn.trim(), term.code).toBeTruthy();
    }
  });

  it("prohibits hot_humid-style combined terms", () => {
    for (const term of ADAPTATION_TERMS) {
      if (term.code.includes("_")) {
        expect(ALLOWED_MULTI_WORD_CODES.has(term.code), term.code).toBe(true);
      }
    }
    expect(isAdaptationTerm("hot_humid")).toBe(false);
  });

  it("keeps codes language-neutral and immutable", () => {
    for (const term of ADAPTATION_TERMS) {
      expect(term.code).toMatch(/^[a-z][a-z0-9_]{1,63}$/);
      expect(term.code).not.toMatch(/[ăâđêôơư]/);
    }
  });
});

describe("lookup and dimension helpers", () => {
  it("recognizes only catalog members", () => {
    expect(isAdaptationTerm("cool")).toBe(true);
    expect(isAdaptationTerm("tropical")).toBe(true);
    expect(isAdaptationTerm("arid")).toBe(false);
    expect(isAdaptationTerm("")).toBe(false);
    expect(isAdaptationTerm(null)).toBe(false);
    expect(isAdaptationDimension("temperature")).toBe(true);
    expect(isAdaptationDimension("soil")).toBe(false);
  });

  it("resolves a term by code", () => {
    expect(getAdaptationTerm("frost_free")?.labelVi).toBe("Không sương giá");
    expect(getAdaptationTerm("frost_free")?.dimension).toBe("season");
    expect(getAdaptationTerm("missing")).toBeUndefined();
  });
});

describe("localized labels with fallback chain", () => {
  it("returns vi/en labels and definitions", () => {
    expect(adaptationTermLabel("cool", "vi")).toBe("Mát");
    expect(adaptationTermLabel("cool", "en")).toBe("Cool");
    expect(adaptationTermLabel("short_season", "vi")).toBe("Vụ ngắn");
    expect(adaptationTermLabel("short_season", "en")).toBe("Short season");
    expect(adaptationTermDefinition("hot", "vi")).toContain("nhiệt độ cao");
    expect(adaptationTermDefinition("hot", "en")).toContain("high temperatures");
  });

  it("falls back to English for unknown locales and prefixes", () => {
    expect(adaptationTermLabel("cool", "vi-VN")).toBe("Mát");
    expect(adaptationTermLabel("cool", "es")).toBe("Cool");
    expect(adaptationTermLabel("cool", "")).toBe("Cool");
    expect(adaptationTermLabel("cool")).toBe("Cool");
  });

  it("never returns an empty label for a known code", () => {
    for (const term of ADAPTATION_TERMS) {
      expect(adaptationTermLabel(term.code, "vi").length).toBeGreaterThan(0);
      expect(adaptationTermLabel(term.code, "en").length).toBeGreaterThan(0);
    }
  });
});

describe("list normalization", () => {
  it("deduplicates in first-seen order and drops unknown codes", () => {
    expect(normalizeAdaptationTermCodes(["hot", "unknown", "hot", "tropical"])).toEqual([
      "hot", "tropical",
    ]);
    expect(normalizeAdaptationTermCodes(["missing"])).toBeUndefined();
    expect(normalizeAdaptationTermCodes([])).toBeUndefined();
    expect(normalizeAdaptationTermCodes(undefined)).toBeUndefined();
    expect(normalizeAdaptationTermCodes("hot")).toBeUndefined();
  });

  it("rejects unknown codes in strict validation", () => {
    expect(assertAdaptationTermCodes(["dry", "humid"])).toEqual(["dry", "humid"]);
    expect(assertAdaptationTermCodes(undefined)).toBeUndefined();
    expect(() => assertAdaptationTermCodes(["arid"])).toThrow(/Invalid adaptation term code/);
    expect(() => assertAdaptationTermCodes("dry")).toThrow(/must be an array/);
  });
});
