import AsyncStorage from '@react-native-async-storage/async-storage';

export type AiDetectorUsage = {
  date: string;
  count: number;
};

const STORAGE_PREFIX = 'ai_detector_usage:';

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildAiDetectorKey(userId?: string | null, deviceId?: string | null): string {
  if (userId) return `${STORAGE_PREFIX}user:${userId}`;
  if (deviceId) return `${STORAGE_PREFIX}device:${deviceId}`;
  return '';
}

export async function getAiDetectorUsage(key: string): Promise<AiDetectorUsage | null> {
  if (!key) return null;
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AiDetectorUsage;
    if (!parsed || typeof parsed.date !== 'string' || typeof parsed.count !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function isAiDetectorLimitReached(key: string, limitPerDay = 1): Promise<boolean> {
  if (!key) return false;
  const today = getLocalDateKey();
  const usage = await getAiDetectorUsage(key);
  const count = usage && usage.date === today ? usage.count : 0;
  return count >= limitPerDay;
}

export async function consumeAiDetectorUsage(key: string, limitPerDay = 1): Promise<{
  allowed: boolean;
  remaining: number;
  count: number;
  date: string;
}> {
  const today = getLocalDateKey();
  if (!key) {
    return { allowed: true, remaining: Math.max(limitPerDay - 1, 0), count: 1, date: today };
  }
  const usage = await getAiDetectorUsage(key);
  const count = usage && usage.date === today ? usage.count : 0;
  if (count >= limitPerDay) {
    return { allowed: false, remaining: 0, count, date: today };
  }
  const nextCount = count + 1;
  const nextUsage: AiDetectorUsage = { date: today, count: nextCount };
  await AsyncStorage.setItem(key, JSON.stringify(nextUsage));
  return { allowed: true, remaining: Math.max(limitPerDay - nextCount, 0), count: nextCount, date: today };
}
