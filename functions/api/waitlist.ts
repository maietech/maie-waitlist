// functions/api/waitlist.ts
// Cloudflare Pages Function — deployed automatically alongside the static
// site, same domain, no separate Worker/DNS routing needed.
// Flow: browser POST -> validate -> insert into D1 -> (best-effort) notify
// via Resend. The D1 write is the source of truth; if Resend fails, the
// signup is still saved and `notified` stays 0 for later reconciliation.

interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  NOTIFY_FROM: string;   // e.g. "MAIE Waitlist <waitlist@joinmaie.com>"
  NOTIFY_TO: string;     // e.g. "founders@joinmaie.com"
  ADMIN_TOKEN: string;   // bearer token for the GET export below
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
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

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : null;
  const company = typeof body.company === "string" ? body.company.trim().slice(0, 200) : null;
  const githubUser = typeof body.github_user === "string" ? body.github_user.trim().slice(0, 200) : null;
  const role = typeof body.role === "string" ? body.role.trim().slice(0, 200) : null;
  const foundVia = typeof body.found_via === "string" ? body.found_via.trim().slice(0, 200) : null;
  const interests = Array.isArray(body.interests)
    ? body.interests.filter((x) => typeof x === "string").join(",").slice(0, 500)
    : null;

  try {
    await env.DB.prepare(
      `INSERT INTO signups (email, name, company, github_user, role, found_via, interests)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(email, name, company, githubUser, role, foundVia, interests).run();
  } catch (err: any) {
    // UNIQUE constraint on email -> treat as a friendly "already on the list"
    if (String(err?.message || "").includes("UNIQUE")) {
      return json({ ok: true, alreadyJoined: true });
    }
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
        ].filter(Boolean).join("\n"),
      }),
    });
    if (resp.ok) {
      await env.DB.prepare(`UPDATE signups SET notified = 1 WHERE email = ?`).bind(email).run();
    }
  } catch {
    // swallow — signup already saved, notification can be reconciled later
  }

  return json({ ok: true });
};

// GET /api/waitlist?token=... — simple CSV export for tracking signups.
// Protect with a long random ADMIN_TOKEN secret; this is meant for you to
// pull data, not a public endpoint.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const token = new URL(request.url).searchParams.get("token");
  if (!token || token !== env.ADMIN_TOKEN) {
    return json({ ok: false, error: "Unauthorized." }, 401);
  }

  const { results } = await env.DB.prepare(
    `SELECT id, email, name, company, github_user, role, found_via, interests, created_at, notified
     FROM signups ORDER BY created_at DESC`
  ).all();

  const rows = results as Record<string, unknown>[];
  const header = "id,email,name,company,github_user,role,found_via,interests,created_at,notified";
  const csv = [header, ...rows.map((r) =>
    [r.id, r.email, r.name, r.company, r.github_user, r.role, r.found_via, r.interests, r.created_at, r.notified]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
  )].join("\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv",
      "content-disposition": "attachment; filename=maie-waitlist.csv",
    },
  });
};
