import { describe, expect, it } from "vitest";

import { canonicalKeyFromPlantIdentity } from "../../../shared/src/canonicalPlantIdentity";
import {
  canonicalKeyForConvexPlant,
  normalizeConvexPlantIdentity,
} from "./canonicalPlantIdentity";

describe("Convex canonical identity adapter", () => {
  it("matches shared v1 output without mutation or database access", () => {
    const input = Object.freeze({
      genus: "  Brassica",
      species: "Ｒａｐａ  ",
      rank: "ssp.",
      infraspecificName: " Chinensis",
      cultivar: null,
      scope: "base" as const,
    });
    const before = JSON.stringify(input);
    const sharedKey = canonicalKeyFromPlantIdentity(input);
    const convexKey = canonicalKeyForConvexPlant(input);
    const normalized = normalizeConvexPlantIdentity(input);

    expect(convexKey).toBe(sharedKey);
    expect(convexKey).toBe('["v1","brassica","rapa","subsp","chinensis",""]');
    expect(normalized.canonicalKey).toBe(sharedKey);
    expect(JSON.stringify(input)).toBe(before);
  });
});

