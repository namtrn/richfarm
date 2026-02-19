import { buildSyncBatch } from './mappers';
import { loadSyncQueue } from './queue';

export type PreparedSyncBatch = {
  queuedCount: number;
  batch: ReturnType<typeof buildSyncBatch>;
};

export type SyncAttemptResult = {
  ok: boolean;
  reason: 'queue_empty' | 'backend_not_ready';
  queuedCount: number;
  batch: ReturnType<typeof buildSyncBatch>;
  attemptedAt: number;
};

let inflight: Promise<SyncAttemptResult> | null = null;

export async function prepareSyncBatch(): Promise<PreparedSyncBatch> {
  const queue = await loadSyncQueue();
  return {
    queuedCount: queue.length,
    batch: buildSyncBatch(queue),
  };
}

export async function syncQueue(): Promise<SyncAttemptResult> {
  if (inflight) return inflight;
  inflight = (async () => {
    const prepared = await prepareSyncBatch();
    if (prepared.queuedCount === 0) {
      return {
        ok: true,
        reason: 'queue_empty',
        attemptedAt: Date.now(),
        ...prepared,
      };
    }
    return {
      ok: false,
      reason: 'backend_not_ready',
      attemptedAt: Date.now(),
      ...prepared,
    };
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
