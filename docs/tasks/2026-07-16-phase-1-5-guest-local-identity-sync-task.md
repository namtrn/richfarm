# Phase 1.5 Task — Guest-local identity and account sync claim

Date: 2026-07-16

Status: **SOURCE COMPLETE — OPERATIONAL VERIFICATION PENDING**

## Decision

The app remains usable before sign-in.

- Guest actions write to a device-local dataset only.
- Guest actions never call authenticated Convex entity mutations.
- After sign-in, new actions use the signed-in account scope and sync to Convex.
- Existing guest data is claimed into the first signed-in account using the same
  entity UUIDs and operation IDs.
- Server ownership is always derived from the authenticated Convex identity;
  client-provided device or account IDs are never authorization evidence.

This work belongs to Phase 1.5 because outbox ownership, projection isolation,
scope changes, retry behavior, and authoritative reconciliation are core sync
correctness requirements. Production rollout/version gates are not part of this
task.

## Canonical identities

Do not construct identity strings ad hoc in hooks. Add one identity module and
use these exact concepts everywhere.

```ts
type LocalSyncIdentity =
  | {
      kind: 'guest';
      installationId: string;
      guestDatasetId: string;
      scopeKey: `guest:v1:${string}:${string}`;
    }
  | {
      kind: 'account';
      installationId: string;
      accountUserId: string;
      scopeKey: `account:v1:${string}:${string}`;
    };
```

Identity fields:

| Identifier | Source | Lifetime | Purpose |
|---|---|---|---|
| `installationId` | Existing device ID | App installation | Separates local storage belonging to different installations |
| `guestDatasetId` | UUID stored under `rf_guest_dataset_id_v1` | Until successfully claimed | Identifies one coherent anonymous local dataset |
| `accountUserId` | Better Auth `session.user.id` | Account lifetime | Selects the local account namespace only |
| Convex `users._id` | Server lookup from `ctx.auth.getUserIdentity().tokenIdentifier` | Server account lifetime | Authoritative database ownership |
| `entityUuid` | Generated at first local create | Entity lifetime | Stable logical identity across guest claim and retries |
| `operationId` | Generated at first local mutation | Operation lifetime | Stable idempotency key across guest claim and retries |

Canonical local keys:

```text
guest:v1:<installationId>:<guestDatasetId>
account:v1:<installationId>:<accountUserId>
```

The current `${deviceId}:guest` and `${deviceId}:${sessionUserId}` strings are
development-only legacy formats. There are no production users to migrate, so
development/simulator storage may be reset. Do not ship migration machinery for
these keys. Never send either canonical local scope key to Convex.

## Required invariants

1. Guest data is visible immediately and survives restart without a session.
2. The guest executor performs no Convex entity, upload, preference, session,
   or reconciliation request.
3. An account executor reads only its own account namespace.
4. Logout never renders the previous account projection in guest mode.
5. Account A data/outbox is never visible or executable under Account B.
6. Guest claim preserves every `entityUuid`, `operationId`, parent logical UUID,
   creation order, quarantine entry, and Photo local reference.
7. Claim order is Garden → Bed → Plant → Activity/Harvest/Photo; deletes use the
   existing reverse dependency ordering.
8. Claim is resumable. Process death after any operation must not duplicate a
   server row or lose a remaining operation.
9. The guest namespace is cleared only after all claimed operations are
   acknowledged and an authoritative account projection has been durably saved.
10. After a successful claim, rotate `guestDatasetId`; later guest activity is a
    new dataset and cannot be silently imported twice.

## Claim policy

Use automatic one-time claim when the authentication server confirms that the
flow created a new account. When signing in to an existing account, require the
explicit product choice described in the Solution section below. Do not infer a
new account from the client route or button used to start authentication.

Persist a claim record outside both outboxes:

```ts
type GuestClaimRecord = {
  version: 1;
  guestDatasetId: string;
  sourceScopeKey: string;
  targetAccountUserId: string;
  targetScopeKey: string;
  status: 'pending' | 'importing' | 'reconciling' | 'complete';
  startedAt: number;
  completedAt?: number;
};
```

