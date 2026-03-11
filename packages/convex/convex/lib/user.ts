import { ConvexError } from 'convex/values';
import { authComponent } from '../auth';
import {
  getRevenueCatAppUserIdForAuthSubject,
  getRevenueCatAppUserIdForDevice,
} from './revenuecat';

// ─── Helpers ────────────────────────────────────────────────────────────────

export function deviceToken(deviceId: string) {
  return `device:${deviceId}`;
}

export async function upsertUserFromIdentity(ctx: any, deviceId?: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const existingByIdentity = await ctx.db
    .query('users')
    .withIndex('by_token', (q: any) =>
      q.eq('tokenIdentifier', identity.tokenIdentifier)
    )
    .unique();

  if (existingByIdentity) {
    // Patch fields có thể thay đổi — idempotent
    const patch: Record<string, unknown> = { lastSyncAt: Date.now() };
    if (!existingByIdentity.revenueCatAppUserId) {
      patch.revenueCatAppUserId = getRevenueCatAppUserIdForAuthSubject(
        identity.subject
      );
    }
    if (deviceId && !existingByIdentity.deviceId) {
      patch.deviceId = deviceId;
    }
    if (!existingByIdentity.name && identity.name) {
      patch.name = identity.name;
    }
    if (!existingByIdentity.email && identity.email) {
      patch.email = identity.email;
    }
    await ctx.db.patch(existingByIdentity._id, patch);
    return { ...existingByIdentity, ...patch };
  }

  // Identity không tồn tại trong DB, nhưng có thể user đã click app trước khi session ready
  // và được tạo qua getOrCreateUserFromDevice (tokenIdentifier = device:ID).
  // Nếu vậy, ta cập nhật row đó sang identity-based token để giữ nguyên data (settings, plants...).
  if (deviceId) {
    const dToken = deviceToken(deviceId);
    const existingByDevice = await ctx.db
      .query('users')
      .withIndex('by_token', (q: any) => q.eq('tokenIdentifier', dToken))
      .unique();

    if (existingByDevice) {
      const authUser = await authComponent.safeGetAuthUser(ctx);
      const isAnonymous = authUser?.isAnonymous === true;
      const patch: Record<string, unknown> = {
        tokenIdentifier: identity.tokenIdentifier,
        revenueCatAppUserId: getRevenueCatAppUserIdForAuthSubject(
          identity.subject
        ),
        lastSyncAt: Date.now(),
        isAnonymous,
      };
      if (identity.name) patch.name = identity.name;
      if (identity.email) patch.email = identity.email;

      await ctx.db.patch(existingByDevice._id, patch);
      return { ...existingByDevice, ...patch };
    }
  }

  // User thực sự không tồn tại (fresh install hoặc admin đã xóa row)
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

// ─── requireUser: Auth-first gate ───────────────────────────────────────────

/**
 * Yêu cầu session hợp lệ. Nếu user row bị xóa → tự động recreate.
 * Throw ConvexError (structured) nếu không có identity.
 *
 * Auth-first: không fallback về deviceId.
 */
export async function requireUser(ctx: any, deviceId?: string) {
  const user =
    (await getOrCreateUserFromIdentity(ctx, deviceId)) ??
    (await getOrCreateUserFromDevice(ctx, deviceId));

  if (!user) {
    throw new ConvexError({
      code: 'UNAUTHORIZED',
      message: 'Failed to resolve user — please sign in again or check device connection',
    });
  }
  return user;
}

// ─── getOrCreateUserFromIdentity ────────────────────────────────────────────

/**
 * Soft version của requireUser — trả null thay vì throw nếu chưa có session.
 * Dùng trong queries hoặc mutations cho phép null user.
 */
export async function getOrCreateUserFromIdentity(ctx: any, deviceId?: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await upsertUserFromIdentity(ctx, deviceId);
}

// ─── getUserByIdentity (query-safe, no write) ───────────────────────────────

/**
 * Dùng trong queries — chỉ đọc, không tạo user mới.
 * Trả null nếu chưa có session hoặc user chưa tồn tại.
 */
export async function getUserByIdentity(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  return await ctx.db
    .query('users')
    .withIndex('by_token', (q: any) =>
      q.eq('tokenIdentifier', identity.tokenIdentifier)
    )
    .unique();
}

// ─── Device-only path (legacy — giữ lại chỉ để tránh break) ────────────────

/**
 * @deprecated Dùng upsertUserFromIdentity thay thế.
 * Chỉ dùng trong trường hợp đặc biệt không có identity.
 * Auth-first: không nên gọi function này trong các flow mới.
 */
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

// ─── getUserByIdentityOrDevice (legacy) ─────────────────────────────────────

/**
 * @deprecated Dùng getUserByIdentity thay thế.
 */
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
      .withIndex('by_token', (q: any) =>
        q.eq('tokenIdentifier', deviceToken(deviceId))
      )
      .unique();
  }

  return null;
}
