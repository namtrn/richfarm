const assert = require("node:assert/strict");
const test = require("node:test");

const {
  auditDescriptionQuality,
  descriptionOrigin,
} = require("./audit-plant-content");

function row(cultivar, contentOrigin) {
  return {
    row: {
      scientificName: "Basella alba",
      cultivar,
      ...(contentOrigin ? { content_origin: contentOrigin } : {}),
    },
    description: "A tropical vine grown for tender leaves and shoots.",
  };
}

test("only explicit inherited descriptions are exempt from authored duplicate failures", () => {
  const inheritedA = row("Inherited A", "inherited");
  const inheritedB = row("Inherited B", "inherited");
  const authored = row("Authored", "authored");
  const imported = row("Imported", "imported");

  assert.equal(descriptionOrigin(inheritedA.row), "inherited");
  assert.equal(descriptionOrigin(authored.row), "authored");
  assert.equal(descriptionOrigin(imported.row), "imported");

  const report = auditDescriptionQuality([inheritedA, inheritedB, authored, imported]);
  assert.equal(report.inheritedDescriptionRows, 2);
  assert.equal(report.inheritedRepeatedDescriptionRows, 2);
  assert.equal(report.repeatedDescriptionRows, 2);
  assert.equal(report.nearDuplicateDescriptionPairs, 1);
  assert.equal(report.inheritedNearDuplicateDescriptionPairs, 5);
});

test("missing origin stays conservative and is audited as independent content", () => {
  const first = row("First");
  const second = row("Second");

  assert.equal(descriptionOrigin(first.row), "unknown");
  const report = auditDescriptionQuality([first, second]);
  assert.equal(report.inheritedDescriptionRows, 0);
  assert.equal(report.repeatedDescriptionRows, 2);
  assert.equal(report.nearDuplicateDescriptionPairs, 1);
  assert.equal(report.inheritedNearDuplicateDescriptionPairs, 0);
});
