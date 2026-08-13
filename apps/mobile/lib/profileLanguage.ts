export type LanguageProfileSyncResult =
  | { status: 'unchanged'; synced: true }
  | { status: 'local-only'; synced: false }
  | { status: 'synced'; synced: true }
  | { status: 'requires-auth'; synced: false; error: unknown }
  | { status: 'failed'; synced: false; error: unknown };

type ErrorRecord = {
  code?: unknown;
  message?: unknown;
  data?: {
    code?: unknown;
    message?: unknown;
  };
};

/** Convex wraps ConvexError payloads differently across client/runtime versions. */
function isSessionAuthorizationError(error: unknown): boolean {
  if (typeof error === 'string') {
    return /unauthorized|session required|authentication required|token expired|invalid token/i.test(error);
  }

  if (!error || typeof error !== 'object') return false;

  const record = error as ErrorRecord;
  const values = [
    record.code,
    record.message,
    record.data?.code,
    record.data?.message,
  ].filter((value): value is string => typeof value === 'string');

  return /unauthorized|session required|authentication required|token expired|invalid token/i.test(values.join(' '));
}

/**
 * Apply the language locally first. A temporarily unavailable authenticated
 * profile must not turn a successful UI preference change into an unhandled
 * promise rejection.
 */
export async function changeLanguageAndSyncProfile(args: {
  code: string;
  currentLanguage: string;
  isAuthenticated: boolean;
  changeLanguage: (code: string) => Promise<unknown> | unknown;
  updateProfile: (args: { locale: string }) => Promise<void>;
}): Promise<LanguageProfileSyncResult> {
  if (args.code === args.currentLanguage) return { status: 'unchanged', synced: true };

  try {
    await args.changeLanguage(args.code);
  } catch (error) {
    return { status: 'failed', synced: false, error };
  }

  // A guest's language is intentionally device-local. Calling updateProfile
  // here would cross the Convex auth boundary and can create an avoidable
  // UNAUTHORIZED rejection for an otherwise successful preference change.
  if (!args.isAuthenticated) return { status: 'local-only', synced: false };

  try {
    await args.updateProfile({ locale: args.code });
    return { status: 'synced', synced: true };
  } catch (error) {
    return {
      status: isSessionAuthorizationError(error) ? 'requires-auth' : 'failed',
      synced: false,
      error,
    };
  }
}
