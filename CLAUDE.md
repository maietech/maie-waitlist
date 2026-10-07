# CLAUDE.md — maie-waitlist

Repo-specific guidance. Ecosystem-wide rules (secrets, git authority,
production boundary) are in the sibling `MAIE_Framework_2.0/CLAUDE.md`
(§0, §7–§9).

## What this is

`waitlist.joinmaie.com` is a static page plus **Cloudflare Pages
Functions** (`functions/api/*.ts`) that write signups and anonymous funnel
telemetry to **D1** and send notifications through **Resend**. `README.md`
is thorough and current: read it before changing anything, especially
"The Demand Engine" (attribution, telemetry, scoring) and the privacy
notes on what telemetry may and may not carry.

`pixie-companion.js` and `story-scroll.js` are copied verbatim from
`joinmaie-landing`. Keep them in sync deliberately rather than editing
only one copy.

## Run locally

```sh
npx wrangler pages dev .   # static page + Functions, with a local D1 instance
```

Apply the schema to the *local* D1 with `wrangler d1 execute maie_waitlist
--local --file=./schema.sql`.

## Boundaries

- **The production D1 database holds real signups (personal data).** Never
  run any `wrangler d1 … --remote` command, CSV export, or migration
  against it without explicit instruction. `migrations/` changes are
  production schema changes.
- `GET /api/waitlist` (CSV export) is authenticated. Don't call it.
- Pages deploys from `main`. Git uses per-action authority (Framework §7).