Storage key:

```text
rf_guest_claim_v1_<guestDatasetId>
```

Rules:

- Once `targetAccountUserId` is written, the dataset cannot be claimed by a
  different account.
- Copy operations into the account outbox with unchanged IDs. Do not generate a
  second create operation.
- Merge with an existing account outbox by `operationId`; identical operations
  deduplicate, conflicting fingerprints go to quarantine.
- Resume `importing` and `reconciling` records on app start.
- Keep the source guest namespace until account reconciliation succeeds.
- On success, mark the claim complete, clear the claimed guest namespace, and
  create a new `guestDatasetId` for the next signed-out session.

## Implementation tasks

### GUEST-IDENTITY-01 — Central identity resolver

Create `apps/mobile/lib/sync/identity.ts`:

- load/create `guestDatasetId`;
- resolve guest/account `LocalSyncIdentity`;
- generate canonical scope keys;
- expose pure helpers for unit tests;
- intentionally omit production legacy-scope migration because no production
  users exist; reset development/simulator storage instead.

Remove scope-string construction from `useEntitySync`, `useSyncExecutor`,
`useSyncProjection`, session cache helpers, and account deletion/logout code.

### GUEST-LOCAL-02 — Render guest authoritative-local projection

Update `useGardens`, `useBeds`, and `usePlants`:

- remove the `!hasSession ? []` behavior;
- skip account-only remote queries while guest;
- render guest projection plus pending overlay;
- use a guest-scoped cache key instead of returning `null`;
- retain current account isolation during scope transitions.

Apply the same policy to Activity, Harvest, Photo, preferences, and any remaining
screen that reads an entity outside these three hooks.

### GUEST-EXECUTOR-03 — No network execution for guest

Update `useSyncExecutor`:

- return a successful local-only result when identity kind is `guest`;
- do not call `ensureSession`, snapshot queries, `applyOperation`, upload URL,
  preference mutation, or runtime metrics;
- leave guest operations pending without increasing attempts/backoff;
- expose `queuedCount` so UI can say “Saved on this device.”

### GUEST-CLAIM-04 — Resumable account claim

Add a serialized claim service under `apps/mobile/lib/sync/guestClaim.ts`:

- atomically lock one guest dataset to one account;
- copy/merge guest outbox and projection into the account scope;
- preserve logical identities and dependencies;
- resume after interruption;
- wait for normal account executor acknowledgement;
- require durable authoritative reconciliation before cleanup;
- rotate the guest dataset after completion.

Do not implement claim as an untracked `AsyncStorage.multiSet` followed by an
immediate guest delete.

### GUEST-TRANSITION-05 — Login, logout, and account switch

- On new-account creation: freeze guest writes, create/resume claim, switch
  rendering to the target account only after its local namespace is loaded, then
  execute claim automatically.
- On existing-account sign-in: ask whether to add guest data or keep it on the
  device. Do not bind or claim unless the user chooses **Add to account**.
- On logout: stop in-flight account callbacks using the existing scope/generation
  guard, then load a fresh guest identity.
- On Account A → B: never claim A data into B and never reuse A projection.
- Slow responses from a previous scope must be ignored.

### GUEST-UX-06 — Explicit storage state

Use product language, not sync internals:

- Guest pending: “Saved on this device.”
- Signed-in pending: “Waiting to sync.”
- Claim running: “Adding this device’s data to your account…”
- Claim complete: “Your device data is synced.”
- Claim conflict: show recoverable quarantine/review state; never discard.

Creating Garden/Bed/Plant while signed out must not show success and then remove
the entity, which is the simulator failure that opened this task.

### GUEST-TEST-07 — Automated coverage

Unit tests:

