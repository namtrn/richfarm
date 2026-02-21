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
