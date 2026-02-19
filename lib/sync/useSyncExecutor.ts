import { useCallback, useRef } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { loadSyncQueue, removeSyncActions } from './queue';
import { buildSyncBatch } from './mappers';
import { useDeviceId } from '../deviceId';

export type SyncExecutorResult = {
    ok: boolean;
    syncedCount: number;
    errorCount: number;
    queuedCount: number;
};

export function useSyncExecutor() {
    const batchSync = useMutation(api.sync.batchSync);
    const { deviceId } = useDeviceId();
    const inflightRef = useRef(false);
    const lastQueuedCountRef = useRef(0);

    const execute = useCallback(async (): Promise<SyncExecutorResult> => {
        if (inflightRef.current) {
            return { ok: false, syncedCount: 0, errorCount: 0, queuedCount: lastQueuedCountRef.current };
        }

        inflightRef.current = true;
        try {
            const queue = await loadSyncQueue();
            lastQueuedCountRef.current = queue.length;
            if (queue.length === 0) {
                return { ok: true, syncedCount: 0, errorCount: 0, queuedCount: 0 };
            }

            const batch = buildSyncBatch(queue);

            const syncableCount = batch.activities.length + batch.harvests.length;
            if (syncableCount === 0) {
                return { ok: true, syncedCount: 0, errorCount: 0, queuedCount: queue.length };
            }

            // Photos are local-only for now (no Convex storage upload implemented)
            // Only sync activities and harvests
            const result = await batchSync({
                deviceId,
                activities: batch.activities.map((a) => ({
                    localId: a.localId,
                    plantId: a.plantId,
                    type: a.type,
                    note: a.note,
                    occurredAt: a.occurredAt,
                })),
                harvests: batch.harvests.map((h) => ({
                    localId: h.localId,
                    plantId: h.plantId,
                    quantity: h.quantity,
                    unit: h.unit,
                    note: h.note,
                    harvestedAt: h.harvestedAt,
                })),
            });

            const failedActivityLocalIds = new Set<string>();
            const failedHarvestLocalIds = new Set<string>();
            for (const error of result.errors) {
                const [kind, localId] = error.split(':');
                if (!localId) continue;
                if (kind === 'activity') failedActivityLocalIds.add(localId);
                if (kind === 'harvest') failedHarvestLocalIds.add(localId);
            }

            const syncedIds = queue
                .filter((item) => item.type === 'activity' || item.type === 'harvest')
                .filter((item) => {
                    const payload = item.payload as { localId?: string };
                    if (!payload?.localId) return false;
                    if (item.type === 'activity') return !failedActivityLocalIds.has(payload.localId);
                    return !failedHarvestLocalIds.has(payload.localId);
                })
                .map((item) => item.id);

            if (syncedIds.length > 0) {
                await removeSyncActions(syncedIds);
            }

            const totalSynced = syncedIds.length;
            const errorCount = result.errors.length;

            return {
                ok: errorCount === 0,
                syncedCount: totalSynced,
                errorCount,
                queuedCount: queue.length - syncedIds.length,
            };
        } catch {
            const queue = await loadSyncQueue();
            lastQueuedCountRef.current = queue.length;
            return {
                ok: false,
                syncedCount: 0,
                errorCount: 1,
                queuedCount: queue.length,
            };
        } finally {
            inflightRef.current = false;
        }
    }, [batchSync, deviceId]);

    return { execute };
}
