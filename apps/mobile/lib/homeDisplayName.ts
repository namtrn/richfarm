import type { AppMode } from './appMode';

export function resolveHomeDisplayName(
  userName: string | null | undefined,
  appMode: AppMode | undefined,
  gardenerDefault: string,
  farmerDefault: string,
) {
  return userName || (appMode === 'farmer' ? farmerDefault : gardenerDefault);
}
