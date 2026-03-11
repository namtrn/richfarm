import { authComponent } from '../auth';
import { getRevenueCatAppUserIdForAuthSubject, getRevenueCatAppUserIdForDevice } from './revenuecat';
import { sanitizeAnonymousProfile } from '../../shared/src/authProfile';

function buildStoredAuthProfile(args: {
  isAnonymous?: boolean | null;
  name?: string | null;
  email?: string | null;
}) {
  const normalized = sanitizeAnonymousProfile(args);

  return {
    isAnonymous: normalized.isAnonymous,
    name: normalized.name,
    email: normalized.email,
  };
}

async function patchUserProfileIfNeeded(ctx: any, user: any, profile: ReturnType<typeof buildStoredAuthProfile>) {
  if (
    user.isAnonymous === profile.isAnonymous &&
    user.name === profile.name &&
    user.email === profile.email
  ) {
    return user;
  }

  await ctx.db.patch(user._id, {
    isAnonymous: profile.isAnonymous,
    name: profile.name,
    email: profile.email,
  });

  return {
    ...user,
    isAnonymous: profile.isAnonymous,
    name: profile.name,
    email: profile.email,
  };
}

export async function getUserByIdentityOrDevice(ctx: any, _deviceId?: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) {
    const authUser = await authComponent.safeGetAuthUser(ctx);
    const user = await ctx.db
      .query('users')
      .withIndex('by_token', (q: any) =>
        q.eq('tokenIdentifier', identity.tokenIdentifier)
      )
      .unique();

    if (!user) {
      return null;
    }

    return await patchUserProfileIfNeeded(
      ctx,
      user,
      buildStoredAuthProfile({
        isAnonymous: authUser?.isAnonymous ?? user.isAnonymous,
        name: authUser?.name ?? identity.name ?? user.name,
        email: authUser?.email ?? identity.email ?? user.email,
      })
    );
  }

  return null;
}

export async function requireUser(ctx: any, deviceId?: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Not authenticated');
  const authUser = await authComponent.safeGetAuthUser(ctx);

  const existingUser = await ctx.db
    .query('users')
    .withIndex('by_token', (q: any) =>
      q.eq('tokenIdentifier', identity.tokenIdentifier)
    )
    .unique();

  if (existingUser) {
    const profile = buildStoredAuthProfile({
      isAnonymous: authUser?.isAnonymous ?? existingUser.isAnonymous,
      name: authUser?.name ?? identity.name ?? existingUser.name,
      email: authUser?.email ?? identity.email ?? existingUser.email,
    });
    const revenueCatAppUserId =
      existingUser.revenueCatAppUserId ??
      getRevenueCatAppUserIdForAuthSubject(identity.subject);
    const nextUser = await patchUserProfileIfNeeded(ctx, existingUser, profile);

    if (nextUser.revenueCatAppUserId !== revenueCatAppUserId) {
      await ctx.db.patch(existingUser._id, {
        revenueCatAppUserId,
      });
      return {
        ...nextUser,
        revenueCatAppUserId,
      };
    }

    return nextUser;
  }

  const profile = buildStoredAuthProfile({
    isAnonymous: authUser?.isAnonymous === true,
    name: authUser?.name ?? identity.name,
    email: authUser?.email ?? identity.email,
  });
  const userId = await ctx.db.insert('users', {
    tokenIdentifier: identity.tokenIdentifier,
    revenueCatAppUserId: getRevenueCatAppUserIdForAuthSubject(identity.subject),
    ...(profile.name !== undefined ? { name: profile.name } : {}),
    ...(profile.email !== undefined ? { email: profile.email } : {}),
    ...(deviceId ? { deviceId } : {}),
    isAnonymous: profile.isAnonymous,
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
    const revenueCatAppUserId =
      existingUser.revenueCatAppUserId ??
      getRevenueCatAppUserIdForDevice(deviceId);
    if (existingUser.revenueCatAppUserId !== revenueCatAppUserId) {
      await ctx.db.patch(existingUser._id, { revenueCatAppUserId });
      return {
        ...existingUser,
        revenueCatAppUserId,
      };
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
