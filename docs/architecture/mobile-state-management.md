# Mobile State Management Architecture

Date: 2026-07-17
Status: Target architecture and engineering contract

## Purpose

This document defines how the RichFarm mobile application owns, persists,
publishes, synchronizes, and resets state. It is the architectural entry point
for authentication, local-first entities, preferences, server state, form state,
and navigation state.

The goal is not to place all state in one library. The goal is to give every
piece of state exactly one owner, one source-of-truth policy, and explicit
transition semantics.

## Core principles

1. Convex owns authoritative server state.
2. The active local sync scope owns durable offline state and optimistic state.
3. React components render state; they are not transactional persistence stores.
4. Every persisted field has one declared scope: installation, guest dataset,
   account, or session.
5. A server mutation acknowledgement is not the same as a reactive query update.
6. State from an old auth scope must never commit after a new scope is active.
7. UI code invokes commands; it does not coordinate AsyncStorage and outbox writes.
8. External stores publish changes once and support selector-based subscriptions.
9. Corrupted user-authored durable state is recoverable, never silently replaced
   with an empty state.
10. Navigation parameters describe navigation intent, not durable domain state.

## State taxonomy and ownership

| State class | Examples | Owner | Persistence | Scope |
|---|---|---|---|---|
| Runtime identity | installation ID, auth status, active scope | `MobileRuntimeStore` | installation ID only | installation/session |
| Server state | users, Library data, authoritative entity pages | Convex | Convex plus read cache where required | account |
| Offline entity state | projection, outbox, quarantine, generation | `SyncScopeStore` | AsyncStorage | guest/account scope |
| Preferences | app mode, theme, units, temperature, weather visibility | `PreferenceStore` | preference outbox plus Convex for accounts | guest/account scope |
| Installation settings | native permissions, device-only capability flags | dedicated installation store | AsyncStorage/SecureStore | installation |
| Local plant attachments | pending photo reference and unsynced child content | command layer under `SyncScopeStore` | AsyncStorage/filesystem | guest/account scope |
| Form state | draft fields, validation, save progress | component reducer/controller | memory unless explicitly resumable | screen/workflow |
| Transient UI state | modal visibility, selected filter, toast | component | memory | component/screen |
| Navigation state | route, return destination, selected entity ID | Expo Router | navigation stack | session |

## Runtime state

The application must expose one coherent runtime snapshot:

```ts
type MobileRuntimeState = {
  installationId: string | null;
  authStatus: 'loading' | 'guest' | 'account';
  identity: LocalSyncIdentity | null;
  activeScope: string | null;
  scopeToken: string;
  network: 'unknown' | 'offline' | 'online';
  appState: 'active' | 'background' | 'inactive';
};
```

`scopeToken` changes on login, logout, account switch, guest dataset rotation,
and account deletion. Every asynchronous read or reconciliation captures the
token and may publish its result only when the token is still current.

Better Auth session reads, device identity resolution, network subscriptions,
and AppState subscriptions should be centralized at the application root.
Domain hooks must consume the runtime snapshot instead of independently
reconstructing identity and connectivity.

## Sync scope store

There is one active `SyncScopeStore` per active guest/account scope. It owns:

```ts
type SyncScopeState = {
  scope: string;
  scopeToken: string;
  generation?: string;
  hydration: 'idle' | 'loading' | 'ready' | 'needs_attention';
  authoritativeProjection: ProjectionEnvelope | null;
  renderedProjection: ProjectionEnvelope | null;
  outbox: OutboxEnvelope;
  syncStatus: 'local_only' | 'idle' | 'pending' | 'retry' | 'attention';
};
```

The store is responsible for:

- loading the persisted projection and outbox once per scope;
- composing pending operations over the authoritative projection;
- publishing one new immutable snapshot after a state transition;
- rejecting late results from an obsolete scope token;
- exposing selector-based subscriptions;
- persisting outbox changes before reporting a command as locally saved;
- coordinating reconciliation and post-commit acknowledgement;
- preserving corrupt payloads for recovery.

Recommended API:

