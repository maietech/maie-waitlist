-- MAIE waitlist — D1 schema
-- Apply with: wrangler d1 execute maie_waitlist --file=./schema.sql

CREATE TABLE IF NOT EXISTS signups (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  company       TEXT,
  github_user   TEXT,
  role          TEXT,
  found_via     TEXT,
  interests     TEXT,      -- comma-separated tags, kept simple; JSON if it grows
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  notified      INTEGER NOT NULL DEFAULT 0  -- 1 once the Resend notification succeeds
);

CREATE INDEX IF NOT EXISTS idx_signups_created_at ON signups(created_at);
