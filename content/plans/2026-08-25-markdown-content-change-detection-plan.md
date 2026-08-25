# Markdown Content Change Detection and Review Inbox Plan

Date: 2026-08-25

Status: **PLANNED — IMPLEMENT IN A LATER CONVERSATION ON THE CURRENT WORKTREE USING THE HEAVY ROUTE**

## Objective

Automatically detect when a human or AI changes Git-authored plant or
pest/disease Markdown, persist the evidence in SQLite, and notify content/admin
users in the dashboard. Detection must never automatically import content into
SQLite or publish it to Convex.

The reviewed publication flow remains:

```text
Git Markdown changed
  -> durable SQLite change event
  -> dashboard Content Inbox
  -> admin/content preview and approval
  -> re-hash + fresh dry-run validation
  -> transactional Markdown -> SQLite import
  -> sync outbox
  -> explicit gated SQLite -> Convex publication
  -> Convex readback/reconciliation
```

The design must remain responsive with an expected catalog of roughly 10,000
content directories and 50,000 locale Markdown files. Dashboard requests must
query persisted state and must not trigger a repository-wide scan or hash.

## Non-goals

- Do not auto-write detected Markdown into SQLite.
- Do not auto-process the Convex sync outbox.
- Do not watch from the browser. A dashboard deployment cannot observe a Git
  working tree that it cannot read.
- Do not use directory slugs or localized display names as canonical identity.
- Do not replace exact SHA-256 manifest validation with `mtime` or file size.
- Do not silently discard, merge, or approve burst events.
- Do not deploy or mutate production Convex as part of this work package.

## Adopted architecture

### Runtime topology

Create a modular content-source monitor owned by the API/worker process that
has read access to the repository `content/` tree. `apps/api/src/server.ts`
starts it after SQLite initialization and stops it during graceful shutdown.

The monitor has four complementary detection layers:

1. **Live watcher:** observes create, modify, rename, and delete events while
   the process is running and queues only the affected paths.
2. **Startup catch-up:** compares a durable Git/source checkpoint and the
   SQLite source index to recover changes made while the process was stopped,
   including pull and branch-switch changes.
3. **Periodic bounded reconciliation:** walks the source tree as a safety net,
   comparing path + `mtime` + size first and hashing only new or suspected
   files. It detects watcher loss without making dashboard requests expensive.
4. **Low-frequency full-hash audit:** hashes every supported source file at
   least once per 24 hours, independent of `mtime` and size. This closes the
   known metadata-first gap where an edit preserves size and falls within the
   filesystem timestamp granularity. Health reports the age and completeness
   of the last full-hash audit; metadata reconciliation alone is not proof that
   source bytes are current. The audit must run in bounded, resumable batches
   under an explicit I/O/time budget distributed across the day, yield to API
   workload, persist its cursor, and avoid a single 50,000-file hashing burst.
   MCD-1 fixtures define the scheduling contract; MCD-7 records and tunes the
   initial hourly budget from measured API latency and throughput.

“Automatic detection” is guaranteed only while at least one configured monitor
runtime or CI equivalent can read the content tree. If coverage is unavailable,
stale, incomplete, or failing, API health and Data Health must report
`degraded`/`incomplete`; the system must never present an unverified green state.

For deployments where the API has no Git checkout, use the same detector as a
CI command and deliver its durable batch to the API through an authenticated,
idempotent endpoint. The endpoint must enforce the existing service-auth
boundary plus a 5 MiB request cap, at most 1,000 events per batch, a 10-minute
signed replay window, and a per-principal rate limit of 10 requests/minute with
explicit `429` behavior. Do not add this topology unless repository/deployment
evidence shows it is needed.

Only one API instance may actively watch, reconcile, or advance detector
checkpoints for a configured content root. Coordinate ownership with a SQLite
lease renewed by heartbeat: 30-second lease, renewal every 10 seconds, and
takeover only after expiry. Non-owners remain passive and report passive
health; loss or ambiguity of the lease is degraded and stops checkpoint writes.

### Separation of responsibilities

- `content-source-index`: paths, metadata, exact digests, checkpoints, and
  idempotent event persistence.
