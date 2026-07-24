-- 0002_demand_engine.sql — non-destructive upgrade for an EXISTING D1 db.
-- Apply with: wrangler d1 execute maie_waitlist --file=./migrations/0002_demand_engine.sql
--
-- Safe to run once against a live database: only ADDs columns/tables,
-- never drops or renames anything. Does not touch existing rows'
-- `email`, `name`, `company`, `github_user`, `role`, `found_via`,
-- `interests`, `created_at`, or `notified` values.
--
-- SQLite can't guard ALTER TABLE ... ADD COLUMN with IF NOT EXISTS, so if
-- you're re-running this (e.g. it partially applied), run
-- `PRAGMA table_info(signups);` first and drop any statements below whose
-- column already exists.

ALTER TABLE signups ADD COLUMN interest_domain       TEXT;
ALTER TABLE signups ADD COLUMN intent                TEXT;
ALTER TABLE signups ADD COLUMN use_case              TEXT;
ALTER TABLE signups ADD COLUMN timing                TEXT;
ALTER TABLE signups ADD COLUMN early_access_interest TEXT;

ALTER TABLE signups ADD COLUMN utm_source     TEXT;
ALTER TABLE signups ADD COLUMN utm_medium     TEXT;
ALTER TABLE signups ADD COLUMN utm_campaign   TEXT;
ALTER TABLE signups ADD COLUMN utm_content    TEXT;
ALTER TABLE signups ADD COLUMN utm_term       TEXT;
ALTER TABLE signups ADD COLUMN referral_code  TEXT;
ALTER TABLE signups ADD COLUMN referrer_url   TEXT;
ALTER TABLE signups ADD COLUMN landing_path   TEXT;

ALTER TABLE signups ADD COLUMN lead_status  TEXT NOT NULL DEFAULT 'new';
ALTER TABLE signups ADD COLUMN demand_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE signups ADD COLUMN session_id   TEXT;

-- SQLite rejects ADD COLUMN ... DEFAULT (datetime('now')) — a function
-- call isn't a "constant" default there — so add it plain and backfill.
ALTER TABLE signups ADD COLUMN updated_at          TEXT;
ALTER TABLE signups ADD COLUMN survey_completed_at TEXT;
ALTER TABLE signups ADD COLUMN last_activity_at    TEXT;

UPDATE signups SET updated_at = created_at WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_signups_lead_status ON signups(lead_status);
CREATE INDEX IF NOT EXISTS idx_signups_session_id ON signups(session_id);

CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL,
  event_name    TEXT NOT NULL,
  path          TEXT,
  referrer      TEXT,
  metadata      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_event_name ON events(event_name);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
