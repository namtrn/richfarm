import type { Id } from "../_generated/dataModel";

type UserId = Id<"users">;

function requireConvexIssuer() {
  const issuer = process.env.CONVEX_SITE_URL;
  if (!issuer) {
    throw new Error("CONVEX_SITE_URL is not set");
  }
  return issuer;
}

export function authTokenIdentifier(subject: string) {
  return `${requireConvexIssuer()}|${subject}`;
}

export async function getAppUserByTokenIdentifier(
  ctx: any,
  tokenIdentifier: string
) {
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q: any) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeDefined<T extends Record<string, unknown>>(
  base?: T,
  override?: T
): Partial<T> | undefined {
  if (!base && !override) return undefined;
  const merged: Record<string, unknown> = {};

  for (const candidate of [base, override]) {
    if (!candidate) continue;
    for (const [key, value] of Object.entries(candidate)) {
      if (value === undefined) continue;
      const current = merged[key];
      if (isRecord(current) && isRecord(value)) {
        merged[key] = mergeDefined(current, value);
        continue;
      }
      merged[key] = value;
    }
  }

  return merged as Partial<T>;
}

function preferNumber(...values: Array<number | undefined>) {
  return values.reduce<number | undefined>((max, value) => {
    if (value === undefined) return max;
    if (max === undefined) return value;
    return Math.max(max, value);
  }, undefined);
}

async function patchRowsByUser(
  ctx: any,
  table:
    | "gardens"
    | "beds"
    | "userPlants"
    | "userFavorites"
    | "reminders"
    | "deviceTokens",
  fromUserId: UserId,
  toUserId: UserId
) {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_user", (q: any) => q.eq("userId", fromUserId))
    .collect();

  for (const row of rows) {
    await ctx.db.patch(row._id, { userId: toUserId });
  }

  return rows;
}

async function movePlantScopedData(ctx: any, fromUserId: UserId, toUserId: UserId) {
  const plants = await patchRowsByUser(ctx, "userPlants", fromUserId, toUserId);

  for (const plant of plants) {
    const [photos, logs, harvestRecords] = await Promise.all([
      ctx.db
        .query("plantPhotos")
        .withIndex("by_user_plant", (q: any) => q.eq("userPlantId", plant._id))
        .collect(),
      ctx.db
        .query("logs")
        .withIndex("by_user_plant", (q: any) => q.eq("userPlantId", plant._id))
        .collect(),
      ctx.db
        .query("harvestRecords")
        .withIndex("by_user_plant", (q: any) => q.eq("userPlantId", plant._id))
        .collect(),
    ]);

    for (const photo of photos) {
      await ctx.db.patch(photo._id, { userId: toUserId });
    }

    for (const row of logs) {
      await ctx.db.patch(row._id, { userId: toUserId });
    }

    for (const row of harvestRecords) {
      await ctx.db.patch(row._id, { userId: toUserId });
    }
  }
}

async function mergeUserSettings(ctx: any, fromUserId: UserId, toUserId: UserId) {
  const [source, target] = await Promise.all([
    ctx.db
      .query("userSettings")
      .withIndex("by_user", (q: any) => q.eq("userId", fromUserId))
      .unique(),
    ctx.db
      .query("userSettings")
      .withIndex("by_user", (q: any) => q.eq("userId", toUserId))
      .unique(),
  ]);

  if (!source) {
    return;
  }

  if (!target) {
    await ctx.db.patch(source._id, { userId: toUserId });
    return;
  }

  const merged = mergeDefined(
    {
      appMode: source.appMode,
      theme: source.theme,
      defaultView: source.defaultView,
      showWeatherCard: source.showWeatherCard,
      unitSystem: source.unitSystem,
      emailNotifications: source.emailNotifications,
      pushNotifications: source.pushNotifications,
      shareAnonymousData: source.shareAnonymousData,
      onboarding: source.onboarding,
    },
    {
      appMode: target.appMode,
      theme: target.theme,
      defaultView: target.defaultView,
      showWeatherCard: target.showWeatherCard,
      unitSystem: target.unitSystem,
      emailNotifications: target.emailNotifications,
      pushNotifications: target.pushNotifications,
      shareAnonymousData: target.shareAnonymousData,
      onboarding: target.onboarding,
    }
  );

  if (merged) {
    await ctx.db.patch(target._id, merged);
  }

  await ctx.db.delete(source._id);
}

