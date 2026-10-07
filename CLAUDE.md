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

## Protected factual constraints (founder-approved 2026-10-07)

**Don't let the website outrun the product.** These apply to every public
surface: page copy, metadata and structured data, social cards, alt text,
and README text the site serves.

- **Never state or imply universal fingerprinting or guaranteed duplicate
  prevention.** That rules out "every file is fingerprinted", "SHA-256
  protects every upload", "duplicates can never slip through", or any
  equally strong rewording. A reworded claim is the same violation, so
  don't restore removed claims in new words.
  - **The facts** (verified against `MAIE_Framework_2.0` source,
    2026-10-07): a SHA-256 checksum is recorded only for **marketplace
    assets uploaded as files**. User-uploaded media gets no content hash.
    Duplicate detection is **heuristic**: client-side, images only,
    flagging *likely* duplicates.
  - **Evidence:**
    `MAIE_Framework_2.0/findings-and-fixes/MAIE_PRODUCT_CLAIMS_VS_IMPLEMENTATION_FINDINGS_10-07-2026.md`.
- **Product reality gate.** Write a capability in the present tense only
  if it can be demonstrated in the current product. If only part of it
  works, describe that part and qualify the rest. If none of it works,
  either omit it or label it clearly as direction or roadmap. Never bridge
  the gap silently.
- **Pricing** appears only if it matches a plan that is actually
  purchasable right now, verified against live billing. Roadmap or
  non-purchasable tiers are never shown as current.
- **No relationship claims** (partner, customer, endorsement, adoption)
  without verified evidence. Organizations mentioned in market research
  are research or outreach targets, not partners.
