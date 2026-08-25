# Canonical Plant Identity, Content Integrity, and Convex Reconciliation Plan

Date: 2026-08-24

Status: **CID-1–CID-9 LOCAL IMPLEMENTATION COMPLETE AND VERIFIED — PRODUCTION CONVEX ROLLOUT NOT AUTHORIZED OR RUN**

## Objective

Prevent duplicate canonical plants, bind Git-authored plant and pest/disease
content to unambiguous database identities, and turn the SQLite authoring
database into a data-quality control plane that validates both outbound writes
and Convex readback.

The completed system must make it impossible for a normal dashboard, import,
seed, migration, or synchronization path to silently create a second record
for the same canonical plant. It must also detect identity, content, provenance,
relationship, and version drift already present in either SQLite or Convex.

## Verified problem statement

- Dashboard authoring is SQLite-first: dashboard → API → SQLite → sync outbox →
  Convex. SQLite is therefore the primary write boundary.
- `sourceConflict` currently rejects only an existing `plant_code` or
  `(source_system, source_id)`. It does not compare canonical taxonomy and
  cultivar identity.
- `withSourceIdentity` creates a UUID when a new source identity is absent.
  A taxonomically identical plant can therefore arrive with a new UUID and a
  different code and pass the current conflict check.
- The dev SQLite database contains two base tomato rows: IDs 6 and 1554 both
  represent `Solanum lycopersicum`, cultivar absent. Row 1554 was deliberately
  created through the dashboard during Stage C geography QA; it predates the
  content-standardization manifest and is not evidence of a production sync
  regression. It does prove that the dashboard/API boundary permits the state.
- `content/plants/<slug>/{vi,en}.md` identifies a taxon by directory convention
  only. It does not identify the target `plant_code`, base/cultivar scope,
  parent, version, review state, checksum, or provenance.
- The current care-content export manifest covers only four Basella locale
  rows and already contains drift for one base Basella pair.
- Pest/disease Markdown uses valid stable keys, but Convex has no localized
  `detailContent` persistence contract for those files and mobile does not yet
  route `richfarm://pests-diseases/{key}` through the in-app detail screen.
- Convex indexes accelerate lookup but are not SQL unique constraints.
  Canonical uniqueness must be enforced in mutations; Convex transactional
  retry semantics make indexed check-then-insert safe when every writer uses
  the same mutation boundary.

## Adopted architecture decisions

1. **Canonical identity is separate from `plant_code`.** Existing plant codes
   remain unchanged during this package. A new deterministic `canonical_key`
   is used for matching and uniqueness.
2. **SQLite/API is the primary enforcement boundary.** Convex repeats the
   invariant as defense in depth for direct seeds, migrations, and future write
   paths.
3. **Source identities are aliases, not plant identities.** Multiple external
   `(source_system, source_id)` values may point to one canonical plant.
4. **Base and cultivar scope is explicit.** Content authored for a base plant
   may be inherited by cultivars; cultivar-specific content targets exactly one
   cultivar record. No importer infers this from a Markdown filename alone.
5. **Reconciliation is report-first.** Detection may classify, block, and
   propose repairs. It must never automatically merge or delete canonical
   plants, rewrite reviewed content, or choose a winner in an ambiguous group.
6. **Every publish is verified by readback.** An applied outbox operation is
   healthy only when the Convex projection returns the expected canonical
   identity, version, relationships, and content hashes.

## Canonical identity contract

### Required normalized fields

- accepted genus;
- accepted species;
- optional infraspecific rank (`subsp`, `var`, `f`) and name;
- optional cultivar;
- explicit base/cultivar scope.

The key is the exact JSON serialization of a normalized six-element tuple
`[version, genus, species, rank, infraspecificName, cultivar]`. JSON escaping
removes separator ambiguity; absent optional components serialize as empty
strings, never omitted or `null`:

```text
["v1","basella","alba","","",""]
["v1","basella","alba","","","ceylon"]
["v1","brassica","rapa","subsp","chinensis",""]
```

Normalization must be implemented once in a shared pure TypeScript module and
used by API validation, SQLite migration/audit, Convex mutations, content
tooling, and tests. Display names, localized common names, source IDs, Convex
document IDs, and random suffixes never participate in the key.

### Versioned Unicode normalization policy

The first algorithm is named `canonical_identity_v1`; stored rows record the
algorithm version so a future taxonomy rule change cannot silently reinterpret
existing keys. `v1` performs these ordered operations:

1. require structured genus and species fields; do not parse a common name;
2. apply Unicode NFKC to every identity token;
3. trim leading/trailing Unicode White_Space and collapse every internal
   `\p{White_Space}+` run to one ASCII space before serialization;
4. apply locale-independent Unicode lowercase (`toLowerCase`, never a
   Vietnamese, Turkish, or device locale);
5. normalize the hybrid multiplication sign `×` to ASCII `x`;
6. normalize rank aliases (`ssp`/`ssp.` → `subsp`, `var.` → `var`, `f.` →
   `f`), while preserving the explicit rank boundary;
7. keep punctuation inside a normalized component and let `JSON.stringify`
   perform the only escaping; never concatenate components with an unescaped
   delimiter;
8. preserve diacritics in cultivar and infraspecific names because removing
   them can collapse distinct identities; serialize absent cultivar as `""`.

New canonical plant creation requires genus, species, explicit base/cultivar
scope, explicit null-or-value cultivar, and explicit null-or-value
infraspecific rank/name. Missing required identity returns
`CANONICAL_IDENTITY_INCOMPLETE`; legacy incomplete rows are quarantined by the
audit and never receive a key derived from a localized common name.

Validation invariants are exact: genus/species are non-empty; infraspecific
rank and name are either both absent or both present; base scope requires absent
cultivar and parent; cultivar scope requires a non-empty cultivar and valid base
parent; accepted infraspecific scope is represented by rank/name and remains a
base taxon unless an explicit cultivar is also present. API and Convex input
validators gain these structured fields additively; `scientific_name` remains a
derived/display compatibility field, not the canonical create input.

### Required data-model changes

SQLite `master_plants`:

- additive `canonical_key TEXT`;
- promote `cultivar` and normalized cultivar from `metadata_json` to explicit
  fields, preserving metadata compatibility during migration;
- optional `parent_master_plant_id` for cultivar → base linkage;
- after collision remediation, a unique index on `canonical_key`;
- final schema requires non-null `canonical_key`; the unique index must not be
  treated as sufficient while nullable rows remain because SQLite permits
  multiple `NULL` values in a unique index;
- foreign key and guard preventing a cultivar from pointing to a base plant of
  another species identity.

SQLite `plant_external_identities`:

- `master_plant_id`;
- `source_system`;
- `source_id`;
- unique `(source_system, source_id)`;
- indexed `master_plant_id`.

Convex `plantsMaster`:

- `canonicalKey` and explicit cultivar identity fields;
- index `by_canonical_key`;
- parent reference where applicable.

Convex external identities use a separate table indexed by source identity and
plant ID. Existing source fields remain readable during the additive rollout.

## Content-to-database contract

Git Markdown is the authoring source of truth for long-form plant and
pest/disease content. SQLite is the staging, review, provenance, audit, and
publication-control plane; Convex is the mobile runtime projection. The
dashboard may preview, review, and approve content, but it must not become a
second independent writer for the same long-form field unless its edits are
exported back to Git with version/hash conflict protection.

Humans and AI edit locale Markdown, not canonical identity strings. Manifests,
canonical keys, checksums, and byte lengths are generated and verified by
repository tooling from structured taxonomy plus an explicitly selected
existing plant target. A content initializer must fail on ambiguous or missing
targets and must never derive identity from a localized display name or accept
a hand-entered canonical key as authoritative.

Each plant content directory gains one machine-readable manifest shared by all
locale Markdown files:

```text
content/plants/basella-alba/
  content.json
  vi.md
  en.md
```

Minimum plant manifest:

```json
{
  "schema_version": 1,
  "plant_code": "BASELLA_ALBA_09A582HJFJ",
  "canonical_identity_version": "canonical_identity_v1",
  "canonical_key": "[\"v1\",\"basella\",\"alba\",\"\",\"\",\"\"]",
  "scope": "base",
  "parent_plant_code": null,
  "scientific_name": "Basella alba",
  "cultivar": null,
  "locales": {
    "vi": {
      "content_version": 4,
      "content_status": "needs_review",
      "review_status": "unreviewed",
      "source_refs": []
    }
  }
}
```

Pest/disease directories use an equivalent `content.json` keyed by stable
`pestsDiseases.key`, type, locale status/version, checksum, and source refs.

Importer requirements:

- dry-run is the default and produces no database changes;
- resolve by immutable `plant_code`, then verify `canonical_key`, scientific
  identity, cultivar, parent, and scope;