async function rewriteSharedBedRefs(ctx: any, fromUserId: UserId, toUserId: UserId) {
  const beds = await ctx.db.query("beds").collect();

  for (const bed of beds) {
    if (!bed.sharedWith?.length) continue;

    let changed = false;
    const nextSharedWith = bed.sharedWith.map((entry: any) => {
      if (entry.userId !== fromUserId) {
        return entry;
      }
      changed = true;
      return { ...entry, userId: toUserId };
    });

    if (!changed) continue;

    const deduped = nextSharedWith.filter(
      (entry: any, index: number, list: any[]) =>
        list.findIndex((candidate) => candidate.userId === entry.userId) === index
    );

    await ctx.db.patch(bed._id, { sharedWith: deduped });
  }
}

export async function mergeAnonymousUserIntoAccount(
  ctx: any,
  args: {
    anonymousAuthUserId: string;
    authenticatedAuthUserId: string;
    authenticatedName?: string | null;
    authenticatedEmail?: string | null;
  }
) {
  const sourceTokenIdentifier = authTokenIdentifier(args.anonymousAuthUserId);
  const targetTokenIdentifier = authTokenIdentifier(args.authenticatedAuthUserId);

  const [sourceUser, targetUser] = await Promise.all([
    getAppUserByTokenIdentifier(ctx, sourceTokenIdentifier),
    getAppUserByTokenIdentifier(ctx, targetTokenIdentifier),
  ]);

  if (!sourceUser && !targetUser) {
    return;
  }

  if (!sourceUser && targetUser) {
    await ctx.db.patch(targetUser._id, {
      isAnonymous: false,
      name: args.authenticatedName ?? targetUser.name,
      email: args.authenticatedEmail ?? targetUser.email,
      lastSyncAt: preferNumber(targetUser.lastSyncAt, Date.now()),
    });
    return;
  }

  if (!sourceUser) {
    return;
  }

  if (!targetUser || targetUser._id === sourceUser._id) {
    await ctx.db.patch(sourceUser._id, {
      tokenIdentifier: targetTokenIdentifier,
      isAnonymous: false,
      name: args.authenticatedName ?? sourceUser.name,
      email: args.authenticatedEmail ?? sourceUser.email,
      lastSyncAt: preferNumber(sourceUser.lastSyncAt, Date.now()),
    });
    return;
  }

  await patchRowsByUser(ctx, "gardens", sourceUser._id, targetUser._id);
  await patchRowsByUser(ctx, "beds", sourceUser._id, targetUser._id);
  await movePlantScopedData(ctx, sourceUser._id, targetUser._id);
  await patchRowsByUser(ctx, "userFavorites", sourceUser._id, targetUser._id);
  await patchRowsByUser(ctx, "reminders", sourceUser._id, targetUser._id);
  await patchRowsByUser(ctx, "deviceTokens", sourceUser._id, targetUser._id);
  await mergeUserSettings(ctx, sourceUser._id, targetUser._id);
  await rewriteSharedBedRefs(ctx, sourceUser._id, targetUser._id);

  const authoredRecipes = await ctx.db
    .query("preservationRecipes")
    .withIndex("by_author", (q: any) => q.eq("authorId", sourceUser._id))
    .collect();
  for (const recipe of authoredRecipes) {
    await ctx.db.patch(recipe._id, { authorId: targetUser._id });
  }

  const mergedUser = mergeDefined(
    {
      name: sourceUser.name,
      email: sourceUser.email,
      avatarUrl: sourceUser.avatarUrl,
      deviceId: sourceUser.deviceId,
      locale: sourceUser.locale,
      timezone: sourceUser.timezone,
      zoneCode: sourceUser.zoneCode,
      frostDates: sourceUser.frostDates,
      notificationPreferences: sourceUser.notificationPreferences,
      aiConsent: sourceUser.aiConsent,
      subscription: sourceUser.subscription,
      isActive: sourceUser.isActive,
      lastSyncAt: sourceUser.lastSyncAt,
    },
    {
      name: args.authenticatedName ?? targetUser.name,
      email: args.authenticatedEmail ?? targetUser.email,
      avatarUrl: targetUser.avatarUrl,
      deviceId: targetUser.deviceId,
      locale: targetUser.locale,
      timezone: targetUser.timezone,
      zoneCode: targetUser.zoneCode,
      frostDates: targetUser.frostDates,
      notificationPreferences: targetUser.notificationPreferences,
      aiConsent: targetUser.aiConsent,
      subscription: targetUser.subscription,
      isActive: targetUser.isActive,
      lastSyncAt: preferNumber(targetUser.lastSyncAt, sourceUser.lastSyncAt, Date.now()),
    }
  );

  await ctx.db.patch(targetUser._id, {
    ...mergedUser,
    tokenIdentifier: targetTokenIdentifier,
    isAnonymous: false,
    isActive: targetUser.isActive || sourceUser.isActive,
  });

  await ctx.db.delete(sourceUser._id);
}
