# Localization Guide

## Scope
This app uses i18next for UI strings and Convex tables for plant/recipe content.

## Add a new UI language
1. Add a new file in `lib/locales/<lang>.json`.
2. Add the locale to `lib/i18n.ts` (`supportedLngs` and `resources`).
3. Ensure all keys match `en.json`.
4. Prefer replacing hardcoded strings with `t()` calls in UI components.

## Key conventions
- Use `section.snake_case` keys.
- Shared labels go under `common`.
- Placeholders end with `_placeholder`.
- Use `*_label` for field labels and `*_title` for headings.

## Keeping locale keys consistent
The `en.json` file is the source of truth for keys. Other locales should contain every key that exists in `en.json`.

Quick check script:

```bash
node - <<'JS'
const fs = require('fs');
const path = require('path');
const base = path.join(process.cwd(), 'lib', 'locales');
const files = fs.readdirSync(base).filter(f => f.endsWith('.json')).sort();

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const nk = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, nk));
    } else {
      out[nk] = v;
    }
  }
  return out;
}

const byFile = {};
const allKeys = new Set();
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(base, f), 'utf8'));
  const flat = flatten(data);
  byFile[f] = flat;
  Object.keys(flat).forEach(k => allKeys.add(k));
}

const keys = Array.from(allKeys).sort();
for (const f of files) {
  const missing = keys.filter(k => !(k in byFile[f]));
  if (missing.length) {
    console.log(`Missing in ${f}: ${missing.length}`);
    missing.slice(0, 20).forEach(k => console.log('  -', k));
    if (missing.length > 20) console.log('  ...');
  }
}
JS
```

## Adding or updating plant translations
Plant content is stored in `plantI18n` (per-locale content) and the base plant tables. Recommended steps:

1. Add or update a `plantI18n` row with `plantId`, `locale`, `commonName`, and optional `description`.
2. Keep `locale` lowercase (e.g., `en`, `vi`, `es`).
3. Use the Convex Dashboard or a dedicated mutation to upsert data.

Reference details and schema notes:
- `docs/plant-multilingual-data-solution.md`

## Adding or updating recipe translations
Recipe content is stored in `recipeI18n` (per-locale content).

1. Add or update a `recipeI18n` row with `recipeId`, `locale`, `title`, and optional `instructions` or other localized fields.
2. Use the Convex Dashboard or an upsert mutation.

Reference details and schema notes:
- `docs/plant-multilingual-data-solution.md`

## Notes
Some locales currently fall back to English for newly added keys. Replace these values with proper translations when the locale is actively used.