- canonical guest/account scope construction;
- canonical identity persistence without legacy production migration;
- guest create survives hook reload and app restart;
- guest executor makes zero network calls and does not increment attempts;
- claim preserves IDs and hierarchy order;
- interrupted claim resumes idempotently;
- claim into an account with an existing outbox merges without duplicates;
- claimed dataset cannot be claimed by Account B;
- logout and slow Account A response cannot mutate guest or Account B scope;
- guest dataset rotates only after reconciliation success.

Convex tests:

- unauthenticated v2 writes remain `unauthorized`;
- authenticated claim operations remain idempotent;
- server ownership ignores client device/account identifiers.

Maestro/dev-client tests:

1. Signed out → create Garden and Bed → restart → both remain local.
2. Confirm Convex has received no guest entity operation.
3. Sign in to test Account A → claim resumes → Garden and Bed appear under A.
4. Kill app during claim → reopen → no duplicate and claim completes.
5. Logout A → guest does not show A data.
6. Create new guest Plant → sign in B → only the new guest dataset is offered to
   B; claimed A data is never copied.
7. Offline authenticated create/edit/delete → reconnect → authoritative result
   matches the existing Phase 1.5 rules.

## Definition of done

- All GUEST-* tasks above are implemented.
- Signed-out CRUD is genuinely local-only and survives restart.
- Sign-in claims the guest dataset exactly once without changing logical IDs.
- Account isolation tests pass for guest, Account A, and Account B.
- Garden → Bed simulator flow passes both before sign-in locally and after claim
  against the Convex development deployment.
- Mobile TypeScript, Convex TypeScript, full Vitest, API build, dashboard build,
  and iOS smoke suite pass.
- Phase 1.5 cross-check links this task and no longer describes guest/account
  behavior as unresolved.

## Explicit non-goals

- Production minimum client version or legacy cutoff.
- Production rollout metrics or operation-count thresholds.
- Production migration/backfill rehearsal.
- Cross-device guest sync before sign-in.
- Treating `deviceId`, `installationId`, `guestDatasetId`, or client
  `accountUserId` as server authorization.

## Solution — approved product flow and technical design

### Product decisions

- A non-empty guest dataset is claimed automatically when the authentication
  flow creates a new account. The dataset becomes owned by that account and can
  never later be claimed by another account.
- Signing in to an existing account does not claim guest data automatically.
  Ask: “This device has data created while signed out. Add it to this account?”
  with two actions: **Add to account** and **Keep on this device**.
- Choosing **Keep on this device** leaves the guest dataset unbound. Account
  data is rendered while signed in; the guest dataset is visible again after
  logout. A Settings entry may offer the claim later without prompting on every
  login.
- New-account detection must come from an authenticated server result (for
  example a Better Auth new-user callback/marker), never from which client
  button or route initiated OAuth.
- There are no production users with the legacy local scope format. Do not add
  production legacy-scope migration machinery in this phase; development and
  simulator storage using the old format may be reset.

### Claim data model

Treat claim as a serialized, crash-resumable local state machine rather than an
AsyncStorage lock. Persist every checkpoint before starting its next side
effect. Re-entering any phase must be safe.

```ts
type GuestClaimRecord = {
  version: 1;
  guestDatasetId: string;
  sourceScopeKey: string;
  targetAccountUserId?: string;
  targetScopeKey?: string;
  status:
    | 'awaiting_account_choice'
    | 'importing'
    | 'executing'
    | 'reconciling'
    | 'needs_attention'
    | 'finalizing'
    | 'complete';
  sourceFingerprint?: string;
  sourceOperationCount?: number;
  sourceOperationIds?: string[];
  sourceQuarantineIds?: string[];
  sourcePlantIds?: string[];
  importedAt?: number;
  reconciledGeneration?: string;
  reconciledAt?: number;
  completedAt?: number;
};
```

Once `targetAccountUserId` is persisted, it is immutable. Enqueue and claim
transitions use the same serialized coordinator so a guest write cannot land
after the claim snapshot and then be deleted. App termination at any checkpoint
must resume without regenerating an operation ID.

### Projection boundary

