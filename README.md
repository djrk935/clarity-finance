# Clarity

**By [Dayan Kijege](https://github.com/djrk935)** · A personal-finance dashboard built with Next.js, TypeScript & Plaid.

A personal **financial dashboard** — it links your real bank via Plaid and shows
what's safe to spend, where your money comes and goes, a searchable feed of every
transaction, period statements (week / month / year), a debt-payoff plan,
proactive insights, and an AI advisor that answers questions grounded in your
actual numbers.

## Pages

| Page          | What it shows                                                                 |
| ------------- | ----------------------------------------------------------------------------- |
| **Overview**  | Safe-to-spend, liquidity, upcoming bills, money-in-vs-out cash flow, insights |
| **Activity**  | Every transaction — searchable and filterable by category, with in/out/net    |
| **Reports**   | Statements by period (week / this month / last month / year): income, spend, net, by-category, top merchants, and a 6-month trend |
| **Accounts**  | Cash & savings, credit-card balances + utilization, net position             |
| **Plan**      | Avalanche debt-payoff order and projected debt-free date                      |
| **Advisor**   | Chat grounded in your real snapshot (Claude, or a rule-based fallback)        |

Design language: **Aurora Brutalism** — frosted-glass surfaces on a brutalist
skeleton (thick borders, hard offset shadows, a blueprint grid seen through the
glass) over a violet→cyan→magenta aurora.

## Getting started

```bash
npm install
cp .env.example .env      # then fill in keys (see below)
npm run dev               # http://localhost:3000
```

With no keys set, the app runs but shows nothing to link yet. Add Plaid keys to
connect a bank; everything on the dashboard is **real data from your linked
accounts** (fetched live on each request — there is no demo/seed data).

## Environment variables

| Variable           | Purpose                                                            |
| ------------------ | ----------------------------------------------------------------- |
| `PLAID_CLIENT_ID`  | Plaid client id                                                   |
| `PLAID_SECRET`     | Plaid secret (sandbox or production)                              |
| `PLAID_ENV`        | `sandbox` or `production`                                         |
| `ANTHROPIC_API_KEY`| Enables the live Claude advisor (falls back to rule-based if unset)|
| `ADVISOR_MODEL`    | Optional model override (default `claude-sonnet-4-6`)            |
| `APP_PASSWORD`     | Require this password to use the app. Blank = open (local dev).   |
| `APP_SECRET`       | Long random string used to sign the login cookie.                |
| `DATABASE_URL`     | `postgres://…` in production (stores the Plaid token). Local: any non-postgres value uses a local file instead. |

## Scripts

| Command             | What it does                              |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Dev server                                |
| `npm run build`     | Production build                          |
| `npm start`         | Run the production build                  |
| `npm run lint`      | ESLint                                    |
| `npm run typecheck` | `tsc --noEmit`                            |
| `npm test`          | Finance-engine checks (Node 22.6+)        |

## How it works

- **Real data, live.** `lib/data/plaid-source.ts` pulls accounts, transactions,
  liabilities (→ debts) and recurring (→ bills) from Plaid; `assemble.ts` turns
  them into the dashboard numbers (all pure + unit-tested in `finance.ts`).
- **One finance engine.** `finance.ts` holds every calculation as a pure,
  dependency-free function — balances, safe-to-spend, income/spend by period,
  category & merchant breakdowns, runway, and the avalanche payoff simulation —
  so the same numbers power the server pages, the client views, and the advisor,
  and stay covered by `npm test`.
- **Auth.** `lib/auth.ts` is a single-user password gate: the login cookie is an
  HMAC of `APP_PASSWORD` keyed by `APP_SECRET`. Enforced only when
  `APP_PASSWORD` is set, so local dev stays open. Pages and every API route are
  guarded, and `lib/rate-limit.ts` locks out an IP after repeated failed logins.
- **Token persistence.** `lib/token-store.ts` keeps the one Plaid access token
  in a local file during dev and in Postgres in production (so the link survives
  on an ephemeral host).
- **AI advisor.** `/api/advisor` uses Claude when `ANTHROPIC_API_KEY` is set,
  otherwise a deterministic rule-based brain — both grounded in your snapshot.

## Deploying to DigitalOcean App Platform

1. Push this repo to a **private** GitHub repo (`.env` and `.plaid/` are
   git-ignored, so no secrets are committed).
2. In DigitalOcean → **Apps → Create App** → pick the GitHub repo. It autodetects
   Next.js (build `npm run build`, run `npm start`).
3. Add a **Dev/Managed Postgres database** to the app (covered by GitHub Student
   credits). App Platform injects its URL as `DATABASE_URL`.
4. Set the app's environment variables (encrypted): `PLAID_CLIENT_ID`,
   `PLAID_SECRET`, `PLAID_ENV=production`, `ANTHROPIC_API_KEY`, `APP_PASSWORD`,
   `APP_SECRET`.
5. Deploy. Visit the app URL, log in with `APP_PASSWORD`, and link your bank.

## Author

**Dayan Kijege** — [github.com/djrk935](https://github.com/djrk935)

## Accessibility & performance

Glass effects use a `@supports` fallback for browsers without `backdrop-filter`,
all motion respects `prefers-reduced-motion`, financial figures stay
high-contrast, and the cash-flow chart carries an `aria-label` summary.
