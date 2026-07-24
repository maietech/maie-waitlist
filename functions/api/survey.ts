// functions/api/survey.ts
// The optional, post-welcome micro-survey (see continuum.js's Scene 1.5).
// Deliberately separate from /api/waitlist: the main form stays lightweight
// and this only ever enriches a row that already exists, identified by the
// email the visitor already gave us. It never creates a signup on its own.

import {
  json, str, enumOf, computeDemandScore,
  INTEREST_DOMAINS, INTENTS, USE_CASES, TIMINGS, EARLY_ACCESS,
} from "./_shared";

interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return json({ ok: false, error: "email is required." }, 400);
  }

  const interestDomain = enumOf(body.interest_domain, INTEREST_DOMAINS);
  const intent = enumOf(body.intent, INTENTS);
  const useCase = enumOf(body.use_case, USE_CASES);
  const timing = enumOf(body.timing, TIMINGS);
  const earlyAccess = enumOf(body.early_access_interest, EARLY_ACCESS);

  const existing = await env.DB.prepare(
    `SELECT company, github_user FROM signups WHERE email = ?`
  ).bind(email).first<{ company: string | null; github_user: string | null }>();

  if (!existing) {
    // Don't let this endpoint double as "does this email exist" oracle
    // behavior beyond what's needed — same generic response either way.
    return json({ ok: false, error: "No matching signup." }, 404);
  }

  const demandScore = computeDemandScore({
    company: existing.company,
    github_user: existing.github_user,
    use_case: useCase,
    intent,
    timing,
    early_access_interest: earlyAccess,
  });

  await env.DB.prepare(
    `UPDATE signups
     SET interest_domain = ?, intent = ?, use_case = ?, timing = ?, early_access_interest = ?,
         demand_score = ?, updated_at = datetime('now'), last_activity_at = datetime('now'),
         survey_completed_at = datetime('now')
     WHERE email = ?`
  ).bind(interestDomain, intent, useCase, timing, earlyAccess, demandScore, email).run();

  return json({ ok: true });
};
