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

    const execute = useCallback(async (): Promise<SyncExecutorResult> => {
        if (inflightRef.current) {
            return { ok: false, syncedCount: 0, errorCount: 0, queuedCount: 0 };
        }

        inflightRef.current = true;
        try {
            const queue = await loadSyncQueue();
            if (queue.length === 0) {
                return { ok: true, syncedCount: 0, errorCount: 0, queuedCount: 0 };
            }

            const batch = buildSyncBatch(queue);

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

            // Remove synced items from queue (keep photo actions since they can't be synced yet)
            const syncedIds = queue
                .filter((item) => item.type === 'activity' || item.type === 'harvest')
                .map((item) => item.id);
            if (syncedIds.length > 0) {
                await removeSyncActions(syncedIds);
            }

            const totalSynced = result.activitiesSynced + result.harvestsSynced;
            const errorCount = result.errors.length;

            return {
                ok: errorCount === 0,
                syncedCount: totalSynced,
                errorCount,
                queuedCount: queue.length - syncedIds.length,
            };
        } catch {
            const queue = await loadSyncQueue();
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