- `content-source-monitor`: lifecycle, watcher events, debounce/batching, and
  scheduled reconciliation.
- `content-change-review`: validation, preview, proposal state, authorization,
  stale-approval protection, and apply orchestration.
- Existing `content-manifests`: authoritative manifest validation, exact-byte
  hashing, dry-run, and transactional apply behavior.
- Existing sync reconciliation/outbox: publication gates and Convex readback.
- Dashboard Content Inbox: reads durable API state; it never scans files.

These responsibilities must remain separate modules with narrow interfaces so
watching, indexing, review, and publication can be tested independently.

## SQLite state model

Add additive migrations for dedicated content-source state. Do not overload
`sync_findings` with watcher lifecycle state or use the outbox as a file queue.

### `content_source_files`

One row per tracked manifest or locale Markdown file:

- normalized repository-relative `path` (unique, case-sensitive contract);
- entity kind: `plant` or `pest_disease`;
- entity key/plant code, locale where applicable, and owning manifest path;
- file kind: `manifest` or `markdown`;
- observed `mtime`, byte size, and exact lowercase SHA-256;
- manifest/content version and validation summary when available;
- first seen, last seen, last hashed, and deleted timestamps;
- last detector checkpoint/reconciliation ID;
- a per-file monotonic evidence revision used to calculate proposal scope
  watermarks;
- state: `clean`, `changed`, `new`, `deleted`, `invalid`, or `unreadable`.

`mtime` and byte size are only scan accelerators. Approval and application
always use a fresh exact-byte hash and existing manifest contract.

### `content_change_events`

Durable, append-oriented review events:

- stable event ID and idempotency key;
- affected path, owning manifest, entity identity, and locale;
- event type: `created`, `modified`, `renamed`, `deleted`, or
  `manifest_changed`;
- old/new exact digest and byte size where known;
- detector source: `watcher`, `startup_catchup`, `periodic_reconcile`, or `ci`;
- first/last detected timestamps and coalesced event count;
- validation findings and evidence revision;
- review state: `pending`, `blocked`, `approved`, `applied`, `dismissed`, or
  `superseded`;
- reviewer identity, role, reason, reviewed timestamp, and apply result;
- links to content proposal, SQLite revision, outbox item, and finding where
  applicable;
- correlation/group ID for rename pairs and entity-level inbox grouping.

Repeated delivery of the same final path/digest/evidence revision must be
idempotent. A later digest supersedes an unapplied approval instead of silently
reusing it.

### `content_source_monitor_runs`

Persist watcher/session and reconciliation evidence:

- run ID, detector mode, start/end/status, repository checkpoint/HEAD;
- paths inspected, metadata comparisons, files hashed, events produced;
- completeness, error, and last healthy heartbeat;
- source revision before/after the run.

Maintain a dedicated monotonic global `content_source_revision` for health and
operator visibility, but do not use it as the proposal stale gate. Each
proposal stores a scoped evidence watermark: the exact path set and manifest
neighborhood it previewed plus the maximum per-file revision/digest evidence
for that set. Apply re-resolves the same scope and rejects only if evidence in
that scope changed. An unrelated plant edit must not stale the proposal. For a
large batch, the proposal may store a canonical scope fingerprint instead of
duplicating hundreds of paths, but the canonical scope definition/query and
its cardinality must also be persisted so apply can re-resolve the same member
set and recompute the fingerprint. A fingerprint alone without reproducible
scope membership is insufficient evidence.

Persist detector checkpoints per root/shard and quarantine state per failed
path. A run may transactionally advance clean shards while retaining the prior
checkpoint for failed shards/paths. Quarantined paths record error, retry
count, first/last failure, and next retry; they are retried with bounded
backoff and by the daily full-hash audit. Coverage remains incomplete until
they recover, without forcing every restart to re-hash all clean files.

The append-oriented journal has a concrete initial policy: retain all pending,
blocked, and unapplied/supersession evidence; retain terminal events for 90
days; and compact terminal/coalesced rows when the database exceeds 512 MiB or
on the daily maintenance pass, whichever comes first. Compaction must preserve
the latest event and audit chain per entity/path, proposal/apply references,
and aggregate run metrics. MCD-2 must make these values configurable and prove
backup/rebuild behavior before enabling deletion.

