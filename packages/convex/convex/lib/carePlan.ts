export const DAY_MS = 86_400_000;

export type CareTaskType = "watering" | "fertilizing" | "pest_check" | "harvest_check";
export type CareTask = {
  type: CareTaskType;
  enabled: boolean;
  intervalDays?: number;
  expectedDate?: number;
};

export type LibraryCareSource = {
  plantId?: string;
  contentVersion?: number;
  sourceLabel?: string;
  wateringFrequencyDays?: number;
  fertilizingFrequencyDays?: number;
  typicalDaysToHarvest?: number;
};

function trustedPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}

export function deriveCarePlan(source: LibraryCareSource, plantedAt?: number) {
  const watering = trustedPositiveInteger(source.wateringFrequencyDays);
  const fertilizing = trustedPositiveInteger(source.fertilizingFrequencyDays);
  const harvestDays = trustedPositiveInteger(source.typicalDaysToHarvest);
  const tasks: CareTask[] = [
    { type: "watering", enabled: watering !== undefined, intervalDays: watering },
    { type: "fertilizing", enabled: fertilizing !== undefined, intervalDays: fertilizing },
    { type: "pest_check", enabled: false },
    {
      type: "harvest_check",
      enabled: harvestDays !== undefined && plantedAt !== undefined,
      expectedDate: harvestDays !== undefined && plantedAt !== undefined
        ? plantedAt + harvestDays * DAY_MS
        : undefined,
    },
  ];
  return {
    sourcePlantId: source.plantId,
    sourceContentVersion: trustedPositiveInteger(source.contentVersion),
    sourceLabel: source.sourceLabel,
    sourceValues: {
      wateringFrequencyDays: watering,
      fertilizingFrequencyDays: fertilizing,
      typicalDaysToHarvest: harvestDays,
    },
    tasks,
  };
}

export function applyCareTaskOverrides(
  tasks: CareTask[],
  overrides: Partial<Record<CareTaskType, Partial<Omit<CareTask, "type">>>>,
) {
  return tasks.map((task) => {
    const override = overrides[task.type];
    if (!override) return task;
    const intervalDays = trustedPositiveInteger(override.intervalDays);
    return {
      ...task,
      ...override,
      ...(override.intervalDays !== undefined && { intervalDays }),
    };
  });
}

function localParts(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  return Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
}

function offsetAt(timestamp: number, timezone: string) {
  const p = localParts(timestamp, timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(timestamp / 1000) * 1000;
}

/** Advances a local calendar date while preserving wall time across DST. */
export function addLocalDays(timestamp: number, intervalDays: number, timezone = "UTC") {
  const days = trustedPositiveInteger(intervalDays) ?? 1;
  let safeZone = timezone;
  try { localParts(timestamp, safeZone); } catch { safeZone = "UTC"; }
  const p = localParts(timestamp, safeZone);
  const desiredWallUtc = Date.UTC(p.year, p.month - 1, p.day + days, p.hour, p.minute, p.second);
  let candidate = desiredWallUtc - offsetAt(desiredWallUtc, safeZone);
  candidate = desiredWallUtc - offsetAt(candidate, safeZone);
  return candidate;
}

export function nextOccurrence(input: {
  scheduledAt: number;
  occurredAt: number;
  intervalDays: number;
  timezone?: string;
}) {
  let next = addLocalDays(input.scheduledAt, input.intervalDays, input.timezone);
  while (next <= input.occurredAt) {
    next = addLocalDays(next, input.intervalDays, input.timezone);
  }
  return next;
}

export function careReminderCopy(type: CareTaskType) {
  switch (type) {
    case "watering": return { title: "Check soil moisture", description: "Check the soil and plant condition; water only if it needs it." };
    case "fertilizing": return { title: "Consider plant nutrition", description: "Check growth and soil condition before deciding whether fertilizer is useful." };
    case "pest_check": return { title: "Inspect plant health", description: "Take a quick look for pests, disease, or stress." };
    case "harvest_check": return { title: "Check harvest readiness", description: "Look for signs that this plant may be ready to harvest." };
  }
}

export function batchKey(input: {
  dueAt: number; timezone?: string; gardenId?: string; bedId?: string;
}) {
  let zone = input.timezone ?? "UTC";
  try { localParts(input.dueAt, zone); } catch { zone = "UTC"; }
  const p = localParts(input.dueAt, zone);
  const day = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return `${day}:${input.gardenId ?? "none"}:${input.bedId ?? "none"}`;
}
