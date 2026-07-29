export function getSyncRetryDelay(
  lastAttemptAt: number,
  now: number,
  minimumIntervalMs: number,
) {
  return Math.max(0, minimumIntervalMs - (now - lastAttemptAt));
}
