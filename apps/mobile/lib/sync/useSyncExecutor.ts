import { useCallback, useRef } from 'react';
import { useConvex, useMutation } from 'convex/react';
import { api } from '../../../../packages/convex/convex/_generated/api';
import type { Id } from '../../../../packages/convex/convex/_generated/dataModel';
import {
    loadOutbox,
    loadSyncQueue,
    markSyncAttempt,
    quarantineSyncAction,
    removeSyncActions,
    setSyncGeneration,
    updateSyncActionPayload,
} from './queue';
import { buildSyncBatch, mapSyncActionToPhoto } from './mappers';
import { useDeviceId } from '../deviceId';
import { EntityOperationPayload, SyncActionType } from './types';
import { authClient } from '../auth-client';
import { reconcileAuthoritativeSnapshot } from './reconciliation';
import {
    loadPreferenceQueue,
    rebasePreferencePatch,
    removePreferencePatch,
} from './preferencesQueue';

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
    const convex = useConvex();
    const batchSync = useMutation(api.sync.batchSync);
    const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
    const savePhoto = useMutation(api.storage.savePhoto);
    const ensureSession = useMutation(api.syncV2.ensureSession);
    const applyOperation = useMutation(api.syncV2.applyOperation);
    const applyPreferencesPatch = useMutation(api.userSettings.applyPreferencesPatch);
    const { deviceId } = useDeviceId();
    const { data: session } = authClient.useSession();
    const scope = deviceId
        ? `${deviceId}:${session?.user?.id ?? 'guest'}`
        : undefined;
    const scopeRef = useRef(scope);
    scopeRef.current = scope;
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
            const queue = (await loadSyncQueue(scope)).filter(
                (item) => !item.nextAttemptAt || item.nextAttemptAt <= Date.now()
            );
            const filteredQueue = filterQueue(queue, options);
            lastQueuedCountRef.current = filteredQueue.length;
            return { ok: false, syncedCount: 0, errorCount: 0, queuedCount: filteredQueue.length };
        }

        inflightRef.current = true;
        try {
            const outbox = await loadOutbox(scope);
            let generation = outbox.syncGeneration;
            const serverSession = await ensureSession({ deviceId });
            if (generation && serverSession && generation !== serverSession.generation) {
                for (const operation of outbox.operations) {
                    await quarantineSyncAction(operation.id, 'wrong_generation', scope);
                }
                await setSyncGeneration(serverSession.generation, scope);
                return {
                    ok: false,
                    syncedCount: 0,
                    errorCount: outbox.operations.length,
                    queuedCount: 0,
                };
            }
            if (!generation) generation = serverSession?.generation;
            if (generation && generation !== outbox.syncGeneration) await setSyncGeneration(generation, scope);
            if (scope && generation) {
                const reconciliation = await reconcileAuthoritativeSnapshot({
                    client: convex,
                    deviceId,
                    scope,
                    generation,
                    isCurrent: () => scopeRef.current === scope,
                });
                if (reconciliation.status === 'scope_changed') {
                    return { ok: false, syncedCount: 0, errorCount: 0, queuedCount: outbox.operations.length };
                }
            }
            const queue = outbox.operations.filter(
                (item) => !item.nextAttemptAt || item.nextAttemptAt <= Date.now()
            );
            const filteredQueue = filterQueue(queue, options);
            lastQueuedCountRef.current = filteredQueue.length;
            const batch = buildSyncBatch(filteredQueue);
            const syncedIds = new Set<string>();
            let errorCount = 0;

            if (scope && serverSession) {
                const preferenceGeneration = `preferences:${serverSession.userId}`;
                const preferenceQueue = await loadPreferenceQueue(scope);
                for (const preference of preferenceQueue) {
                    try {
                        let result = await applyPreferencesPatch({
                            deviceId,
                            operationId: preference.operationId,
                            baseRevision: preference.baseRevision,
                            generation: preference.generation ?? preferenceGeneration,
                            patch: preference.patch,
                        });
                        if (result.status === 'revision_conflict') {
                            await rebasePreferencePatch(scope, preference.operationId, result.revision, preferenceGeneration);
                            result = await applyPreferencesPatch({
                                deviceId,
                                operationId: preference.operationId,
                                baseRevision: result.revision,
                                generation: preferenceGeneration,
                                patch: preference.patch,
                            });
                        }
                        if (result.status === 'applied' || result.status === 'already_applied') {
                            await removePreferencePatch(scope, preference.operationId);
                        } else {
                            errorCount++;
                        }
                    } catch {
                        errorCount++;
                    }
                }
            }

            const entityRank = { garden: 0, bed: 1, plant: 2, activity: 3, harvest: 3, photo: 3 } as const;
            const entityItems = filteredQueue
                .filter((item) => item.type === 'entity')
                .sort((a, b) => {
                    const left = a.payload as EntityOperationPayload;
                    const right = b.payload as EntityOperationPayload;
                    const leftRank = left.operationType === 'delete' ? 100 - entityRank[left.entityType] : entityRank[left.entityType];
                    const rightRank = right.operationType === 'delete' ? 100 - entityRank[right.entityType] : entityRank[right.entityType];
                    return leftRank - rightRank || a.createdAt - b.createdAt;
                });
            const failedEntities = new Set<string>();
            for (const item of entityItems) {
                const operation = item.payload as EntityOperationPayload;
                const dependencies = Object.values(operation.parentRefs ?? {}).filter(
                    (value): value is string => typeof value === 'string'
                );
                if (dependencies.some((value) => failedEntities.has(value))) continue;
                if (!generation) {
                    await markSyncAttempt(item.id, 'sync_session_unavailable', scope);
                    failedEntities.add(operation.entityUuid);
                    errorCount++;
                    continue;
                }
                try {
                    const result = await applyOperation({
                        deviceId,
                        operationId: operation.operationId,
                        syncGeneration: generation,
                        entityType: operation.entityType,
                        entityUuid: operation.entityUuid,
                        type: operation.operationType,
                        baseRevision: operation.baseRevision,
                        parentRefs: operation.parentRefs,
                        payload: operation.payload,
                    });
                    if (result.status === 'applied' || result.status === 'already_applied' || result.status === 'discarded_deleted' || result.status === 'discarded_stale') {
                        syncedIds.add(item.id);
                    } else if (result.status === 'wrong_generation') {
                        await quarantineSyncAction(item.id, result.status, scope);
                        failedEntities.add(operation.entityUuid);
                        errorCount++;
                    } else if (result.status === 'revision_conflict' || result.status === 'invalid_parent' || result.status === 'missing_target' || result.status === 'operation_conflict') {
                        await quarantineSyncAction(item.id, result.status, scope);
                        failedEntities.add(operation.entityUuid);
                        errorCount++;
                    } else {
                        await markSyncAttempt(item.id, result.status, scope);
                        failedEntities.add(operation.entityUuid);
                        errorCount++;
                    }
                } catch (error) {
                    await markSyncAttempt(item.id, error instanceof Error ? error.message : 'sync_failed', scope);
                    failedEntities.add(operation.entityUuid);
                    errorCount++;
                }
            }

            const photoItems = filteredQueue.filter((item) => item.type === 'photo');
            for (const item of photoItems) {
                const photo = mapSyncActionToPhoto(item);
                if (!photo) continue;
                try {
                    let storageId = photo.storageId;
                    if (!storageId) {
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
                        const uploaded = await uploadResponse.json();
                        storageId = uploaded.storageId;
                        await updateSyncActionPayload(item.id, { ...item.payload, storageId }, scope);
                    }
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
                    await markSyncAttempt(item.id, message, scope);
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
                        await markSyncAttempt(item.id, message, scope);
                    }
                } catch (error) {
                    errorCount += syncableCount;
                    const message =
                        error instanceof Error ? error.message : 'sync_failed';
                    const pendingItems = filteredQueue.filter(
                        (item) => item.type === 'activity' || item.type === 'harvest'
                    );
                    await Promise.all(
                        pendingItems.map((item) => markSyncAttempt(item.id, message, scope))
                    );
                }
            }

            if (syncedIds.size > 0) {
                await removeSyncActions(Array.from(syncedIds), scope);
            }

            return {
                ok: errorCount === 0,
                syncedCount: syncedIds.size,
                errorCount,
                queuedCount: filteredQueue.length - syncedIds.size,
            };
        } catch {
            const queue = await loadSyncQueue(scope);
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
    }, [applyOperation, applyPreferencesPatch, batchSync, convex, deviceId, ensureSession, filterQueue, generateUploadUrl, savePhoto, scope]);

    return { execute };
}