- never resolve by directory slug alone;
- block missing, ambiguous, stale, or contradictory identity;
- preserve non-content fields;
- require an explicit apply flag and authenticated admin authority;
- keep AI-authored or unverified drafts at `needs_review`/`unreviewed`;
- compare file and database hashes and reject stale overwrite unless an
  explicit reviewed conflict resolution is recorded;
- write SQLite and enqueue publication in one transaction.

Tooling requirements:

- provide an initializer/refresh command that selects a concrete database
  plant and generates `content.json`; authors do not type identity fields;
- reject manually altered identity fields unless they exactly recompute from
  the structured target identity and selected `plant_code`;
- regenerate hashes and byte lengths from exact Markdown bytes;
- keep generated output deterministic and byte-stable;
- treat a dashboard edit to Git-authoritative long-form content as a conflict
  until it is explicitly exported/reconciled, never as silent last-write-wins.

### Content hash contract

All content comparisons use SHA-256 over the exact UTF-8 bytes of the canonical
Markdown string. No newline, Unicode, whitespace, or Markdown normalization is
performed before hashing. The manifest records byte length plus lowercase hex
SHA-256. SQLite stores or computes the same values from `care_content`; Convex
must either persist the supplied byte length/hash beside the content or compute
and return them through the trusted admin readback. A publish cannot pass the
hash gate using version/status alone.

Exact hashes prove transport and storage fidelity; they do not by themselves
decide severity. The detector applies this matrix:

- exact hash mismatch immediately after publish/readback: `blocked`;
- exact hash mismatch at the same content version: `blocked` because the write
  bypassed the expected version contract or bytes changed in transit;
- hash mismatch with a newer version on one side: `warning/conflict` pending
  authority and outbox-history analysis;
- formatting-only drift such as a trailing newline before publication:
  `warning`, not a publication-wide block.

An optional normalized diagnostic hash may normalize line endings and terminal
newlines to explain formatting-only drift. It never replaces the exact hash and
is never used to authorize overwrite.

Severity precedence is `blocked identity/version/readback defect` >
`authority conflict` > `formatting warning`. A normalized-hash match cannot
downgrade a same-version or immediate post-publish exact-hash mismatch.

Exporter requirements:

- generate or refresh all manifests from SQLite without silently overwriting
  dirty Markdown;
- emit checksums, versions, review state, identity, and provenance;
- report missing locale files, orphan files, and database-only content;
- make repeated exports byte-stable when source data has not changed.

## SQLite smart detection and reconciliation

Extend the existing reconciliation-run concept with structured findings.

The detector is a new read-only audit endpoint/function. It must not reuse the
current `POST /api/master-plants/sync-convex-to-sqlite` behavior, because that
endpoint mutates/upserts the mirror and may delete stale mirror rows before an
operator sees the evidence. A separate explicitly named apply action consumes
an approved audit/repair proposal.

`sync_reconciliation_runs` records snapshot identity, timestamps, status,
counts, and the compared SQLite/Convex versions.

Every audit records a freshness boundary: audit/run ID, SQLite data revision,
outbox watermark, Convex snapshot watermark, expected/received document counts,
page count, terminal cursor state, and whether source data changed during the
read. Findings and repair proposals are stale when any boundary changes; stale
evidence cannot block, approve, or apply a repair until revalidated.

SQLite maintains a catalog-revision singleton incremented in the same
transaction as every plant/content/relationship write; the audit captures that
revision plus the highest outbox sequence. Convex maintains a catalog metadata
document containing atomic revision and expected counts, incremented in the
same transaction by every production mutation touching any table included in
the admin snapshot: plant master, i18n, care, geography/adaptation,
propagation, external identity, and other projected relationships. Static
routing tests enumerate those tables and fail when a writer bypasses revision
increment. Each snapshot page returns the same unified revision token; the
final page rereads metadata and the audit restarts if start/page/end revisions
or expected counts disagree. A plant-only revision is insufficient and cannot
authorize a complete snapshot.

The Convex snapshot reader must paginate with bounded page size until the
terminal cursor is reached, detect repeated cursors/pages, compare expected and
received counts, and retry or mark the run `incomplete` when data changes during
collection. An incomplete snapshot can never produce a `healthy` result or an
applicable repair proposal.

New `sync_findings` records:

- severity (`info`, `warning`, `blocked`);
- stable finding code;
- canonical key;
- SQLite and Convex identities;
- evidence JSON;
- resolution status and operator audit fields.

Optional `sync_repair_proposals` records a proposed merge, identity-link,
republish, quarantine, or archive action. Applying a proposal is a separate
admin mutation with a preview and audit trail.

### Required detectors

Identity:

- duplicate canonical keys in SQLite or Convex;
- plant-code collision or code/taxonomy mismatch;
- one external identity attached to multiple canonical plants;
- missing/invalid base parent;
- base/cultivar species mismatch;
- canonical key inconsistent with normalized fields.

Synchronization:

- SQLite-only draft versus unpublished error;
- unexpected Convex-only plant;
- version regression;
- Convex change without corresponding outbox/audit evidence;
- applied outbox item whose readback identity/version/hash differs;
- failed, stuck, or repeatedly retried outbox work.

Content and provenance:

- manifest/file/SQLite/Convex checksum drift;
- missing required locale;
- `published` with `unreviewed` content;
- `reviewed` content without source refs;
- inherited content materialized as an unexplained duplicate;
- stale content version or locale-state mismatch.

Relationships:

- orphan plant i18n, care, geography, adaptation, or propagation rows;
- pest/disease `plantKeys` with no canonical plant;
- plant Markdown links to missing pest/disease keys;
- pest/disease content missing a required locale or runtime detail record.

### Health semantics

- `healthy`: identity, outbox, readback, hashes, and relationships agree;
- `healthy_with_exclusions`: target scope is healthy but signed, fresh,
  explicitly out-of-scope findings remain visible;
- `warning`: expected unpublished draft, missing optional locale, or incomplete
  provenance that does not expose unreviewed content;
- `incomplete`: snapshot pagination, counts, or revision consistency was not
  proven; the run cannot authorize publication or repair;
- `blocked`: canonical collision, source collision, taxonomy mismatch, orphan,
  unsafe overwrite, publish/readback mismatch, or published-unreviewed content.

Blocked findings prevent affected-plant publication. Unrelated healthy plants
remain publishable; a single finding must not freeze the entire catalog unless
the invariant or snapshot itself is globally unreliable.

### Publication enforcement point

The authoritative gate runs inside outbox processing immediately before the
Convex call, not only at enqueue time or in the dashboard. For each claimed
outbox item it recomputes current canonical identity, loads fresh unresolved
findings for that plant, verifies the audit boundaries, and either publishes or
returns a structured `blocked_data_quality` result without consuming the item.
Existing queued work is therefore protected when a finding appears later.

`sync_outbox` is migrated additively from its current status set to include
`blocked`, with `blocked_finding_id`, `blocked_at`, and operator-resolution
metadata. A data-quality block moves the item to `blocked`; normal retry claims
only pending/retryable failures and never loops blocked rows. Resolving the
finding or approving a fresh admin override explicitly requeues the item. An
override records admin, reason, audit revision, and expiry and is revalidated at
send time; it never converts the underlying finding to healthy.

API create/import guards prevent new identity conflicts earlier; enqueue may
retain blocked work for operator visibility; exporters remain available but
must include health/finding state. Repair apply and exceptional publication
override are separate admin-only operations with reason and audit trail.

### Authorization and retention

- editor: view findings and export reports; editors cannot approve, dismiss,
  override, or apply repair;
- admin: approve/apply repair, dismiss with a reason, and use any explicitly
  supported publication override;
- service token: run audit/readback and persist evidence, but never self-approve
  a repair.

No new `viewer` role is introduced in this package; the contract stays aligned
with the current `admin`/`editor` authorization model.

Run summaries and aggregate health metrics are retained durably. Open/blocked
findings remain until resolved. Repeated identical findings are coalesced with
first/last-seen timestamps and occurrence count. Resolved evidence payloads use
a configurable retention period (initial policy: 180 days) while preserving a
durable compact resolution/audit record.

The API maintenance module owns retention. A bounded cleanup runs after a
successful audit or through an authenticated maintenance command, records its
counts in the run summary, and can delete only expired resolved evidence
payloads, never open findings or compact audit records.

## Convex write boundary

Create one internal canonical upsert used by backend sync, seed, migration, and
admin creation. It must:

1. validate and normalize identity;
2. query `by_canonical_key` and inspect up to two matches;
3. throw a structured error if legacy duplicates exist;
4. update/link an exact existing plant idempotently;
5. insert only when no canonical plant exists;
6. maintain external identities separately;
7. return created/existing status and canonical identity;
8. define argument and return validators.

