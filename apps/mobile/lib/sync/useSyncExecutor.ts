import { useCallback, useRef } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../packages/convex/_generated/api';
import type { Id } from '../../../../packages/convex/_generated/dataModel';
import { loadSyncQueue, markSyncAttempt, removeSyncActions } from './queue';
import { buildSyncBatch, mapSyncActionToPhoto } from './mappers';
import { useDeviceId } from '../deviceId';
import { SyncActionType } from './types';

export type SyncExecutorResult = {
    ok: boolean;
    syncedCount: number;
    errorCount: number;
    queuedCount: number;
};

type SyncExecuteOptions = {
    types?: SyncActionType[];
    plantId?: string;
};

export function useSyncExecutor() {
    const batchSync = useMutation(api.sync.batchSync);
    const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
    const savePhoto = useMutation(api.storage.savePhoto);
    const { deviceId } = useDeviceId();
    const inflightRef = useRef(false);
    const lastQueuedCountRef = useRef(0);

    const filterQueue = useCallback(
        (queue: Awaited<ReturnType<typeof loadSyncQueue>>, options?: SyncExecuteOptions) => {
            let filteredQueue = queue;
            if (options?.types?.length) {
                filteredQueue = filteredQueue.filter((item) => options.types!.includes(item.type));
            }
            if (options?.plantId) {
                filteredQueue = filteredQueue.filter((item) => item.plantId === options.plantId);
            }
            return filteredQueue;
        },
        []
    );

    const execute = useCallback(async (options?: SyncExecuteOptions): Promise<SyncExecutorResult> => {
        if (inflightRef.current) {
            const queue = await loadSyncQueue();
            const filteredQueue = filterQueue(queue, options);
            lastQueuedCountRef.current = filteredQueue.length;
            return { ok: false, syncedCount: 0, errorCount: 0, queuedCount: filteredQueue.length };
        }

        inflightRef.current = true;
        try {
            const queue = await loadSyncQueue();
            const filteredQueue = filterQueue(queue, options);
            lastQueuedCountRef.current = filteredQueue.length;
            if (filteredQueue.length === 0) {
                return { ok: true, syncedCount: 0, errorCount: 0, queuedCount: 0 };
            }

            const batch = buildSyncBatch(filteredQueue);
            const syncedIds = new Set<string>();
            let errorCount = 0;

            const photoItems = filteredQueue.filter((item) => item.type === 'photo');
            for (const item of photoItems) {
                const photo = mapSyncActionToPhoto(item);
                if (!photo) continue;
                try {
                    const uploadUrl = await generateUploadUrl({ deviceId });
                    const response = await fetch(photo.localUri);
                    const blob = await response.blob();
                    const uploadResponse = await fetch(uploadUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': blob.type || 'application/octet-stream' },
                        body: blob,
                    });
                    if (!uploadResponse.ok) {
                        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
                    }
                    const { storageId } = await uploadResponse.json();
                    await savePhoto({
                        deviceId,
                        plantId: photo.plantId as Id<'userPlants'>,
                        storageId: storageId as Id<'_storage'>,
                        capturedAt: photo.capturedAt,
                        localId: photo.localId,
                        source: photo.source,
                    });
                    syncedIds.add(item.id);
                } catch (error) {
                    errorCount += 1;
                    const message =
                        error instanceof Error ? error.message : 'photo_upload_failed';
                    await markSyncAttempt(item.id, message);
                }
            }

            const syncableCount = batch.activities.length + batch.harvests.length;
            if (syncableCount > 0) {
                try {
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

                    const syncedActivityLocalIds = new Set<string>(
                        result.syncedActivityLocalIds ?? []
                    );
                    const syncedHarvestLocalIds = new Set<string>(
                        result.syncedHarvestLocalIds ?? []
                    );
                    const errorByLocalId = new Map<string, string>();
                    for (const error of result.errors) {
                        const [kind, localId, ...rest] = error.split(':');
                        if (!localId) continue;
                        const message =
                            rest.length > 0 ? rest.join(':') : 'sync_failed';
                        if (kind === 'activity' || kind === 'harvest') {
                            errorByLocalId.set(`${kind}:${localId}`, message);
                        }
                    }
                    errorCount += result.errors.length;

                    for (const item of filteredQueue) {
                        if (item.type !== 'activity' && item.type !== 'harvest') continue;
                        const payload = item.payload as { localId?: string };
                        if (!payload?.localId) continue;
                        const key = `${item.type}:${payload.localId}`;
                        const synced =
                            item.type === 'activity'
                                ? syncedActivityLocalIds.has(payload.localId)
                                : syncedHarvestLocalIds.has(payload.localId);
                        if (synced) {
                            syncedIds.add(item.id);
                            continue;
                        }
                        const message = errorByLocalId.get(key) ?? 'sync_pending';
                        await markSyncAttempt(item.id, message);
                    }
                } catch (error) {
                    errorCount += syncableCount;
                    const message =
                        error instanceof Error ? error.message : 'sync_failed';
                    const pendingItems = filteredQueue.filter(
                        (item) => item.type === 'activity' || item.type === 'harvest'
                    );
                    await Promise.all(
                        pendingItems.map((item) => markSyncAttempt(item.id, message))
                    );
                }
            }

            if (syncedIds.size > 0) {
                await removeSyncActions(Array.from(syncedIds));
            }

            return {
                ok: errorCount === 0,
                syncedCount: syncedIds.size,
                errorCount,
                queuedCount: filteredQueue.length - syncedIds.size,
            };
        } catch {
            const queue = await loadSyncQueue();
            const filteredQueue = filterQueue(queue, options);
            lastQueuedCountRef.current = filteredQueue.length;
            return {
                ok: false,
                syncedCount: 0,
                errorCount: 1,
                queuedCount: filteredQueue.length,
            };
        } finally {
            inflightRef.current = false;
        }
    }, [batchSync, deviceId, filterQueue, generateUploadUrl, savePhoto]);

    return { execute };
}
