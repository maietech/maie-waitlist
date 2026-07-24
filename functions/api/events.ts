// functions/api/events.ts
// Anonymous funnel telemetry — POST-only, fire-and-forget from the client
// (navigator.sendBeacon, falling back to fetch(..., {keepalive:true})).
//
// Privacy note (see form-overview.md, "One Important Privacy Recommendation"):
// events are keyed by a first-party, random session_id generated client-side
// (see index.html) and stored with no email, name, or other identifying
// field. A row here only becomes attributable to a person if that same
// session_id later appears on a `signups` row — i.e. the visitor chose to
// submit the waitlist form. Nothing in this endpoint links the two; the
// join, if you need it, happens later by querying on session_id.

import { json, str, ALLOWED_EVENTS } from "./_shared";

interface Env {
  DB: D1Database;
}

const MAX_METADATA_LEN = 1000;

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const sessionId = str(body.session_id, 100);
  const eventName = typeof body.event === "string" ? body.event.trim() : "";

  if (!sessionId) {
    return json({ ok: false, error: "session_id is required." }, 400);
  }
  if (!(ALLOWED_EVENTS as readonly string[]).includes(eventName)) {
    // Reject rather than silently store — an unbounded event vocabulary
    // turns this into an arbitrary-write endpoint over time.
    return json({ ok: false, error: "Unknown event." }, 400);
  }

  const path = str(body.path, 300);
  const referrer = str(body.referrer, 500);

  // metadata is small, optional, and stored as an opaque JSON string —
  // never parsed/interpreted server-side, so it can't be used to smuggle
  // structured writes elsewhere.
  let metadata: string | null = null;
  if (body.metadata && typeof body.metadata === "object") {
    try {
      metadata = JSON.stringify(body.metadata).slice(0, MAX_METADATA_LEN);
    } catch {
      metadata = null;
    }
  }

  try {
    await env.DB.prepare(
      `INSERT INTO events (session_id, event_name, path, referrer, metadata)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(sessionId, eventName, path, referrer, metadata).run();
  } catch {
    // Telemetry is best-effort by design — never surface a 500 to the
    // beacon call, there's nothing the client can usefully do with it.
    return json({ ok: true });
  }

  return json({ ok: true });
};
