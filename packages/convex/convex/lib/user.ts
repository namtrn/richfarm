import { authComponent } from '../auth';
import {
  getRevenueCatAppUserIdForAuthSubject,
  getRevenueCatAppUserIdForDevice,
} from './revenuecat';

export function deviceToken(deviceId: string) {
  return `device:${deviceId}`;
}

export async function getUserByIdentityOrDevice(ctx: any, deviceId?: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) {
    return await ctx.db
      .query('users')
      .withIndex('by_token', (q: any) =>
        q.eq('tokenIdentifier', identity.tokenIdentifier)
      )
      .unique();
  }

  if (deviceId) {
    return await ctx.db
      .query('users')
      .withIndex('by_token', (q: any) => q.eq('tokenIdentifier', deviceToken(deviceId)))
      .unique();
  }

  return null;
}

export async function requireUser(ctx: any, deviceId?: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Not authenticated');

  const existingUser = await ctx.db
    .query('users')
    .withIndex('by_token', (q: any) =>
      q.eq('tokenIdentifier', identity.tokenIdentifier)
    )
    .unique();

  if (existingUser) {
    if (!existingUser.revenueCatAppUserId) {
      await ctx.db.patch(existingUser._id, {
        revenueCatAppUserId: getRevenueCatAppUserIdForAuthSubject(identity.subject),
      });
    }
    return existingUser;
  }

  const authUser = await authComponent.safeGetAuthUser(ctx);
  const isAnonymous = authUser?.isAnonymous === true;
  const userId = await ctx.db.insert('users', {
    tokenIdentifier: identity.tokenIdentifier,
    revenueCatAppUserId: getRevenueCatAppUserIdForAuthSubject(identity.subject),
    name: authUser?.name ?? identity.name,
    email: authUser?.email ?? identity.email,
    ...(deviceId ? { deviceId } : {}),
    isAnonymous,
    isActive: true,
    lastSyncAt: Date.now(),
  });

  return await ctx.db.get(userId);
}

export async function getOrCreateUserFromIdentity(ctx: any, deviceId?: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await requireUser(ctx, deviceId);
}

export async function getOrCreateUserFromDevice(ctx: any, deviceId?: string) {
  if (!deviceId) return null;
  const tokenIdentifier = deviceToken(deviceId);
  const existingUser = await ctx.db
    .query('users')
    .withIndex('by_token', (q: any) => q.eq('tokenIdentifier', tokenIdentifier))
    .unique();

  if (existingUser) {
    if (!existingUser.revenueCatAppUserId) {
      await ctx.db.patch(existingUser._id, {
        revenueCatAppUserId: getRevenueCatAppUserIdForDevice(deviceId),
      });
    }
    return existingUser;
  }

  const userId = await ctx.db.insert('users', {
    tokenIdentifier,
    revenueCatAppUserId: getRevenueCatAppUserIdForDevice(deviceId),
    deviceId,
    isAnonymous: true,
    isActive: true,
    lastSyncAt: Date.now(),
  });

  return await ctx.db.get(userId);
}
