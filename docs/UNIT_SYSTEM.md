# Unit System & Per-Area Metrics

## Defaults
- Default unit system is **imperial** when device region is **US**.
- Otherwise default is **metric**.
- User selection is stored in `userSettings.unitSystem` and overrides defaults.

## Base Storage Units (DB)
All values are stored in metric base units. UI converts for display.

- Area: `m²`
- Length: `cm`
- Volume: `L`
- Weight: `kg`

## plantsMaster: Per-Area Metrics
New optional fields (all per square meter):

- `maxPlantsPerM2` — max plants per `m²`
- `seedRatePerM2` — seeds per `m²`
- `waterLitersPerM2` — liters per `m²`
- `yieldKgPerM2` — kg per `m²`

### Seed format example
```ts
{
  scientificName: "Solanum lycopersicum",
  group: "nightshades",
  spacingCm: 45,
  maxPlantsPerM2: 4,
  seedRatePerM2: 6,
  waterLitersPerM2: 8,
  yieldKgPerM2: 3.5,
}
```

## Seeded Defaults (Best-Practice)
The seed file computes defaults for all plants using:

- `maxPlantsPerM2` derived from `spacingCm` (square packing).
- `seedRatePerM2` estimated as `maxPlantsPerM2 × 1.2` (germination buffer).
- `waterLitersPerM2` from crop water needs (inches/week) converted to L/m²/week.
- `yieldKgPerM2` from regional yield tables (qt/ha → kg/m²) with group fallback.

Sources used:
- Utah State University Extension water recommendations (inches/week).
- Department of Agriculture Meghalaya yield tables (qt/ha).

## reminders: Water Amount
- Optional `waterLiters` stored in liters.
- UI shows gallons when unit system is imperial.

## UI Conversion Examples
- `seedRatePerM2`: `seeds/ft²` when imperial.
- `waterLitersPerM2`: `gal/ft²` when imperial.
- `yieldKgPerM2`: `lb/ft²` when imperial.
- `spacingCm`: `in` when imperial.
