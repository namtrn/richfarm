import type { Doc } from "../_generated/dataModel";
import { isPremiumActive } from "./subscription";

export const AI_SCAN_DAILY_LIMIT = {
    free: 3,
    premium: 10,
} as const;

export function getAiScanDailyLimit(user: Doc<"users">): number {
    return isPremiumActive(user) ? AI_SCAN_DAILY_LIMIT.premium : AI_SCAN_DAILY_LIMIT.free;
}

export function getAiScanDateKey(now = Date.now()): string {
    return new Date(now).toISOString().slice(0, 10);
}
