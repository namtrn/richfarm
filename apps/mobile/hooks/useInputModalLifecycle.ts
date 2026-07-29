import { useCallback, useEffect, useRef } from 'react';
import { Keyboard, TextInput } from 'react-native';

type Options = {
  visible: boolean;
  onClose: () => void;
  /** Use only when closing means Cancel. Edit forms should reload their source data instead. */
  onDiscard?: () => void;
};

/**
 * Standard lifecycle for a modal or bottom sheet that contains text inputs.
 * Every close path must call `close`, never `onClose` directly.
 */
export function useInputModalLifecycle({ visible, onClose, onDiscard }: Options) {
  const activeInputRef = useRef<TextInput>(null);

  const dismissKeyboard = useCallback(() => {
    activeInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  const close = useCallback(() => {
    dismissKeyboard();
    onDiscard?.();
    onClose();
  }, [dismissKeyboard, onClose, onDiscard]);

  useEffect(() => {
    if (!visible) dismissKeyboard();
  }, [dismissKeyboard, visible]);

  return { activeInputRef, close, dismissKeyboard };
}
