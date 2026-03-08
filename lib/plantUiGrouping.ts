import { isDisplayBasePlant } from "./plantBase";

function normalizeGroupingText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/[()'".,/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeScientificGroupingName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/[()'",]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLocalizedName(plant: any, locale?: string) {
  const normalizedLocale = String(locale ?? "").split("-")[0]?.toLowerCase();
  const rows = Array.isArray(plant?.i18nRows) ? plant.i18nRows : [];
  const exact =
    normalizedLocale
      ? rows.find((row: any) => String(row?.locale ?? "").toLowerCase() === normalizedLocale)
      : null;
  const english = rows.find((row: any) => String(row?.locale ?? "").toLowerCase() === "en");
  return exact?.commonName ?? plant?.displayName ?? english?.commonName ?? plant?.scientificName ?? "";
}

function getNameAliases(plant: any, locale?: string) {
  const aliases = new Set<string>();
  const localized = getLocalizedName(plant, locale);
  if (localized) aliases.add(localized);
  if (plant?.displayName) aliases.add(String(plant.displayName));
  if (plant?.scientificName) aliases.add(String(plant.scientificName));
  if (Array.isArray(plant?.i18nRows)) {
    for (const row of plant.i18nRows) {
      if (row?.commonName) aliases.add(String(row.commonName));
    }
  }
  return Array.from(aliases)
    .map((value) => normalizeGroupingText(value))
    .filter((value) => value.length >= 2)
    .sort((a, b) => b.length - a.length);
}

function containsAlias(name: string, alias: string) {
  if (!name || !alias) return false;
  if (name === alias) return true;
  return (
    name.startsWith(`${alias} `) ||
    name.endsWith(` ${alias}`) ||
    name.includes(` ${alias} `)
  );
}

function buildFallbackGroup(plant: any, locale?: string) {
  const label = String(getLocalizedName(plant, locale) || "Plant").trim();
  return {
    key: normalizeGroupingText(label) || normalizeGroupingText(plant?.scientificName) || "plant",
    label,
  };
}

function getExplicitGroup(plant: any, locale?: string) {
  const normalizedLocale = String(locale ?? "").split("-")[0]?.toLowerCase();
  const key = String(plant?.uiGroupKey ?? "").trim();
  const labelVi = String(plant?.uiGroupLabelVi ?? "").trim();
  const labelEn = String(plant?.uiGroupLabelEn ?? "").trim();
  const label =
    normalizedLocale === "vi"
      ? labelVi || labelEn
      : labelEn || labelVi;
  if (!key || !label) return null;
  return {
    key: normalizeGroupingText(key),
    label,
  };
}

export function buildPlantUiGroupMap(plants: any[], locale?: string) {
  const plantsById = new Map(plants.map((plant) => [String(plant?._id), plant]));
  const basePlants = plants.filter((plant) => isDisplayBasePlant(plant));
  const basePlantsByScientificName = new Map<string, any>();

  for (const plant of basePlants) {
    const scientificKey = normalizeScientificGroupingName(plant?.scientificName);
    if (!scientificKey) continue;

    const existing = basePlantsByScientificName.get(scientificKey);
    if (!existing) {
      basePlantsByScientificName.set(scientificKey, plant);
      continue;
    }

    const existingLabel = String(
      getLocalizedName(existing, locale) || existing?.scientificName || ""
    ).trim();
    const nextLabel = String(
      getLocalizedName(plant, locale) || plant?.scientificName || ""
    ).trim();

    if (nextLabel.length < existingLabel.length) {
      basePlantsByScientificName.set(scientificKey, plant);
    }
  }

  const baseEntries = basePlants.map((plant) => ({
    plant,
    label: String(getLocalizedName(plant, locale) || plant?.scientificName || "Plant").trim(),
    aliases: getNameAliases(plant, locale),
    group: String(plant?.group ?? ""),
    genus: normalizeGroupingText(plant?.genus ?? ""),
    scientificName: normalizeGroupingText(plant?.scientificName ?? ""),
  }));

  return new Map(
    plants.map((plant) => {
      const groupBasePlantId = String(plant?.groupBasePlantId ?? "").trim();
      if (groupBasePlantId) {
        const basePlant = plantsById.get(groupBasePlantId) ?? (String(plant?._id) === groupBasePlantId ? plant : null);
        if (basePlant) {
          return [
            String(plant?._id),
            {
              key: groupBasePlantId,
              label: String(getLocalizedName(basePlant, locale) || basePlant?.scientificName || "Plant").trim(),
            },
          ];
        }
      }
      if (isDisplayBasePlant(plant)) {
        return [
          String(plant?._id),
          {
            key: String(plant?._id),
            label: String(getLocalizedName(plant, locale) || plant?.scientificName || "Plant").trim(),
          },
        ];
      }
      const scientificKey = normalizeScientificGroupingName(plant?.scientificName);
      const scientificBasePlant = scientificKey
        ? basePlantsByScientificName.get(scientificKey)
        : null;
      if (scientificBasePlant) {
        return [
          String(plant?._id),
          {
            key: String(scientificBasePlant?._id ?? scientificKey),
            label: String(
              getLocalizedName(scientificBasePlant, locale) ||
                scientificBasePlant?.scientificName ||
                "Plant"
            ).trim(),
          },
        ];
      }
      const explicitGroup = getExplicitGroup(plant, locale);
      if (explicitGroup) {
        return [String(plant?._id), explicitGroup];
      }
      const fallback = buildFallbackGroup(plant, locale);
      const localizedName = getLocalizedName(plant, locale);
      const normalizedName = normalizeGroupingText(localizedName);
      const plantGroup = String(plant?.group ?? "");
      const plantGenus = normalizeGroupingText(plant?.genus ?? "");
      const plantScientific = normalizeGroupingText(plant?.scientificName ?? "");

      let best:
        | {
            key: string;
            label: string;
            score: number;
          }
        | undefined;

      for (const entry of baseEntries) {
        let aliasScore = -1;
        for (const alias of entry.aliases) {
          if (!containsAlias(normalizedName, alias)) continue;
          aliasScore = Math.max(aliasScore, alias.length);
        }
        const scientificExact = entry.scientificName && plantScientific && entry.scientificName === plantScientific;
        if (aliasScore < 0 && !scientificExact) continue;

        let score = Math.max(aliasScore, 0) * 100;
        if (scientificExact) score += 40;
        if (entry.group && plantGroup && entry.group === plantGroup) score += 20;
        if (entry.genus && plantGenus && entry.genus === plantGenus) score += 5;
        if (String(entry.plant?._id) === String(plant?._id)) score += 1000;

        if (!best || score > best.score) {
          best = {
            key: normalizeGroupingText(entry.label) || fallback.key,
            label: entry.label,
            score,
          };
        }
      }

      return [
        String(plant?._id),
        best
          ? { key: best.key, label: best.label }
          : fallback,
      ];
    })
  );
}
