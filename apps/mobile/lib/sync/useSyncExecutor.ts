import { useCallback, useRef } from 'react';
import { useConvex, useMutation } from 'convex/react';
import { api } from '../../../../packages/convex/convex/_generated/api';
import {
    loadOutbox,
    loadSyncQueue,
    markSyncAttempt,
    quarantineSyncAction,
    removeSyncActions,
    setSyncGeneration,
    updateSyncActionPayload,
} from './queue';
import { mapSyncActionToPhoto } from './mappers';
import { useDeviceId } from '../deviceId';
import { EntityOperationPayload, SyncActionType } from './types';
import { useLocalSyncIdentity } from './identity';
import { APP_VERSION } from '../appVersion';
import { loadRenderedProjection, reconcileAuthoritativeSnapshot } from './reconciliation';
import {
    loadPreferenceQueue,
    acknowledgePreferencePatch,
    rebasePreferencePatch,
} from './preferencesQueue';
import * as ImagePicker from 'expo-image-picker';
import { isManagedPlantPhotoUri, removeManagedPlantPhoto } from '../photo/managedPlantPhotos';

async function loadLocalPhotoBlob(photo: { localUri: string; source?: 'camera' | 'gallery' }) {
    const read = async () => {
        const response = await fetch(photo.localUri);
        if (!response.ok) throw new Error('photo_file_not_found');
        return await response.blob();
    };
    try {
        return await read();
    } catch (firstError) {
        if (isManagedPlantPhotoUri(photo.localUri) || photo.source !== 'gallery') {
            throw new Error('photo_file_not_found');
        }
        let permission = await ImagePicker.getMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
            permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        }
        if (permission.status !== 'granted') throw new Error('photo_permission_required');
        try {
            return await read();
        } catch {
            throw firstError instanceof Error && firstError.message === 'photo_file_not_found'
                ? firstError
                : new Error('photo_file_not_found');
        }
    }
}

function photoNeedsRecovery(message: string) {
    return message === 'photo_file_not_found' || message === 'managed_photo_missing';
}

