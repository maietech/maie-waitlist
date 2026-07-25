// functions/api/waitlist.ts
// Cloudflare Pages Function — deployed automatically alongside the static
// site, same domain, no separate Worker/DNS routing needed.
// Flow: browser POST -> validate -> insert into D1 -> (best-effort) notify
// via Resend. The D1 write is the source of truth; if Resend fails, the
// signup is still saved and `notified` stays 0 for later reconciliation.

import { EMAIL_RE, json, str, computeDemandScore } from "./_shared";

interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  NOTIFY_FROM: string;   // e.g. "MAIE Waitlist <waitlist@joinmaie.com>"
  NOTIFY_TO: string;     // e.g. "founders@joinmaie.com"
  ADMIN_TOKEN: string;   // bearer token for the GET export below
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  // Honeypot: a hidden field named "company_website" that real users never
  // fill in. Bots that auto-fill every field will trip it.
  if (typeof body.company_website === "string" && body.company_website.trim() !== "") {
    return json({ ok: true }); // pretend success, drop silently
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_RE.test(email)) {
    return json({ ok: false, error: "A valid email is required." }, 400);
  }

  const name = str(body.name, 200);
  const company = str(body.company, 200);
  const githubUser = str(body.github_user, 200);
  const role = str(body.role, 200);
  const foundVia = str(body.found_via, 200);
  const interests = Array.isArray(body.interests)
    ? body.interests.filter((x) => typeof x === "string").join(",").slice(0, 500)
    : null;

  // Objective attribution — read by the client from the URL/sessionStorage
  // at landing time (see index.html), not hand-typed by the visitor. Kept
  // alongside the human-reported `found_via` rather than replacing it —
  // see form-overview.md item 9 ("They said Reddit" vs "They actually
  // arrived from Reddit").
  const utmSource = str(body.utm_source, 200);
  const utmMedium = str(body.utm_medium, 200);
  const utmCampaign = str(body.utm_campaign, 200);
  const utmContent = str(body.utm_content, 200);
  const utmTerm = str(body.utm_term, 200);
  const referralCode = str(body.referral_code, 200);
  const referrerUrl = str(body.referrer_url, 500);
  const landingPath = str(body.landing_path, 500);
  const sessionId = str(body.session_id, 100);

  const demandScore = computeDemandScore({ company, github_user: githubUser });

  try {
    await env.DB.prepare(
      `INSERT INTO signups (
         email, name, company, github_user, role, found_via, interests,
         utm_source, utm_medium, utm_campaign, utm_content, utm_term,
         referral_code, referrer_url, landing_path, session_id,
         lead_status, demand_score, updated_at, last_activity_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, datetime('now'), datetime('now'))`
    ).bind(
      email, name, company, githubUser, role, foundVia, interests,
      utmSource, utmMedium, utmCampaign, utmContent, utmTerm,
      referralCode, referrerUrl, landingPath, sessionId,
      demandScore
    ).run();
  } catch (err: any) {
    // UNIQUE constraint on email -> treat as a friendly "already on the list"
    if (String(err?.message || "").includes("UNIQUE")) {
      return json({ ok: true, alreadyJoined: true });
    }
    // Anything else (most commonly: the D1 schema doesn't have a column
    // this INSERT references yet — e.g. migrations/0002_demand_engine.sql
    // hasn't been applied to the live database) was previously swallowed
    // into a generic 500 with no way to tell which. Surface it via
    // `wrangler pages deployment tail` instead of guessing next time.
    console.log(`Waitlist insert failed: ${err?.message || err}`);
    return json({ ok: false, error: "Could not save signup." }, 500);
  }

  // Best-effort notification — failure here must never fail the request,
  // since the signup is already durably stored.
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.NOTIFY_FROM,
        to: [env.NOTIFY_TO],
        subject: `New waitlist signup: ${email}`,
        text: [
          `New waitlist signup`,
          name ? `Name: ${name}` : null,
          role ? `Role: ${role}` : null,
          company ? `Company: ${company}` : null,
          `Email: ${email}`,
          githubUser ? `GitHub: ${githubUser}` : null,
          foundVia ? `Found via: ${foundVia}` : null,
          interests ? `Interested in: ${interests}` : null,
          utmSource ? `UTM source: ${utmSource}` : null,
          referralCode ? `Referral code: ${referralCode}` : null,
          `Demand score: ${demandScore}`,
        ].filter(Boolean).join("\n"),
      }),
    });
    if (resp.ok) {
      await env.DB.prepare(`UPDATE signups SET notified = 1 WHERE email = ?`).bind(email).run();
    } else {
      // TEMP DEBUG — remove once notifications are confirmed working.
      const errBody = await resp.text();
      console.log(`Resend failed: status=${resp.status} body=${errBody}`);
    }
  } catch (e: any) {
    // TEMP DEBUG — remove once notifications are confirmed working.
    console.log(`Resend threw: ${e?.message || e}`);
  }

  return json({ ok: true });
};

// GET /api/waitlist — CSV export of signups.
//
// SECURITY: this used to accept ?token=... as a query string. Query params
// land in server access logs, browser history, and Referer headers, so a
// static token there should be treated as already leaked. It now requires
// the same secret sent as a proper Authorization header instead, which
// none of those surfaces capture:
//
//   curl -H "Authorization: Bearer $ADMIN_TOKEN" https://joinmaie.com/api/waitlist
//
// This is still a single shared secret, not per-admin auth or short-lived
// tokens — adequate for "pull data yourself," not for handing out to a
// team. If more than one person needs export access, or you want expiring
// tokens, revisit this with real admin auth before wider rollout.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;

  const authHeader = request.headers.get("Authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  const token = match ? match[1] : null;

  if (!token || !env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    // Best-effort audit trail for failed export attempts — there's no
    // external alerting wired up yet, so this only surfaces via `wrangler
    // pages deployment tail`, but it's a starting point (see
    // form-overview.md item 14).
    console.log(`Unauthorized waitlist export attempt from ${request.headers.get("cf-connecting-ip") || "unknown"}`);
    return json({ ok: false, error: "Unauthorized." }, 401);
  }

  const { results } = await env.DB.prepare(
    `SELECT id, email, name, company, github_user, role, interests,
            interest_domain, intent, use_case, timing, early_access_interest,
            found_via, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
            referral_code, referrer_url, landing_path,
            lead_status, demand_score, session_id,
            created_at, updated_at, survey_completed_at, last_activity_at, notified
     FROM signups ORDER BY created_at DESC`
  ).all();

  const rows = results as Record<string, unknown>[];
  const header = [
    "id", "email", "name", "company", "github_user", "role", "interests",
    "interest_domain", "intent", "use_case", "timing", "early_access_interest",
    "found_via", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    "referral_code", "referrer_url", "landing_path",
    "lead_status", "demand_score", "session_id",
    "created_at", "updated_at", "survey_completed_at", "last_activity_at", "notified",
  ];
  const csv = [header.join(","), ...rows.map((r) =>
    header.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(",")
  )].join("\n");

  console.log(`Waitlist export served: ${rows.length} rows`);

  return new Response(csv, {
    headers: {
      "content-type": "text/csv",
      "content-disposition": "attachment; filename=maie-waitlist.csv",
    },
  });
};
