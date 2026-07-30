import Toast from 'react-native-toast-message';

export type RichToastTone = 'success' | 'info' | 'warning' | 'error';

export type RichToastOptions = {
  key?: string;
  tone?: RichToastTone;
  title: string;
  message?: string;
  duration?: number;
  persistent?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
};

let visibleKey: string | undefined;

export function showToast({
  key,
  tone = 'info',
  title,
  message,
  duration = 3600,
  persistent = false,
  actionLabel,
  onAction,
  testID,
}: RichToastOptions) {
  visibleKey = key;
  Toast.show({
    type: 'richfarm',
    position: 'top',
    text1: title,
    text2: message,
    autoHide: !persistent,
    visibilityTime: duration,
    swipeable: !persistent,
    props: {
      tone,
      actionLabel,
      onAction,
      testID,
    },
  });
}

export function hideToast(key?: string) {
  if (key && visibleKey !== key) return;
  visibleKey = undefined;
  Toast.hide();
}

export const toast = {
  show: showToast,
  hide: hideToast,
  success: (title: string, options: Omit<RichToastOptions, 'title' | 'tone'> = {}) =>
    showToast({ ...options, title, tone: 'success' }),
  info: (title: string, options: Omit<RichToastOptions, 'title' | 'tone'> = {}) =>
    showToast({ ...options, title, tone: 'info' }),
  warning: (title: string, options: Omit<RichToastOptions, 'title' | 'tone'> = {}) =>
    showToast({ ...options, title, tone: 'warning' }),
  error: (title: string, options: Omit<RichToastOptions, 'title' | 'tone'> = {}) =>
    showToast({ ...options, title, tone: 'error', duration: options.duration ?? 5600 }),
};