## Detection contract

- Watch only supported `content/plants/**/{content.json,<locale>.md}` and
  `content/pests-diseases/**/{content.json,<locale>.md}` paths.
- Normalize and validate paths before persistence; reject traversal and paths
  outside configured roots.
- Treat repository paths as case-sensitive in the contract, but build a
  case-folded collision key during discovery. If two supported paths collide
  under Unicode-normalized case folding, mark both invalid, emit a blocking
  finding, and do not watch/apply either path. MCD-1 fixtures must cover this on
  case-insensitive filesystems such as default macOS APFS.
- Debounce per path and process mass checkout/pull events in bounded batches.
- A manifest change revalidates that manifest and its declared locale files;
  a locale change hashes that file and validates its owning manifest.
- Current repository content is mixed: some entity directories have
  `content.json`, while legacy directories contain locale Markdown without a
  manifest. During the explicitly marked initial baseline only, discovery must
  index pre-existing manifestless Markdown as `invalid` with
  `owner_status = legacy_missing_manifest`, record counts and representative
  paths, and expose one aggregate blocking health/inbox item per entity kind;
  it must not emit or replay one change event per legacy file. After the
  baseline checkpoint is committed, any newly created manifestless file, or a
  tracked file whose manifest is removed, uses
  `owner_status = missing_manifest` and emits an entity-grouped blocking review
  item normally. Neither state may infer identity or allow apply until a valid
  owning manifest exists, and baseline suppression must never hide a digest or
  path change observed after the baseline.
- Persist rename as delete + create evidence, but correlate pairs within the
  debounce window using exact digest first and stable file identity/inode only
  as a local hint. Present a correlated pair as one entity-grouped inbox item;
  never assume identity preservation solely from inode or timing.
- Deletion creates a review event and never deletes SQLite/Convex content.
- Required locales must come from configuration/manifest policy; do not
  hard-code `en` and `vi` if the target is five languages.
- Watcher queue overflow, lost permissions, unreadable paths, invalid
  checkpoints, or incomplete reconciliation degrade health and remain visible.
- Startup readiness may distinguish `starting/catching_up` from `ready`; it
  must not claim complete monitoring before catch-up evidence is persisted.

## Review and apply contract

Add authenticated API endpoints and a dashboard Content Inbox for:

- paginated/filterable pending, blocked, applied, and dismissed events;
- source/manifest identity, locale, old/new hash, validation findings, and
  readable content diff/preview;
- explicit approve/apply and dismiss actions with actor and reason;
- batch approval only for independently valid items with an exact previewed
  evidence revision; partial failure must be reported per item;
- monitor status, lease owner/passive state, last complete catch-up,
  reconciliation and full-hash audit, global health revision, scoped proposal
  evidence, quarantined paths, and coverage health.

Approval requires the existing authorized admin/content role contract to be
made explicit in middleware and tests. Immediately before apply, the API must:

1. re-read and re-hash every selected file;
2. verify manifest fingerprint and identity;
3. verify the stored scoped path/manifest watermark and relevant SQLite
   boundary; an unrelated global source revision change is informational only;
4. run a fresh `dryRunContentImport()`;
5. reject the proposal if any source or database evidence changed;
6. call the existing transactional `applyContentImport()` path only after all
   gates pass.

Successful apply updates SQLite and enqueues outbox work. Convex publication
remains a separate explicit action guarded by existing Data Health and outbox
rules. A blocked item must block only affected entities/outbox items; unrelated
content remains reviewable and publishable.

## Work packages and hard dependencies

### MCD-1 — Contract, topology, and fixtures

Pin configured content roots, path/case-collision rules, one-time legacy
baseline versus post-baseline missing-manifest behavior, reproducible scoped
proposal watermark/fingerprint, partial checkpoints/quarantine, active lease
semantics, full-hash I/O scheduling budget, locale policy, monitor runtime,
health semantics, event state machine, auth roles, polling SLA (pending durable
events visible within 30 seconds), and fixture generators.
Create small behavioral fixtures plus a generated 50,000-file performance
fixture that is excluded from normal source control.

**Exit gate:** contracts are represented by tests before runtime integration;
the chosen process demonstrably has read access to the content tree.

