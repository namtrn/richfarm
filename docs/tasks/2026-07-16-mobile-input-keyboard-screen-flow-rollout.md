# Mobile input and keyboard: screen → flow rollout

Date: 2026-07-16
Standard: `docs/standards/mobile-input-keyboard.md`

## Objective

Apply the mobile input and keyboard standard consistently to every React Native input flow. Build the reusable foundation from the strongest existing implementation, Create Garden, prove that Create Garden still works through the shared component, and then migrate each remaining screen and flow in risk order.

## Definition of done

For every flow below, verify on both iOS and Android:

1. Opening a screen, modal, or bottom sheet does not focus an input or show the keyboard unless immediate text entry is the explicit and sole purpose of the action.
2. Tapping a field shows the appropriate keyboard and keeps the focused field visible.
3. Buttons and list items remain tappable while the keyboard is visible.
4. Bottom-sheet drag gestures are available only from the drag handle.
5. Every dismissal path uses the shared lifecycle: backdrop, X, Android back, swipe, Cancel, success.
6. Create + Cancel discards the draft; Edit + Cancel restores persisted data; save failure preserves the draft and correction context.
7. Reopening the flow allows the same or another input to focus and accept text.
8. Critical create/edit inputs have stable `testID` values.
9. Critical flows automate: open → tap input → type → close → reopen → tap input → type.

## Review summary

The static audit found 57 `TextInput` instances across 20 mobile files.

- No production input currently uses `autoFocus`; the default “tap field to show keyboard” behavior is already correct.
- Auth is the strongest full-screen form implementation.
- Create Garden is the strongest bottom-sheet input implementation and is the reference for the shared foundation.
- Timezone already uses the shared lifecycle hook, but still needs the common keyboard-aware sheet/list behavior.
- Most other input sheets independently implement modal layout and pan gestures, producing the same lifecycle, keyboard, and draft-policy gaps.

## Reference implementation: Create Garden

Create Garden is the best existing modal flow because it covers the complete interaction lifecycle:

- It does not focus an input when opened.
- It uses `KeyboardAvoidingView` on iOS.
- Its form is scrollable and uses `keyboardShouldPersistTaps="handled"`.
- Dragging is attached only to the handle, not the form body.
- Backdrop, X, Android back, swipe, success, and Cancel use one close path.
- Closing blurs the active input and dismisses the keyboard.
- Cancel discards the create draft.
- Save failure keeps the draft and error visible.
- Reopen focus is not implemented through `autoFocus`.
- Critical inputs and actions have stable E2E IDs.

Create Garden must remain the proving flow for every change to the shared sheet foundation.

## Shared foundation

### `InputSheet`

Reusable presentation shell extracted from Create Garden. It owns only cross-flow UI behavior:

- transparent React Native `Modal`;
- iOS keyboard avoidance;
- backdrop dismissal;
- common sheet surface, header, title, close control, and scroll container;
- `keyboardShouldPersistTaps="handled"`;
- drag gesture attached only to the handle;
- pan reset on every open;
- Android `onRequestClose` routed through the supplied standardized close callback.

It must not own Garden, Reminder, Harvest, or other domain state.

### `useInputModalLifecycle`

Reusable behavior hook. It owns:

- the active input ref;
- blur and `Keyboard.dismiss()`;
- the single close callback used by every dismissal path;
- the flow-supplied discard/restore policy.

The screen still owns business state and chooses the correct draft policy.

## Phase 1 — build and prove the reusable foundation

Status: in progress

- [x] Establish the mobile input and keyboard standard.
- [x] Audit all screens and flows statically.
- [x] Add `useInputModalLifecycle`.
- [x] Extract `InputSheet` from the Create Garden implementation.
- [x] Render Create Garden through `InputSheet`.
- [x] Pass mobile TypeScript checking.
- [x] Pass the existing iOS Garden create/scroll/submit smoke flow.
- [x] Pass the dedicated Create Garden close/reopen lifecycle flow on iOS.
- [ ] Verify Create Garden manually on iOS.
- [ ] Verify Create Garden manually on Android.
- [x] Automate the Create Garden close/reopen regression sequence.

Phase 1 is complete only when Create Garden proves that the reusable component preserves every reference behavior listed above.

