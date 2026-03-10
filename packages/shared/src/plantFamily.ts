const FAMILY_VI_LABELS: Record<string, string> = {
  Amaranthaceae: "rau dền",
  Apiaceae: "hoa tán",
  Araceae: "ráy",
  Asteraceae: "cúc",
  Brassicaceae: "cải",
  Cucurbitaceae: "bầu bí",
  Fabaceae: "đậu",
  Lamiaceae: "bạc hà",
  Rosaceae: "hoa hồng",
  Rutaceae: "cam chanh",
  Solanaceae: "cà",
};

function normalizeLocale(locale?: string) {
  return (locale ?? "en").split("-")[0].toLowerCase();
}

export function formatPlantFamilyDisplayName(family?: string | null, locale?: string) {
  const value = String(family ?? "").trim();
  if (!value) return "";

  if (normalizeLocale(locale) === "vi") {
    const label = FAMILY_VI_LABELS[value];
    return label ? `Cây họ nhà ${label} (${value})` : `Cây họ nhà ${value}`;
  }

  return `${value} family`;
}
