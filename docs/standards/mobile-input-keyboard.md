# Mobile input and keyboard standard

This standard applies to every React Native `TextInput` in the mobile app.

## Required behavior

### All inputs

- The focused input must remain visible when the keyboard opens. Use a keyboard-aware layout (`KeyboardAvoidingView` on iOS) and a scrollable form when content can exceed the remaining height.
- Tapping another control must work while the keyboard is open. Form scroll containers use `keyboardShouldPersistTaps="handled"`.
- Do not use `keyboardDismissMode="on-drag"` on a form unless dismiss-on-scroll is an explicit product decision.
- A drag gesture must not be attached to the entire form. Bottom-sheet pan handlers belong on the drag handle only, so a small finger movement over an input cannot steal focus.
- Inputs need a stable `testID` when they are part of a critical create/edit flow.

### Inputs in a modal or bottom sheet

- Use `useInputModalLifecycle`. Every close path—backdrop, X button, Android back, swipe, success, and cancel—must call its `close` function rather than calling the parent `onClose` directly.
- Opening a modal or bottom sheet must not automatically focus a text input or show the keyboard. Focus the input and show the appropriate keyboard only after the user taps the field.
- Automatic focus is allowed only when immediate text entry is the explicit and sole purpose of the action that opened the sheet, such as Search or Rename. It must be a deliberate product decision, not a lifecycle workaround.
- Closing must blur the active input and dismiss the keyboard before hiding the modal. The same input must be focusable every time the modal is reopened.
- Draft behavior must be intentional:
  - Create + Cancel: pass `onDiscard` and reset the draft.
  - Edit + Cancel: restore/reload the persisted source value; never erase persisted data.
  - Save failure: keep the draft and keyboard context so the user can correct it.
- Do not set `autoFocus` merely to work around a broken reopen lifecycle.

## Review and regression checklist

For every input form, verify on both iOS and Android:

1. Open, focus each input, and confirm it remains above the keyboard.
2. Unless the flow explicitly allows automatic focus, confirm that opening the modal or bottom sheet does not focus an input or show the keyboard; then tap the field and confirm the appropriate keyboard appears.
3. Type a draft, close by every supported close path, then reopen.
4. Confirm the documented draft policy (discard or restore).
5. Focus and type again after the second open.
6. Scroll and tap buttons while the keyboard is visible.
7. For bottom sheets, drag only from the handle and verify input gestures do not move the sheet.

Critical flows should automate the sequence: open → type → close → reopen → focus → type.
