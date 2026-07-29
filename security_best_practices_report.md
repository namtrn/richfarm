# Authentication Review — RichFarm

## Executive summary

The mobile authentication flow is built on Better Auth + Convex and includes email verification, sign-up, sign-in, and password reset. The dashboard is a separate REST + SQLite + JWT system and currently exposes sign-in only. Builds pass, but the authentication surface is not production-ready until reset-token handling, secret configuration, and JWT revocation semantics are addressed.

## High severity

### AUTH-001 — Password-reset and verification URLs are written to logs when email is not configured

**Evidence:** `packages/convex/convex/auth.ts:44-47` logs `args.url` whenever `RESEND_API_KEY` or `AUTH_EMAIL_FROM` is missing. The same callback handles both reset and verification links at `:107-130`.

**Impact:** The URL contains a bearer token. Anyone with access to Convex logs, log aggregation, support exports, or screenshots can use a reset URL to take over an account before expiry. This is especially dangerous because the application reports the email operation as successful while silently falling back to logging the secret.

**Recommendation:** Fail closed in production when email delivery is not configured. Never log the full URL or token. In development, require an explicit opt-in flag and redact the token; use a local mail catcher instead.

### AUTH-002 — Dashboard JWTs remain valid after user deactivation or role changes

**Evidence:** `apps/api/src/auth.ts:48-49` places `email` and `role` in the JWT. `apps/api/src/auth.ts:100-119` validates only the signature, issuer, audience, and token claims; it does not reload the user from SQLite or check `is_active`.

**Impact:** A disabled user keeps access until token expiry, and a demoted user keeps the old privileges. With the default 12-hour lifetime from `apps/api/src/server.ts`, this can be a long-lived authorization bypass after an administrative action.

**Recommendation:** On every protected request, load the user by `sub`, require `is_active = 1`, and derive the role from the database. For immediate revocation, add a per-user session/version or a server-side refresh-token/session store. Keep JWT access tokens short-lived.

## Medium severity

### AUTH-003 — Two independent authentication systems create account and recovery inconsistency

**Evidence:** Mobile uses Better Auth + Convex (`apps/mobile/lib/auth-client.ts:1-25`, `packages/convex/convex/auth.ts:98-140`), while dashboard uses a separate SQLite `users` table and bcrypt/JWT (`apps/api/src/auth.ts:53-80`, `apps/api/src/db.ts:30-40`). The dashboard UI only implements sign-in (`apps/dashboard/src/components/LoginPage.tsx`).

**Risk:** A user can have different credentials, lifecycle, roles, and reset behavior depending on the client. Mobile sign-up/reset does not create or recover the dashboard SQLite account. This is a product/security boundary that should be intentional and documented.

**Recommendation:** Choose one identity provider as the source of truth, or explicitly define dashboard accounts as separate admin identities. If they are intended to be the same accounts, implement a server-side identity bridge rather than duplicating password stores.

### AUTH-004 — Login rate limiting is local and IP-only

**Evidence:** `apps/api/src/app.ts:75-86` limits only `/api/auth/login` with the default in-memory limiter and a single IP key. Better Auth routes are registered in `packages/convex/convex/http.ts:7-8`, with no application-specific abuse controls visible in this repository.

**Risk:** Multiple instances do not share limits; distributed attempts can bypass the control. NAT/shared IPs can also cause denial of service for legitimate users. Password reset and verification resend endpoints need independent limits as well.

**Recommendation:** Use a shared store (for example Redis) in deployed environments, combine IP and account-based throttling, and rate-limit sign-in, sign-up, reset requests, and verification resends. Confirm proxy/trusted-proxy configuration before relying on `req.ip`.

### AUTH-005 — Production safety depends on correct environment labeling

**Evidence:** `packages/convex/convex/auth.ts:19-24` falls back to `dev-secret-change-me` whenever `NODE_ENV` is not exactly `production`. `apps/api/src/server.ts:9-21` similarly has a default JWT secret and only rejects it when `NODE_ENV === "production"`.

**Risk:** A staging or misconfigured shared deployment can use publicly known secrets, allowing token forgery or session compromise.

**Recommendation:** Require non-empty, high-entropy secrets in every non-local deployment. Make local development explicit (for example `AUTH_ENV=local`) rather than treating every non-production environment as safe.

## Database review

- SQLite passwords are stored as bcrypt hashes, not plaintext (`apps/api/src/db.ts:140-157`); this is a good baseline.
- The SQLite user table has a unique email and active flag (`apps/api/src/db.ts:30-40`), but it has no password-reset token/session tables, audit trail, email-verification state, or user/session revocation version. That is acceptable only if the dashboard is deliberately admin-only and its auth remains separate.
- Convex application `users` are profile records keyed by `tokenIdentifier` (`packages/convex/convex/schema.ts:11-62`); Better Auth's account/session/verification data lives in its component adapter, not this application table. Keep those ownership boundaries explicit and test deletion, duplicate-email, and orphan-record behavior.

## Verification performed

- Convex TypeScript typecheck: passed.
- API TypeScript build: passed.
- API tests: 16 tests failed before assertions because the sandbox denied opening `0.0.0.0` (`EPERM`); this is an environment limitation, not evidence that the auth assertions pass or fail.

## Suggested remediation order

1. Remove reset/verification token logging and fail closed for missing production email configuration.
2. Make dashboard authorization database-backed or add revocation/version checks.
3. Decide whether mobile and dashboard identities are intentionally separate.
4. Add shared, multi-endpoint rate limiting and production secret validation.
5. Add integration tests for sign-up, verification, sign-in, reset, replayed/expired tokens, disabled users, role changes, and duplicate emails.
