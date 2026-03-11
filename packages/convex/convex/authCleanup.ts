import { internalMutation } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
import { deleteAppUserData } from "./lib/deleteUserData";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_AGE_DAYS = 30;
const DEFAULT_BATCH_SIZE = 100;

function authTokenIdentifier(authUserId: string) {
  const issuer = process.env.CONVEX_SITE_URL?.trim();
  if (!issuer) {
    return null;
  }
  return `${issuer}|${authUserId}`;
}

async function deleteAuthRows(ctx: any, authUserId: string) {
  const paginationOpts = { numItems: DEFAULT_BATCH_SIZE, cursor: null };

  await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
    input: {
      model: "session",
      where: [{ field: "userId", value: authUserId }],
    },
    paginationOpts,
  });

  await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
    input: {
      model: "account",
      where: [{ field: "userId", value: authUserId }],
    },
    paginationOpts,
  });

  await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
    input: {
      model: "twoFactor",
      where: [{ field: "userId", value: authUserId }],
    },
    paginationOpts,
  });

  await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
    input: {
      model: "passkey",
      where: [{ field: "userId", value: authUserId }],
    },
    paginationOpts,
  });

  await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
    input: {
      model: "user",
      where: [{ field: "_id", value: authUserId }],
    },
  });
}

export const cleanupStaleAnonymousUsers = internalMutation({
  args: {
    maxAgeDays: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxAgeDays = Math.max(1, Math.floor(args.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS));
    const batchSize = Math.max(1, Math.min(200, Math.floor(args.batchSize ?? DEFAULT_BATCH_SIZE)));
    const cutoff = Date.now() - maxAgeDays * DAY_MS;

    const authUsersResult = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      where: [
        { field: "isAnonymous", value: true },
        { field: "createdAt", operator: "lt", value: cutoff },
      ],
      sortBy: {
        field: "createdAt",
        direction: "asc",
      },
      paginationOpts: {
        numItems: batchSize,
        cursor: null,
      },
    });

    let deleted = 0;
    let skipped = 0;

    for (const authUser of authUsersResult.page) {
      const sessionsResult = await ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: "session",
        where: [{ field: "userId", value: authUser._id }],
        sortBy: {
          field: "updatedAt",
          direction: "desc",
        },
        paginationOpts: {
          numItems: 10,
          cursor: null,
        },
      });

      const hasRecentSession = sessionsResult.page.some((session: any) => {
        const updatedAt = typeof session.updatedAt === "number" ? session.updatedAt : session.createdAt;
        return updatedAt > cutoff || session.expiresAt > Date.now();
      });

      const tokenIdentifier = authTokenIdentifier(authUser._id);
      const appUser = tokenIdentifier
        ? await ctx.db
            .query("users")
            .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
            .unique()
        : null;

      const appLastActiveAt = appUser?.lastSyncAt ?? appUser?._creationTime ?? 0;
      const hasRecentAppActivity = appLastActiveAt > cutoff;

      if (hasRecentSession || hasRecentAppActivity) {
        skipped += 1;
        continue;
      }

      if (appUser?.isAnonymous) {
        await deleteAppUserData(ctx, appUser);
      }

      await deleteAuthRows(ctx, authUser._id);
      deleted += 1;
    }

    return {
      ok: true as const,
      cutoff,
      scanned: authUsersResult.page.length,
      deleted,
      skipped,
      hasMore: !authUsersResult.isDone,
    };
  },
});
