import { ConvexError } from "convex/values";

/**
 * Server-to-server boundary for master-data administration.
 *
 * The token is deliberately read only inside Convex and is never accepted as
 * a deployment/admin key. Public functions still need an explicit argument so
 * direct calls from a browser or mobile client cannot bypass the API role
 * boundary. There is no development fallback: an unset secret is a denial.
 */
export function requireAdminServiceToken(serviceToken: string): void {
  const expected = process.env.CONVEX_ADMIN_FUNCTION_KEY?.trim();
  if (!expected || !serviceToken || serviceToken !== expected) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Admin service authorization required",
    });
  }
}
