import { describe, expect, it } from "vitest";
import {
  addLocalDays, applyCareTaskOverrides, batchKey, careReminderCopy,
  deriveCarePlan, nextOccurrence,
} from "./carePlan";

describe("care plan derivation", () => {
  it("uses only trustworthy Library values and snapshots their version", () => {
    const plan = deriveCarePlan({
      plantId: "tomato", contentVersion: 4, sourceLabel: "reviewed-library",
      wateringFrequencyDays: 3, fertilizingFrequencyDays: 14,
      typicalDaysToHarvest: 80,
    }, Date.UTC(2026, 0, 1));
    expect(plan.sourceContentVersion).toBe(4);
    expect(plan.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "watering", enabled: true, intervalDays: 3 }),
      expect.objectContaining({ type: "harvest_check", enabled: true }),
      expect.objectContaining({ type: "pest_check", enabled: false }),
    ]));
  });

  it("does not invent missing or invalid intervals", () => {
    const plan = deriveCarePlan({ wateringFrequencyDays: 0, fertilizingFrequencyDays: NaN });
    expect(plan.tasks.filter((task) => task.enabled)).toHaveLength(0);
  });

  it("applies explicit overrides without mutating the source snapshot", () => {
    const original = deriveCarePlan({ wateringFrequencyDays: 3 }).tasks;
    const changed = applyCareTaskOverrides(original, { watering: { intervalDays: 5 }, pest_check: { enabled: true, intervalDays: 7 } });
    expect(original[0].intervalDays).toBe(3);
    expect(changed[0].intervalDays).toBe(5);
    expect(changed[2]).toMatchObject({ enabled: true, intervalDays: 7 });
  });
});

describe("care recurrence and batching", () => {
  it("preserves local wall time over a spring DST boundary", () => {
    const start = Date.parse("2026-03-07T13:00:00Z"); // 08:00 New York
    const next = addLocalDays(start, 1, "America/New_York");
    expect(new Date(next).toISOString()).toBe("2026-03-08T12:00:00.000Z");
  });

  it("advances until strictly after a late outcome", () => {
    expect(nextOccurrence({ scheduledAt: 0, occurredAt: 3 * 86_400_000, intervalDays: 2, timezone: "UTC" }))
      .toBe(4 * 86_400_000);
  });

  it("groups by local day and organization", () => {
    expect(batchKey({ dueAt: Date.parse("2026-01-01T01:00:00Z"), timezone: "America/Los_Angeles", gardenId: "g", bedId: "b" }))
      .toBe("2025-12-31:g:b");
  });

  it("uses non-coercive copy", () => {
    expect(careReminderCopy("watering").description).toMatch(/check/i);
    expect(careReminderCopy("watering").description).not.toMatch(/^water/i);
  });
});
