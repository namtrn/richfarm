import { describe, expect, it } from "vitest";
import { sanitizeAuthoringLocale, sanitizeAuthoringPlantPayload } from "../src/content-approval";

describe("content approval authoring boundary", () => {
  it("ignores forged approval metadata and drafts changed care content", () => {
    const result = sanitizeAuthoringLocale({
      common_name: "Tomato",
      care_content: "## New care",
      content_status: "published",
      review_status: "reviewed",
      reviewed_by: "forged",
      reviewed_at: "2026-08-31T00:00:00.000Z",
    });

    expect(result).toEqual({
      careChanged: true,
      payload: {
        common_name: "Tomato",
        care_content: "## New care",
        content_status: "needs_review",
        review_status: "unreviewed",
        reviewed_by: null,
        reviewed_at: null,
      },
    });
  });

  it("preserves approval metadata for an unrelated edit", () => {
    const result = sanitizeAuthoringLocale(
      { common_name: "Tomato updated", content_status: "needs_review", review_status: "unreviewed" },
      {
        common_name: "Tomato",
        care_content: "## Approved care",
        content_status: "published",
        review_status: "reviewed",
        reviewed_by: "2:admin@example.com",
        reviewed_at: "2026-08-31T00:00:00.000Z",
      },
    );

    expect(result).toEqual({
      careChanged: false,
      payload: {
        common_name: "Tomato updated",
        content_status: "published",
        review_status: "reviewed",
        reviewed_by: "2:admin@example.com",
        reviewed_at: "2026-08-31T00:00:00.000Z",
      },
    });
  });

  it("drafts a changed care locale in a full plant payload", () => {
    const result = sanitizeAuthoringPlantPayload(
      {
        content_status: "published",
        review_status: "reviewed",
        reviewed_by: "forged",
        reviewed_at: "2026-08-31T00:00:00.000Z",
        i18n: {
          vi: { common_name: "Cà chua", care_content: "## Chăm sóc mới" },
          en: { common_name: "Tomato", care_content: "## New care" },
        },
      },
      {
        content_status: "published",
        review_status: "reviewed",
        reviewed_by: "2:admin@example.com",
        reviewed_at: "2026-08-31T00:00:00.000Z",
        i18n: {
          vi: { common_name: "Cà chua", care_content: "## Chăm sóc cũ", content_status: "published", review_status: "reviewed" },
          en: { common_name: "Tomato", care_content: "## Old care", content_status: "published", review_status: "reviewed" },
        },
      },
    );

    expect(result.careChanged).toBe(true);
    expect(result.payload).toMatchObject({
      content_status: "needs_review",
      review_status: "unreviewed",
      reviewed_by: null,
      reviewed_at: null,
      i18n: {
        vi: { content_status: "needs_review", review_status: "unreviewed" },
        en: { content_status: "needs_review", review_status: "unreviewed" },
      },
    });
  });
});