No other production function may directly insert `plantsMaster`. Static checks
or focused source tests must enforce this boundary. The initial routing audit
must explicitly include direct inserts currently present in
`plantI18n.ts`, `seed.ts`, `masterSync.ts`, and `plantAdmin.ts`; distinguish
production code from test fixtures so the guard does not create false safety
by scanning only one module.

Convex migration is additive and reversible. Before backfill, export an
authorized snapshot and record every touched document with migration run ID,
document ID, prior canonical fields, and proposed fields. Dry-run precedes
apply; rollback restores or clears only fields written by that run and verifies
a fresh readback. No merge or document deletion occurs in the canonical-key
backfill because a deleted Convex document ID cannot be recreated safely.

Before apply or rollback, deploy writer routing so every production plant write
uses the compatibility mutation and participates in the catalog revision. Apply
and rollback run under an explicit migration mode that rejects unrouted writes;
they abort if the revision changes outside the migration batch sequence. Schema
and indexes remain additive and unused after a field rollback; removing them is
a later deploy performed only after restored data passes audit, avoiding a
function/data/schema rollback race.

## Dashboard behavior

Before create, the API returns a canonical match preview. If an exact plant
exists, the dashboard shows the existing base/cultivar and opens it instead of
submitting a second create.

Near matches remain suggestions only. The system must not merge plants based
on localized common-name similarity or fuzzy text.

The dashboard gains a Data Health view with:

- last reconciliation and snapshot age;
- healthy/warning/blocked counts;
- filterable findings with exact evidence;
- affected SQLite/Convex/content identities;
- previewable repair proposals;
- separate approve/apply controls for authorized admins;
- readback result after every applied repair or publish.

## Work packages and ordered execution

The nine packages were executed as a gated roadmap. CID-1/2 evidence was
reviewed before the operator selected tomato row 1554 as canonical; later
packages then proceeded through independent implementation and verification
gates. Production Convex deployment and data mutation remain a separate
authorization boundary.

### CID-1 — Shared identity contract

Owner: shared/API implementation.

- Define normalization, canonical key, base/cultivar, and parent contracts.
- Add exhaustive fixtures for botanical ranks, hybrids, Unicode, cultivar
  punctuation/case, empty cultivar, and invalid identities.
- Document which taxonomy corrections preserve a key and which require an
  explicit alias/migration decision.

Gate: deterministic cross-runtime tests pass with identical API/Convex output.

### CID-2 — Read-only duplicate and drift audit

Owner: API tooling.

- Audit the full SQLite database and Convex admin snapshot without mutation.
- Classify exact duplicates, legitimate cultivars/infraspecific taxa, source
  aliases, and unresolved ambiguity.
- Produce a machine-readable report and operator summary.
- Include known dev fixture rows 6/1554 without assuming the remediation.

Gate: repeated audit is deterministic; every collision has evidence and no
repair has been applied.

### CID-3 — Additive SQLite identity model

Owner: API/SQLite.

- Add nullable fields and external-identity table.
- Freeze or route every SQLite plant writer to a compatibility boundary before
  backfill begins so new nullable/unclassified rows cannot appear mid-rollout.
- Backfill source identities and canonical fields in dry-run and apply modes
  with counts, resumable batches, and explicit ambiguous-row quarantine.
- Stop on ambiguity; never invent cultivar or parent values.
- After all collisions and null keys are explicitly resolved, rebuild the table
  if required to enforce non-null canonical keys and self-referencing parent
  constraints, then add the unique canonical-key index.
- Define backup, rollback, and post-rollback validation before any table
  rebuild or collision repair.

Gate: zero unresolved canonical collisions and migration readback matches the
pre-migration backup except for approved identity changes; zero null canonical
keys remain and every normal writer is proven to populate the field.

Hard dependency: CID-4 cannot enter apply mode until CID-3 has routed all
writers, backfilled every resolvable legacy row, quarantined ambiguity, and
proven zero null canonical keys. During the transition, the compatibility
writer computes the new key and also checks legacy structured identity on the
fly so partial backfill cannot admit another duplicate.

### CID-4 — API and dashboard create guard

Owner: API then dashboard.