```ts
useGardensState()
useBedsState(gardenId?)
usePlantsState(status?)
usePlantChildrenState(plantId)
useSyncStatusState(plantId?)
```

These hooks are selectors over one store. They must not each read AsyncStorage,
clone the complete projection, or establish separate projection subscriptions.

`useSyncExternalStore` is sufficient for a custom store. Zustand with selectors
is also acceptable. Redux must not mirror all Convex server state.

## Authoritative and optimistic state

Rendered entity state is derived as:

```text
authoritative projection
        + valid pending outbox operations
        - tombstoned/deleted entities
        = rendered projection
```

Rules:

- Convex remains authoritative after reconciliation.
- Pending creates render before a server snapshot exists.
- Pending updates apply only to the revision they were based on.
- Invalid-parent or deleted-target operations enter quarantine.
- Tombstones always defeat stale local updates.
- A successful server acknowledgement does not remove the optimistic overlay
  until the corresponding authoritative revision is durably available.
- Projection recomputation happens once per store transition, not once per hook.

## Preference state

All user-facing preferences use one `PreferenceStore` and the same optimistic
revision contract.

Initial fields:

- `appMode`;
- `theme`;
- `unitSystem`;
- `temperatureUnit`;
- `showWeatherCard`.

Resolution order:

```text
pending scoped patch
    → acknowledged patch awaiting remote revision
    → authoritative/cached scoped settings
    → product default
```

Rules:

- Guest preferences are stored under the guest dataset scope and perform no
  authenticated network request.
- Account preferences use an account-scoped outbox and Convex revision.
- An acknowledged patch remains visible until
  `remoteRevision >= acknowledgedRevision`.
- Account A preferences are never used as Account B or guest defaults.
- A preference cannot simultaneously have a global device override and an
  account-synced value.
- Installation-only settings must use a separate, explicitly named store and
  must not be written to `userSettings`.

Theme and unit hooks derive their rendered values from `PreferenceStore`; they
must not mirror scoped values into unrelated local React state.

## Command layer

Screens invoke domain commands rather than performing storage choreography.

Examples:

```ts
commands.createGarden(input)
commands.updatePlant(id, patch)
commands.appendActivity(plantId, activity)
commands.addPhoto(plantId, photo)
commands.setPreference({ appMode: 'farmer' })
```

A command owns:

1. input validation;
2. stable entity and operation IDs;
3. dependency references;
4. serialized durable local write;
5. optimistic store publication;
6. sync scheduling for an account scope;
7. local-only outcome for a guest scope;
8. recoverable failure state.

Commands affecting local plant presentation and the outbox must use one
serialized coordinator per `scope + plantId`. React `setState` updater timing
must never be used as a persistence transaction.

## Authentication and scope transitions

### Login

1. Resolve the authenticated account identity.
2. Rotate `scopeToken`.
3. Stop old-scope publications and callbacks.
4. Load the target account store.
5. Render only after the target namespace is selected.
6. Run or resume guest claim according to product policy.

### Logout

1. Rotate `scopeToken` before loading guest data.
2. Cancel/ignore account callbacks.
3. Clear in-memory account snapshots.
4. Load a fresh/current guest identity and its store.
5. Never use the prior account projection or preference as a fallback.

### Account A to Account B

- A late A response is discarded by scope token.
- A projection, outbox, preferences, form draft, or local attachment is never
  published under B.
- Account-specific screens show a loading boundary or B state, never A state.

### Guest claim

- The claim record binds one guest dataset to one account.
- Operation and entity IDs remain unchanged.
- Guest writes racing with claim start are serialized through the claim
  coordinator.
- Source cleanup and guest dataset rotation occur only after authoritative
  reconciliation is durably stored.

## Form and transient UI state

Component-local state remains the correct owner for:

- text currently being entered;
- modal and sheet visibility;
- selected local tab or filter;
- validation feedback;
- one interaction's loading/error state.

Complex workflows use a reducer/controller with explicit events:

```text
OPEN_CREATE
OPEN_EDIT(source)
CHANGE_FIELD
SUBMIT
SUBMIT_SUCCESS
SUBMIT_FAILURE
CANCEL
SCOPE_CHANGED
```

