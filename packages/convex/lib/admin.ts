export function requireAdminAccess(adminKey?: string) {
  const expected = process.env.CONVEX_ADMIN_FUNCTION_KEY?.trim();
  if (!expected) {
    throw new Error("Admin functions are not configured");
  }

  if (!adminKey || adminKey !== expected) {
    throw new Error("Admin access required");
  }
}