Verification note (2026-07-16): the existing `smoke-garden-create-bed` flow passed on an iPhone 17 Pro / iOS 26.2 after the refactor, including focusing all Create Garden inputs, typing, scrolling the form with the keyboard open, submitting, and closing the sheet. The dedicated `input-sheet-create-garden-lifecycle` flow now also passes from clean state: it enters `Draft Garden`, closes, reopens, focuses the field again, enters `Fresh Garden`, records visual evidence of the cleared draft, closes, and confirms the launch action is available again. The test exposed an iOS native-Modal reopen animation race; `InputSheet` now uses a deterministic JS entry animation instead, fixing the behavior once for every consumer. iOS manual sign-off and all Android verification remain open.

## Screen → flow review and rollout

### 1. Authentication — `app/auth.tsx`

#### Sign in

- Current: keyboard-aware layout and handled scroll taps; critical IDs exist.
- Action: no structural migration. Add to regression coverage when shared form primitives are introduced.

#### Sign up

- Current: same compliant full-screen form shell as Sign in.
- Action: preserve current behavior; verify next-field and submit behavior on both platforms.

#### Forgot-password request

- Current: shares the compliant auth layout.
- Action: preserve; verify submit while keyboard is visible.

### 2. Reset password — `app/reset-password.tsx`

#### New password + confirmation

- Current: has keyboard avoidance.
- Gaps: scroll view lacks handled taps; critical inputs lack stable IDs.
- Migration: keep full-screen layout, add tap handling and IDs; no `InputSheet` migration.
- Progress: migrated; the scroll keeps actions tappable with the keyboard open and both password fields have stable IDs. Platform verification remains open.

### 3. Explorer — `app/(tabs)/explorer.tsx`

#### Search/filter

- Current: search stays visible and scroll taps are handled.
- Action: preserve; verify tapping results and controls with keyboard open.

### 4. Library main — `app/(tabs)/library/index.tsx`

#### Plant/pest search

- Current: visible top search with a stable ID and clear control.
- Gaps: result list tap handling must be confirmed/configured.
- Migration: use the future shared searchable-list pattern, not `InputSheet`.
- Progress: migrated; every result `FlatList` now keeps item taps available while the keyboard is visible. The existing stable search ID is preserved. Platform verification remains open.

#### Plant detail viewer

- Current: informational modal without input.
- Action: outside the input standard.

#### Add plant target

- Current: shared selection modal without input.
- Action: outside the input standard unless a search field is later added.

#### Scanner

- Current: shared `usePlantScanner` implementation.
- Migration: fixed once in the shared scanner flow; verify from Library as a consumer screen.

### 5. Library family — `app/(tabs)/library/family/[family].tsx`

#### Search family plants

- Current: search remains visible above the list.
- Gaps: `FlatList` tap handling and stable search ID.
- Migration: shared searchable-list pattern.
- Progress: migrated; handled list taps and a stable search ID are in place. Platform verification remains open.

### 6. Library genus — `.../genus/[genusNormalized].tsx`

#### Search genus plants

- Same gaps and migration as Library family.
- Progress: migrated with handled list taps and a stable search ID. Platform verification remains open.

### 7. Library species — `.../species/[speciesNormalized].tsx`

#### Search species plants

- Same gaps and migration as Library family.
- Progress: migrated with handled list taps and a stable search ID. Platform verification remains open.

### 8. Library plant detail — `app/(tabs)/library/[masterPlantId].tsx`

#### Add plant target

- Current: selection-only `AddPlantTargetModal`.
- Action: no input migration.

#### Gardener add-plant details

- Current: multi-input modal with nickname, optional garden creation, expected date, and nested date editors.
- Gaps: no keyboard-aware shell, shared close lifecycle, reliable create-draft reset, or critical IDs.
- Migration: high priority. Move the outer flow to `InputSheet`; keep business state local; use discard policy for create; keep draft on save failure.
- Progress: migrated to `InputSheet`; all close paths discard the create draft, save failure stays open, save is protected from accidental dismissal, and nickname/date inputs have stable IDs. Platform verification remains open.

#### Create garden inside add-plant

