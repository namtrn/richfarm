# Daily Report - 2026-02-21

## Scope
- Chuẩn hoá auth stack theo hướng `Convex + Better Auth` cho app Expo/RN.
- Bổ sung UI auth để test trên simulator.
- Chuẩn bị các phần cần thiết cho Google Sign-In và Forgot Password.

## Completed
- Installed dependencies:
  - `@convex-dev/better-auth@0.10.10`
  - `better-auth@1.4.9`
  - `@better-auth/expo@1.4.9`
  - `expo-secure-store`
- Added Convex Better Auth backend setup:
  - `convex/convex.config.ts`
  - `convex/auth.config.ts`
  - `convex/auth.ts`
  - `convex/http.ts`
- Added Expo auth client:
  - `lib/auth-client.ts`
- Switched app root provider to Better Auth + Convex:
  - Updated `app/_layout.tsx` to use `ConvexBetterAuthProvider`.
- Generated and set Better Auth secret in Convex env:
  - `BETTER_AUTH_SECRET` (set successfully via `npx convex env set`).
- Added auth UI in profile screen:
  - Email/password `Sign up`, `Sign in`, `Sign out`
  - `Continue with Google` button
  - `Forgot password` flow button
  - `Back` and `Close` auth panel buttons
  - Updated file: `app/(tabs)/profile.tsx`

## Validation Run
- `npx convex codegen` ✅
- `npx tsc --noEmit` ✅

## Environment / Config Notes
- `EXPO_PUBLIC_CONVEX_SITE_URL` should be:
  - `https://curious-starling-690.convex.site`
- `EXPO_PUBLIC_CONVEX_URL` vẫn cần cho Convex client realtime (`*.convex.cloud`).
- `BETTER_AUTH_SECRET` đã set trên Convex env.

## Important Pending Items
- Google OAuth provider chưa cấu hình server-side:
  - cần `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - cần redirect URI:
    - `https://curious-starling-690.convex.site/api/auth/callback/google`
- Forgot password mới có UI/client call:
  - cần cấu hình `sendResetPassword` trong Better Auth backend để gửi email reset thực tế.

## Files Added/Updated Today (Auth-related)
- Added:
  - `convex/convex.config.ts`
  - `convex/auth.config.ts`
  - `convex/auth.ts`
  - `convex/http.ts`
  - `lib/auth-client.ts`
- Updated:
  - `app/_layout.tsx`
  - `app/(tabs)/profile.tsx`
  - `app.json`
  - `package.json`
  - `package-lock.json`

## Review — commit `4f372f98` (2026-02-21 16:41)

**Commit**: `feat: complete initial implementation including plants, gardens, auth, native widgets and daily report`
**Scope**: 108 files changed, +6,651 / −67 lines

### ✅ What Went Well
1. **Auth stack (Convex + Better Auth)** — backend (`convex/auth.ts`, `convex/auth.config.ts`, `convex/http.ts`, `convex/convex.config.ts`) and client (`lib/auth-client.ts`) are clean and minimal. Provider swap in `app/_layout.tsx` is a single-line change — low risk.
2. **Profile auth UI** — `app/(tabs)/profile.tsx` has full email sign-up/in, Google sign-in, forgot-password, and sign-out flows with proper loading states, input validation (`password.length < 8`), and error messages. The collapsible auth panel (Back/Close) is a nice UX touch.
3. **Native widget improvements** — iOS widget (`widgets/ios/MyGardenWidget.swift`) now uses centralized constants (`widgetAppName`, `widgetAppScheme`, `widgetAppGroupId`), adds `.widgetURL()` for deep-link, and replaces dummy `Button` with `Link(destination:)`. Android widget removes unused `ACTION_WATER_PLANT` broadcast and simplifies to open-app intent.
4. **`scripts/init-app.js`** — comprehensive white-label re-branding script covering `app.json`, Xcode project, Android manifests, Kotlin packages, and widget configs. Includes XML escaping and dry-run-safe helpers (`replaceInFileIfExists`).
5. **Full native project scaffolding** — both `ios/` and `android/` directories committed with splash screens, widget extensions, app icons, and bridging modules — ready for local builds.

### ⚠️ Concerns & Suggestions
| # | Area | Issue | Suggestion |
|---|------|-------|------------|
| 1 | `profile.tsx` — Google Sign-In | Uses `authClient as any` with optional chaining (`client?.signIn?.social`). No compile-time type safety. | Define a typed interface or extend the Better Auth client type so social sign-in is properly typed. |
| 2 | `profile.tsx` — Forgot Password | Also uses `as any` cast and tries two function names (`forgetPassword` / `requestPasswordReset`). | Pin to the exact Better Auth API method name and remove the fallback once confirmed. |
| 3 | `profile.tsx` — hardcoded scheme | `callbackURL` and `redirectTo` are hardcoded to `'my-garden://'`. If the init-app script changes the scheme, these will break. | Extract scheme from a shared config or env var. |
| 4 | `app.json` | `"expo-secure-store"` is appended as a bare string in the plugins array without a config object. Works but may cause confusion. | Verify this is the intended format per Expo docs and add a comment if so. |
| 5 | Native projects committed | Committing `ios/Podfile.lock` (2,294 lines) and Android gradle files is fine for reproducibility, but increases repo size. | Consider if these should be gitignored and regenerated — depends on team workflow. |
| 6 | Missing Google OAuth config | Report notes `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are pending — the Google Sign-In button will fail at runtime until configured. | Add a runtime guard or disable the button when OAuth is not configured. |
| 7 | Forgot password backend | `sendResetPassword` not configured server-side — the "Send reset link" button will appear to succeed but no email is sent. | Either hide the forgot-password option until backend is ready, or show a clear warning. |

### 📝 Overall
Solid day — auth foundation is in place, native projects are scaffolded, and widgets are improved. Main risks are the `as any` casts in auth handlers and the incomplete Google OAuth / forgot-password backend. Recommend addressing items 1–3 and 6–7 before testing on a real device.

---

## Fixes Applied (16:49 — same day)

Verified: `npx tsc --noEmit` ✅ after all changes

| # | Concern | Fix |
|---|---------|-----|
| 1 | `as any` on Google Sign-In | Narrowed to `(authClient.signIn as any).social()` — only the `.social` call is untyped. Added `GOOGLE_OAUTH_ENABLED` flag that **short-circuits before any call** when `false`. |
| 2 | `as any` on Forgot Password | Replaced broad `as any` + two fallback names with a narrow `RequestResetFn` type + runtime guard. Uses `requestPasswordReset` method name from Better Auth internals. |
| 3 | Hardcoded `'my-garden://'` | Exported `APP_SCHEME` from `lib/auth-client.ts`; all `callbackURL` / `redirectTo` now use `` `${APP_SCHEME}://` ``. |
| 4 | `expo-secure-store` in `app.json` | Confirmed valid — bare string is the correct Expo plugin format when no config is needed. No change required. |
| 5 | `Podfile.lock` committed | Added `ios/Podfile.lock` to `.gitignore`. |
| 6 | Google button fires when not configured | Button now shows **"Google — coming soon"** and is **disabled** when `GOOGLE_OAUTH_ENABLED = false`. |
| 7 | Forgot password fires with no backend | Shows **"⚠ Password reset is not configured yet"** message and returns immediately when `RESET_PASSWORD_ENABLED = false`. |

### Files Changed
- `lib/auth-client.ts` — exported `APP_SCHEME`
- `app/(tabs)/profile.tsx` — feature flags, type-safe auth calls, `APP_SCHEME`
- `.gitignore` — added `ios/Podfile.lock`
