export type SyncToastKind =
  | 'attention'
  | 'local'
  | 'retry'
  | 'offline'
  | 'pending'
  | 'complete'
  | 'none';

export function selectSyncToastKind(input: {
  status: 'loading' | 'idle' | 'offline' | 'pending' | 'retry' | 'attention';
  isOffline: boolean;
  isLocalOnly: boolean;
  hasPending: boolean;
  hasQuarantine: boolean;
  previouslyHadPending: boolean;
}): SyncToastKind {
  if (input.status === 'loading') return 'none';
  if (input.hasQuarantine) return 'attention';
  if (input.isLocalOnly && input.hasPending) return 'local';
  if (input.status === 'retry') return 'retry';
  if (input.isOffline) return 'offline';
  if (input.status === 'pending') return 'pending';
  if (input.previouslyHadPending) return 'complete';
  return 'none';
}
