# Scripts

## `init-app.js`

Bootstraps project branding and native identifiers across Expo, iOS, Android, and widget bridge files.

Required flags:

```bash
node scripts/init-app.js --name "My App" --bundle-id "com.example.app"
```

Optional flags:

- `--slug` (default: kebab-case of `--name`)
- `--scheme` (default: `--slug`)
- `--android-package` (default: `--bundle-id`)
- `--group-id` (default: `group.<bundle-id>`)
- `--npm-name` (default: `--slug`)

Run from repository root. Review changed files before committing, especially native project files under `ios/` and `android/`.

## `run-ios-smoke-tests.js`

Runs the mobile Maestro smoke suite through the Expo development build.

Use the root script:

```bash
npm run test:smoke:ios
```

The runner prevents the common dev-client setup failure where the app opens to `No script URL provided` by:

- booting or reusing an iPhone simulator
- starting Metro with `expo start --dev-client --localhost` when port `8081` is free
- verifying port `8081` belongs to `apps/mobile`
- opening the app with `richfarm://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081`
- running Maestro against the selected simulator
- stopping only the Metro process that it started itself

Pass flow files after the script to run a subset:

```bash
node scripts/run-ios-smoke-tests.js .maestro/smoke-home-library-health.yaml
```

## Authenticated Android UI E2E

`run-android-auth-e2e.js` exercises the real native UI and real Better Auth
backend: sign up, verify email, sign in, create a garden, plant, and reminder,
then sign out and sign in again. It scans both Android `logcat` and Metro output
and fails on uncaught JS errors or native crashes.

Because production auth requires email verification, provide either a known
verification URL or a command that prints the newest URL from your test inbox:

```bash
E2E_EMAIL="unique-address@your-test-inbox.example" \
E2E_PASSWORD="a-test-password" \
E2E_FETCH_VERIFICATION_COMMAND="./scripts/read-test-verification-link.sh" \
npm run test:e2e:auth:android
```

The fetch command runs after the signup UI succeeds and receives the same
environment, including `E2E_EMAIL`. For manual one-off verification, replace it
with `E2E_VERIFICATION_URL="https://..."`, or omit both verification variables
and paste the link when the interactive runner prompts after signup.

The runner expects one connected Android device or emulator. Set
`ANDROID_SERIAL` when multiple devices are attached. Logs are written under
`artifacts/e2e/`, which is gitignored. To allow a known benign log message, add
an `E2E_LOG_ALLOWLIST` containing case-insensitive regexes separated by `||`.
# Plant content quality audit

Run `npm run audit:plant-content` to report duplicate plant/locale identities,
missing and short descriptions, known placeholder copy, and repeated description
clusters. The command fails on duplicate identities; the other metrics are a
quality baseline to improve batch by batch without blocking catalog maintenance.

Run `npm run improve:plant-content` to apply reviewed base-species copy and remove
known cultivar placeholder copy. Cultivars without genuinely distinct content
inherit their base species description at read time instead of repeating filler.
