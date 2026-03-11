import { useCallback, useEffect, useState } from 'react';
import {
  ScanHistoryEntry,
  getScanHistory,
  deleteScanEntry,
  clearScanHistory,
} from '../lib/scanHistory';

export interface UseScanHistoryResult {
  history: ScanHistoryEntry[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
}

export function useScanHistory(): UseScanHistoryResult {
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getScanHistory();
      setHistory(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await deleteScanEntry(id);
    setHistory((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clear = useCallback(async () => {
    await clearScanHistory();
    setHistory([]);
  }, []);

  return { history, isLoading, refresh, remove, clear };
}