- Current: embedded create state inside the add-plant modal.
- Gaps: keyboard visibility and Cancel reset are not standardized.
- Migration: decide whether it remains an inline step or opens the shared Create Garden flow; in either case use the common lifecycle contract.
- Progress: retained as an inline step inside the keyboard-aware shared sheet; its name field has a stable ID and the parent create-discard lifecycle resets it on close. Platform verification remains open.

#### Custom planted/water date editor

- Current: nested overlay with text input.
- Gaps: keyboard awareness and explicit restore-on-Cancel semantics.
- Migration: use a small input-dialog variant or native date/time control; preserve previous value on Cancel.
- Progress: retained as a nested editor inside the shared sheet; Cancel/backdrop/X now restore the pre-editor value, Save keeps the change, and the input has a stable ID. Platform verification remains open.

### 9. Garden list — `app/(tabs)/garden/index.tsx`

#### Create Garden

- Current: reference flow and first `InputSheet` consumer.
- Required verification: open without keyboard; focus every field; tap chips and Submit with keyboard open; close through backdrop/X/Back/swipe; reopen and type again; discard on Cancel; retain on save failure.

#### Quick add plant

- Current gaps: direct state-setter close paths, sheet-wide pan gesture, no keyboard avoidance, inconsistent Cancel reset.
- Migration: `InputSheet` + `useInputModalLifecycle` with create-discard policy.
- Progress: migrated; all dismissal paths discard the nickname, save failure retains it, success uses the shared close path, and stable IDs are in place. Platform verification remains open.

#### Photo detection name correction

- Current gaps: no keyboard-aware shared lifecycle; no stable input ID.
- Migration: `InputSheet`; preserve detected name on save failure, discard transient result on explicit Cancel.
- Progress: migrated; transient photo/detection state is discarded only on dismissal/success, failure remains editable, and the correction input has a stable ID. Platform verification remains open.

### 10. Garden detail — `app/(tabs)/garden/[gardenId].tsx`

#### Create bed

- Current: long bottom-sheet form.
- Gaps: no keyboard-aware shell, handled taps, shared close lifecycle, handle-only drag, or complete IDs.
- Migration: P1 `InputSheet`; create-discard policy.
- Progress: migrated; shared keyboard-aware shell, lifecycle close, handle-only drag, create-discard policy, sticky Save action, and stable IDs are in place. Platform verification remains open.

#### Edit bed

- Current: shares `BedFormModal` with Create.
- Gaps: reopening with the same source object can retain canceled local edits.
- Migration: same `InputSheet`; restore persisted bed values on Cancel/reopen, never clear persisted data.
- Progress: migrated; persisted bed values are reloaded on every open and every Cancel close. Platform verification remains open.

#### Edit garden

- Current gaps: same keyboard, pan, lifecycle, and edit-restore issues.
- Migration: P1 `InputSheet` with edit restore policy.
- Progress: migrated; persisted Garden values are restored on Cancel/reopen and critical IDs were added. Platform verification remains open.

### 11. Bed detail — `app/(tabs)/bed/[bedId].tsx`

#### Adjust dimensions

- Current: multiple numeric inputs in a non-scrollable sheet.
- Gaps: keyboard can cover fields/actions; pan gesture covers the sheet; close bypasses lifecycle; edit Cancel does not explicitly restore source.
- Migration: P1 `InputSheet` with edit restore policy and stable IDs.
- Progress: migrated; all numeric inputs are scrollable above the keyboard, Cancel restores the bed snapshot, and stable IDs were added. Platform verification remains open.

#### Search/select plant

- Current: search input plus plant results.
- Gaps: sheet-wide pan, direct close, search retained on Cancel, list tap handling not guaranteed.
- Migration: `InputSheet` plus shared searchable-list pattern; clear transient search on Cancel.
- Progress: migrated to non-nested-list `InputSheet`; search/filter are discarded on close and result taps are handled with the keyboard open. Platform verification remains open.

### 12. Planning — `app/(tabs)/planning.tsx`

#### Quick add plant

- Current: stable E2E IDs and draft reset after successful save.
- Gaps: Cancel/backdrop/X retain nickname; no keyboard-aware lifecycle; sheet-wide pan.
- Migration: `InputSheet` with create-discard policy.
- Progress: migrated; Cancel/backdrop/X/Back/swipe discard the nickname, save failure keeps it open, and success closes through the shared lifecycle. Platform verification remains open.