Create-form cancel discards its draft. Edit-form cancel restores the persisted
source. Account or mode changes close or revalidate a workflow that is no longer
valid. All input sheets follow `docs/standards/mobile-input-keyboard.md`.

Large screens should extract workflow controllers such as:

- `useGardenCreateDraft`;
- `useGardenEditDraft`;
- `usePlantActivityComposer`;
- `usePlantLocationEditor`;
- `useProfilePreferencesDraft`.

## Navigation state

Route parameters may carry:

- selected entity identifiers;
- one-time navigation intent such as opening a create sheet;
- return destination;
- shareable search/filter parameters.

They must not become the long-lived source of truth for app mode, auth scope,
entity content, saved preferences, or unsaved form drafts. One-time parameters
must be consumed or guarded so focus/remount does not repeat the action.

Mode-dependent routes must subscribe to the central preference selector. When a
route becomes invalid after a mode transition, it redirects deterministically
and discards or restores its draft according to the form policy.

## Persistence and recovery

Persisted envelopes require:

- explicit version;
- embedded scope;
- runtime schema validation;
- migration or quarantine for unsupported versions;
- recovery copy of malformed user-authored data;
- payload-free diagnostics;
- idempotent writes and cleanup.

Read caches may be discarded when corrupt because the server can rebuild them.
Outboxes, guest datasets, pending attachments, and unsynced plant content may
not be silently converted into empty state.

## Performance contract

- One runtime subscription per native/external source.
- One projection/outbox hydration per active scope.
- Selector consumers rerender only when their selected slice changes.
- Projection cloning/recomposition occurs once per transition.
- React Compiler remains enabled, but compiler memoization is not a replacement
  for correct external-store ownership.
- Performance work follows measure → optimize → re-measure → validate.
- Profile mode switch, entity enqueue, reconciliation, and large Plant Detail
  hydration in React Native DevTools before and after store consolidation.

## Testing contract

Required automated coverage:

1. Slow Account A projection cannot publish after Account B becomes active.
2. Logout cannot render account projection or preferences in guest scope.
3. Account B with missing preferences receives product defaults, not Account A
   values.
4. Guest preferences survive restart without network execution.
5. Mode, theme, unit, and weather changes notify every relevant selector.
6. Server acknowledgement before reactive query does not roll UI backward.
7. Concurrent plant-local commands cannot lose an activity/photo/harvest.
8. Process interruption between durable command checkpoints resumes safely.
9. Corrupt outbox enters recovery state and preserves the original payload.
10. Mode changes update tabs, active screens, detail routes, and open forms.

Tests should include pure store tests, hook/component tests, and Maestro/native
flows. Passing backend tests alone is not sufficient evidence for screen
reactivity or account-transition safety.

## Migration plan

1. Add scope-token protection to current projection reads.
2. Unify theme, unit, weather, and mode ownership in the preference layer.
3. Introduce one runtime store and one active sync-scope store without changing
   Convex APIs.
4. Convert domain hooks to selector hooks and command calls.
5. Move plant local/outbox writes into serialized commands.
6. Add persisted-envelope validation and recovery.
7. Extract complex form controllers from large screens.
8. Profile and remove obsolete subscriptions, caches, and adapters.

Each step must retain guest/account isolation and the Phase 1.5 sync invariants.

## Anti-patterns

Do not:

- load the same projection independently in every domain hook;
- copy server/scoped preference state into an unscoped global state;
- clear optimistic state only because a mutation returned success;
- coordinate multiple durable writes directly in a screen;
- assume a React state updater executes synchronously for persistence;
- use route parameters as durable state;
- silently replace corrupt user-authored state with an empty array;
- add Redux/Zustand copies of all Convex query results;
- require app restart or navigation remount for state propagation.

## Related documents

- `docs/tasks/2026-07-17-mobile-state-management-review.md`
- `docs/tasks/2026-07-14-phase-1-5-authoritative-offline-sync-plan.md`
- `docs/tasks/2026-07-16-phase-1-5-guest-local-identity-sync-task.md`
- `docs/standards/mobile-input-keyboard.md`
