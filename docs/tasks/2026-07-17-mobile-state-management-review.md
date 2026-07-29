# Mobile State Management Review

Date: 2026-07-17
Scope: `apps/mobile` current working tree, including uncommitted changes
Review mode: Read-only architecture and correctness review

## Verdict

**PARTIAL — strong sync foundation, state ownership consolidation required.**

Overall assessment: **6/10**.

The mobile application has a stronger-than-average offline synchronization
foundation: account-scoped outboxes, stable operations, tombstones, revisions,
authoritative reconciliation, optimistic projection, and resumable guest claim.
The React-facing state layer is less mature. Runtime state is reconstructed by
many hooks, projection state is duplicated per consumer, and several
preferences have overlapping local and server sources of truth.

The most urgent issue is a scope-transition race that can publish an old
account's projection after another account or guest scope is active. This must
be resolved before Phase 2 adds more entities that depend on the sync layer.

## Scorecard

| Area | Score | Assessment |
|---|---:|---|
| Offline/sync model | 8/10 | Strong operation, receipt, tombstone, revision, and claim model |
| Account isolation | 5/10 | Storage keys are scoped, but projection publication has a stale-scope race |
| Preference state | 4/10 | Theme, unit, weather, and settings have overlapping owners |
| React reactivity | 6/10 | Mode propagation improved; external stores remain fragmented |
| Performance/scalability | 5/10 | Repeated subscriptions, AsyncStorage reads, projection clones, and renders |
| Local form state | 6/10 | Appropriate local state exists, but workflows are concentrated in large screens |
| Testability | 4/10 | Good pure sync tests; weak hook, screen, and transition coverage |

## Findings

### P0 — Old-scope projection can publish after account transition

Evidence:

- `apps/mobile/hooks/useSyncProjection.ts:17-26` starts an async
  `loadRenderedProjection(scope)` and unconditionally calls `setProjection`.
- The effect unsubscribes listeners when scope changes, but it does not cancel
  or invalidate an already running AsyncStorage read.
- `useGardens`, `useBeds`, `usePlants`, and Plant Detail combine the projection
  returned by that hook with the currently resolved identity.

Reproduction path:

1. Account A begins a slow projection load.
2. The user logs out or signs into Account B.
3. The new scope begins loading.
4. Account A's earlier promise resolves last.
5. The hook publishes Account A's projection while the current identity is
   guest or Account B.

Impact:

- Cross-account data may flash or remain visible.
- Domain mutations may resolve revisions/UUIDs from the wrong rendered
  projection.
- The documented account-isolation invariant is not proven.

Required remediation:

- Capture `scope + scopeToken` for every async projection load.
- Publish only when both still match the active runtime snapshot.
- Clear the in-memory projection synchronously on scope transition.
- Add a deterministic delayed-Account-A/fast-Account-B regression test.

### P1 — Every projection consumer creates an independent store

Evidence:

- `useGardens`, `useBeds`, `usePlants`, and Plant Detail each invoke
  `useSyncProjection`.
- Each `useSyncProjection` instance subscribes to both the outbox and
  authoritative projection.
- Each notification calls `loadRenderedProjection`, which reads the persisted
  projection and outbox and deep-clones the projection using JSON.

Impact:

- One queued operation causes repeated AsyncStorage reads and full projection
  composition.
- Different hook instances can temporarily render different snapshots.
- Cost grows with both projection size and number of mounted screens.

Required remediation:

- Introduce one active `SyncScopeStore`.
- Hydrate/compose once per transition.
- Expose selector-based hooks by entity type and query/filter.
- Use `useSyncExternalStore` or Zustand selectors; do not mirror all Convex
  server state in Redux.

### P1 — Unit system is globally persisted but also account-synced

Evidence:

- `apps/mobile/lib/unitPreference.ts:4` uses the unscoped key
  `richfarm:unitSystem`.
- `apps/mobile/hooks/useUnitSystem.ts:29` prioritizes the global cached value
  over `settings.unitSystem`.
- Profile writes both the global value and the account preference.

Impact:

- Account A's unit choice can override Account B or guest state.
- Multi-device settings and local device behavior can disagree.
- The application has no single source of truth for units.

Required remediation:

- Declare units account/guest-scoped and route them only through the scoped
  preference store; or declare them installation-only and stop syncing them.
