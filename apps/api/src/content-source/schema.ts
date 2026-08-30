import type { SqliteDatabase } from "../db";

/**
 * Additive MCD-2 content-source state. Never touches CID tables, findings, or
 * the outbox; every statement is CREATE IF NOT EXISTS so opening an older or
 * newer database remains idempotent.
 */
export function ensureContentSourceSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_source_revision (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      revision INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO content_source_revision (id, revision) VALUES (1, 0);

    CREATE TABLE IF NOT EXISTS content_source_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      casefold_key TEXT NOT NULL,
      root_key TEXT NOT NULL,
      entity_kind TEXT NOT NULL CHECK (entity_kind IN ('plant', 'pest_disease')),
      entity_key TEXT,
      locale TEXT,
      file_kind TEXT NOT NULL CHECK (file_kind IN ('manifest', 'markdown')),
      owning_manifest_path TEXT,
      observed_mtime_ms INTEGER,
      byte_size INTEGER,
      sha256 TEXT,
      content_version INTEGER,
      validation_summary_json TEXT NOT NULL DEFAULT '{}',
      owner_status TEXT CHECK (owner_status IN ('manifest_ok', 'missing_manifest', 'legacy_missing_manifest')),
      evidence_revision INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('clean', 'changed', 'new', 'deleted', 'invalid', 'unreadable')),
      error TEXT,
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_hashed_at TEXT,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_content_source_files_root_state
      ON content_source_files(root_key, state);
    CREATE INDEX IF NOT EXISTS idx_content_source_files_owner_status
      ON content_source_files(owner_status);
    CREATE INDEX IF NOT EXISTS idx_content_source_files_casefold
      ON content_source_files(casefold_key);

    CREATE TABLE IF NOT EXISTS content_change_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      idempotency_key TEXT NOT NULL UNIQUE,
      correlation_group_id TEXT,
      root_key TEXT NOT NULL,
      path TEXT NOT NULL,
      owning_manifest_path TEXT,
      entity_kind TEXT NOT NULL CHECK (entity_kind IN ('plant', 'pest_disease')),
      entity_key TEXT,
      locale TEXT,
      event_type TEXT NOT NULL CHECK (event_type IN ('created', 'modified', 'renamed', 'deleted', 'manifest_changed')),
      old_sha256 TEXT,
      new_sha256 TEXT,
      old_byte_size INTEGER,
      new_byte_size INTEGER,
      detector_source TEXT NOT NULL CHECK (detector_source IN ('watcher', 'startup_catchup', 'periodic_reconcile', 'ci')),
      evidence_revision INTEGER NOT NULL,
      findings_json TEXT NOT NULL DEFAULT '{}',
      review_state TEXT NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending', 'blocked', 'approved', 'applied', 'dismissed', 'superseded')),
      reviewer_id TEXT,
      reviewer_role TEXT,
      review_reason TEXT,
      reviewed_at TEXT,
      apply_result_json TEXT NOT NULL DEFAULT '{}',
      proposal_id TEXT,
      sqlite_revision TEXT,
      outbox_item_id INTEGER,
      finding_id INTEGER,
      superseded_by_event_id TEXT,
      coalesced_count INTEGER NOT NULL DEFAULT 1,
      first_detected_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_detected_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_content_change_events_review
      ON content_change_events(review_state, first_detected_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_content_change_events_entity
      ON content_change_events(entity_kind, entity_key);
    CREATE INDEX IF NOT EXISTS idx_content_change_events_correlation
      ON content_change_events(correlation_group_id)
      WHERE correlation_group_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_content_change_events_path
      ON content_change_events(path, review_state);

    CREATE TABLE IF NOT EXISTS content_source_monitor_runs (
      run_id TEXT PRIMARY KEY,
      detector_mode TEXT NOT NULL CHECK (detector_mode IN ('watcher_session', 'startup_catchup', 'periodic_reconcile', 'full_hash_audit', 'baseline')),
      status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'complete', 'incomplete', 'failed')),
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      repository_checkpoint TEXT,
      paths_inspected INTEGER NOT NULL DEFAULT 0,
      metadata_comparisons INTEGER NOT NULL DEFAULT 0,
      files_hashed INTEGER NOT NULL DEFAULT 0,
      events_produced INTEGER NOT NULL DEFAULT 0,
      complete INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      last_heartbeat_at TEXT,
      source_revision_before INTEGER,
      source_revision_after INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_content_source_monitor_runs_mode_started
      ON content_source_monitor_runs(detector_mode, started_at DESC);

    CREATE TABLE IF NOT EXISTS content_source_checkpoints (
      root_key TEXT NOT NULL,
      shard_key TEXT NOT NULL DEFAULT '',
      checkpoint_kind TEXT NOT NULL CHECK (checkpoint_kind IN ('baseline', 'metadata', 'full_hash')),
      checkpoint_value TEXT NOT NULL,
      evidence_revision_watermark INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (root_key, shard_key, checkpoint_kind)
    );

    CREATE TABLE IF NOT EXISTS content_source_quarantine (
      path TEXT PRIMARY KEY,
      reason TEXT NOT NULL,
      error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      first_failed_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_failed_at TEXT NOT NULL DEFAULT (datetime('now')),
      next_retry_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_content_source_quarantine_next_retry
      ON content_source_quarantine(resolved_at, next_retry_at);

    CREATE TABLE IF NOT EXISTS content_source_monitor_leases (
      root_key TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      acquired_at TEXT NOT NULL,
      renewed_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS content_review_proposals (
      proposal_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'approved', 'applied', 'stale', 'rejected', 'dismissed')),
      scope_fingerprint TEXT NOT NULL,
      scope_definition_json TEXT NOT NULL,
      scope_cardinality INTEGER NOT NULL,
      scope_paths_json TEXT NOT NULL,
      scope_max_evidence_revision INTEGER NOT NULL,
      scope_digests_json TEXT NOT NULL,
      stale_reason TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      approved_by TEXT,
      approved_at TEXT,
      applied_at TEXT
    );
  `);
}
