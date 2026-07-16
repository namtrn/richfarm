import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocalSyncIdentity } from './identity';
import { rotateGuestDatasetId } from './identity';
import { clearSyncNamespace, enqueueSyncAction, loadOutbox, updateOutbox, type OutboxEnvelope } from './queue';
import type { SyncAction } from './types';
import { clearPlantLocalData, loadPlantLocalData, savePlantLocalData, type PlantLocalData } from '../plantLocalData';

const CLAIM_PREFIX = 'rf_guest_claim_v1_';
let claimChain: Promise<void> = Promise.resolve();

export type GuestClaimStatus =
  | 'awaiting_account_choice'
  | 'importing'
  | 'executing'
  | 'reconciling'
  | 'needs_attention'
  | 'finalizing'
  | 'complete';

export type GuestClaimRecord = {
  version: 1;
  guestDatasetId: string;
  sourceScopeKey: string;
  targetAccountUserId?: string;
  targetScopeKey?: string;
  status: GuestClaimStatus;
  sourceFingerprint?: string;
  sourceOperationCount?: number;
  sourceOperationIds?: string[];
  sourceQuarantineIds?: string[];
  sourcePlantIds?: string[];
  importedAt?: number;
  reconciledGeneration?: string;
  reconciledAt?: number;
  completedAt?: number;
};

function claimKey(datasetId: string) {
  return `${CLAIM_PREFIX}${datasetId}`;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function operationFingerprint(action: SyncAction) {
  if (action.type === 'entity') {
    const payload = action.payload as any;
    return stable({
      entityType: payload.entityType,
      entityUuid: payload.entityUuid,
      operationType: payload.operationType,
      baseRevision: payload.baseRevision,
      parentRefs: payload.parentRefs,
      payload: payload.payload,
    });
  }
  return stable({ type: action.type, plantId: action.plantId, payload: action.payload });
}

function sourceFingerprint(envelope: OutboxEnvelope) {
  return stable({
    operations: envelope.operations.map((action) => [action.id, operationFingerprint(action)]),
    quarantine: envelope.quarantine.map((action) => [action.id, operationFingerprint(action)]),
  });
}

function mergeLocalEntries<T extends { id: string }>(current: T[], incoming: T[]) {
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of incoming) if (!byId.has(entry.id)) byId.set(entry.id, entry);
  return Array.from(byId.values());
}

async function copyPlantLocalReferences(
  sourceScope: string,
  targetScope: string,
  operations: SyncAction[]
) {
  const plantIds = new Set(
    operations.map((operation) => operation.plantId).filter((value): value is string => !!value)
  );
  for (const plantId of plantIds) {
    const [source, target] = await Promise.all([
      loadPlantLocalData(sourceScope, plantId),
      loadPlantLocalData(targetScope, plantId),
    ]);
    const merged: PlantLocalData = {
      photos: mergeLocalEntries(target.photos, source.photos),
      activities: mergeLocalEntries(target.activities, source.activities),
      harvests: mergeLocalEntries(target.harvests, source.harvests),
    };
    await savePlantLocalData(targetScope, plantId, merged);
  }
}

