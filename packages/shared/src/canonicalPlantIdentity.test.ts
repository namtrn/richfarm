import { describe, expect, it } from "vitest";

import {
  CANONICAL_IDENTITY_VERSION,
  canonicalKeyFromPlantIdentity,
  extractLegacyCanonicalIdentityFields,
  normalizeCanonicalIdentityToken,
  validateCanonicalPlantIdentity,
} from "./canonicalPlantIdentity";

const LEGACY_METADATA_IDENTITY_FIXTURES = [
  { id: 49, scientific_name: "Brassica rapa", metadata_json: JSON.stringify({ cultivar: "subsp. chinensis", cultivarNormalized: "subsp. chinensis" }), rank: "subsp", name: "chinensis", key: '["v1","brassica","rapa","subsp","chinensis",""]' },
  { id: 53, scientific_name: "Brassica rapa", metadata_json: JSON.stringify({ cultivar: "subsp. pekinensis", cultivarNormalized: "subsp. pekinensis" }), rank: "subsp", name: "pekinensis", key: '["v1","brassica","rapa","subsp","pekinensis",""]' },
  { id: 120, scientific_name: "Brassica rapa", metadata_json: JSON.stringify({ cultivar: "subsp. rapa", cultivarNormalized: "subsp. rapa" }), rank: "subsp", name: "rapa", key: '["v1","brassica","rapa","subsp","rapa",""]' },
  { id: 471, scientific_name: "Brassica rapa", metadata_json: JSON.stringify({ cultivar: "subsp. narinosa", cultivarNormalized: "subsp. narinosa" }), rank: "subsp", name: "narinosa", key: '["v1","brassica","rapa","subsp","narinosa",""]' },
  { id: 50, scientific_name: "Brassica oleracea", metadata_json: JSON.stringify({ cultivar: "var. capitata", cultivarNormalized: "var. capitata" }), rank: "var", name: "capitata", key: '["v1","brassica","oleracea","var","capitata",""]' },
  { id: 435, scientific_name: "Brassica oleracea", metadata_json: JSON.stringify({ cultivar: "var. sabellica", cultivarNormalized: "var. sabellica" }), rank: "var", name: "sabellica", key: '["v1","brassica","oleracea","var","sabellica",""]' },
  { id: 591, scientific_name: "Brassica napus", metadata_json: JSON.stringify({ cultivar: "var. napobrassica", cultivarNormalized: "var. napobrassica" }), rank: "var", name: "napobrassica", key: '["v1","brassica","napus","var","napobrassica",""]' },
  { id: 1548, scientific_name: "Brassica rapa", metadata_json: JSON.stringify({ cultivarNormalized: "__default__" }), rank: null, name: null, key: '["v1","brassica","rapa","","",""]' },
  { id: 1549, scientific_name: "Brassica oleracea", metadata_json: JSON.stringify({ cultivarNormalized: "__default__" }), rank: null, name: null, key: '["v1","brassica","oleracea","","",""]' },
  { id: 1550, scientific_name: "Brassica napus", metadata_json: JSON.stringify({ cultivarNormalized: "__default__" }), rank: null, name: null, key: '["v1","brassica","napus","","",""]' },
] as const;

