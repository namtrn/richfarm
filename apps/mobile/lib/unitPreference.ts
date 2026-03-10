import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UnitSystem } from './units';

const STORAGE_KEY = 'richfarm:unitSystem';

let cachedUnitSystem: UnitSystem | undefined;
let hydrated = false;
const listeners = new Set<(unitSystem?: UnitSystem) => void>();

function normalizeUnitSystem(value?: string | null): UnitSystem | undefined {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'metric' || normalized === 'imperial') return normalized;
  return undefined;
}

function emit(unitSystem?: UnitSystem) {
  for (const listener of listeners) {
    listener(unitSystem);
  }
}

export function getCachedUnitSystemPreference() {
  return cachedUnitSystem;
}

export async function hydrateUnitSystemPreference() {
  if (hydrated) return cachedUnitSystem;
  hydrated = true;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  cachedUnitSystem = normalizeUnitSystem(raw);
  return cachedUnitSystem;
}

export async function setUnitSystemPreference(unitSystem?: UnitSystem) {
  cachedUnitSystem = unitSystem;
  if (!unitSystem) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    emit(undefined);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, unitSystem);
  emit(unitSystem);
}

export function subscribeUnitSystemPreference(listener: (unitSystem?: UnitSystem) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
