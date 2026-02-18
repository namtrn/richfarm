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
  const user = await getUserByIdentityOrDevice(ctx, deviceId);
  if (!user) throw new Error('Not authenticated');
  return user;
}
