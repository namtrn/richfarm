const PLACEHOLDER_PATTERNS = [
  /for (?:a )?broader (?:plant mix|garden planning coverage|library coverage)/i,
  /for diversified seed coverage/i,
  /with stable growth profile/i,
  /is a popular plant for home gardens and small farms/i,
  /giúp mở rộng lựa chọn trong thư viện cây/i,
  /sinh trưởng ổn định/i,
  /là cây phổ biến trong vườn nhà và nông trại nhỏ/i,
  /là giống cây trong bộ sưu tập/i,
  /giống cây trong bộ sưu tập/i,
];

function normalizedWords(value: string, ignored: string[] = []) {
  let normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  for (const token of ignored) {
    const clean = token
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    if (clean) normalized = normalized.replaceAll(clean, " ");
  }
  return normalized.match(/[a-z0-9]+/g) ?? [];
}
export function isPlaceholderPlantDescription(value?: string | null) {
  const description = value?.trim() ?? "";
  return !description || PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(description));
}

export function plantDescriptionSimilarity(
  left?: string | null,
  right?: string | null,
  ignored: string[] = [],
) {
  const leftWords = new Set(normalizedWords(left ?? "", ignored));
  const rightWords = new Set(normalizedWords(right ?? "", ignored));
  if (leftWords.size === 0 || rightWords.size === 0) return 0;
  let intersection = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) intersection += 1;
  }
  const union = new Set([...leftWords, ...rightWords]).size;
  return union ? intersection / union : 0;
}

export function shouldUseBasePlantDescription(args: {
  cultivarDescription?: string | null;
  baseDescription?: string | null;
  cultivar?: string | null;
  cultivarCommonName?: string | null;
  baseCommonName?: string | null;
}) {
  if (!args.baseDescription?.trim()) return false;
  if (isPlaceholderPlantDescription(args.cultivarDescription)) return true;
  return plantDescriptionSimilarity(
    args.cultivarDescription,
    args.baseDescription,
    [args.cultivar ?? "", args.cultivarCommonName ?? "", args.baseCommonName ?? ""],
  ) >= 0.82;
}
