export function isLocalProjectionEntityRow(row: unknown): row is {
  _id: string;
  entityUuid: string;
  _pending?: boolean;
} {
  if (!row || typeof row !== 'object') return false;
  const candidate = row as Record<string, unknown>;
  // Local logical IDs are reused by the retry/quarantine projection, where
  // the transient `_pending` marker may no longer be present.
  return typeof candidate._id === 'string'
    && typeof candidate.entityUuid === 'string'
    && candidate._id === candidate.entityUuid
    && (candidate._pending === true || candidate._id.includes(':'));
}
