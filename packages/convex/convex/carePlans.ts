import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, getUserByIdentityOrDevice } from "./lib/user";
import { getOwnedPlantOrThrow } from "./lib/ownership";
import { appendPlantActivity } from "./lib/plantActivities";
import {
  CareTask, CareTaskType, applyCareTaskOverrides, careReminderCopy,
  deriveCarePlan, nextOccurrence, validateReminderOccurrence,
} from "./lib/carePlan";
import { markSyncDatasetChanged } from "./lib/syncProtocol";

const taskType = v.union(
  v.literal("watering"), v.literal("fertilizing"),
  v.literal("pest_check"), v.literal("harvest_check"),
);
const taskValidator = v.object({
  type: taskType,
  enabled: v.boolean(),
  intervalDays: v.optional(v.number()),
  expectedDate: v.optional(v.number()),
});
const outcomeValidator = v.union(
  v.literal("performed"), v.literal("checked_not_needed"),
  v.literal("snoozed"), v.literal("skipped"), v.literal("edited"),
  v.literal("disabled"), v.literal("deleted"),
);

async function librarySuggestion(ctx: any, plant: any) {
  if (!plant.plantMasterId) return deriveCarePlan({}, plant.plantedAt);
  const [care, content] = await Promise.all([
    ctx.db.query("plantCare").withIndex("by_plant", (q: any) => q.eq("plantId", plant.plantMasterId)).first(),
    ctx.db.query("plantCareI18n").withIndex("by_plant_locale", (q: any) =>
      q.eq("plantId", plant.plantMasterId).eq("locale", "en")
    ).first(),
  ]);
  return deriveCarePlan({
    plantId: String(plant.plantMasterId),
    contentVersion: content?.contentVersion,
    sourceLabel: "library:plantCare",
    wateringFrequencyDays: care?.wateringFrequencyDays,
    fertilizingFrequencyDays: care?.fertilizingFrequencyDays,
    typicalDaysToHarvest: care?.typicalDaysToHarvest,
  }, plant.plantedAt);
}

function firstRun(task: CareTask, now: number, timezone: string) {
  if (task.type === "harvest_check") return task.expectedDate;
  if (!task.intervalDays) return undefined;
  return nextOccurrence({
    scheduledAt: now, occurredAt: now,
    intervalDays: task.intervalDays, timezone,
  });
}

async function activatePlan(ctx: any, user: any, plant: any, plan: any) {
  const timezone = user.timezone ?? "UTC";
  const now = Date.now();
  for (const task of plan.tasks as CareTask[]) {
    if (!task.enabled) continue;
    const nextRunAt = firstRun(task, plan.activatedAt ?? now, timezone);
    if (!nextRunAt) continue;
    const entityUuid = `${plan.entityUuid}:${plan.planVersion}:${task.type}`;
    const existing = await ctx.db.query("reminders")
      .withIndex("by_user_entity_uuid", (q: any) =>
        q.eq("userId", user._id).eq("entityUuid", entityUuid)
      ).unique();
    if (existing) continue;
    const copy = careReminderCopy(task.type);
    await ctx.db.insert("reminders", {
      userId: user._id, userPlantId: plant._id, bedId: plant.bedId,
      carePlanId: plan._id, carePlanVersion: plan.planVersion,
      taskType: task.type, type: task.type, entityUuid, revision: 1,
      timezone, title: copy.title, description: copy.description,
      nextRunAt, rrule: task.intervalDays ? `FREQ=DAILY;INTERVAL=${task.intervalDays}` : undefined,
      enabled: true, priority: 3, completedCount: 0, skippedCount: 0,
      notificationMethods: ["push", "in_app", "care_plan_v2"],
    });
  }
}

export const getSuggestedPlan = query({
  args: { userPlantId: v.id("userPlants"), deviceId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getUserByIdentityOrDevice(ctx, args.deviceId);
    if (!user) return null;
    const plant = await ctx.db.get(args.userPlantId);
    if (!plant || plant.userId !== user._id || plant.isDeleted) return null;
    return await librarySuggestion(ctx, plant);
  },
});

