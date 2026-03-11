import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'scan_history_v1';
const MAX_ENTRIES = 100;

export type ScanStatus = 'identified' | 'unknown' | 'saved';

export interface ScanHistoryEntry {
  id: string;
  /** Local file URI of the scanned photo */
  photoUri: string | null;
  /** Display name returned by AI (or "Unknown plant") */
  plantName: string;
  /** plantMasterId from library if matched, otherwise null */
  plantMasterId: string | null;
  /** User-plant id if the plant was added to their garden, otherwise null */
  userPlantId: string | null;
  status: ScanStatus;
  /** Unix timestamp (ms) */
  scannedAt: number;
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function readAll(): Promise<ScanHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ScanHistoryEntry[];
  } catch {
    return [];
  }
}

async function writeAll(entries: ScanHistoryEntry[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/** Returns all entries, newest first. */
export async function getScanHistory(): Promise<ScanHistoryEntry[]> {
  const all = await readAll();
  return [...all].sort((a, b) => b.scannedAt - a.scannedAt);
}

/** Prepend a new scan entry. Trims to MAX_ENTRIES. Returns the new entry. */
export async function addScanEntry(
  data: Omit<ScanHistoryEntry, 'id' | 'scannedAt'>
): Promise<ScanHistoryEntry> {
  const entry: ScanHistoryEntry = {
    ...data,
    id: createId(),
    scannedAt: Date.now(),
  };
  const existing = await readAll();
  const updated = [entry, ...existing].slice(0, MAX_ENTRIES);
  await writeAll(updated);
  return entry;
}

/** Update the status or userPlantId of an existing entry by id. */
export async function updateScanEntry(
  id: string,
  patch: Partial<Pick<ScanHistoryEntry, 'status' | 'userPlantId' | 'plantMasterId'>>
): Promise<void> {
  const all = await readAll();
  const idx = all.findIndex((e) => e.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], ...patch };
  await writeAll(all);
}

/** Delete a single scan entry by id. */
export async function deleteScanEntry(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((e) => e.id !== id));
}

/** Clear the entire history. */
export async function clearScanHistory(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
