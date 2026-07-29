import { useMemo } from 'react';
import { createLocalId } from '../lib/plantLocalData';
import { createPlantContentCommands } from '../lib/commands/plantContentCommands';
import { mobileRuntimeStore, useMobileRuntime } from '../lib/state/mobileRuntimeStore';
import { useSyncExecutor } from '../lib/sync/useSyncExecutor';

export function usePlantContentCommands() {
  const identity = useMobileRuntime((state) => state.identity);
  const scopeToken = useMobileRuntime((state) => state.scopeToken);
  const { execute } = useSyncExecutor();
  return useMemo(() => {
    if (!identity) return null;
    return createPlantContentCommands({
      identity,
      scopeToken,
      createId: createLocalId,
      now: Date.now,
      isCurrentScope: (scope, token) => {
        const state = mobileRuntimeStore.getState();
        return state.activeScope === scope && state.scopeToken === token;
      },
      scheduleSync: (plantUuid) => { void execute({ plantId: plantUuid }); },
    });
  }, [execute, identity, scopeToken]);
}
