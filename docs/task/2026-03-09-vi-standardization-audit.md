# Vietnamese Seed Standardization Audit

Date: 2026-03-09

## Summary

- File audited: `convex/data/plantI18n/vi.ts`
- `commonName` entries still ASCII/non-standardized: `715`
- `description` entries still ASCII/non-standardized: `705`

## Primary source of non-standardized rows

Most remaining non-standardized Vietnamese rows come from the supplemental catalog in:

- `convex/data/plantsMasterSeed.ts`

These rows are generated from `makeSupplementalCatalogEntry(...)` with `viCommonName` values that are still ASCII or half-translated.

## Examples

- `Bac ha meo`
- `Hung chanh tay`
- `Co ngot`
- `Cuc La Ma`
- `Hung que tay`
- `Cai kale`
- `Cu cai endive`
- `Xa lach tim`
- `Cai Nhat`
- `Ot Aji`
- `Tam bop`
- `Thuoc la canh`
- `Toi voi`
- `Hanh tim`
- `He toa`
- `Nguu bang`
- `Dau lentil`
- `Dau lima`
- `Dua pepino`
- `Ngan hau`
- `Thiet moc lan`
- `Truc bach hop`
- `Van nien thanh`

## Important finding

The high-quality Vietnamese content from `docs/task/full_plants_updated.json` was merged into `convex/data/plantI18n/vi.ts`, but newer supplemental plants still inherit older generated Vietnamese labels/descriptions from `convex/data/plantsMasterSeed.ts`.

So the remaining cleanup should happen at the generation source, not only inside `vi.ts`.

## Recommended next step

Standardize `viCommonName` and generated Vietnamese descriptions for the supplemental catalog in `convex/data/plantsMasterSeed.ts`, then regenerate `convex/data/plantI18n/vi.ts` and re-seed Convex.
