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

// ─── Core: upsert user từ identity (Auth-first) ─────────────────────────────

/**
 * Single source of truth để tạo/lấy user theo Better Auth identity.
 *
 * Edge cases xử lý:
 * - User chưa tồn tại trong DB → tạo mới
 * - User đã có nhưng thiếu revenueCatAppUserId → patch
 * - Admin xóa user row trong Convex → auto-recreate (session vẫn hợp lệ)
 * - isAnonymous flag đồng bộ từ Better Auth
 */
export async function upsertUserFromIdentity(ctx: any, deviceId?: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const existing = await ctx.db
    .query('users')
    .withIndex('by_token', (q: any) =>
      q.eq('tokenIdentifier', identity.tokenIdentifier)
    )
    .unique();

  if (existing) {
    // Patch fields có thể thay đổi — idempotent
    const patch: Record<string, unknown> = { lastSyncAt: Date.now() };
    if (!existing.revenueCatAppUserId) {
      patch.revenueCatAppUserId = getRevenueCatAppUserIdForAuthSubject(
        identity.subject
      );
    }
    if (deviceId && !existing.deviceId) {
      patch.deviceId = deviceId;
    }
    if (identity.name && existing.name !== identity.name) {
      patch.name = identity.name;
    }
    if (identity.email && existing.email !== identity.email) {
      patch.email = identity.email;
    }
    await ctx.db.patch(existing._id, patch);
    return { ...existing, ...patch };
  }

  // User không tồn tại (fresh install hoặc admin đã xóa row)
  // → tạo lại dựa trên identity — session vẫn hợp lệ
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
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: 'UNAUTHORIZED',
      message: 'Not authenticated — valid session required',
    });
  }

  const user = await upsertUserFromIdentity(ctx, deviceId);
  if (!user) {
    // Không nên xảy ra (identity đã check), nhưng guard phòng race condition
    throw new ConvexError({
      code: 'UNAUTHORIZED',
      message: 'Failed to resolve user — please sign in again',
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
