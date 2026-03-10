import { NativeModules, Platform } from 'react-native';

const { WidgetBridge } = NativeModules;

export interface WidgetData {
  plantCount: number;
  nextWatering: string;
  nextWateringPlant: string;
  hasOverdue: boolean;
}

export const WidgetBridgeModule = {
  /**
   * Update widget data from React Native
   */
  updateWidget: (data: WidgetData): void => {
    if (Platform.OS === 'ios') {
      WidgetBridge?.updateWidget?.(data);
    } else if (Platform.OS === 'android') {
      WidgetBridge?.updateWidget?.(
        data.plantCount,
        data.nextWatering,
        data.nextWateringPlant,
        data.hasOverdue
      );
    }
  },

  /**
   * Request widget reload
   */
  reloadWidgets: (): void => {
    WidgetBridge?.reloadWidgets?.();
  },

  /**
   * Check if widget is added to home screen
   */
  isWidgetAdded: async (): Promise<boolean> => {
    if (WidgetBridge?.isWidgetAdded) {
      return await WidgetBridge.isWidgetAdded();
    }
    return false;
  },
};

export default WidgetBridgeModule;
