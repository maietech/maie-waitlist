// functions/api/_shared.ts
// Small helpers shared across the waitlist / events / survey endpoints.
// No framework — Pages Functions run on Workers, keep this dependency-free.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Bounded string trim — every free-text field goes through this so a
// malformed payload can't write an oversized value into D1.
export function str(v: unknown, maxLen = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t.slice(0, maxLen);
}

// Only accept values from a known set; anything else is dropped (stored as
// null) rather than written verbatim. Keeps `intent`, `timing`, etc. as a
// real enum in the data even though D1/SQLite has no native enum type.
export function enumOf(v: unknown, allowed: readonly string[]): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return (allowed as string[]).includes(s) ? s : null;
}

// ── Demand-engine enums ────────────────────────────────────────────────
export const INTEREST_DOMAINS = ["maie", "midwest_media_alliance", "both", "exploring"] as const;
export const INTENTS = [
  "explore", "early_access", "beta_test", "build", "collaborate", "partner", "learn", "investor_interest",
] as const;
export const USE_CASES = [
  "ai_agents", "media_ai", "datasets", "model_training", "compute",
  "media_production", "marketplace", "collaboration",
] as const;
export const TIMINGS = ["asap", "within_1_month", "within_3_months", "later_this_year", "exploring"] as const;
export const EARLY_ACCESS = ["yes_early_access", "yes_test", "yes_feedback", "wait"] as const;

// Funnel + demand events accepted by /api/events. An explicit allow-list
// keeps the ingestion path from becoming an arbitrary write — anything not
// on this list is rejected with a 400 rather than silently stored.
export const ALLOWED_EVENTS = [
  // engagement (passive)
  "landing_view",
  "waitlist_started",
  "waitlist_stage_completed",
  "waitlist_submitted",
  "already_registered",
  "threshold_viewed",
  "pixie_started",
  "pixie_completed",
  "journey_completed",
  "portal_redirected",
  "micro_survey_started",
  // demand (intentional)
  "micro_survey_completed",
  "micro_survey_skipped",
  "founding_cohort_requested",
  "referral_shared",
] as const;

interface DemandInputs {
  company?: string | null;
  github_user?: string | null;
  use_case?: string | null;
  intent?: string | null;
  timing?: string | null;
  early_access_interest?: string | null;
}

// Deliberately simple and transparent — this is internal triage, not a
// scored gate the visitor is ever shown. See form-overview.md item 11.
export function computeDemandScore(f: DemandInputs): number {
  let score = 0;
  if (f.early_access_interest === "yes_early_access") score += 5;
  else if (f.early_access_interest === "yes_test" || f.early_access_interest === "yes_feedback") score += 4;

  if (f.timing === "asap") score += 5;
  else if (f.timing === "within_1_month") score += 3;
  else if (f.timing === "within_3_months") score += 1;

  if (f.intent === "build" || f.intent === "beta_test" || f.intent === "partner" || f.intent === "investor_interest") score += 2;
  if (f.company) score += 3;
  if (f.use_case) score += 3;
  if (f.github_user) score += 1;

  return score;
}
