export const DISPLAY_DEFAULT_CULTIVAR_NORMALIZED = "__default__";

const DISPLAY_INFRASPECIFIC_PATTERN = /^(subsp|ssp|var|f)\.?\s+/i;

function normalizeToken(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isInfraspecificDisplayCultivar(
  cultivarNormalized?: string | null,
) {
  const token = normalizeToken(cultivarNormalized);
  if (!token || token === DISPLAY_DEFAULT_CULTIVAR_NORMALIZED) return false;
  return DISPLAY_INFRASPECIFIC_PATTERN.test(token);
}

export function isDisplayBasePlant(plant: any) {
  if (typeof plant?.isBaseVariant === "boolean") {
    return plant.isBaseVariant;
  }

  const cultivarNormalized = normalizeToken(plant?.cultivarNormalized);
  if (!cultivarNormalized) {
    const cultivar = String(plant?.cultivar ?? "").trim();
    return cultivar.length === 0;
  }

  return (
    cultivarNormalized === DISPLAY_DEFAULT_CULTIVAR_NORMALIZED ||
    isInfraspecificDisplayCultivar(cultivarNormalized)
  );
}