#### Photo detection correction

- Current: correction draft stays available on failure.
- Gaps: direct close, no keyboard avoidance, sheet-wide pan, missing input ID.
- Migration: `InputSheet`; retain on failure, discard transient draft on explicit Cancel.
- Progress: migrated; detected-name correction is keyboard-aware, transient photo/name state is discarded on close, save failure stays open, and a stable input ID was added. Platform verification remains open.

### 13. Reminder — `app/(tabs)/reminder.tsx`

#### Create reminder

- Current: scrollable six-input form; save failure retains state.
- Gaps: no keyboard avoidance, handled taps, shared lifecycle, or handle-only gesture; IDs are incomplete.
- Migration: highest-priority `InputSheet` consumer after Create Garden; create-discard policy.
- Progress: migrated to `InputSheet`; all dismissal paths use `useInputModalLifecycle`; all six inputs now have stable IDs. Platform verification remains open.

#### Edit reminder

- Current: state reload depends on `reminder`, not visibility.
- Risk: cancel and reopen with the same reminder object can retain the canceled draft.
- Migration: same shared shell; explicit restore from persisted reminder on Cancel/reopen.
- Progress: migrated; the form now reloads the persisted reminder snapshot whenever it opens and when Cancel closes it. Platform verification remains open.

### 14. Plant detail — `app/(tabs)/plant/[userPlantId].tsx`

#### Inline nickname, notes, and expected harvest edit

- Current: inputs live low in the main screen scroll.
- Gaps: no screen keyboard avoidance and no stable IDs.
- Migration: keyboard-aware full-screen form treatment; not `InputSheet` unless product changes the edit interaction.
- Progress: migrated without changing the interaction model; the main scroll handles taps, adjusts keyboard insets, and exposes stable IDs for all three fields. Platform verification remains open.

#### Add activity

- Current: two-input bottom sheet; save failure retains draft.
- Gaps: sheet-wide pan, no keyboard-aware scroll, direct close, unclear create-discard policy, no IDs.
- Migration: P1 `InputSheet` with create-discard policy.
- Progress: migrated; Cancel clears draft, save failure now leaves the sheet and draft open, success closes through the shared lifecycle, and stable IDs were added. Platform verification remains open.

#### Add harvest

- Current: four-input bottom sheet; save failure retains draft.
- Gaps: same as Add activity, with higher keyboard-cover risk.
- Migration: P1 `InputSheet` with create-discard policy.
- Progress: migrated with the same lifecycle guarantees as Add activity; save failure no longer clears or closes the draft. Platform verification remains open.

### 15. Profile — `app/(tabs)/profile.tsx`

#### Change password

- Current: inline expandable form near the bottom of a long scroll.
- Gaps: no keyboard avoidance, handled taps, or critical input IDs.
- Migration: keyboard-aware full-screen treatment; no `InputSheet` required.
- Progress: migrated; the parent scroll handles keyboard-visible taps, adjusts keyboard insets, and both fields have stable IDs. Platform verification remains open.

#### Select timezone

- Current: already uses `useInputModalLifecycle`, clears transient search on close, and has no competing pan gesture.
- Gaps: missing shared keyboard-aware sheet/list behavior and input ID.
- Migration: early, low-risk `InputSheet` adoption; preserve selection and discard only search text.
- Progress: migrated to the non-nested-list `InputSheet` mode; selection is preserved, transient search is discarded, result taps are handled while the keyboard is open, and stable close/search IDs were added. Platform verification remains open.

### 16. Gardener My Plants — `features/garden/GardenerMyPlantsView.tsx`

#### Search my plants

- Current: search is visible near the top.
- Gaps: scroll tap handling and stable search ID.
- Migration: shared searchable-list pattern.
- Progress: migrated; the parent scroll handles result/action taps with the keyboard visible and the search field has a stable ID. Platform verification remains open.

### 17. Shared Scanner — `hooks/usePlantScanner.tsx`

Consumers include Scan, Library, and app-level scanner entry points.

#### Choose camera/gallery

- No text input; outside the keyboard standard.

#### Review/correct detected name