- Replace source-only create checks with canonical conflict detection.
- Keep source identity linking idempotent.
- Return structured `409 CANONICAL_PLANT_EXISTS` evidence.
- Add exact-match preview and open-existing UX.
- Apply the same guard to single create, bulk import, i18n-triggered upsert,
  mirror hydration, and reconciliation paths.
- Require complete structured genus/species, infraspecific, scope, and cultivar
  input; reject incomplete canonical identity instead of deriving it from a
  common name.

Gate: repeated and concurrent create attempts produce one canonical row.

### CID-5 — Convex defense in depth

Owner: Convex.

- Add canonical fields/indexes and external identities additively.
- Backfill with a bounded, resumable migration.
- Capture a pre-migration snapshot and per-document before/after journal;
  provide run-scoped rollback and readback verification.
- Route/quiesce all writers before apply or rollback and keep schema/index
  removal as a separately verified cleanup deploy.
- Route all creates through one internal mutation.
- Reject pre-existing duplicates and source/taxonomy conflicts explicitly.

Gate: concurrent mutations and repeated SQLite outbox delivery converge on one
Convex document and one source link set.

### CID-6 — Content manifests and safe importer/exporter

Owner: content tooling + API.

- Introduce versioned per-directory manifests for plants and pest/disease.
- Generate draft manifests and surface every ambiguous directory.
- Implement dry-run import, explicit apply, version/hash conflict detection,
  provenance/status rules, and byte-stable export.
- Do not publish content as part of the initial manifest generation.

Gate: full content workspace maps one-to-one to intended SQLite identities or
is explicitly blocked with actionable evidence.

### CID-7 — Smart Convex reconciliation

Owner: API/SQLite.

- Add a read-only audit path separate from the existing mutating
  `sync-convex-to-sqlite` endpoint and fetch a complete authorized snapshot.
- Paginate to a verified terminal cursor with count, repeated-page, watermark,
  and source-change checks; incomplete runs fail closed.
- Replace the current unbounded Convex `listAll().collect()` audit dependency
  with a cursor-based admin snapshot query returning catalog revision and
  expected active count on every page.
- Analyze before applying mirror changes.
- Persist findings and repair proposals.
- Require an explicit audit/run ID and admin approval before a separate apply
  action mutates mirror or source data.
- Revalidate audit freshness immediately before blocking publication or
  applying a proposal.
- Block only affected unsafe publications.
- Verify every publish by canonical readback and hashes.

Gate: seeded mismatch fixtures produce the expected severity/finding codes;
healthy repeated syncs are idempotent and finding-free.

### CID-8 — Pest/disease runtime linkage

Owner: Convex + mobile boundary.

- Add localized/versioned/provenanced detail content storage.
- Import only reviewed pest/disease drafts through the same manifest contract.
- Validate all plant content links against stable keys.
- Route internal Markdown links to the in-app detail screen; unsupported or
  missing keys render safely without opening an external URL.

Gate: vi/en links open the intended record offline/online and missing-key tests
fail safely.

### CID-9 — Rollout and operational closure

Owner: main integration.

- Rehearse on a backup of the dev SQLite database and a dev Convex deployment.
- Review every proposed merge/repair before apply.
- Explicitly resolve or retain-as-blocked every known starting defect: tomato
  IDs 6/1554, Basella manifest hash drift, missing content provenance, missing
  plant locales, and pest/disease runtime-detail gaps. None may disappear from
  reports merely because a migration ignored it.
- Run focused, package, and end-to-end gates after the last data change.
- Require a clean read-only audit after migration.
- Production data repair/deploy remains a separate authorization.

Gate: the migrated target scope reports `healthy`; any deliberately retained
out-of-scope defect is represented by a signed, expiring exclusion and the
global status is honestly `healthy_with_exclusions`, never plain `healthy`.
Duplicate-create reproduction is blocked, content round-trip is byte-stable,
and no unrelated data changed.

## Verification matrix

- Shared: normalization and canonical-key fixture suite.
- SQLite: migration dry-run/apply/readback, unique index, parent and source
  identity constraints, rollback from backup.
- API: create/import/i18n/mirror conflict paths, structured errors,
  idempotency, concurrent requests, outbox blocked/requeue/override behavior,
  stale-audit rejection, and readback behavior.
- Convex: schema/typecheck, canonical mutation concurrency, duplicate legacy
  failure, source linking, migration pagination, canonical projection.
- Dashboard: exact-match preview, open-existing flow, finding filters, repair
  preview permissions, blocked publish state.
