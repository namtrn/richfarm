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