describe("canonical_identity_v1", () => {
  it("serializes the exact six-element base tuple", () => {
    expect(canonicalKeyFromPlantIdentity({
      genus: "Basella",
      species: "alba",
      rank: null,
      infraspecificName: null,
      cultivar: null,
      scope: "base",
    })).toBe('["v1","basella","alba","","",""]');
  });

  it("keeps cultivar punctuation and diacritics while normalizing case", () => {
    expect(canonicalKeyFromPlantIdentity({
      genus: "Rosa",
      species: "chinensis",
      rank: null,
      infraspecificName: null,
      cultivar: "  André’s  ‘Tea’  ",
      scope: "cultivar",
      parentCanonicalKey: '["v1","rosa","chinensis","","",""]',
    })).toBe('["v1","rosa","chinensis","","","andré’s ‘tea’"]');
  });

  it("normalizes NFKC, Unicode whitespace, lowercase, and hybrids", () => {
    expect(normalizeCanonicalIdentityToken("  Ｂｒａｓｓｉｃａ\u00a0×\u2003Ｒａｐａ  "))
      .toBe("brassica x rapa");
    expect(canonicalKeyFromPlantIdentity({
      genus: "Ｂｒａｓｓｉｃａ",
      species: "Ｒａｐａ",
      rank: "ssp.",
      infraspecificName: "  Chinensis\u2009",
      cultivar: null,
      scope: "base",
    })).toBe('["v1","brassica","rapa","subsp","chinensis",""]');
  });

  it.each([
    ["ssp", "subsp"],
    ["ssp.", "subsp"],
    ["subsp.", "subsp"],
    ["var.", "var"],
    ["f.", "f"],
  ])("maps rank alias %s to %s", (rank, expected) => {
    const result = validateCanonicalPlantIdentity({
      genus: "Brassica",
      species: "rapa",
      rank,
      infraspecificName: "chinensis",
      cultivar: null,
      scope: "base",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.identity.rank).toBe(expected);
  });

  it("rejects unsupported rank aliases instead of silently changing identity", () => {
    const result = validateCanonicalPlantIdentity({
      genus: "Brassica",
      species: "rapa",
      rank: "forma",
      infraspecificName: "chinensis",
      cultivar: null,
      scope: "base",
    });
    expect(result).toMatchObject({ ok: false, code: "CANONICAL_IDENTITY_INVALID_RANK" });
  });

  it("requires all structured fields and never infers from a display name", () => {
    const result = validateCanonicalPlantIdentity({ scientific_name: "Basella alba", common_name: "Mồng tơi" });
    expect(result).toMatchObject({ ok: false, code: "CANONICAL_IDENTITY_INCOMPLETE" });
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toEqual([
        "genus",
        "species",
        "scope",
        "rank",
        "infraspecificName",
        "cultivar",
      ]);
    }
  });

  it("requires rank and name together", () => {
    const result = validateCanonicalPlantIdentity({
      genus: "Brassica",
      species: "rapa",
      rank: "var",
      infraspecificName: null,
      cultivar: null,
      scope: "base",
    });
    expect(result).toMatchObject({ ok: false, code: "CANONICAL_IDENTITY_INFRASPECIFIC_PAIR" });
  });

  it("validates cultivar parent scope and taxonomy", () => {
    const base = canonicalKeyFromPlantIdentity({
      genus: "Basella",
      species: "alba",
      rank: null,
      infraspecificName: null,
      cultivar: null,
      scope: "base",
    });
    const cultivar = validateCanonicalPlantIdentity({
      genus: "Basella",
      species: "alba",
      rank: null,
      infraspecificName: null,
      cultivar: "Ceylon",
      scope: "cultivar",
      parentCanonicalKey: base,
    });
    expect(cultivar.ok).toBe(true);
    if (cultivar.ok) {
      expect(cultivar.identity.canonicalKey).toBe('["v1","basella","alba","","","ceylon"]');
      expect(cultivar.identity.identityVersion).toBe(CANONICAL_IDENTITY_VERSION);
    }

    const noParent = validateCanonicalPlantIdentity({
      genus: "Basella",
      species: "alba",
      rank: null,
      infraspecificName: null,
      cultivar: "Ceylon",
      scope: "cultivar",
    });
    expect(noParent).toMatchObject({ ok: false, code: "CANONICAL_IDENTITY_PARENT_REQUIRED" });
  });

  it("promotes exact legacy metadata rank qualifiers and ignores default cultivar sentinels", () => {
    for (const fixture of LEGACY_METADATA_IDENTITY_FIXTURES) {
      const fields = extractLegacyCanonicalIdentityFields({
        id: fixture.id,
        scientific_name: fixture.scientific_name,
        // CID-3 adds this nullable direct column before legacy metadata is
        // backfilled; it must not hide the metadata value.
        cultivar: null,
        metadata_json: fixture.metadata_json,
      });
      expect(fields).toMatchObject({
        rank: fixture.rank,
        infraspecificName: fixture.name,
        cultivar: null,
        scope: "base",
      });
      const identity = validateCanonicalPlantIdentity({
        genus: fields.genus,
        species: fields.species,
        rank: fields.rank,
        infraspecificName: fields.infraspecificName,
        cultivar: fields.cultivar,
        scope: fields.scope,
      });
      expect(identity).toMatchObject({ ok: true, canonicalKey: fixture.key });
    }
  });
});
