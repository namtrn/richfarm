import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { OutboxEnvelope } from '../sync/queue';
import type { ProjectionEnvelope } from '../sync/reconciliation';
import type { EntityType } from '../sync/types';

export type SyncHydrationStatus = 'idle' | 'loading' | 'ready' | 'needs_attention';

export type SyncScopeState = {
  scope: string | null;
  scopeToken: string;
  hydration: SyncHydrationStatus;
  projection: ProjectionEnvelope | null;
  outbox: OutboxEnvelope | null;
  entityLists: Record<EntityType, unknown[]>;
  plantChildLists: Record<'activity' | 'harvest' | 'photo', Record<string, unknown[]>>;
  error: string | null;
};

const EMPTY_ENTITY_LISTS: Record<EntityType, unknown[]> = {
  garden: [],
  bed: [],
  plant: [],
  activity: [],
  harvest: [],
  photo: [],
  carePlan: [],
  reminder: [],
  reminderOutcome: [],
};
const EMPTY_CHILD_LISTS: SyncScopeState['plantChildLists'] = {
  activity: {}, harvest: {}, photo: {},
};
const EMPTY_LIST: unknown[] = [];

function groupPlantChildren(
  projection: ProjectionEnvelope | null,
  previous: SyncScopeState['plantChildLists'] = EMPTY_CHILD_LISTS,
) {
  const grouped: SyncScopeState['plantChildLists'] = { activity: {}, harvest: {}, photo: {} };
  if (!projection) return grouped;
  for (const type of ['activity', 'harvest', 'photo'] as const) {
    for (const row of Object.values(projection.entities[type])) {
      const child = row as Record<string, unknown>;
      const keys = [child.plantUuid, child.userPlantId].filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      );
      for (const key of keys) (grouped[type][key] ??= []).push(row);
    }
    for (const [key, rows] of Object.entries(grouped[type])) {
      const before = previous[type][key];
      if (before && JSON.stringify(before) === JSON.stringify(rows)) grouped[type][key] = before;
    }
  }
  return grouped;
}

export function createSyncScopeStore() {
  return createStore<SyncScopeState>()(() => ({
    scope: null,
    scopeToken: 'uninitialized',
    hydration: 'idle',
    projection: null,
    outbox: null,
    entityLists: EMPTY_ENTITY_LISTS,
    plantChildLists: EMPTY_CHILD_LISTS,
    error: null,
  }));
}

export const syncScopeStore = createSyncScopeStore();

export function beginSyncScope(scope: string | null, scopeToken: string) {
  syncScopeStore.setState({
    scope,
    scopeToken,
    hydration: scope ? 'loading' : 'idle',
    projection: null,
    outbox: null,
    entityLists: EMPTY_ENTITY_LISTS,
    plantChildLists: EMPTY_CHILD_LISTS,
    error: null,
  });
}

export function publishSyncScopeSnapshot(input: {
  scope: string;
  scopeToken: string;
  projection: ProjectionEnvelope | null;
  outbox: OutboxEnvelope;
}) {
  const current = syncScopeStore.getState();
  if (current.scope !== input.scope || current.scopeToken !== input.scopeToken) return false;
  const projection = input.projection;
  syncScopeStore.setState({
    projection,
    outbox: input.outbox,
    entityLists: projection
      ? {
          garden: Object.values(projection.entities.garden),
          bed: Object.values(projection.entities.bed),
          plant: Object.values(projection.entities.plant),
          activity: Object.values(projection.entities.activity),
          harvest: Object.values(projection.entities.harvest),
          photo: Object.values(projection.entities.photo),
          carePlan: Object.values(projection.entities.carePlan),
          reminder: Object.values(projection.entities.reminder),
          reminderOutcome: Object.values(projection.entities.reminderOutcome),
        }
      : EMPTY_ENTITY_LISTS,
    plantChildLists: groupPlantChildren(projection, current.plantChildLists),
    hydration: input.outbox.quarantine.length > 0 ? 'needs_attention' : 'ready',
    error: null,
  });
  return true;
}

export function publishSyncScopeError(scope: string, scopeToken: string, error: unknown) {
  const current = syncScopeStore.getState();
  if (current.scope !== scope || current.scopeToken !== scopeToken) return false;
  syncScopeStore.setState({
    hydration: 'needs_attention',
    error: error instanceof Error ? error.message : 'sync_scope_hydration_failed',
  });
  return true;
}

export function useSyncScope<T>(selector: (state: SyncScopeState) => T) {
  return useStore(syncScopeStore, selector);
}

export function useSyncScopeEntities(type: EntityType) {
  return useSyncScope((state) => state.entityLists[type]);
}

function usePlantChildren(type: 'activity' | 'harvest' | 'photo', plantUuid: string) {
  return useSyncScope((state) => state.plantChildLists[type][plantUuid] ?? EMPTY_LIST);
}

export function usePlantActivitiesState(plantUuid: string) {
  return usePlantChildren('activity', plantUuid);
}

export function usePlantHarvestsState(plantUuid: string) {
  return usePlantChildren('harvest', plantUuid);
}

export function usePlantPhotosState(plantUuid: string) {
  return usePlantChildren('photo', plantUuid);
}

export function usePlantContentStatusState(plantUuid: string) {
  return useSyncScope(useShallow((state) => ({
    hydration: state.hydration,
    pendingCount:
      (state.plantChildLists.activity[plantUuid]?.length ?? 0)
      + (state.plantChildLists.harvest[plantUuid]?.length ?? 0)
      + (state.plantChildLists.photo[plantUuid]?.length ?? 0),
  })));
}
