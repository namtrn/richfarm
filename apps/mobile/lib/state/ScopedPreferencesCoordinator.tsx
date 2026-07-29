import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useUserSettingsSource } from '../../hooks/useUserSettingsSource';
import { useMobileRuntime } from './mobileRuntimeStore';
import {
  activateScopedPreferences,
  configurePreferenceWriter,
  publishPreferenceSource,
} from './scopedPreferencesStore';

export function ScopedPreferencesCoordinator({ children }: { children: ReactNode }) {
  const activeScope = useMobileRuntime((state) => state.activeScope);
  const scopeToken = useMobileRuntime((state) => state.scopeToken);
  const source = useUserSettingsSource();
  const writerRef = useRef(source.updateSettings);
  writerRef.current = source.updateSettings;

  useLayoutEffect(() => {
    void activateScopedPreferences(activeScope, scopeToken);
  }, [activeScope, scopeToken]);

  useEffect(() => {
    if (!activeScope || source.scope !== activeScope) {
      configurePreferenceWriter(null, null);
      return;
    }
    configurePreferenceWriter(activeScope, (patch) => writerRef.current(patch));
    return () => configurePreferenceWriter(null, null);
  }, [activeScope, source.scope]);

  useEffect(() => {
    if (!activeScope || source.scope !== activeScope) return;
    publishPreferenceSource({
      scope: activeScope,
      scopeToken,
      settings: source.settings,
      isLoading: source.isLoading,
    });
  }, [activeScope, scopeToken, source.isLoading, source.scope, source.settings]);

  return children;
}