- Current: shared input sheet with draft retention on save failure.
- Gaps: no shared lifecycle or keyboard-aware shell, pan covers the sheet, direct close paths, missing input ID.
- Migration: `InputSheet` once; verify the flow independently from every consumer screen.
- Progress: migrated once in the shared scanner hook; all consumers now receive the keyboard-aware sheet, handle-only drag, create-discard lifecycle, failure retention, and stable IDs. Consumer/platform verification remains open.

## Rollout phases after the foundation

### Phase 2 — high-risk create/edit forms

1. Reminder create/edit. **Code migrated; iOS/Android interaction verification pending.**
2. Garden detail create/edit bed and edit garden. **Code migrated; platform verification pending.**
3. Bed detail adjust dimensions. **Code migrated; platform verification pending.**
4. Plant detail add activity/add harvest. **Code migrated; platform verification pending.**
5. Library gardener add-plant details. **Code migrated; platform verification pending.**

### Phase 3 — quick input and searchable sheets

1. Garden and Planning quick add. **Code migrated; platform verification pending.**
2. Garden and Planning photo correction. **Code migrated; platform verification pending.**
3. Shared Scanner review/correction. **Code migrated; consumer/platform verification pending.**
4. Bed plant selector. **Code migrated; platform verification pending.**
5. Timezone selector. **Code migrated; platform verification pending.**
6. Library family/genus/species search lists. **Code migrated; platform verification pending.**

### Phase 4 — full-screen and inline forms

1. Plant detail inline edit. **Code migrated; platform verification pending.**
2. Profile change password. **Code migrated; platform verification pending.**
3. Reset password. **Code migrated; platform verification pending.**
4. Gardener My Plants search. **Code migrated; platform verification pending.**
5. Complete critical IDs and E2E regression coverage. **Static ID coverage complete; runtime regression coverage pending.**

## Verification gates for every migration

- TypeScript passes.
- No `autoFocus` is introduced without an explicit product exception.
- No form scroll uses `keyboardDismissMode="on-drag"` by default.
- No bottom-sheet content container owns pan handlers.
- No modal with input calls the parent `onClose` directly.
- Create and edit draft policies are documented next to the lifecycle hook call.
- Save failure does not close the sheet or erase the draft.
- Manual iOS and Android checklist is recorded before marking the flow complete.

## Implementation completion audit — 2026-07-16

The repository-wide implementation pass is complete. Release-level manual platform sign-off remains a separate QA gate.

### Scope evidence

- Static inventory: 57 `TextInput` instances across 20 production mobile files.
- Modal-input consumers using `InputSheet`: Garden list, Garden detail, Bed detail, Planning, Reminder, Library gardener details, Plant Activity, Plant Harvest, Timezone, and the shared Scanner.
- Remaining raw `Modal` instances were inspected and contain selection, confirmation, informational, camera/gallery, or navigation UI only; none owns a text-entry flow.
- Full-screen and inline inputs were intentionally not forced into a bottom sheet. Auth, Reset Password, Explorer, Library search, family/genus/species search, Plant inline edit, Profile password, and Gardener My Plants use the keyboard-aware treatment appropriate to their screen structure.
- No production input introduces `autoFocus` or form-level `keyboardDismissMode="on-drag"`.
- Pan handling for input sheets exists only inside `InputSheet` and is attached only to its drag target. Remaining screen-level pan responders belong to non-input informational/photo modals.

### Foundation evidence

- `InputSheet` and `useInputModalLifecycle` are extracted from the Create Garden reference behavior without owning domain state.
- Create Garden renders through the shared component.
- The existing Create Garden create/scroll/submit smoke flow passed after extraction.
- The dedicated clean-state close/reopen flow passes on iPhone 17 Pro / iOS 26.2 and records the reopened `Fresh Garden` value after the original `Draft Garden` was discarded.
- The dedicated test found an iOS native-Modal remount race. The common component now uses a deterministic JS entry animation, so the fix applies to every migrated consumer.
- Mobile TypeScript checking and `git diff --check` pass after the complete migration.

### Remaining release QA

- Manual iOS sign-off for every dismissal path and save-failure state.
- Android device/emulator verification. No Android SDK, emulator, or connected `adb` device was available in this workspace session.
- Consumer-specific end-to-end fixtures for data-dependent Reminder, Bed, Plant, and Library flows.
