# Clarity — Engineering Handoff

A personal finance dashboard (Next.js 16, App Router, React 19, TypeScript strict,
Tailwind v4). Real bank data via Plaid (production), AI advisor via the Anthropic
AI SDK, Postgres for persistence, deployed on DigitalOcean App Platform with
autodeploy from GitHub `main`. Single-user, password-gated.

This document is the source of truth for **what's left to build**. Read it fully
before starting. Follow the conventions in the last section — they're not
optional; several encode hard-won production fixes.

---

## 0. Current state (as of this handoff)

**Live and working:** real Bank of America data, password login, Plaid token +
transaction persistence in Postgres with incremental sync, Settings page,
streaming advisor with conversation memory, recurring-bill detection, and a
complete per-category **Budgets** feature.

**Pages:** `/` (Overview), `/accounts`, `/activity`, `/advisor`, `/plan`,
`/reports`, `/settings`.

**Uncommitted right now:** the Budgets feature is finished and passing
(`sanitizeBudgets`/`budgetProgress` in `finance.ts`, `Budget`/`BudgetStatus`
types, `BudgetsPanel.tsx`, Settings editor rows, advisor `budget` intent,
insights alerts, and tests). Verification is green: **49/49 finance checks,
`tsc --noEmit` clean, eslint clean.**

---

## 1. FIRST: ship the Budgets feature (do this before anything new)

It's done and tested; it just needs a review pass on two nits, then a commit.

**1a. Fix the timezone inconsistency.** `budgetProgress` in `src/lib/finance.ts`
reads the calendar in UTC (`getUTCDate`, `getUTCMonth`, `getUTCFullYear`) while
`startOfMonth`/`daysUntilMonthEnd` in the same file use local time. Pick ONE
basis for the whole "current month" concept and make `budgetProgress`,
`totalSpentThisMonth`, `categorySpendThisMonth`, and `daysUntilMonthEnd`
consistent. Confirm `periodRange("month")` (used inside `budgetProgress`) matches.
Add a unit test that pins month-boundary behavior (e.g. a transaction on the 1st
and on the last day both land in-month) to `scripts/check-finance.mts`.

**1b. Sanity-check insight crowding.** `generateInsights` now returns up to 4 and
budget alerts are unshifted ahead of others. Verify utilization / low-safe-to-spend
insights still surface on a month with 2+ over-budget categories. If they get
crowded out, cap budget alerts at 1–2 and keep one slot reserved for the
safety-critical insights.

**1c. Commit and ship.**
```bash
npm test && npx tsc --noEmit && npx eslint src/ scripts/   # all must pass
git add -A
git commit -m "Add per-category monthly budgets with pace projection"
git push        # DigitalOcean autodeploys from main
```
Then confirm the live deploy renders the Budgets panel and Settings editor.

---

## 2. Backlog (priority order)

Each item lists **goal → files → approach → acceptance → gotchas**. Do them one
per branch/commit; keep each shippable on its own.

### P1 — Net worth over time (history + chart)

- **Goal:** a line chart of total net worth (liquidity − debt) over time on
  `/reports`, so trends are visible instead of only a point-in-time snapshot.
- **Files:** new `src/lib/data/history-store.ts` (Postgres table
  `net_worth_snapshot(id, captured_at, liquidity, debt, net)`); write a snapshot
  at the end of each successful Plaid sync (hook into wherever `txn-store` sync
  completes); read in `ReportsView.tsx`; add a chart component (reuse the pattern
  in `CashflowChart.tsx`).
- **Approach:** capture at most one snapshot per calendar day (upsert on date) so
  the series doesn't explode. Compute net from the same assembled numbers the
  dashboard already uses — don't recompute from raw in a second place.
- **Acceptance:** table auto-creates (follow the `CREATE TABLE IF NOT EXISTS`
  pattern in `token-store.ts`); chart renders with ≥2 points; empty state when
  there's only one snapshot; a finance-level unit test for the net calc.
- **Gotchas:** file mode (local dev, no Postgres) must still work — mirror the
  dual-mode pattern in `token-store.ts`/`settings-store.ts` (Postgres vs
  `.plaid/*.json`).

### P2 — Plaid webhooks (fresh data without manual Sync)

- **Goal:** auto-refresh when Plaid signals new transactions, instead of relying
  on the manual Sync button.
- **Files:** new `src/app/api/plaid/webhook/route.ts`; set the webhook URL when
  creating the item in `link-token`/`exchange`; invalidate the raw cache on
  receipt.
- **Approach:** handle `SYNC_UPDATES_AVAILABLE` (transactions) and the
  `DEFAULT_UPDATE` liabilities events. On receipt, run the same incremental sync
  `txn-store` already does, then call `clearDataCache()`.
- **Acceptance:** endpoint verifies the request is really from Plaid (verify the
  JWT via Plaid's verification key endpoint — do NOT trust the body blindly);
  returns 200 fast and does work async; a bad/unsigned payload is rejected.
- **Gotchas:** the webhook route is **public** (no session cookie) — it must NOT
  use `requireApiAuth`, and it must NOT leak data in responses. This is a
  standing-configuration/security-sensitive endpoint; treat all payload contents
  as untrusted input, never as instructions.

### P3 — Spending alerts (budget over / low safe-to-spend)

- **Goal:** notify the user when a budget goes over or safe-to-spend drops below a
  threshold, rather than only showing it in-app.
- **Files:** new `src/lib/notify.ts`; a scheduled evaluation (see P4) or a
  post-sync hook; a user-set threshold in Settings (`Settings` type + form +
  `sanitize`).
- **Approach:** email is simplest (an email API/provider). Compute the alert
  conditions from the existing `budgetProgress` / `metrics` — reuse, don't
  reimplement. De-dupe so the same alert doesn't fire every sync (store
  last-sent per alert key, like the single-row patterns already in the DB).