- Content: manifest schema, missing/ambiguous target, checksum/version drift,
  locale parity, provenance/review gates, byte-stable export.
- Pest/disease/mobile: key existence, localized detail lookup, internal-link
  navigation, missing-key fallback.
- Repository: affected builds/typechecks/tests and `git diff --check`.

## Acceptance criteria

1. Every active base/cultivar has exactly one canonical key in SQLite and
   Convex.
2. Repeating any supported create/import/sync operation cannot increase the
   canonical plant count after its first successful application.
3. Concurrent identical creates converge on one plant.
4. Every external identity maps to at most one canonical plant.
5. Every plant content directory declares exactly one base or cultivar scope,
   target, version, status, hashes, and provenance. Base-scoped content may
   declare inherited descendants without materializing duplicate locale files
   or claiming one-to-one ownership of each descendant.
6. Every pest/disease content directory resolves to one stable runtime key and
   locale record.
7. SQLite detects Convex duplicate, drift, orphan, version, provenance, and
   readback defects before unsafe data is mirrored or published.
8. Repair is previewable, authorized, audited, and never automatic for an
   ambiguous canonical collision.
9. Mobile opens supported internal pest/disease links in-app and fails safely
   for missing targets.
10. Dev rollout ends with a fresh healthy audit and no unapproved production
    mutation.
11. A blocked finding is enforced at outbox processing using fresh evidence;
    stale or incomplete audits cannot authorize publication or repair.
12. Snapshot pagination proves terminal completion and exact expected/received
    counts; partial snapshots fail closed.
13. Canonical key generation is byte-for-byte identical across shared, API,
    migration, content tooling, and Convex for all `canonical_identity_v1`
    fixtures.
14. Migration apply/rollback rejects unrouted concurrent writers, restores only
    run-owned fields, and leaves an auditable snapshot/journal.
15. Editor/admin/service-token permissions and 180-day resolved-evidence
    retention behave exactly as specified without deleting open findings.

## Non-goals

- Renaming all legacy `plant_code` values in this package.
- Automatically deciding botanical synonym acceptance.
- Fuzzy matching common names as canonical identity.
- Automatically merging/deleting duplicate plants.
- Publishing existing unreviewed content.
- Running a production catalog migration without separate authorization.

## Blockers and explicit approvals

- Duplicate repair requires an operator-approved canonical winner and a
  complete reference-transfer report.
- Adding a unique index is blocked until the read-only audit reports zero
  unresolved collisions.
- Production Convex schema/function deploy and production data migration are
  separate approvals.
- The local tomato collision is resolved by retaining row 1554 and reversibly
  archiving/redirecting row 6; any equivalent production repair still requires
  a fresh target-specific proposal and authorization.

## Local completion result (2026-08-25)

- CID-3 applied locally from a verified backup: row 1554 is the active tomato,
  row 6 is reversibly archived and redirected, references/aliases were retained,
  and the unique active canonical-key invariant passed readback. No hard delete
  occurred.
- CID-4/5 route normal API, dashboard, import, seed, migration, and Convex
  writers through canonical conflict checks; the Convex implementation is
  checked in but was not deployed or run against live data.
- CID-6 generated 56 deterministic manifests (38 plant, 18 pest/disease) and
  applied only the selected tomato Markdown to local SQLite. Two plant
  directories remain blocked for missing English content, and Basella Ceylon
  remains quarantined for an invalid parent/identity relationship.
- CID-7/9 add complete revisioned snapshot reconciliation, durable findings and
  proposals, fresh-evidence outbox gates, audited admin controls, and the Data
  Health dashboard. Existing pending outbox rows were not sent.
- CID-8 adds localized pest/disease persistence, bounded migration tooling,
  stable-link validation, and safe mobile in-app detail routing.
- Focused suites, affected builds/typechecks, independent verification, local
  migration readback, the final read-only audit, and `git diff --check` passed.
  Current local SQLite SHA-256 is
  `b57d6dba7a347e11d5e50d729bec2a616ca4fee2987db8340c59b84d6fa978e9`.

## Next action

With separate production authorization: deploy the additive Convex schema and
functions, initialize catalog revision metadata, capture a complete authorized
snapshot, run canonical and pest/disease migrations in dry-run mode, review the
generated proposals, rehearse readback/rollback, then publish only through a
fresh healthy reconciliation gate. Do not publish the two missing-English
plants or quarantined Basella Ceylon until their blockers are resolved.