export type SyncExecutorResult = {
    status: 'local_only' | 'synced' | 'partial' | 'scope_changed' | 'needs_attention';
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
    const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
    const registerSyncUpload = useMutation(api.storage.registerSyncUpload);
    const ensureSession = useMutation(api.syncV2.ensureSession);
    const applyOperation = useMutation(api.syncV2.applyOperation);
    const applyPreferencesPatch = useMutation(api.userSettings.applyPreferencesPatch);
    const recordClientOutcome = useMutation(api.syncRuntime.recordClientOutcome);
    const { deviceId } = useDeviceId();
    const { identity } = useLocalSyncIdentity();
    const scope = identity?.scopeKey;
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
        if (!identity) {
            return { status: 'scope_changed', ok: false, syncedCount: 0, errorCount: 0, queuedCount: 0 };
        }
        if (identity.kind === 'guest') {
            const filteredQueue = filterQueue(await loadSyncQueue(identity.scopeKey), options);
            lastQueuedCountRef.current = filteredQueue.length;
            return {
                status: 'local_only', ok: true, syncedCount: 0, errorCount: 0,
                queuedCount: filteredQueue.length,
            };
        }
        if (inflightRef.current) {
            const queue = (await loadSyncQueue(scope)).filter(
                (item) => !item.nextAttemptAt || item.nextAttemptAt <= Date.now()
            );
            const filteredQueue = filterQueue(queue, options);
            lastQueuedCountRef.current = filteredQueue.length;
            return { status: 'partial', ok: false, syncedCount: 0, errorCount: 0, queuedCount: filteredQueue.length };
        }

        inflightRef.current = true;
        try {
            const outbox = await loadOutbox(scope);
            if (outbox.needsAttention) {
                const filteredQueue = filterQueue(outbox.operations, options);
                lastQueuedCountRef.current = filteredQueue.length;
                return {
                    status: 'needs_attention',
                    ok: false,
                    syncedCount: 0,
                    errorCount: 0,
                    queuedCount: filteredQueue.length,
                };
            }
            let generation = outbox.syncGeneration;
            const serverSession = await ensureSession({ deviceId, appVersion: APP_VERSION });
            if (generation && serverSession && generation !== serverSession.generation) {
                for (const operation of outbox.operations) {
                    await quarantineSyncAction(operation.id, 'wrong_generation', scope);
                    await recordClientOutcome({
                        deviceId, appVersion: APP_VERSION,
                        entityType: operation.type === 'entity' ? (operation.payload as EntityOperationPayload).entityType : operation.type,
                        status: 'quarantined',
                    });
                }
                await setSyncGeneration(serverSession.generation, scope);
                return {
                    status: 'partial',
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
                    return { status: 'scope_changed', ok: false, syncedCount: 0, errorCount: 0, queuedCount: outbox.operations.length };
                }
            }
            const queue = outbox.operations.filter(
                (item) => !item.nextAttemptAt || item.nextAttemptAt <= Date.now()
            );
            const filteredQueue = filterQueue(queue, options);
            lastQueuedCountRef.current = filteredQueue.length;
            const syncedIds = new Set<string>();
            const syncedEntityIds = new Set<string>();
            const reconciledManagedPhotoUris = new Map<string, string>();
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
                            await acknowledgePreferencePatch(scope, preference.operationId, result.revision);
                        } else {
                            errorCount++;
                        }
                    } catch {
                        errorCount++;
                    }
                }
            }

            const entityRank = {
                garden: 0, bed: 1, plant: 2, carePlan: 3, reminder: 4,
                activity: 5, harvest: 5, photo: 5, reminderOutcome: 5,
            } as const;
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
                        appVersion: APP_VERSION,
                        entityType: operation.entityType,
                        entityUuid: operation.entityUuid,
                        type: operation.operationType,
                        baseRevision: operation.baseRevision,
                        parentRefs: operation.parentRefs,
                        payload: operation.payload,
                    });
                    if (result.status === 'applied' || result.status === 'already_applied' || result.status === 'discarded_deleted' || result.status === 'discarded_stale') {
                        syncedIds.add(item.id);
                        syncedEntityIds.add(item.id);
                    } else if (result.status === 'wrong_generation') {
                        await quarantineSyncAction(item.id, result.status, scope);
                        await recordClientOutcome({ deviceId, appVersion: APP_VERSION, entityType: operation.entityType, status: 'quarantined' });
                        failedEntities.add(operation.entityUuid);
                        errorCount++;
                    } else if (result.status === 'revision_conflict' || result.status === 'invalid_parent' || result.status === 'missing_target' || result.status === 'operation_conflict') {
                        await quarantineSyncAction(item.id, result.status, scope);
                        await recordClientOutcome({ deviceId, appVersion: APP_VERSION, entityType: operation.entityType, status: 'quarantined' });
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
                        const blob = await loadLocalPhotoBlob(photo);
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
                        await updateSyncActionPayload(item.id, {
                            ...item.payload,
                            storageId,
                            phase: 'uploaded',
                        }, scope);
                    }
                    await registerSyncUpload({
                        deviceId,
                        operationId: item.id,
                        entityUuid: photo.localId,
                        storageId: storageId as any,
                    });
                    const projection = scope ? await loadRenderedProjection(scope) : null;
                    const plantEntry = projection
                        ? Object.entries(projection.entities.plant).find(([, row]) =>
                            String((row as any)._id) === String(photo.plantId)
                            || (row as any).entityUuid === String(photo.plantId)
                        )
                        : undefined;
                    if (!generation || !plantEntry) throw new Error('photo_parent_not_hydrated');
                    const result = await applyOperation({
                        deviceId,
                        operationId: item.id,
                        syncGeneration: generation,
                        appVersion: APP_VERSION,
                        entityType: 'photo',
                        entityUuid: photo.localId,
                        type: 'create',
                        parentRefs: { plantUuid: plantEntry[0] },
                        payload: {
                            storageId,
                            takenAt: photo.capturedAt,
                            source: photo.source,
                        },
                    });
                    if (result.status === 'applied' || result.status === 'already_applied' || result.status === 'discarded_deleted') {
                        syncedIds.add(item.id);
                        syncedEntityIds.add(item.id);
                        const managedUri = (item.payload as any).managedUri;
                        if (managedUri) reconciledManagedPhotoUris.set(item.id, managedUri);
                    } else if (result.status === 'invalid_parent' || result.status === 'operation_conflict' || result.status === 'wrong_generation') {
                        await quarantineSyncAction(item.id, result.status, scope);
                        await recordClientOutcome({ deviceId, appVersion: APP_VERSION, entityType: 'photo', status: 'quarantined' });
                        errorCount++;
                    } else {
                        throw new Error(result.status);
                    }
                } catch (error) {
                    errorCount += 1;
                    const message =
                        error instanceof Error ? error.message : 'photo_upload_failed';
                    if (photoNeedsRecovery(message)) {
                        // A missing local binary cannot be fixed by retrying the
                        // network request forever. Keep the operation and its
                        // stable IDs in quarantine so the user can recover or
                        // replace the file explicitly.
                        await quarantineSyncAction(item.id, message, scope);
                        await recordClientOutcome({
                            deviceId,
                            appVersion: APP_VERSION,
                            entityType: 'photo',
                            status: 'quarantined',
                        });
                    } else {
                        await markSyncAttempt(item.id, message, scope);
                    }
                }
            }

            const childItems = filteredQueue.filter(
                (item) => item.type === 'activity' || item.type === 'harvest'
            );
            for (const item of childItems) {
                const payload = item.payload as any;
                try {
                    const projection = scope ? await loadRenderedProjection(scope) : null;
                    const plantEntry = projection && item.plantId
                        ? Object.entries(projection.entities.plant).find(([, row]) =>
                            String((row as any)._id) === String(item.plantId)
                            || (row as any).entityUuid === String(item.plantId)
                        )
                        : undefined;
                    if (!generation || !plantEntry || !payload.localId) {
                        throw new Error('child_parent_not_hydrated');
                    }
                    const result = await applyOperation({
                        deviceId,
                        operationId: item.id,
                        syncGeneration: generation,
                        appVersion: APP_VERSION,
                        entityType: item.type as 'activity' | 'harvest',
                        entityUuid: payload.localId,
                        type: 'create',
                        parentRefs: { plantUuid: plantEntry[0] },
                        payload: item.type === 'activity'
                            ? { type: payload.type, note: payload.note, occurredAt: payload.date }
                            : {
                                quantity: payload.quantity ? Number(payload.quantity) || undefined : undefined,
                                unit: payload.unit,
                                notes: payload.note,
                                harvestDate: payload.date,
                            },
                    });
                    if (result.status === 'applied' || result.status === 'already_applied') {
                        syncedIds.add(item.id);
                        syncedEntityIds.add(item.id);
                        continue;
                    }
                    if (result.status === 'discarded_deleted' || result.status === 'invalid_parent') {
                        await quarantineSyncAction(item.id, result.status, scope);
                        await recordClientOutcome({ deviceId, appVersion: APP_VERSION, entityType: item.type, status: 'quarantined' });
                        errorCount++;
                        continue;
                    }
                    if (result.status === 'operation_conflict' || result.status === 'wrong_generation' || result.status === 'revision_conflict' || result.status === 'missing_target') {
                        await quarantineSyncAction(item.id, result.status, scope);
                        await recordClientOutcome({ deviceId, appVersion: APP_VERSION, entityType: item.type, status: 'quarantined' });
                        errorCount++;
                        continue;
                    }
                    throw new Error(result.status);
                } catch (error) {
                    errorCount++;
                    await markSyncAttempt(item.id, error instanceof Error ? error.message : 'sync_failed', scope);
                }
            }

            if (syncedEntityIds.size > 0 && scope && generation) {
                try {
                    const refreshed = await reconcileAuthoritativeSnapshot({
                        client: convex,
                        deviceId,
                        scope,
                        generation,
                        isCurrent: () => scopeRef.current === scope,
                    });
                    if (refreshed.status !== 'ok') throw new Error(refreshed.status);
                } catch {
                    // Keep acknowledged entity operations in the outbox until their
                    // authoritative rows are durably reflected in the local projection.
                    for (const id of syncedEntityIds) syncedIds.delete(id);
                    errorCount += syncedEntityIds.size;
                }
            }
            if (syncedIds.size > 0) {
                await removeSyncActions(Array.from(syncedIds), scope);
                for (const id of syncedIds) {
                    removeManagedPlantPhoto(reconciledManagedPhotoUris.get(id));
                }
            }

            return {
                status: errorCount === 0 ? 'synced' : 'partial',
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
                status: 'partial',
                ok: false,
                syncedCount: 0,
                errorCount: 1,
                queuedCount: filteredQueue.length,
            };
        } finally {
            inflightRef.current = false;
        }
    }, [applyOperation, applyPreferencesPatch, convex, deviceId, ensureSession, filterQueue, generateUploadUrl, identity, recordClientOutcome, registerSyncUpload, scope]);

    return { execute };
}
