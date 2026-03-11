# Plant I18n Source

This folder is the editable source of truth for plant locale content.

- Edit `*.json` here.
- Run `npm run build:plant-i18n`.
- Generated TypeScript files will be written to `packages/convex/convex/data/plantI18n/`.
- Seed and Convex sync continue to read from the generated TypeScript files.

Each row should look like:

```json
{
  "scientificName": "Mentha × piperita",
  "cultivar": "Chocolate",
  "locale": "vi",
  "commonName": "Bạc hà Chocolate",
  "description": "..."
}
```
