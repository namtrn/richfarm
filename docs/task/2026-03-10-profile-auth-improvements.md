# Profile Screen — Missing Features & Auth Edge Cases

Date: 2026-03-10
Repo: `/Users/n/Documents/GitHub/richfarm`

---

## Context

Review of `apps/mobile/app/(tabs)/profile.tsx` and `apps/mobile/app/auth.tsx` to identify missing features required for a production-ready profile and auth flow (including App Store compliance).

---

## Done in This Session

### Profile Screen (`profile.tsx`)

| Feature | Status |
|---|---|
| Delete Account | ✅ Already existed |
| Đổi mật khẩu (Change Password) | ✅ Added — collapsible form, show/hide, min 8 chars, only for non-anonymous |
| Cài đặt thông báo (Notifications) | ✅ Added — reads `expo-notifications` permission, enable/open settings |
| Liên hệ hỗ trợ (Support) | ✅ Added — `mailto:support@richfarm.app` + GitHub Issues |
| Chính sách / Điều khoản (Legal) | ✅ Added — Privacy Policy + Terms of Service links |
| App Version | ✅ Added — reads from `expo-constants`, shows at bottom of Legal section |

### Auth Screen (`auth.tsx`)

| Fix | Status |
|---|---|
| Auto-navigate after sign in/sign up | ✅ Fixed — `setTimeout(navigateBack, 900-1200ms)` after success |
| `KeyboardAvoidingView` | ✅ Added — `behavior="padding"` on iOS |
| Error code mapping | ✅ Added — `mapAuthError()` maps common server errors to friendly i18n keys |
| Confirm password field (sign up) | ✅ Added — inline mismatch hint |
| Loading text in button | ✅ Fixed — shows "Signing in…", "Creating account…", "Sending…" |
| Error vs success message style | ✅ Fixed — errors show warning color, success shows neutral |
| Forgot password reset-sent hint | ✅ Added — secondary hint text after successful reset email |
| Network error catch | ✅ Added — all handlers wrapped with `catch` → `auth_err_network` |

---

## Still TODO

### Profile — URL placeholders to replace

These are hardcoded placeholders that need real URLs before App Store submission:

- `mailto:support@richfarm.app` in Support section  
- `https://github.com/namtrn/richfarm/issues` — bug report URL  
- `https://richfarm.app/privacy` — Privacy Policy page  
- `https://richfarm.app/terms` — Terms of Service page  

### Auth — Feature flags to enable when backend is ready

Located at top of `apps/mobile/app/auth.tsx`:

```ts
const GOOGLE_OAUTH_ENABLED = false;   // needs GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET on server
const RESET_PASSWORD_ENABLED = false; // needs emailAndPassword.sendResetPassword in Better Auth config
```

When `GOOGLE_OAUTH_ENABLED = true`, **Sign in with Apple must also be added** — Apple requires it whenever any third-party social login is offered.

### Profile — Nice to have (not blocking)

- [ ] **Edit name inline** — currently name is display-only; need TextInput + save
- [ ] **Avatar / profile photo** — not present at all
- [ ] **Sign in with Apple** — add when Google OAuth is enabled (App Store requirement)
- [ ] **Notification granularity** — currently binary on/off; could add per-type toggles (watering, harvest, general)
- [ ] **Data export (GDPR)** — not required for App Store but good practice

### Auth — Nice to have

- [ ] **Rate limiting UI** — backend should rate-limit; frontend could disable button with countdown
- [ ] **Email verification flow** — if Better Auth is configured to require verification, a "check your inbox" holding screen is needed
- [ ] **Deep link handler for reset password** — when user taps reset link in email, app should open a "new password" form. Currently `redirectTo: APP_SCHEME://` goes nowhere.

---

## App Store Compliance Checklist (Apple)

| Requirement | Status |
|---|---|
| Privacy Policy link | ✅ Added |
| Terms of Service link | ✅ Added |
| Account Deletion | ✅ Already existed |
| App Version display | ✅ Added |
| Sign in with Apple (if social login enabled) | ⚠️ Needed when Google OAuth is turned on |
| Push notification permission must be opt-in | ✅ `requestPermissionsAsync()` is user-triggered |

---

## Files Changed

- `apps/mobile/app/(tabs)/profile.tsx` — 4 new sections added
- `apps/mobile/app/auth.tsx` — full auth flow hardening  
- `apps/mobile/lib/locales/en.json` — added `profile.*` keys for all new features + error mapping
- `apps/mobile/lib/locales/vi.json` — Vietnamese translations for all above
