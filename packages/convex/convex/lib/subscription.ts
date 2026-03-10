import type { Doc } from "../_generated/dataModel";

export function isPremiumActive(user: Doc<"users"> | null): boolean {
    if (!user || user.isAnonymous === true) return false;

    const subscription = user.subscription;
    if (subscription?.source && subscription.source !== "revenuecat") return false;
    if (subscription?.tier !== "premium") return false;

    return (
        subscription.expiresAt === undefined ||
        subscription.expiresAt > Date.now()
    );
}