- Recommended decision: make units guest/account-scoped.

### P1 — Theme mirror can retain a previous account's value

Evidence:

- `apps/mobile/lib/ThemeContext.tsx:20-29` copies `settings.theme` into local
  React state.
- The effect updates only when `settings.theme` is truthy.
- Profile also changes ThemeContext directly before writing the preference.

Impact:

- If Account A selects dark and Account B has no explicit theme, B can inherit
  A's local mirror instead of the `system` default.
- Theme has two write paths and two owners.

Required remediation:

- Derive the rendered theme directly from scoped optimistic settings and the
  system color scheme.
- Remove the independent scoped-theme mirror from ThemeContext.

### P1 — Weather visibility has conflicting local and server ownership

Evidence:

- `apps/mobile/hooks/useWeatherCardPreference.ts` maintains React state,
  account-scoped AsyncStorage, and `userSettings.showWeatherCard`.
- The implementation states that the local device value is primary while still
  synchronizing the field to Convex.
- Signed-out mode forces `true` instead of consuming the guest-scoped
  preference queue.

Impact:

- Guest preference does not follow the same persistence model as mode.
- Local cache can permanently override a server preference.
- Account and device semantics are ambiguous.

Required remediation:

- Use the common scoped preference pipeline for weather visibility.
- If product policy chooses installation-only behavior, remove it from server
  settings instead.

### P1 — Plant local state and outbox operations are not one durable command

Evidence:

- Plant/Library screens save `plantLocalData` and enqueue the corresponding
  Activity/Harvest/Photo in separate awaited calls.
- `savePlantLocalData` overwrites the whole plant-local document and has no
  per-scope/plant serialization.
- The sync executor can concurrently edit the same local document while
  resolving or quarantining operations.

Impact:

- Process death between the two writes can leave presentation without an
  operation or an operation without presentation.
- Concurrent read-modify-write sequences can lose entries.

Required remediation:

- Add domain commands that serialize local presentation and outbox updates by
  `scope + plantId`.
- Persist checkpoints so interrupted commands can be completed or recovered.
- Prevent screens from coordinating these writes directly.

### P1 — React state updater timing is treated as a transaction

Evidence:

- `apps/mobile/app/(tabs)/plant/[userPlantId].tsx:388-408` assigns a local
  variable inside `setLocalData(prev => ...)` and immediately assumes that
  assignment has completed.

Impact:

- React does not guarantee this updater is a synchronous persistence primitive.
- A save may return `false` or persist the wrong snapshot under concurrent
  rendering/batching.

Required remediation:

- Compute and persist through a serialized store/command outside React state.
- Publish the resulting immutable snapshot to React after the durable step.

### P1 — Corrupt durable user state is silently converted to empty state

Evidence:

- `apps/mobile/lib/sync/queue.ts:29-46` returns an empty outbox on JSON parse,
  version, or scope failure.
- `apps/mobile/lib/plantLocalData.ts:76-91` returns empty arrays on parse
  failure.

Impact:

- Unsynced user-authored content can disappear without recovery or diagnostic
  state.
- A later write can overwrite the corrupted source with an empty envelope.

Required remediation:

- Add runtime schema validation.
- Preserve the raw payload under a recovery key.
- Enter `needs_attention` instead of reporting an empty healthy queue.
- Permit disposable server read caches to reset, but not durable outboxes or
  guest-authored content.

### P2 — Runtime state is reconstructed through many subscriptions

Evidence:

- Better Auth session is consumed independently by AuthProvider,
  `useLocalSyncIdentity`, `BetterAuthConvexProvider`, `useHasAuthSession`, and
  `GuestClaimCoordinator`.
- Device ID, network status, identity, and projection are repeatedly composed
  inside domain hooks.

Impact:

- Transition ordering is difficult to reason about and test.
- Auth/network changes fan out through many effects and rerenders.
- A future change can update one identity interpretation but miss another.

Required remediation:

- Add one `MobileRuntimeStore` for installation ID, auth classification,
  identity, active scope token, network, and AppState.
- Make domain layers consume the same runtime snapshot.

### P2 — Complex workflows are concentrated in large screens

Current examples:

- Garden Index: approximately 1,451 lines and 21 local state hooks.
- Reminder: approximately 1,583 lines and 12 local state hooks.
- Plant Detail: approximately 1,232 lines and 15 local state hooks.
- Library Detail: approximately 1,442 lines and 12 local state hooks.
- Profile: approximately 972 lines and 16 local state hooks.

Impact:

- Draft reset, mode transition, account transition, navigation focus, and modal
  lifecycle logic are interleaved.
- Tests must mount large screens to validate small workflow rules.

Required remediation:

- Keep truly local UI state local.
- Extract form/workflow reducers and controllers with explicit events.
- Close or revalidate incompatible forms on scope/mode transition.

### P2 — Projection/domain typing is weak

Evidence:

- Domain hooks cast projection collections to `any[]`.
- There are extensive `any` casts across sync and major screens.

Impact:

- Projection schema changes can bypass TypeScript.
- Logical IDs, Convex IDs, pending fields, and server-only fields are easily
  mixed.

Required remediation:

- Define rendered entity types per domain.
- Distinguish logical UUIDs from Convex document IDs.
- Validate persisted envelopes and remove `any` from domain boundaries first.

## Strengths to preserve

- Canonical guest/account scope keys are centralized.
- Outbox writes are serialized.
- Reconciliation already checks current scope before committing a freshly
  downloaded server snapshot.
- Pending creates render before the first server hydration.
- Tombstones and revision checks prevent common resurrection failures.
- Guest execution avoids authenticated entity sync.
- Guest claim preserves logical and operation IDs.
- `useQueryCache` has a cancellation guard on cache-key changes.
- Preference mode now keeps an acknowledged optimistic patch until the remote
  revision catches up.
- React Compiler is enabled; state-library adoption should be driven by
  ownership and selectors, not manual memoization avoidance.

## Missing test coverage

The mobile suite currently focuses on storage and pure sync behavior. Required
additional coverage:

1. Delayed Account A projection after Account B activation.
2. Logout to guest with no Account A projection/preference flash.
3. Theme/unit/weather isolation across guest, Account A, and Account B.
4. Guest preference restart behavior with zero network calls.
5. Mode switch propagation through tabs, mounted screens, detail routes, and
   open forms.
6. Preference ACK before reactive query without UI rollback.
7. Concurrent local Activity/Harvest/Photo writes.
8. Process interruption between local content and outbox checkpoints.
9. Corrupt outbox recovery.
10. Render-count/profile baseline for projection changes.

Tests should combine:

- pure external-store tests;
- hook/component tests;
- Maestro native flows;
- two-account and offline/restart scenarios.

## Recommended target architecture

The target is specified in:

- `docs/architecture/mobile-state-management.md`

Summary:

```text
MobileRuntimeStore
        │ active scope + scope token
        ▼
SyncScopeStore ───── PreferenceStore
        │                   │
        ├── selectors       ├── mode
        ├── commands        ├── theme
        ├── projection      ├── units
        └── outbox          └── weather
                │
                ▼
              Convex
```

Convex remains the server-state owner. The local stores own only runtime,
durable offline state, optimistic projection, and scoped preferences.

## Implementation order

1. Fix stale-scope projection publication and add the Account A/B regression
   test.
2. Unify mode/theme/unit/weather in one scoped preference model.
3. Introduce one runtime snapshot and one active sync-scope store.
4. Convert domain hooks to selector hooks and command calls.
5. Make plant local/outbox updates serialized recoverable commands.
6. Add runtime persistence validation and recovery.
7. Extract large workflow controllers and profile rerenders.

## Completion gate

State management remediation is complete when:

- no old scope can publish after a scope transition;
- each preference has exactly one declared owner and scope;
- projection/outbox hydration and composition occur once per active scope;
- screens invoke durable commands instead of coordinating storage writes;
- corrupt user-authored offline state is recoverable;
- guest, Account A, and Account B isolation tests pass;
- mode/theme/unit/weather update all active consumers without restart;
- native mode/account/restart tests pass;
- React profiling confirms projection updates do not fan out through redundant
  store instances.

## Recommendation

Do not rewrite the application around a general global-state library. First
repair scope safety and define ownership. Then consolidate the existing custom
external stores behind selector hooks. This retains the strong Phase 1.5 sync
model while removing the React-layer ambiguity and duplicated work.
