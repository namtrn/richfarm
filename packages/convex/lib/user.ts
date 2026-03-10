export async function getUserByIdentityOrDevice(ctx: any, _deviceId?: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) {
    return await ctx.db
      .query('users')
      .withIndex('by_token', (q: any) =>
        q.eq('tokenIdentifier', identity.tokenIdentifier)
      )
      .unique();
  }

  return null;
}

export async function requireUser(ctx: any, _deviceId?: string) {
  const user = await getUserByIdentityOrDevice(ctx);
  if (!user) throw new Error('Not authenticated');
  return user;
}
