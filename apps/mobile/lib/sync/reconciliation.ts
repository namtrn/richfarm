import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ConvexReactClient } from 'convex/react';
import { api } from '../../../../packages/convex/convex/_generated/api';
import type { EntityType } from './types';

type SnapshotDomain = EntityType | 'tombstone';
type ProjectionEnvelope = {
  version: 1;
  scope: string;
  generation: string;
  hydratedAt: number;
  complete: boolean;
  entities: Record<EntityType, Record<string, unknown>>;
  tombstones: Record<string, unknown>;
};

const domains: SnapshotDomain[] = [
  'tombstone', 'garden', 'bed', 'plant', 'activity', 'harvest', 'photo',
];

function projectionKey(scope: string) {
  return `rf_sync_projection_v1_${encodeURIComponent(scope)}`;
}

function emptyProjection(scope: string, generation: string): ProjectionEnvelope {
  return {
    version: 1,
    scope,
    generation,
    hydratedAt: Date.now(),
    complete: false,
    entities: { garden: {}, bed: {}, plant: {}, activity: {}, harvest: {}, photo: {} },
    tombstones: {},
  };
}

export async function loadAuthoritativeProjection(scope: string) {
  const raw = await AsyncStorage.getItem(projectionKey(scope));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ProjectionEnvelope;
    return parsed.version === 1 && parsed.scope === scope ? parsed : null;
  } catch {
    return null;
  }
}

export async function reconcileAuthoritativeSnapshot(input: {
  client: ConvexReactClient;
  deviceId?: string;
  scope: string;
  generation: string;
  isCurrent: () => boolean;
}) {
  const projection = emptyProjection(input.scope, input.generation);
  for (const domain of domains) {
    let cursor: string | null = null;
    do {
      const result: any = await input.client.query(api.syncV2.snapshotPage, {
        deviceId: input.deviceId,
        generation: input.generation,
        domain,
        paginationOpts: { numItems: 100, cursor },
      });
      if (!input.isCurrent()) return { status: 'scope_changed' as const };
      if (result.status !== 'ok') return { status: result.status as 'unauthorized' | 'wrong_generation' };
      for (const row of result.page as Array<Record<string, unknown>>) {
        const entityUuid = typeof row.entityUuid === 'string' ? row.entityUuid : `legacy:${String(row._id)}`;
        if (domain === 'tombstone') {
          const entityType = String(row.entityType) as EntityType;
          projection.tombstones[`${entityType}:${entityUuid}`] = row;
          delete projection.entities[entityType]?.[entityUuid];
        } else if (!projection.tombstones[`${domain}:${entityUuid}`]) {
          projection.entities[domain][entityUuid] = row;
        }
      }
      cursor = result.isDone ? null : result.continueCursor;
    } while (cursor);
  }
  projection.complete = true;
  projection.hydratedAt = Date.now();
  if (!input.isCurrent()) return { status: 'scope_changed' as const };
  await AsyncStorage.setItem(projectionKey(input.scope), JSON.stringify(projection));
  return { status: 'ok' as const, projection };
}
