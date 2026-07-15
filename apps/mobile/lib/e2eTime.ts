export function getE2ENow() {
  const raw = process.env.EXPO_PUBLIC_E2E_NOW;
  if (!raw) return Date.now();
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}
