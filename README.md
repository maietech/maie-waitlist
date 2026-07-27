# MAIE Waitlist — `waitlist.joinmaie.com`

Static page (`index.html`) + one Cloudflare Pages Function
(`functions/api/waitlist.ts`) that does the D1 write and Resend
notification. No separate Worker to deploy or route — Pages Functions
are Workers under the hood, shipped with the static site as one unit.

## What's in this repo
```
index.html                    the waitlist page itself
functions/api/waitlist.ts     POST = save signup + notify; GET = CSV export (auth header required)
functions/api/events.ts       POST = anonymous funnel telemetry (see "The Demand Engine" below)
functions/api/survey.ts       POST = post-welcome micro-survey answers, enriches an existing signup
functions/api/_shared.ts      shared validation/enum/scoring helpers used by all three functions above
schema.sql                    D1 table definitions — fresh-install canonical schema
migrations/0002_demand_engine.sql   non-destructive upgrade path for an existing deployed DB
wrangler.toml                  local dev config / D1 binding reference
telemetry.js                   session id + UTM/referral capture + event beacon — loads first
continuum.js                   post-signup cinematic sequence — see below
river-atmosphere.js            the Continuum's atmospheric layer, "The River Finds You" — see below
pixie-companion.js             ported verbatim from joinmaie-landing, unmodified
story-scroll.js                ported verbatim from joinmaie-landing, unmodified
```

## The Demand Engine

Three additions turn the waitlist from lead capture into something that
also tells you *why* people showed up and how likely they are to convert:

- **Silent attribution** — `telemetry.js` reads `utm_source/medium/campaign/
  content/term` and a `?ref=` referral code from the URL once per browser
  session, alongside `document.referrer` and the landing path, and sends
  them along with the waitlist submission. None of this is a form field;
  the visitor never sees it.
- **Anonymous funnel telemetry** — the same script assigns a random
  `session_id` (sessionStorage, not a cookie) and fires fire-and-forget
  beacons to `/api/events` at each funnel step (`landing_view` through
  `portal_redirected`; see the `ALLOWED_EVENTS` list in
  `functions/api/_shared.ts`). These rows carry no email — they only
  become attributable to a person if that same `session_id` later shows
  up on a `signups` row.