### MCD-2 — Additive SQLite source index and event journal

Implement migrations and repository interfaces for source files, events,
monitor runs, per-file revisions/scoped watermarks, root/shard checkpoints,
quarantine, monitor lease, and global health revision. Prove idempotent
insertion, rename correlation/grouping, supersession, pagination, the 90-day /
512-MiB retention/compaction policy, and database rebuild behavior.

**Hard dependency:** MCD-1.

**Exit gate:** deterministic repository tests pass; existing CID tables and
outbox behavior remain unchanged.

### MCD-3 — Incremental scanner and startup catch-up

Implement bounded tree reconciliation using metadata-first comparison and
exact hashing for suspected paths, plus a complete full-hash audit at least
every 24 hours. Persist complete/incomplete evidence and advance only clean
root/shard checkpoints transactionally; quarantine failures with their own
retry checkpoint instead of holding back unrelated clean coverage.

**Hard dependency:** MCD-2.

**Exit gate:** edits made while the service is stopped, Git pull/checkout
bursts, deletes, and renames are recovered on restart without missing paths.

### MCD-4 — Live watcher lifecycle

Implement the watcher adapter, per-path debounce, bounded queue/backpressure,
start/stop lifecycle in `server.ts`, heartbeat, and recovery scheduling. The
watcher emits candidates through the same indexing interface as MCD-3.
`package.json` currently has no watcher dependency; MCD-4 will add either
`chokidar` v4 or `@parcel/watcher` after a fixture-based comparison of supported
Node/platform versions, recursive-event correctness, rename/overflow signals,
resource use at 50,000 files, lifecycle shutdown, maintenance status, and
native-build/deployment cost. Record the choice and lock its version.

**Hard dependencies:** MCD-2 and MCD-3; catch-up must exist before live events
can be called reliable.

**Exit gate:** exactly one leased instance is active and a second instance is
passive/takes over only after lease expiry; one file change processes only its
file/manifest neighborhood; shutdown releases handles; overflow or watcher
failure degrades health.

### MCD-5 — Change review API and stale-approval gates

Expose paginated event/status/preview endpoints and authenticated approve,
apply, dismiss, and batch actions. Reuse the current manifest dry-run/apply
library rather than creating another importer.

**Hard dependencies:** MCD-2 through MCD-4.

**Exit gate:** no detector path can write content; stale file, manifest, scoped
source evidence, or SQLite evidence rejects apply while unrelated source edits
do not; authorized apply creates the expected SQLite change and outbox item but
does not call Convex.

### MCD-6 — Dashboard Content Inbox and Data Health integration

Add a Content Inbox with filters, badges, preview/diff, findings, and explicit
review actions. Use bounded polling initially unless repository evidence
justifies SSE; both must query persisted API state rather than files.

**Hard dependency:** MCD-5.

**Exit gate:** a durable pending change becomes visible within 30 seconds under
normal polling; monitor/catch-up/full-audit failures, quarantined paths, and
passive/lease state are visibly degraded or explicitly passive.

### MCD-7 — Scale, resilience, and operational verification

Measure initial indexing and steady-state behavior with 50,000 files; verify
restart recovery, mass checkout batching, database growth, retention, backup,
and incomplete-evidence alarms. Document local worker and any required CI
operation without enabling production mutation.

**Hard dependencies:** MCD-1 through MCD-6.

**Exit gate:** all acceptance criteria below pass with recorded metrics and no
silent coverage gaps.

## Acceptance and verification requirements

### Functional

- Create, modify, delete, rename, manifest change, Git pull, branch switch, and
  changes made while the service is stopped all produce durable correct events.
- Duplicate/burst delivery is idempotent and preserves the final path state.
- Correlated rename evidence is presented as one entity-grouped review item.
- Missing manifests and case-folded path collisions are durable blocking
  findings, never silently skipped or treated as valid identities.
- Initial legacy manifestless content produces bounded aggregate evidence,
  while post-baseline manifestless creation/removal produces normal blocking
  review items and is never suppressed as legacy.
- CI ingestion rejects oversized, over-rate, expired, or replayed batches and
  preserves idempotency for accepted retries.
