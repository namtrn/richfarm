import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { legacyCareObjectToMarkdown } from "../../shared/src/careContentLegacy";
import { requireAdminServiceToken } from "./lib/adminAuth";

/**
 * Phase 4.4 data migration: convert `plantCareI18n.careContent` values that
 * are JSON-encoded legacy objects into canonical Markdown.
 *
 * Rules (plan L140-143):
 * - Parse only for migration detection.
 * - Convert only when `JSON.parse` succeeds and returns a supported plain-object
 *   legacy shape, including `{ "text": string }` and recognized section objects.
 * - Preserve every other non-empty string byte-for-byte (authored Markdown,
 *   JSON-looking prose, arrays, scalars, malformed JSON) and report
 *   ambiguous/unsupported parsed values instead of rewriting them.
 * - Idempotent: a plain Markdown string (or a JSON parse that is not a
 *   supported legacy shape) is left untouched, so re-running converges.
 *
 * Pagination uses Convex's stable database cursor. Callers walk until
 * `hasMore: false`; no full-table collection or extra zero-row request is
 * required.
 */
export const migratePlantCareI18nJsonToString = mutation({
  args: {
    serviceToken: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdminServiceToken(args.serviceToken);
    const DEFAULT_PAGE_SIZE = 500;
    const requestedLimit = args.limit === undefined ? DEFAULT_PAGE_SIZE : Math.floor(args.limit);
    const limit = Math.max(
      1,
      Math.min(DEFAULT_PAGE_SIZE, Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_PAGE_SIZE),
    );
    const pagination = await ctx.db
      .query("plantCareI18n")
      .order("asc")
      .paginate({ cursor: args.cursor ?? null, numItems: limit });
    const page = pagination.page as any[];
    const hasMore = !pagination.isDone;

    const report = {
      scanned: page.length,
      converted: 0,
      preserved: 0,
      skipped: 0,
      alreadyCanonical: 0,
      unsupported: 0,
      failures: [] as Array<{ id: string; locale: string; reason: string }>,
      dispositions: [] as Array<{
        id: string;
        locale: string;
        disposition: "converted" | "preserved" | "skipped" | "unsupported";
        reason?: string;
      }>,
      convertedHashes: [] as string[],
      preservedHashes: [] as string[],
      failureHashes: [] as string[],
    };

    for (const row of page) {
      const raw = row.careContent;
      const trimmed = typeof raw === "string" ? raw.trim() : "";
      if (typeof raw !== "string" || trimmed === "" || trimmed === "{}") {
        report.skipped += 1;
        report.dispositions.push({ id: String(row._id), locale: row.locale, disposition: "skipped" });
        continue;
      }

      let parsed: unknown;
      let parseFailed = false;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parseFailed = true;
      }

      let disposition: "converted" | "preserved" | "skipped" | "unsupported";
      let markdown: string | null = null;
      let reason: string | undefined;

      if (parseFailed) {
        // JSON-looking prose that fails to parse is ambiguous: preserve
        // byte-for-byte and report. Anything else is authored Markdown.
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          disposition = "unsupported";
          reason = "malformed JSON";
        } else {
          disposition = "preserved";
        }
      } else if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        const conversion = legacyCareObjectToMarkdown(parsed, row.locale);
        if (conversion.kind === "markdown") {
          disposition = "converted";
          markdown = conversion.markdown;
        } else if (conversion.kind === "empty") {
          disposition = "skipped";
        } else {
          disposition = "unsupported";
          reason = conversion.reason;
        }
      } else if (Array.isArray(parsed)) {
        disposition = "unsupported";
        reason = "parsed value is an array";
      } else {
        // Scalars are not legacy shapes; treat as canonical prose.
        disposition = "preserved";
      }

      const rawHash = await sha256(raw);
      report.dispositions.push({
        id: String(row._id),
        locale: row.locale,
        disposition,
        ...(reason ? { reason } : {}),
      });

      if (disposition === "converted" && markdown !== null) {
        await ctx.db.patch(row._id, { careContent: markdown } as any);
        report.converted += 1;
        report.convertedHashes.push(`${row._id}:${await sha256(markdown)}`);
      } else if (disposition === "skipped") {
        report.skipped += 1;
      } else {
        report.preserved += 1;
        report.preservedHashes.push(`${row._id}:${rawHash}`);
        if (disposition === "unsupported") {
          report.unsupported += 1;
          report.failures.push({
            id: String(row._id),
            locale: row.locale,
            reason: reason ?? "unsupported value",
          });
          report.failureHashes.push(`${row._id}:${rawHash}`);
        } else {
          report.alreadyCanonical += 1;
        }
      }
    }

    return {
      ...report,
      hasMore,
      isDone: pagination.isDone,
      nextCursor: hasMore ? pagination.continueCursor : null,
    };
  },
});

async function sha256(value: string): Promise<string> {
  // Convex's default runtime exposes Web Crypto but cannot bundle Node's
  // `crypto` module. Keep the report's real SHA-256 evidence without moving
  // this database mutation into the Node action runtime.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