export async function loadGuestClaim(datasetId: string): Promise<GuestClaimRecord | null> {
  const raw = await AsyncStorage.getItem(claimKey(datasetId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GuestClaimRecord;
    return parsed.version === 1 && parsed.guestDatasetId === datasetId ? parsed : null;
  } catch {
    return null;
  }
}

async function saveClaim(record: GuestClaimRecord) {
  await AsyncStorage.setItem(claimKey(record.guestDatasetId), JSON.stringify(record));
}

function mergeActions(
  current: SyncAction[],
  incoming: SyncAction[]
) {
  const merged = [...current];
  const byId = new Map(merged.map((action) => [action.id, action]));
  const conflicts: SyncAction[] = [];
  for (const action of incoming) {
    const existing = byId.get(action.id);
    if (!existing) {
      merged.push(action);
      byId.set(action.id, action);
    } else if (operationFingerprint(existing) !== operationFingerprint(action)) {
      conflicts.push({ ...action, lastError: 'claim_operation_conflict' });
    }
  }
  return { merged, conflicts };
}

export async function claimGuestDataset(
  guest: Extract<LocalSyncIdentity, { kind: 'guest' }>,
  account: Extract<LocalSyncIdentity, { kind: 'account' }>
): Promise<GuestClaimRecord> {
  let result: GuestClaimRecord | null = null;
  const run = async () => {
    const existing = await loadGuestClaim(guest.guestDatasetId);
    if (existing?.targetAccountUserId && existing.targetAccountUserId !== account.accountUserId) {
      throw new Error('guest_dataset_bound_to_another_account');
    }
    let record: GuestClaimRecord = existing ?? {
      version: 1,
      guestDatasetId: guest.guestDatasetId,
      sourceScopeKey: guest.scopeKey,
      status: 'importing',
    };
    record = {
      ...record,
      targetAccountUserId: account.accountUserId,
      targetScopeKey: account.scopeKey,
      status: 'importing',
    };
    await saveClaim(record);
    const source = await loadOutbox(guest.scopeKey);
    record = {
      ...record,
      sourceFingerprint: sourceFingerprint(source),
      sourceOperationCount: source.operations.length,
      sourceOperationIds: source.operations.map((operation) => operation.id),
      sourceQuarantineIds: source.quarantine.map((operation) => operation.id),
      sourcePlantIds: Array.from(new Set(
        [...source.operations, ...source.quarantine]
          .map((operation) => operation.plantId)
          .filter((value): value is string => !!value)
      )),
    };
    await saveClaim(record);
    await copyPlantLocalReferences(
      guest.scopeKey,
      account.scopeKey,
      [...source.operations, ...source.quarantine]
    );

    const imported = await updateOutbox(account.scopeKey, (target) => {
      const operations = mergeActions(target.operations, source.operations);
      const quarantined = mergeActions(target.quarantine, [
        ...source.quarantine,
        ...operations.conflicts,
      ]);
      return {
        ...target,
        operations: operations.merged,
        quarantine: quarantined.merged,
      };
    });
    record = {
      ...record,
      status: source.quarantine.length > 0
        || imported.quarantine.some((item) => item.lastError === 'claim_operation_conflict')
        ? 'needs_attention'
        : 'executing',
      importedAt: Date.now(),
    };
    await saveClaim(record);
    result = record;
  };
  claimChain = claimChain.then(run, run);
  await claimChain;
  return result!;
}

export async function enqueueForIdentity(identity: LocalSyncIdentity, action: SyncAction) {
  const run = async () => {
    if (identity.kind === 'account') {
      await enqueueSyncAction(action, identity.scopeKey);
      return;
    }
    const claim = await loadGuestClaim(identity.guestDatasetId);
    const destination = claim?.targetScopeKey && claim.status !== 'complete'
      ? claim.targetScopeKey
      : identity.scopeKey;
    await enqueueSyncAction(action, destination);
  };
  claimChain = claimChain.then(run, run);
  await claimChain;
}

export async function completeGuestClaim(args: {
  datasetId: string;
  activeAccountUserId: string;
  generation: string;
}) {
  const record = await loadGuestClaim(args.datasetId);
  if (!record || record.targetAccountUserId !== args.activeAccountUserId) {
    throw new Error('claim_target_not_active');
  }
  if (!record.targetScopeKey) throw new Error('claim_target_missing');
  const target = await loadOutbox(record.targetScopeKey);
  const claimedIds = new Set(record.sourceOperationIds ?? []);
  const claimedQuarantineIds = new Set(record.sourceQuarantineIds ?? []);
  if (
    target.operations.some((operation) => claimedIds.has(operation.id))
    || target.quarantine.some((operation) => (
      claimedIds.has(operation.id)
      || claimedQuarantineIds.has(operation.id)
      || operation.lastError === 'claim_operation_conflict'
    ))
  ) return record;
  const reconciledAt = Date.now();
  const finalizing: GuestClaimRecord = {
    ...record,
    status: 'finalizing',
    reconciledGeneration: args.generation,
    reconciledAt,
  };
  await saveClaim(finalizing);
  await rotateGuestDatasetId(record.guestDatasetId);
  await clearSyncNamespace(record.sourceScopeKey);
  for (const plantId of record.sourcePlantIds ?? []) {
    await clearPlantLocalData(record.sourceScopeKey, plantId);
  }
  const complete: GuestClaimRecord = {
    ...finalizing,
    status: 'complete',
    completedAt: Date.now(),
  };
  await saveClaim(complete);
  return complete;
}
