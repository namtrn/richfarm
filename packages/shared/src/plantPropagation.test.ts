import { describe, expect, it } from "vitest";

import {
  PROPAGATION_METHODS,
  isPropagationMethod,
  normalizePropagationMethods,
} from "./plantPropagation";

describe("plant propagation methods", () => {
  it("keeps one stable set of 18 values", () => {
    expect(PROPAGATION_METHODS).toHaveLength(18);
    expect(new Set(PROPAGATION_METHODS).size).toBe(18);
    expect(PROPAGATION_METHODS.every((method) => isPropagationMethod(method))).toBe(true);
  });

  it("deduplicates in first-seen order and drops unknown values", () => {
    expect(normalizePropagationMethods([
      "stem_cutting",
      "unknown",
      "seed",
      "stem_cutting",
      "seed",
    ])).toEqual(["stem_cutting", "seed"]);
  });

  it("normalizes empty or malformed input to undefined", () => {
    expect(normalizePropagationMethods([])).toBeUndefined();
    expect(normalizePropagationMethods(["unknown"])).toBeUndefined();
    expect(normalizePropagationMethods(undefined)).toBeUndefined();
  });
});