export const getPlans = query({
  args: { userPlantId: v.optional(v.id("userPlants")), deviceId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getUserByIdentityOrDevice(ctx, args.deviceId);
    if (!user) return [];
    const rows = await ctx.db.query("userPlantCarePlans")
      .withIndex("by_user_plant", (q: any) => q.eq("userId", user._id))
      .collect();
    return args.userPlantId ? rows.filter((row: any) => row.userPlantId === args.userPlantId) : rows;
  },
});

export const materializePlan = mutation({
  args: {
    userPlantId: v.id("userPlants"), operationId: v.string(),
    tasks: v.optional(v.array(taskValidator)), deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.deviceId);
    const plant = await getOwnedPlantOrThrow(ctx, user._id, args.userPlantId);
    const entityUuid = `care-plan:${plant.entityUuid ?? plant._id}:${args.operationId}`;
    const prior = await ctx.db.query("userPlantCarePlans")
      .withIndex("by_user_entity_uuid", (q: any) => q.eq("userId", user._id).eq("entityUuid", entityUuid))
      .unique();
    if (prior) return prior;
    const plans = await ctx.db.query("userPlantCarePlans")
      .withIndex("by_user_plant", (q: any) => q.eq("userId", user._id).eq("userPlantId", plant._id))
      .collect();
    const suggestion = await librarySuggestion(ctx, plant);
    const suggestedTasks = suggestion.tasks as CareTask[];
    const tasks = args.tasks
      ? applyCareTaskOverrides(suggestedTasks, Object.fromEntries(args.tasks.map((task) =>
          [task.type, { enabled: task.enabled, intervalDays: task.intervalDays, expectedDate: task.expectedDate }]
        )) as Partial<Record<CareTaskType, Partial<Omit<CareTask, "type">>>>)
      : suggestedTasks;
    const planVersion = Math.max(0, ...plans.map((plan: any) => plan.planVersion)) + 1;
    for (const plan of plans.filter((row: any) => row.status === "active" || row.status === "draft")) {
      await ctx.db.patch(plan._id, { status: "superseded", revision: plan.revision + 1 });
    }
    const active = plant.status === "growing";
    const id = await ctx.db.insert("userPlantCarePlans", {
      userId: user._id, userPlantId: plant._id, entityUuid, revision: 1,
      planVersion, status: active ? "active" : "draft",
      sourcePlantId: suggestion.sourcePlantId
        ? ctx.db.normalizeId("plantsMaster", suggestion.sourcePlantId) ?? undefined
        : undefined,
      sourceContentVersion: suggestion.sourceContentVersion,
      sourceLabel: suggestion.sourceLabel, sourceValues: suggestion.sourceValues,
      tasks, activatedAt: active ? Date.now() : undefined, createdAt: Date.now(),
    });
    const plan = await ctx.db.get(id);
    if (active) await activatePlan(ctx, user, plant, plan);
    await markSyncDatasetChanged(ctx, user._id);
    return plan;
  },
});

