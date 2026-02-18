import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'rf_device_id';
let cachedId: string | null = null;
let inflight: Promise<string> | null = null;

function generateDeviceId() {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `rf_${time}_${rand}`;
}

async function loadOrCreateDeviceId() {
  const existing = await AsyncStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const created = generateDeviceId();
  await AsyncStorage.setItem(STORAGE_KEY, created);
  return created;
}

export async function getDeviceId() {
  if (cachedId) return cachedId;
  if (!inflight) {
    inflight = loadOrCreateDeviceId()
      .then((id) => {
        cachedId = id;
        return id;
      })
      .catch(() => {
        const fallback = generateDeviceId();
        cachedId = fallback;
        return fallback;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useDeviceId() {
  const [deviceId, setDeviceId] = useState<string | undefined>(cachedId ?? undefined);

  useEffect(() => {
    let mounted = true;
    if (!deviceId) {
      getDeviceId().then((id) => {
        if (mounted) setDeviceId(id);
      });
    }
    return () => {
      mounted = false;
    };
  }, [deviceId]);

  return {
    deviceId,
    isLoading: !deviceId,
  };
}