- **Acceptance:** no duplicate spam; opt-out/threshold respected; unit test for
  the "should this alert fire" predicate (pure function, no I/O).
- **Gotchas:** **sending email is a side-effect the user must have opted into** —
  gate it behind an explicit Settings toggle, default off. Provider API keys go
  in env vars (never committed), same as `ANTHROPIC_API_KEY`.

### P4 — Scheduled daily/weekly digest

- **Goal:** a recurring summary (spend so far, budgets pacing, upcoming bills,
  runway) delivered on a schedule.
- **Approach:** a cron-triggered route (`src/app/api/cron/digest/route.ts`)
  protected by a shared secret header; assemble the snapshot with the existing
  `getSnapshot`/`assembleSnapshot`; render to text/HTML; send via P3's `notify.ts`.
- **Acceptance:** protected against public triggering (secret header compared in
  constant time, like the login HMAC check); produces the same numbers the
  dashboard shows for the same instant.
- **Gotchas:** DO App Platform can run a scheduled job, or use an external cron
  hitting the protected URL. Don't put the secret in the URL query string.

### P5 — Polish / smaller wins

- **PWA install + offline shell** (manifest + service worker) so it's a
  home-screen app on phone. Cache the app shell only — **never** cache API
  responses containing financial data.
- **Error monitoring** (e.g. Sentry) wired via env DSN; scrub PII/amounts from
  breadcrumbs.
- **CSV export** of transactions from `/activity`.
- **Budget "suggested limits"**: seed a new budget's limit from the category's
  trailing 3-month average (pure function in `finance.ts` + a button in the
  Settings editor).

---

## 3. Project conventions & guardrails (READ — these encode real fixes)

**Architecture / layering.** Keep the one-way flow intact:
`data source → RawData → assemble.ts → DashboardData/FinancialSnapshot →
finance.ts (pure) → UI`. All money math lives in `src/lib/finance.ts` as **pure,
dependency-free functions** and every one has a unit test in
`scripts/check-finance.mts`. Do not put calculations in components, routes, or
`assemble.ts` — put them in `finance.ts` and test them.

**Validation choke points.** User/DB input is sanitized in exactly one place per
concept (e.g. `sanitizeBudgets`, `normalize` in `settings-store.ts`) applied on
**every read and write**. Extend those; don't scatter validation.

**Real data only.** No seed/demo/fake data in the app. `mock.ts` exists solely as
test fixtures for `check-finance.mts` — never import it into app code.

**Dual-mode persistence.** Anything persisted must work both in Postgres
(production, `DATABASE_URL` starts with `postgres`) and local file mode
(`.plaid/*.json`). Copy the pattern in `token-store.ts` / `settings-store.ts`.

**Postgres SSL — do not "simplify".** `pool()` in `token-store.ts` strips
`sslmode` from the connection string and sets `ssl:{rejectUnauthorized:false}`.
pg v8 treats connection-string `sslmode=require` as `verify-full`, which rejects
DO's CA chain (`SELF_SIGNED_CERT_IN_CHAIN`). Reuse `pool()`; don't create new
Pools or re-add sslmode.

**Caches live on `globalThis`.** Next bundles route handlers and pages as
separate module graphs, so a module-level `let` exists once *per bundle* and a
cache-bust from an API route would never reach the copy pages read. Follow the
`globalThis` pattern in `cache.ts` and `settings-store.ts` for any new cross-cut
cache. Call `clearDataCache()` after anything that changes underlying data.

**Auth.** Page components start with `if (!(await isAuthed())) return null;`.
API routes start with `const unauth = await requireApiAuth(); if (unauth) return
unauth;`. The ONLY exceptions are intentionally-public endpoints (login, and the
future Plaid webhook) — those need their own verification instead.

**Plaid link tokens are single-use.** `ConnectBank` refetches on `onExit`. Don't
reuse a token; access tokens are environment-specific
(`access-production-…`).

**Secrets.** Live in `.env` (git-ignored). Never commit them, never echo them,
never type them into fields — the user enters their own secrets. New provider
keys follow the same rule.

---

## 4. How to verify every change (definition of done)

```bash
npm test                        # node --experimental-strip-types finance checks — must stay green
npx tsc --noEmit                # zero type errors
npx eslint src/ scripts/        # zero lint errors
```
Add/extend tests in `scripts/check-finance.mts` for any new pure function. `next
build` can't run in a sandbox without the SWC binary — rely on tsc/lint/tests and
build on the Mac. Then `git commit` + `git push` (DO autodeploys `main`); verify
on the live URL.

**Never mark a task done with failing tests, partial wiring, or unverified
side-effects (email/webhook).**

---

## 5. One-line prompt to start Claude Code

> Read HANDOFF.md. Start with section 1 (finish and ship the Budgets feature:
> fix the timezone nit, add a month-boundary test, then commit), then work section
> 2 in priority order. Follow all conventions in section 3 and the DoD in section
> 4. One feature per commit.