export const resolveReminder = mutation({
  args: {
    reminderId: v.id("reminders"), operationId: v.string(),
    outcome: outcomeValidator, occurredAt: v.optional(v.number()),
    snoozedUntil: v.optional(v.number()), note: v.optional(v.string()),
    occurrenceKey: v.optional(v.string()),
    legacyCompatibility: v.optional(v.boolean()),
    intervalDays: v.optional(v.number()), enabled: v.optional(v.boolean()),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.deviceId);
    const prior = await ctx.db.query("reminderOutcomes")
      .withIndex("by_user_operation", (q: any) =>
        q.eq("userId", user._id).eq("operationId", args.operationId)
      ).unique();
    if (prior) return prior;
    const reminder = await ctx.db.get(args.reminderId);
    if (!reminder || reminder.userId !== user._id) throw new Error("Reminder not found");
    if (!reminder.enabled) throw new Error("Reminder is disabled");
    const plant = reminder.userPlantId ? await ctx.db.get(reminder.userPlantId) : null;
    if (!plant || plant.isDeleted || plant.status === "harvested" || plant.status === "archived") {
      throw new Error("Reminder plant is inactive");
    }
    const occurrenceError = validateReminderOccurrence(
      reminder,
      args.occurrenceKey,
      args.legacyCompatibility,
    );
    if (occurrenceError === "stale_reminder_occurrence") throw new Error("Reminder occurrence is stale");
    if (occurrenceError === "occurrence_key_required") throw new Error("Reminder occurrence key is required");
    if (occurrenceError === "legacy_occurrence_exemption_required") {
      throw new Error("Legacy reminder compatibility must be explicit");
    }
    const occurredAt = args.occurredAt ?? Date.now();
    const interval = args.intervalDays
      ?? Number(reminder.rrule?.match(/INTERVAL=(\d+)/i)?.[1] ?? 0);
    const patch: Record<string, unknown> = { revision: (reminder.revision ?? 1) + 1 };
    if (args.outcome === "snoozed") {
      if (!args.snoozedUntil || args.snoozedUntil <= occurredAt) throw new Error("Invalid snooze time");
      patch.snoozedUntil = args.snoozedUntil;
    } else if (args.outcome === "disabled" || args.outcome === "deleted") {
      patch.enabled = false;
    } else if (args.outcome === "edited") {
      if (args.enabled !== undefined) patch.enabled = args.enabled;
      if (args.intervalDays !== undefined) {
        if (!Number.isFinite(args.intervalDays) || args.intervalDays <= 0) throw new Error("Invalid interval");
        patch.rrule = `FREQ=DAILY;INTERVAL=${Math.max(1, Math.round(args.intervalDays))}`;
      }
    } else {
      patch.lastRunAt = occurredAt;
      patch.snoozedUntil = undefined;
      if (interval > 0) {
        patch.nextRunAt = nextOccurrence({
          scheduledAt: reminder.nextRunAt, occurredAt, intervalDays: interval,
          timezone: reminder.timezone ?? user.timezone ?? "UTC",
        });
      } else {
        patch.enabled = false;
      }
      if (args.outcome === "skipped") patch.skippedCount = (reminder.skippedCount ?? 0) + 1;
      else patch.completedCount = (reminder.completedCount ?? 0) + 1;
    }
    await ctx.db.patch(reminder._id, patch);
    let activityId;
    if (reminder.userPlantId) {
      const activityType = args.outcome === "performed"
        ? reminder.taskType === "watering" ? "watering"
          : reminder.taskType === "fertilizing" ? "fertilizing"
            : reminder.taskType === "harvest_check" ? "harvest_readiness_check"
              : "pest_inspection"
        : args.outcome === "checked_not_needed"
          ? reminder.taskType === "watering" ? "watering_check"
            : reminder.taskType === "fertilizing" ? "fertilizing_check"
              : reminder.taskType === "harvest_check" ? "harvest_readiness_check"
                : "pest_inspection"
          : args.outcome === "skipped" ? "reminder_skipped" : undefined;
      if (activityType) {
        activityId = await appendPlantActivity(ctx, {
          userId: user._id, userPlantId: reminder.userPlantId, reminderId: reminder._id,
          entityUuid: `reminder-outcome-activity:${args.operationId}`, revision: 1,
          type: activityType, occurredAt, source: "reminder", note: args.note,
          value: { action: args.outcome, reminderType: reminder.taskType ?? reminder.type },
        });
        if (activityType === "watering") await ctx.db.patch(reminder.userPlantId, { lastWateredAt: occurredAt });
        if (activityType === "fertilizing") await ctx.db.patch(reminder.userPlantId, { lastFertilizedAt: occurredAt });
      }
    }
    const outcomeId = await ctx.db.insert("reminderOutcomes", {
      userId: user._id, userPlantId: reminder.userPlantId, reminderId: reminder._id,
      entityUuid: `reminder-outcome:${args.operationId}`, revision: 1,
      operationId: args.operationId, outcome: args.outcome, occurredAt,
      recordedAt: Date.now(), snoozedUntil: args.snoozedUntil, note: args.note, activityId,
    });
    await markSyncDatasetChanged(ctx, user._id);
    return await ctx.db.get(outcomeId);
  },
});