- Every event exposes path, entity, locale, old/new hash, validation result,
  detector source, evidence revision, and review state.
- Watcher/scanner detection never writes content to SQLite or Convex.
- Approve/apply requires authorized role plus reason and records actor/audit
  evidence.
- Re-hash immediately before apply rejects stale approval.
- Valid apply uses existing dry-run + transactional importer, updates SQLite,
  and enqueues outbox work; Convex is not called automatically.
- Affected blocked content is gated without blocking unrelated entities.

### Scale and performance

- A dashboard request performs zero repository scan/hash work.
- A steady-state single-file edit hashes only the changed file and the minimum
  manifest neighborhood needed for validation.
- The 50,000-file fixture completes initial index and periodic metadata
  reconciliation within recorded, agreed budgets; memory and SQLite growth are
  bounded and reported before implementation is considered complete.
- Large Git bursts are batched and backpressured without unbounded memory or
  one UI notification per transient write.

### Reliability and observability

- Stop-edit-restart catch-up is complete before health becomes current.
- Multi-instance tests prove single active ownership, passive reporting, lease
  expiry takeover, and no checkpoint advancement after ownership loss.
- Watcher failure, queue overflow, permission loss, invalid checkpoint, and
  partial reconciliation all surface as `degraded` or `incomplete`.
- Clean root/shard checkpoints may advance on partial runs; failed paths/shards
  retain independent checkpoints and quarantine evidence until recovered.
- API shutdown closes watcher/timers before SQLite closes.
- Scoped source evidence invalidates only proposals that overlap changed
  paths/manifests, independently of catalog/outbox revision; global source
  revision is health-only.
- A complete full-hash audit runs at least every 24 hours and surfaces its age.
- Full-hash work is resumable and throttled across the day; verification
  records request-latency impact and proves restart resumes from its cursor.
- Structured logs and persisted run metrics identify inspected, hashed,
  changed, failed, and queued counts without logging content bodies or secrets.

### Regression gates

- Focused API index/monitor/review tests.
- Lifecycle tests for start, catch-up, ready, failure, recovery, and stop.
- Dashboard Content Inbox component/hook tests.
- Existing content-manifest, canonical identity, reconciliation, outbox, API,
  dashboard, Convex, and shared-package suites remain green.
- Typechecks/builds and `git diff --check` pass.
- No live Convex call, production deploy, or production data mutation is used
  for verification without separate explicit authorization.

## Rollout and rollback

1. Ship additive SQLite schema and read-only initial indexing first. Mark this
   run explicitly as the one-time baseline: summarize pre-existing
   manifestless content per entity kind, persist individual invalid index rows
   without individual inbox events, and atomically seal the baseline checkpoint
   so later files cannot be misclassified as legacy.
2. Enable monitor in observe-only mode; compare watcher events with periodic
   reconciliation and measure false negatives/duplicates.
3. Enable dashboard inbox after evidence completeness is demonstrated.
4. Enable approve/apply only after auth and stale-evidence tests pass.
5. Keep Convex publication manual and gated throughout this plan.

The monitor can be disabled by configuration without deleting its journal.
If it is re-enabled after any downtime, it must resume from the retained
checkpoint/journal and complete normal startup catch-up across the disabled
interval before reporting current health; re-enable must never create or rerun
the one-time legacy baseline.
SQLite schema changes are additive; before migration, create and verify a DB
backup using the existing repository procedure. Rollback disables the monitor
and UI actions while preserving events for diagnosis. Never roll back by
deleting content files, findings, outbox rows, or published Convex data.

## Next-conversation handoff

- Continue on the current worktree; do not create another worktree.
- Use the Heavy route and initialize/reuse exactly one session explorer.
- Start with MCD-1, then MCD-2. Do not begin live watcher integration before
  startup catch-up and durable indexing exist.
- MCD-4 adds and pins a watcher dependency; choose between `chokidar` v4 and
  `@parcel/watcher` using the recorded cross-platform, lifecycle, overflow,
  scale, maintenance, and deployment criteria above.
- Define measurable 50,000-file budgets from a local baseline instead of
  inventing unsupported timing numbers in advance.
- Production Convex deployment and mutation remain outside authorization.
