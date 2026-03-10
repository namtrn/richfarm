import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate";

type LibraryMatch = { plantId: string; matchType: string } | null;
type DetectSuggestion = {
    id: string;
    name: string;
    probability: number;
    common_names: string[];
    description: string;
    image_url: string | null;
    plantMasterId: string | null;
};
type DetectResult = {
    match: DetectSuggestion | null;
    alternatives: DetectSuggestion[];
};

const normalizeLocale = (locale?: string) => {
    let result = locale ?? "en";
    if (result.includes("-")) result = result.split("-")[0];
    return result.toLowerCase();
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const guessMimeType = (base64: string) => {
    if (base64.startsWith("/9j/")) return "image/jpeg";
    if (base64.startsWith("iVBOR")) return "image/png";
    if (base64.startsWith("R0lGOD")) return "image/gif";
    if (base64.startsWith("UklGR")) return "image/webp";
    return "image/jpeg";
};

const extractJson = (rawText: string) => {
    const trimmed = rawText.trim();
    const withoutFence = trimmed
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/, "");
    const first = withoutFence.indexOf("{");
    const last = withoutFence.lastIndexOf("}");
    if (first === -1 || last === -1 || last < first) return null;
    return withoutFence.slice(first, last + 1);
};

type ParsedGeminiSuggestion = {
    name: string;
    probability?: number;
    common_names?: string[];
    description?: string;
};

type ParsedGeminiResult = {
    match?: ParsedGeminiSuggestion | null;
    alternatives?: ParsedGeminiSuggestion[];
};

const buildPrompt = (locale: string) => `
You are an image classifier for plants. Analyze the image and return ONLY strict JSON.
Language for names/description: ${locale}.

Schema:
{
  "match": {
    "name": "string",
    "probability": 0.0,
    "common_names": ["string"],
    "description": "string"
  },
  "alternatives": [
    {
      "name": "string",
      "probability": 0.0,
      "common_names": ["string"],
      "description": "string"
    }
  ]
}

Rules:
- If not a plant, set "match" to null and "alternatives" to [].
- probability must be a number from 0 to 1.
- alternatives length max 3.
- No markdown, no explanation, JSON only.
`.trim();

const toSuggestion = (item: ParsedGeminiSuggestion, plantMasterId: string | null): DetectSuggestion => ({
    id: item.name,
    name: item.name,
    probability: clamp01(typeof item.probability === "number" ? item.probability : 0.5),
    common_names: Array.isArray(item.common_names) ? item.common_names.filter((v) => typeof v === "string") : [],
    description: typeof item.description === "string" ? item.description : "",
    image_url: null,
    plantMasterId,
});

export const detectPlant = action({
    args: {
        images: v.array(v.string()),
        latitude: v.optional(v.number()),
        longitude: v.optional(v.number()),
        locale: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<DetectResult> => {
        const apiKey = process.env.GEMINI_API_KEY;
        const locale = normalizeLocale(args.locale);

        if (!apiKey) {
            console.error("GEMINI_API_KEY is not set in environment variables");
            throw new Error("AI detection service is temporarily unavailable (missing Gemini API key)");
        }
        if (args.images.length === 0) {
            return { match: null, alternatives: [] };
        }

        const prompt = buildPrompt(locale);
        const imageBase64 = args.images[0];
        const mimeType = guessMimeType(imageBase64);

        try {
            const response = await fetch(GEMINI_API_URL, {
                method: "POST",
                headers: {
                    "x-goog-api-key": apiKey,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                { text: prompt },
                                {
                                    inline_data: {
                                        mime_type: mimeType,
                                        data: imageBase64,
                                    },
                                },
                            ],
                        },
                    ],
                    generationConfig: {
                        responseMimeType: "application/json",
                        temperature: 0.1,
                    },
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Gemini API error:", response.status, errorText);
                throw new Error(`AI service error: ${response.status}`);
            }

            const data = await response.json();
            const rawText = (data.candidates?.[0]?.content?.parts ?? [])
                .map((part: { text?: string }) => part.text ?? "")
                .join("\n")
                .trim();
            const jsonText = extractJson(rawText);
            if (!jsonText) return { match: null, alternatives: [] };

            const parsed = JSON.parse(jsonText) as ParsedGeminiResult;
            if (!parsed?.match?.name) return { match: null, alternatives: [] };

            const getLibraryMatch = async (item: ParsedGeminiSuggestion): Promise<LibraryMatch> => {
                try {
                    const commonNames = Array.isArray(item.common_names) ? item.common_names : [];
                    const match = await ctx.runQuery((api as any).plantLibrary.matchPlantInLibrary, {
                        scientificName: item.name,
                        commonNames: commonNames.length > 0 ? commonNames : [item.name],
                        locale,
                    });
                    return match ?? null;
                } catch (error) {
                    console.error("Error matching plant in library:", error);
                    return null;
                }
            };

            const topLibMatch = await getLibraryMatch(parsed.match);
            const top = toSuggestion(parsed.match, topLibMatch?.plantId ?? null);

            const alternativesInput = Array.isArray(parsed.alternatives) ? parsed.alternatives : [];
            const alternatives: DetectSuggestion[] = [];
            for (const item of alternativesInput.slice(0, 3)) {
                if (!item?.name || item.name === top.name) continue;
                const libMatch = await getLibraryMatch(item);
                alternatives.push(toSuggestion(item, libMatch?.plantId ?? null));
            }

            return {
                match: top,
                alternatives,
            };
        } catch (error) {
            console.error("Error in detectPlant action:", error);
            throw error instanceof Error ? error : new Error("Failed to detect plant");
        }
    },
});

/**
 * Optional fallback endpoint for generic image labels.
 * Requires GOOGLE_CLOUD_VISION_API_KEY.
 */
export const detectPlantVision = action({
    args: {
        images: v.array(v.string()),
        locale: v.optional(v.string()),
    },
    handler: async (_ctx, args) => {
        const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
        const locale = normalizeLocale(args.locale);
        if (!apiKey) {
            console.warn("GOOGLE_CLOUD_VISION_API_KEY not set, Vision detection skipped.");
            return { labels: [] };
        }

        try {
            const response = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    requests: args.images.map((img) => ({
                        image: { content: img },
                        features: [{ type: "LABEL_DETECTION", maxResults: 10 }],
                        imageContext: { languageHints: [locale] },
                    })),
                }),
            });

            if (!response.ok) return { labels: [] };
            const data = await response.json();
            return {
                labels:
                    data.responses?.[0]?.labelAnnotations
                        ?.map((label: { description?: string }) => label.description)
                        .filter((value: unknown) => typeof value === "string") ?? [],
            };
        } catch (error) {
            console.error("Vision API error:", error);
            return { labels: [] };
        }
    },
});
