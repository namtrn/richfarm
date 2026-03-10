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
  cultivar?: string | null,
) {
  const token = normalizeToken(cultivar);
  if (!token || token === DISPLAY_DEFAULT_CULTIVAR_NORMALIZED) return false;
  return DISPLAY_INFRASPECIFIC_PATTERN.test(token);
}

export function isDisplayBasePlant(plant: any) {
  if (typeof plant?.isBaseVariant === "boolean") {
    return plant.isBaseVariant;
  }

  const cultivar = String(plant?.cultivar ?? "").trim();
  if (!cultivar) {
    return true;
  }
  return isInfraspecificDisplayCultivar(cultivar);
}
