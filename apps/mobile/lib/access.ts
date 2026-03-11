import type { Doc } from '../../../packages/convex/convex/_generated/dataModel';

export type UserWithSubscription = Doc<'users'> | null | undefined;

export function isPremiumActive(user: UserWithSubscription): boolean {
  if (!user || user.isAnonymous === true) return false;

  const subscription = user.subscription;
  if (subscription?.source && subscription.source !== 'revenuecat') return false;
  if (subscription?.tier !== 'premium') return false;

  return subscription.expiresAt === undefined || subscription.expiresAt > Date.now();
}
