export const REVENUECAT_ENTITLEMENT_ID = "premium";

function toHex(input: string) {
  return Array.from(new TextEncoder().encode(input), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}

function fnv1a(input: string, seed: number) {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildRevenueCatAppUserId(stableKey: string) {
  const normalized = stableKey.trim();
  if (!normalized) {
    throw new Error("RevenueCat app user id requires a non-empty stable key");
  }

  const encoded = toHex(normalized);
  const candidate = `rc_${encoded}`;
  if (candidate.length <= 100) {
    return candidate;
  }

  return `rc_${fnv1a(normalized, 0x811c9dc5)}${fnv1a(
    normalized.split("").reverse().join(""),
    0x9e3779b1
  )}`;
}

export function getRevenueCatAppUserIdForAuthSubject(subject: string) {
  return buildRevenueCatAppUserId(`auth:${subject}`);
}

export function getRevenueCatAppUserIdForDevice(deviceId: string) {
  return buildRevenueCatAppUserId(`device:${deviceId}`);
}
