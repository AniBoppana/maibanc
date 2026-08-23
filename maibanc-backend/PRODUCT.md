# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The owner/operator, plus a small circle of trusted people (e.g. household or family) they choose to give access to — each with their own Clerk account and their own connected bank data. Not a public multi-tenant SaaS; access is granted personally, not self-serve signup.

## Product Purpose

A personal finance tracker: connect real bank accounts (via Plaid), see net worth and account balances, browse and filter transactions, set monthly budgets per category, and get a forecast (average spend by category, detected recurring charges, budget pacing, and a projected end-of-month balance). Success is the owner (and anyone they've given access to) being able to see where their money is and where it's headed, without a subscription or a third party holding the data.

## Positioning

Self-hosted and private — the operator's own Postgres database and own Plaid API keys, so financial data never lands on a vendor's servers or gets sold/brokered — combined with running at $0/month, with no premium tier or paywall. This is the truthful difference from Mint, YNAB, Copilot, and Monarch: those are hosted SaaS with a business model built on your data or your subscription; this is neither.

## Operating Context

Single self-hosted deployment (currently local dev; not yet deployed to a public production environment). Auth is Clerk, with one row per Clerk user in the database. Bank connections go through Plaid Link; access tokens are stored AES-256-GCM encrypted. Development currently runs against Plaid's sandbox environment, with a documented path to switch to Plaid production. A `X-Dev-User-Id` header bypasses Clerk auth in local development only (never in production) to make local testing easier without a full sign-in flow.

## Capabilities and Constraints

- Accounts: list connected accounts and balances; compute net worth (assets − liabilities).
- Transactions: list/filter by category and date range; distinct category list; manual re-sync.
- Budgets: create/update (upsert) and delete a monthly budget per category.
- Forecast: trailing-3-month average spend per category; recurring-charge detection (merchant + amount + ~monthly interval); budget pacing (month-to-date spend projected to month-end vs. budget); projected end-of-month balance from current balance + linear daily spend/income rate.
- Plaid: create Link token, exchange public token, list/disconnect connected bank items, webhook receiver for transaction sync updates and item errors.
- Known constraint: Plaid webhook signature verification is not yet implemented (tracked in README as a pre-production item).
- Frontend is a web app today (React/Vite); an Electron desktop wrapper has been discussed as a possible later packaging step, not a native design-language change.

## Evidence on Hand

`FinanceOS_desktop_app.html` at the project root is an early static mockup (dark terminal-style UI, "FinanceOS" name, JetBrains Mono, dense layout). The user has confirmed this is rough/early and explicitly **not** the committed visual direction — a full visual redesign is wanted, avoiding generic AI-slop patterns (boring gradients, overused rounded cards, uninspired layouts). Treat the mockup's name, palette, and layout as superseded, not as binding evidence, in any future design work.

The working frontend (`finance-frontend/`) currently uses default/unstyled Tailwind utility classes with no committed visual system — functional but not art-directed.

## Product Principles

1. Privacy and self-hosting are the product's reason to exist — never suggest patterns that imply a hosted multi-tenant backend or third-party data sharing.
2. Keep the cost floor at $0/month; avoid recommending paid infrastructure, fonts, or services as a default.
3. Access is personal and small-circle, not public signup — design for a handful of known users, not anonymous growth/acquisition flows.
4. Financial data density and correctness (real balances, real transactions, real projections) outrank decorative simplification — don't hide real numbers behind vague summaries.
