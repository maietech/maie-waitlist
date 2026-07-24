-- MAIE waitlist — D1 schema
-- Apply with: wrangler d1 execute maie_waitlist --file=./schema.sql
--
-- This is the canonical schema for a FRESH database. If you already have a
-- deployed `signups` table, do not re-run this file — apply
-- migrations/0002_demand_engine.sql instead, which ALTERs the existing
-- table non-destructively and adds the new `events` table.

CREATE TABLE IF NOT EXISTS signups (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Identity
  email                   TEXT NOT NULL UNIQUE,
  name                    TEXT,
  company                 TEXT,
  github_user             TEXT,
  role                    TEXT,

  -- Interest (existing product-fit signal, kept as-is)
  interests               TEXT,     -- comma-separated tags, kept simple; JSON if it grows

  -- Audience / affiliation — separates MAIE-the-technology from the
  -- Midwest Media Alliance mission umbrella. Populated by the
  -- post-welcome micro-survey (see /api/survey), not the main form.
  interest_domain         TEXT,     -- maie | midwest_media_alliance | both | exploring
  intent                  TEXT,     -- explore | early_access | beta_test | build | collaborate | partner | learn | investor_interest
  use_case                TEXT,     -- ai_agents | media_ai | datasets | model_training | compute | media_production | marketplace | collaboration
  timing                  TEXT,     -- asap | within_1_month | within_3_months | later_this_year | exploring
  early_access_interest   TEXT,     -- yes_early_access | yes_test | yes_feedback | wait

  -- Acquisition — human-reported vs. objective attribution
  found_via               TEXT,     -- human-reported ("How did you hear about us?")
  utm_source              TEXT,
  utm_medium              TEXT,
  utm_campaign            TEXT,
  utm_content             TEXT,
  utm_term                TEXT,
  referral_code           TEXT,
  referrer_url            TEXT,
  landing_path            TEXT,

  -- Qualification — internal, never shown to the user
  lead_status             TEXT NOT NULL DEFAULT 'new',   -- new | qualified | contacted | responded | demo_scheduled | beta_candidate | founding_cohort | active_user | customer | partner | investor_interest | inactive
  demand_score            INTEGER NOT NULL DEFAULT 0,

  -- Session linkage (best-effort join to anonymous `events`, only once
  -- the visitor identifies themselves by submitting the form)
  session_id              TEXT,

  -- Timestamps
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  survey_completed_at     TEXT,
  last_activity_at        TEXT,

  notified                INTEGER NOT NULL DEFAULT 0  -- 1 once the Resend notification succeeds
);

CREATE INDEX IF NOT EXISTS idx_signups_created_at ON signups(created_at);
CREATE INDEX IF NOT EXISTS idx_signups_lead_status ON signups(lead_status);
CREATE INDEX IF NOT EXISTS idx_signups_session_id ON signups(session_id);

-- Anonymous behavioral telemetry. Deliberately separate from `signups`:
-- events are keyed by an anonymous, first-party session_id and are never
-- required to carry an email. A row here only becomes attributable to a
-- person if that same session_id later shows up on a signups row (i.e.
-- the visitor chose to submit the form) — see functions/api/waitlist.ts.
CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL,
  event_name    TEXT NOT NULL,
  path          TEXT,
  referrer      TEXT,
  metadata      TEXT,     -- JSON string, small and optional
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_event_name ON events(event_name);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