Never copy the guest projection into the account authoritative projection.

```text
guest outbox ── idempotent merge ──> account outbox
                                          │
                                          ▼
                                  normal account executor
                                          │
                                          ▼
                                        Convex
                                          │
                                          ▼
                              fresh authoritative projection
```

While claim is running, render the account's durable server projection with the
account outbox as its pending overlay. Guest data may be presented as a separate
claim preview, but must never be marked as server-authoritative before Convex
acknowledgement and reconciliation.

### Merge and completion rules

- Merge by immutable `operationId` using a canonical fingerprint containing
  only entity type/UUID, operation type, base revision, parent references, and
  payload. Retry metadata, device ID, generation, timestamps, and errors are not
  part of the fingerprint.
- Identical operations deduplicate. A different payload under the same
  operation ID is a diagnostic invariant violation and must not overwrite either
  copy silently.
- Network loss, timeout, and process death remain pending and retry normally;
  they are not user-facing conflicts.
- Complete the claim only after every non-terminal operation is acknowledged and
  a fresh authoritative account projection for the active generation has been
  durably stored. Clear the source namespace and rotate `guestDatasetId` last.
- If the user logs out or switches accounts during a bound claim, pause it. It
  may resume only while its bound target account is authenticated.

### Photo recovery

- A local photo whose file no longer exists is not synced. Show an
  **Image not found** placeholder with one action: **Delete photo**.
- Do not replace or re-import an image through that placeholder. The user adds a
  different photo through the normal add-photo flow, producing a new operation.
- If the file exists but access permission is missing, request the relevant
  permission and retry the same operation after access is restored.
- Network, upload, and server failures display and retry according to their real
  cause; they must not be mislabeled as a missing local file.

### Executor result

Guest execution is a distinct local-only outcome, not a successful sync:

```ts
type SyncExecutorResult =
  | { status: 'local_only'; queuedCount: number }
  | { status: 'synced'; syncedCount: number; queuedCount: number }
  | { status: 'partial'; syncedCount: number; errorCount: number; queuedCount: number }
  | { status: 'scope_changed'; queuedCount: number };
```

The guest path performs zero Convex, upload, preference, reconciliation, or
runtime-metrics calls and does not change attempts or retry timestamps.

### Required additional tests

- New account auto-claims a non-empty guest dataset.
- Existing account requires an explicit choice; **Keep on this device** leaves
  the dataset unbound and visible again after logout.
- OAuth/new-account classification uses a server-authenticated marker rather
  than the initiating client screen.
- Fault injection after every durable claim checkpoint resumes idempotently.
- A guest enqueue racing with claim start is either included in that claim or
  safely routed to the bound account; it is never lost.
- Logout or Account B sign-in pauses an Account A claim and cannot execute it.
- Missing image file shows the delete-only placeholder and never attempts an
  upload; missing permission requests access and retries after permission is
  restored.
- Guest executor returns `local_only`, performs zero network calls, and leaves
  retry metadata unchanged.

### Mobile input and keyboard standard

All inputs introduced or changed by this phase follow
[`docs/standards/mobile-input-keyboard.md`](../standards/mobile-input-keyboard.md).
In particular, modal and bottom-sheet close paths must use the shared
`useInputModalLifecycle` hook so an input can focus and open the keyboard again
after the modal is reopened. Create-form cancel actions discard their draft;
edit forms restore their persisted source value.

## Completion Update — 2026-07-29

The source implementation now satisfies the guest identity, guest-local
projection, no-network guest executor, resumable claim, scope transition,
storage-state messaging, and automated pure-test requirements in this task.

Remaining evidence is part of the parent Phase 1.5 operational gate:

- restart and reconnect on physical/simulator iOS and Android installations;
- interrupted guest claim followed by process restart;
- account A → guest → account B isolation with delayed old-account responses;
- two-client conflict and deletion scenarios;
- independent release audit.

Until those scenarios are recorded, this task is source-complete but does not by
itself open Phase 2.
