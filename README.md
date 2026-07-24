# MAIE Waitlist — `waitlist.joinmaie.com`

Static page (`index.html`) + one Cloudflare Pages Function
(`functions/api/waitlist.ts`) that does the D1 write and Resend
notification. No separate Worker to deploy or route — Pages Functions
are Workers under the hood, shipped with the static site as one unit.

## What's in this repo
```
index.html                    the waitlist page itself
functions/api/waitlist.ts      POST = save signup + notify; GET = CSV export
schema.sql                     D1 table definition
wrangler.toml                  local dev config / D1 binding reference
continuum.js                   post-signup cinematic sequence — see below
pixie-companion.js             ported verbatim from joinmaie-landing, unmodified
story-scroll.js                ported verbatim from joinmaie-landing, unmodified
```

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
- `ADMIN_TOKEN` — any long random string; this is what protects the CSV export (`GET /api/waitlist?token=...`)

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
https://waitlist.joinmaie.com/api/waitlist?token=YOUR_ADMIN_TOKEN
```
Returns a CSV of every signup (email, name, company, role, github
username, how they found you, interests, timestamp, whether the
notification email went out). Safe to open in Sheets/Excel directly.

## Local testing
```
npm install -g wrangler   # if you don't have it
wrangler pages dev .
```
