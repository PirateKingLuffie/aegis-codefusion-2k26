CREATE TABLE IF NOT EXISTS aegis_agent_activity_revisions (
  receipt_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  recorded_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  digest TEXT NOT NULL CHECK (length(digest) = 64),
  previous_digest TEXT,
  approval_status TEXT NOT NULL CHECK (
    approval_status IN ('not-required', 'pending', 'approved', 'rejected')
  ),
  channel TEXT NOT NULL CHECK (channel IN ('agent-ledger', 'operations-center')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  activity_json TEXT NOT NULL CHECK (json_valid(activity_json)),
  PRIMARY KEY (receipt_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_agent_activity_recorded_at
  ON aegis_agent_activity_revisions (recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_activity_approval
  ON aegis_agent_activity_revisions (approval_status, recorded_at DESC);
