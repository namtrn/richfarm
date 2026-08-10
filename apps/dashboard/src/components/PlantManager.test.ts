import { describe, expect, it } from "vitest";
import { careContentToMarkdown, parseFriendlyCare } from "./PlantManager";

describe("parseFriendlyCare", () => {
    it("turns structured care JSON into readable sections", () => {
        expect(parseFriendlyCare(JSON.stringify({
            watering: {
                intro: "Keep soil evenly moist.",
                items: ["Water in the morning.", "Mulch the roots."],
            },
        }))).toEqual([{
            key: "watering",
            intro: "Keep soil evenly moist.",
            items: ["Water in the morning.", "Mulch the roots."],
        }]);
    });

    it("does not invent friendly content for empty, invalid, or unsupported JSON", () => {
        expect(parseFriendlyCare("{}")).toEqual([]);
        expect(parseFriendlyCare("not-json")).toEqual([]);
        expect(parseFriendlyCare('{"watering":"daily"}')).toEqual([]);
    });

    it("converts the complete care document to localized Markdown", () => {
        expect(careContentToMarkdown(JSON.stringify({
            watering: {
                intro: "Giữ đất **ẩm đều**.",
                items: ["Tưới vào buổi sáng."],
            },
        }), "vi")).toBe([
            "### Tưới nước",
            "Giữ đất **ẩm đều**.",
            "- Tưới vào buổi sáng.",
        ].join("\n\n"));
    });
});
