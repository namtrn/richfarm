import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import WidgetBridgeModule, { WidgetData } from '../modules/widget-bridge';

/**
 * Hook to manage widget updates
 */
export function useWidget() {
  /**
   * Update widget with current data
   */
  const updateWidget = useCallback((data: WidgetData) => {
    WidgetBridgeModule.updateWidget(data);
  }, []);

  /**
   * Reload all widgets
   */
  const reloadWidgets = useCallback(() => {
    WidgetBridgeModule.reloadWidgets();
  }, []);

  /**
   * Check if widget is added to home screen
   */
  const isWidgetAdded = useCallback(async (): Promise<boolean> => {
    return await WidgetBridgeModule.isWidgetAdded();
  }, []);

  /**
   * Auto-update widget when app comes to foreground
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // Reload widgets when app becomes active
        reloadWidgets();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [reloadWidgets]);

  return {
    updateWidget,
    reloadWidgets,
    isWidgetAdded,
  };
}

export default useWidget;