- **Post-welcome micro-survey** — three optional, one-tap-at-a-time
  questions (what brings you here / what you'd want to do first / when
  you'd want to start) appear on the final "Welcome." curtain, well after
  submission. Answering any of it calls `/api/survey`, which enriches the
  already-created signup with `interest_domain`, `intent`, `use_case`,
  `timing`, and `early_access_interest`, and recomputes `demand_score`.
  Skipping it, or ignoring it entirely, changes nothing else about the
  experience.

`lead_status` and `demand_score` are internal-only columns — nothing in
the UI ever shows or gates on them.

## The Continuum

A signup doesn't end at "you're on the list" — `continuum.js` takes over
from the submit handler in `index.html` (`window.MaieContinuum.begin()`)
and runs a short scroll-driven sequence in the same story-scene style
joinmaie-landing uses for its own cinematic sections: the form dissolves
into a plain "You're in.", then three tall scroll-scenes follow — Pixie
appears and says one thing (reusing `pixie-companion.js`/
`getPixieThemeColors()` as-is), a handful of one-line intertitles, then a
curtain that fills the screen and hands off to `joinmaie.com` with a real
navigation after a short dwell (manual link only under
`prefers-reduced-motion`, never automatic).

`pixie-companion.js` reads `--brand-light`/`--accent` via
`getComputedStyle`; this page's tokens predate that engine and use
`--primary*` names for the same colors, so `index.html`'s `:root` aliases
`--brand`/`--brand-light`/`--brand-glow` to the existing `--primary*`
values rather than forking the engine or renaming either side.

## The River

`river-atmosphere.js` is the Continuum's dedicated atmospheric layer —
the design direction internally called "The River Finds You." It's a
single `<canvas>`, inserted into the page (right before `.continuum-haze`)
only when `continuum.js`'s `begin()` calls `MaieRiver.mount()`, so a
visitor who never signs up never pays for it.

Three systems, matching the design doc:
- **The Current** — waveform fragments, pulses, and destination nodes
  drift downward at all times, independent of scroll. Scrolling briefly
  strengthens the current (a decaying multiplier tied to scroll delta);
  it always settles back to its resting pace on its own.
- **Living Water** — `continuum.js` calls `MaieRiver.echo(x, y)` at quiet
  beats (an evolve-line flashing in during the Invitation scene, an
  intertitle handing off to the next during the Journey scene) so that
  moment dissolves into the Current instead of just disappearing.
- **Rapids + Convergence** — `continuum.js` calls `MaieRiver.setMomentum(0..1)`,
  ramping it up across the back half of the Journey scene and holding it
  through most of the Transition scene before easing it back to 0 right
  before the curtain completes. Momentum speeds up the Current, widens
  parallax depth, brightens reflections, and gradually bends waveform
  fragments toward a shared lane (Convergence) — then everything settles
  again right before arrival.

Density (`quiet` / `narrative` / `cinematic`) is content-adaptive:
`index.html` tags each scene's sticky panel with
`data-river-density="…"`, and `river-atmosphere.js` watches all of them
with one `IntersectionObserver`, fading or intensifying the whole layer
toward whichever tagged panel is currently most visible rather than
using one fixed global opacity.

Every particle's shape, lane, and phase come from a fixed hash of its
index, never `Math.random()` — the same visitor sees the same
handcrafted flow every time, not a fresh scatter on reload. Motion is
canvas 2D redraws driven by `requestAnimationFrame`, not scroll-jacking.
Under `prefers-reduced-motion`, it renders one settled frame at low
density and never starts the animation loop at all.

## One-time setup in the Cloudflare dashboard

You're in the right account (`joinmaie.com`). These steps only exist in
the dashboard/CLI — I can't do them for you, but here's exactly where
each one lives.

**1. Create the D1 database**
Dashboard → **Storage & databases** → **D1** → **Create database** →
name it `maie_waitlist`. Copy the `database_id` it gives you into
`wrangler.toml` in this repo (replaces `REPLACE_WITH_D1_DATABASE_ID`).

**2. Load the schema**
From your machine, with `wrangler` installed and logged in:
```
wrangler d1 execute maie_waitlist --remote --file=./schema.sql
```
If this D1 database already has a deployed `signups` table from before,
do **not** re-run `schema.sql` — apply the non-destructive upgrade
instead, which only adds columns/tables and never touches existing rows:
```
wrangler d1 execute maie_waitlist --remote --file=./migrations/0002_demand_engine.sql
```

**3. Create the Pages project**
Dashboard → **Compute** → **Workers & Pages** → **Ship something new** →
**Pages** → **Connect to Git**. Point it at a new (or existing) GitHub
repo containing this folder. Build output directory: `/` (it's static,
no build command needed).

**4. Bind D1 to the Pages project**
In the new Pages project → **Settings** → **Functions** → **D1 database
bindings** → **Add binding**: variable name `DB`, database `maie_waitlist`.

**5. Add the secrets**
Same **Settings** → **Environment variables** (mark these as *Secret*,
not plaintext):
- `RESEND_API_KEY` — from resend.com after you verify `joinmaie.com` as a sending domain there
- `NOTIFY_FROM` — e.g. `MAIE Waitlist <waitlist@joinmaie.com>`
- `NOTIFY_TO` — e.g. `founders@joinmaie.com`
- `ADMIN_TOKEN` — any long random string; this is what protects the CSV export. Sent as an `Authorization: Bearer` header now, not a `?token=` query param — see "Pulling signups" below for why.

**6. Attach the domain**
Pages project → **Custom domains** → **Set up a custom domain** →
`waitlist.joinmaie.com`. Cloudflare will add the DNS record for you
since the zone is already on your account.

**7. Email forwarding for the notification address**
Domains → `joinmaie.com` → **Email** → **Email Routing** → add
`founders@joinmaie.com` → forward to whatever inbox you actually read.
This is separate from Resend (Resend *sends* the notification; Email
Routing just forwards `founders@joinmaie.com` if you also want that
address to work for direct mail).

**8. Update the GitHub README**
In `github.com/maie/...`, point people at the new page:
```md
## Join the waitlist
https://waitlist.joinmaie.com
```

## Pulling signups
```
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  https://waitlist.joinmaie.com/api/waitlist -o maie-waitlist.csv
```
A query-string `?token=...` used to work here — it's been removed on
purpose. Query params land in server access logs, browser history, and
`Referer` headers on any outbound request from that page, so a static
token there should be treated as already leaked. A header isn't logged
the same way. This is still one shared secret, not per-admin auth or
short-lived tokens — fine for pulling data yourself, worth revisiting
before handing export access to a team (see item 14 in the audit notes).

Returns a CSV of every signup: identity (email, name, company, role,
github username), interests, the post-welcome survey fields
(`interest_domain`, `intent`, `use_case`, `timing`,
`early_access_interest`), acquisition (`found_via` plus the UTM/referral
fields captured silently by `telemetry.js`), `lead_status` and
`demand_score`, `session_id`, and all timestamps. Safe to open in
Sheets/Excel directly.

Anonymous funnel events (`landing_view` … `portal_redirected`) live in
the separate `events` table — pull those directly via `wrangler d1
execute maie_waitlist --remote --command "SELECT * FROM events ..."`
until/unless that gets its own export endpoint.

## Local testing
```
npm install -g wrangler   # if you don't have it
wrangler pages dev .
```
