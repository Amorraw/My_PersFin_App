# Development Timeline — Canadian Personal Finance App

A chronological record of how the **My_PersFin_App** project evolved from its
first commit (March 6, 2026) to its current production-ready state
(June 9, 2026), based on the project's 58-commit Git history. The work spans
roughly 3 months across 9 development phases.

**Tech stack (final state):** React 19 + TypeScript + Vite (web), Node.js +
Express 5 + TypeScript + MongoDB/Mongoose (server), Python + FastAPI/uvicorn
(ML microservice), Passport.js session auth, Recharts, deployed to Render
(two services: app + ML).

---

## Timeline Overview

| Phase | Date(s) | Theme | Key Commits |
|---|---|---|---|
| 0 | Mar 6–7, 2026 | Project bootstrap & CSV import | `1197dafb`, `bf74f6ff` |
| 1 | Mar 15–Apr 30, 2026 | Core financial features | `eac407d5`, `e25e55ed`, `7ad8dd82` |
| 2 | May 1, 2026 | UI/UX overhaul & navigation | `63df7ecb`, `fb7f6da2`, `f073121c`, `d7fd9b8a` |
| 3 | May 2–3, 2026 | AI/ML insights & demo data | `fad274f2`, `c2115b70`, `273e19d7`, `b3a55d7b` |
| 4 | May 7, 2026 | CSS consistency, PDF import, first Render deploy | `3c1d6bf9` → `80cf774f` (12 commits) |
| 5 | May 10, 2026 | Data integrity & registered account tracking | `2822ed4d`, `9d6bbabe` |
| 6 | May 17, 2026 | Demo profile overhaul & bug squashing | `819a3d76` → `40824a02` (9 commits) |
| 7 | Jun 8, 2026 | ML model improvements, refactor & testing | `14e42145` → `b8f75c90` (7 commits) |
| 8 | Jun 9, 2026 | Production hardening & security review (final) | `947ff280` → `43a61de9` (12 commits) |

---

## Phase 0 — Project Bootstrap & CSV Import (Mar 6–7, 2026)

**What happened**
- `1197dafb` — *First Commit of Enhanced Starter Code.* Initial scaffold:
  Express/TypeScript server, React/Vite frontend, MongoDB models, session
  auth, base routes for accounts, transactions, budgets, debts, analytics.
- `bf74f6ff` — *Implemented CSV file upload*, except credit-card statement
  formats. Added auto-categorization logic for imported transactions.

**Issues & lessons**
- The initial commit included the entire `node_modules` tree (13,042 files),
  which would later force a large history clean-up (see Phase 8). **Lesson:**
  set up `.gitignore` *before* the first commit, not after.
- Credit-card statement CSVs were deferred because their column layouts
  differ significantly from chequing/savings exports — an early sign that
  bank-statement parsing would need a flexible, format-detecting importer
  rather than a single fixed schema.

---

## Phase 1 — Core Financial Features (Mar 15 – Apr 30, 2026)

**What happened**
- `eac407d5` (Mar 15) — Implemented Debt management, Budget management,
  Investment tracking, Tax Strategy, and Financial Planning modules (93 files,
  ~28K lines). This was the single largest "feature batch" commit of the
  early project.
- `e25e55ed` (Apr 26) — Further financial implementation/refinement (804
  lines).
- `7ad8dd82` (Apr 30) — Added "Forgot Password" / "Logout" flows and other
  account-related enhancements.

**Issues & lessons**
- A 6-week gap between `eac407d5` and `e25e55ed` suggests the financial
  domain logic (avalanche/snowball debt payoff, tax strategy calculations)
  required significant design/research time before implementation could
  continue — Canadian-specific tax rules (RRSP/TFSA/FHSA, etc.) are not
  "standard" finance-app boilerplate and needed careful modeling.
- Bundling five major feature areas (Debt, Budget, Investment, Tax, Planning)
  into one commit made it hard to isolate regressions later. **Lesson carried
  forward:** later phases still tend toward large multi-feature commits, but
  the project increasingly relies on small, targeted fix commits once issues
  surface (see Phases 4, 6, 8).

---

## Phase 2 — UI/UX Overhaul & Navigation (May 1, 2026)

**What happened** — four commits on a single day, evolving the UI rapidly:
- `63df7ecb` — Implemented display styles for several features, added
  "Forgot Password" UI/functions, and reworked header content/placement.
- `fb7f6da2` — Reorganized pages into financially-meaningful groupings and
  added a collapsible left sidebar (collapsed by default).
- `f073121c` — Added graphs, charts, and visual summary cards across groups
  and dashboards (Recharts-based).
- `d7fd9b8a` — "Phase A": predictive/analytic forecasting features that do
  **not** rely on ML (rule-based projections), laying groundwork before the
  ML insights phase.

**Issues & lessons**
- `63df7ecb` touched 376 files and added ~278K lines — almost certainly
  another instance of build artifacts or `node_modules` changes being swept
  into a feature commit, reinforcing the need for the later `.gitignore`
  clean-up.
- Doing navigation restructuring (`fb7f6da2`) *before* finishing chart/visual
  work (`f073121c`) on the same day shows an iterative "structure first, then
  populate" approach — grouping pages first made it easier to decide where
  new dashboards/charts belonged.
- Building non-ML predictive features first (`d7fd9b8a`) gave the app a
  working forecasting baseline that the ML phase could later be compared
  against / fall back to.

---

## Phase 3 — AI/ML Insights & Demo Data (May 2–3, 2026)

**What happened**
- `fad274f2` — Implemented the AI/ML Insights module (introduced the
  Python ML microservice referenced later in `render.yaml`/`python-ml`).
- `c2115b70` — Added "Everyday Accounts" setup under the Accounts tab.
- `273e19d7` — Built a demo-data population feature generating **10 distinct
  Canadian personal-finance profiles** (e.g., young professional, family,
  retiree-type archetypes) for demo/testing purposes.
- `b3a55d7b` — Added automatic detection/reload of transactions and
  detection of debts, bills, recurring charges, etc., surfaced via a
  dashboard "Run All Analysis" button.

**Issues & lessons**
- Introducing a separate Python ML service alongside the Node/Express API
  established a **two-service architecture** early — a decision that later
  required its own deployment config, CORS rules, and a "trailing slash"
  routing fix (Phase 8).
- Creating 10 hand-built demo profiles was valuable for showcasing the app,
  but it created a maintenance burden: every later schema change (new
  account types, FHSA/RESP/TFSA pages, 3-year history, etc.) had to be
  re-applied to all profiles. This complexity is exactly what Phase 6 later
  collapsed down to a single demo account.
- "Run All Analysis" centralizing recurring/debt/bill detection into one
  action was a good UX simplification, but it also meant analysis bugs would
  now surface app-wide from a single entry point — increasing the blast
  radius of any detection-logic bug (relevant to the NaN issues fixed later).

---

## Phase 4 — CSS Consistency, PDF Import & First Render Deploy (May 7, 2026)

**What happened** — 13 commits on one day; this was the first attempt to get
the app **deployed to Render**.

- `3c1d6bf9` — Worked toward a consistent overall CSS theme; began PDF
  upload support and fixed account/transaction reading correctness (952
  files, ~309K lines — again indicates repository bloat from build output).
- `bd7e9a59` — Added Render deployment config (`render.yaml`).
- `cb13540e` → `80cf774f` (11 commits) — A rapid-fire sequence of build and
  runtime fixes required to get the app actually running on Render:
  - `cb13540e` — Render's build needed devDependencies installed for
    `tsc`/`vite` compilation.
  - `07172070` — Multiple TypeScript build errors: disabled
    `noUnusedLocals`/`noUnusedParameters`, fixed Recharts v3 `Formatter`
    types (`v`/`name` now allow `undefined`), fixed chart data prop types,
    added a missing `EmployerPensionMonthly` field, removed a `RadialBar`
    `data` prop that no longer exists in Recharts v3.
  - `c09da964`, `4c0401d4`, `6cf8b2ef` — More chart-data type casts
    (`ComparisonBarChart`, Dashboard chart data, eventually a double
    `as unknown as` cast) to satisfy strict TS on Render's build.
  - `1b48d7a0` — Fixed an `ObjectId`/`string` type mismatch in
    `clearDemoUsers`.
  - `7a3b6460` — **Express 5** upgraded `path-to-regexp` to v8, breaking the
    SPA catch-all route (`*` → `/{*splat}`).
  - `c56aef33` — Static files were returning 500s because they were
    registered *after* the error handler; reordered middleware to
    `static → CORS → session/passport → API routes → SPA fallback → error
    handler`.
  - `ba98088b` — `fetch()` with `credentials: include` sends an `Origin`
    header even for same-origin requests; allowed the app's own Render URL
    in CORS via `RENDER_EXTERNAL_URL`.
  - `d18a47b9`, `80cf774f` — Added a temporary `/api/setup/seed-demo`
    endpoint to populate demo users directly in MongoDB Atlas; had to fix it
    because `main()` was auto-executing on dynamic import (disconnecting
    Mongoose and killing the live server) and `PROFILES` wasn't exported.

**Issues & lessons** (the most concentrated debugging session of the
project)
- **Local dev ≠ production build.** Most of these 11 fix commits stem from
  the gap between a working `vite dev`/`ts-node` setup and a strict
  production `tsc` + `vite build`. Library major-version differences
  (Recharts v3, Express 5) only surfaced under the production build/runtime.
- **Library upgrades have hidden breaking changes.** Recharts v3 changed
  `Formatter` typings and removed `RadialBar`'s `data` prop; Express 5
  changed wildcard route syntax via `path-to-regexp` v8. Both required
  source-level fixes, not just config tweaks.
- **Middleware ordering matters in Express.** Static file serving must
  precede session/error-handling middleware, or unrelated session-store
  issues cascade into 500s on completely static assets.
- **CORS + same-origin cookies is subtle.** `credentials: 'include'` sends
  `Origin` even for same-origin calls, so the deployed app must allow-list
  *its own* URL — solved cleanly using Render's auto-injected
  `RENDER_EXTERNAL_URL`.
- **One-off seed/admin endpoints are dangerous if not guarded.** The seed
  endpoint's module had a top-level `main()` that ran `mongoose.disconnect()`
  on *any* import — including being imported by the running server —
  killing the DB connection. **Lesson:** scripts meant to run standalone must
  guard their entry point (`if (require.main === module)`), especially if a
  route handler might dynamically import them.
- This phase's commit messages explicitly flag `Co-Authored-By: Claude
  Sonnet 4.6`, marking the point where AI-assisted debugging became a
  routine part of the workflow for build/deploy issues.

---

## Phase 5 — Data Integrity & Registered Account Tracking (May 10, 2026)

**What happened**
- `2822ed4d` — Fixed data-propagation bugs throughout the app; standardized
  amount rendering to red/green with explicit +/− signs; added new
  investment/tax tracking pages: **FHSA, RESP, TFSA, and RRSP** trackers
  under their appropriate categories (35 files, ~3.2K lines).
- `9d6bbabe` — Fixed a TypeScript error in `RESPTracker` by widening a
  `planType` string literal to a union type for the Render build.

**Issues & lessons**
- Adding four new Canadian-specific account/tax tracking pages (FHSA, RESP,
  TFSA, RRSP) in one pass shows the financial domain model maturing toward
  full Canadian tax-advantaged account coverage — a key differentiator for a
  "Canadian" personal finance app vs. generic templates.
- The recurring pattern of "feature commit → immediately followed by a
  narrow TS-build-fix commit" (seen again here with `9d6bbabe`) suggests
  Render's stricter TS compilation continued to catch issues that local dev
  didn't. **Lesson reinforced:** run the production `tsc` build locally
  before pushing, to catch literal-type/union issues earlier.

---

## Phase 6 — Demo Profile Overhaul & Bug Squashing (May 17, 2026)

**What happened** — 9 commits on one day, consolidating and debugging the
demo system and several UI rendering issues:
- `819a3d76` — Extended seed history from 24 to 36 months (3 years) for all
  10 demo profiles; added `DemoSnapshot` model + `demoProfileIndex` on
  `User`; new endpoints `/api/demo/activate`, `/regenerate`, `/reset`,
  `/clear` letting **any logged-in user** load/reset a demo financial
  profile; added a red "DEMO ONLY" header bar.
- `6469cee3` — Simplified demo login down to a **single shared account**
  (`user_test@demo.com` / `Demo1234!`), replacing the 10 separate demo
  logins; cleaned up legacy `user_test1-10` accounts.
- `2142b83e` — A broad batch of changes (23 files, ~1.5K lines).
- `9fd3fc1f` — Fixed a Recharts v3 `ResponsiveContainer` bug where it
  reports `width(-1)/height(-1)` inside flex parents without
  `min-width: 0`; wrapped every `ResponsiveContainer` app-wide in a
  `{ width: '100%', minWidth: 0 }` div; fixed `MiniSparkline` similarly.
- `2fa8fa68` — Fixed card-layout issues.
- `8cc2cf85` — Committed seeding for the new `user_test@demo.com`
  credentials.
- `55e99c6b` — Fixed a **`$NaN`** display bug: `netWorthTrend` was returning
  an array of snapshots instead of a scalar delta (JS coerces a multi-element
  array to `NaN`). Fixed to compute `newest - previous`; added `isFinite`
  guards to all four `ChartTheme` formatters (`fmtCAD`, `fmtMoney`,
  `fmtCADShort`, `fmtPct`) plus `.toFixed()` calls for savings rate, debt
  ratio, and emergency-fund months.
- `2cb1406f` — Fixed remaining NaN-value renderings app-wide.
- `bf99e2d7` — Reworked the Accounts page to a fixed 6-column card grid
  (1280px container, responsive breakpoints at 1100/768/480px), shortening
  the "Delete" button to "Del" to avoid overflow.
- `a9983719` / `40824a02` — Fixed Passport's `deserializeUser`: when a
  session held a stale user ID no longer in the DB, calling
  `done(null, undefined)` threw "Failed to deserialize user out of session";
  changed to `done(null, false)` so Passport silently clears the session
  instead of erroring.

**Issues & lessons**
- **Demo-data complexity reduction.** Maintaining 10 separate demo profiles
  (introduced in Phase 3) became unsustainable; consolidating to one
  account with a "load any profile" mechanism (`/api/demo/activate`)
  preserved the showcase value while drastically cutting maintenance
  overhead. **Lesson:** prefer *one account, many loadable templates* over
  *many hardcoded accounts*.
- **`NaN` propagation is a systemic risk in financial UIs.** A single
  function returning the wrong shape (`array` vs `scalar`) silently became
  `$NaN` in the UI due to JS type coercion. The fix wasn't just the one bug —
  it was adding **`isFinite` guards to all shared formatters**, turning a
  one-off bug fix into a defensive app-wide invariant ("never display NaN to
  a user, ever").
- **Third-party chart libraries need defensive wrappers.** The Recharts
  `ResponsiveContainer` -1/-1 sizing bug inside flex layouts had to be fixed
  *everywhere* the component was used — a good case for a shared wrapper
  component going forward rather than per-page fixes.
- **Auth edge cases need explicit handling.** Stale session cookies pointing
  to deleted users are inevitable with a demo-reset feature (`/api/demo/clear`
  removes users that may still have active sessions). Passport's
  `done(null, false)` contract for "no such user" must be honored, not
  `undefined`.

---

## Phase 7 — ML Model Improvements, Refactor & Testing (Jun 8, 2026)

**What happened**
- `14e42145` — ML/AI insight changes: adjusted financial input data, extended
  prediction horizon, improved the underlying model and its plotting/output
  for usefulness (net **-6,737 lines**, i.e., significant simplification/
  cleanup of the ML pipeline).
- `694e4a08` — Added logs (`python-ml/ml.log`, `ml.err`).
- `43c22b7c` — Refactored code and commented out dead/experimental code
  (117 files).
- `406854cb` — Committed staged changes (752 lines, 2 files — likely large
  config/lock files).
- `7036d63b` — Merged branch `feature/refrag` into `main`.
- `b7443e81` — Implemented unit testing: **Jest + ts-jest** for the server
  (with a mock DB) and **Vitest** for the web frontend.
- `b8f75c90` — Merged branch `feature/implement_test_code` into `main`.

**Issues & lessons**
- This is the first phase to use **feature branches and merge commits**
  (`feature/refrag`, `feature/implement_test_code`), marking a shift from
  direct-to-`main` commits toward a slightly more structured workflow as the
  codebase matured.
- Reducing the ML insight code by ~6,700 lines while *improving* prediction
  length and model quality suggests the original ML implementation was
  over-engineered or contained significant dead code — **simplifying often
  improves both maintainability and output quality simultaneously.**
- Introducing a test suite (Jest/ts-jest + Vitest) this late (after ~50
  commits) meant tests were retrofitted onto an already-large codebase rather
  than grown alongside it. A mock-DB approach for server tests was chosen to
  avoid requiring a live MongoDB instance in CI — a sensible call but one
  that needs the mocks kept in sync with real schema changes going forward.
- `b7443e81`/`b8f75c90` both show **9,030 files changed / ~937K insertions**,
  almost certainly `node_modules` again — directly motivating the `.gitignore`
  clean-up that follows immediately in Phase 8.

---

## Phase 8 — Production Hardening & Security Review (Jun 9, 2026, final)

**What happened** — 12 commits, the final push to production-readiness:
- `947ff280` — Added root `.gitignore` to stop committing
  `.env`/`node_modules`/logs; **removed `server/.env` from git tracking**
  (kept locally, never pushed again); fixed `render.yaml` env-var names
  (code read `SMTP_*` but `render.yaml` had `EMAIL_USER`/`EMAIL_PASS`); split
  config into non-secret static values vs. `sync: false` secrets
  (SMTP, Plaid).
- `d8c4e901` — Prepared additional online parameters and general deployment
  readiness troubleshooting.
- `61e48488` — Removed a dead `noUnusedLocals` TS flag line causing
  declared-but-unused binding errors.
- `3942454d` — Excluded the test directory from the production `tsc` build.
- `6983553e` — Fixed an ML service **trailing-slash routing** issue.
- `265fb2e7` — First round of production-review fixes (**851 files / -288K
  lines** — the big history clean-up from removing tracked
  `node_modules`/build artifacts).
- `63b962de` — Second round of production-review fixes.
- `41d7fd20`, `10eb1267` — Extensive troubleshooting of the **PDF upload →
  "Preview Transactions"** flow specifically for **TD Canada Trust** bank
  statement PDFs, following an earlier PDF-parsing library upgrade.
- `076c1c7a` — Added an **Edit button** to the "Preview Transactions" list so
  users can correct parsed transactions before import.
- `e5c2e6d6` — Pass over responsive-design CSS for all common screens.
- `43a61de9` (final commit) — **Cybersecurity and threat-vulnerability
  remediation:**
  - Added `express-rate-limit` (rate limiting on sensitive endpoints).
  - Added `server/src/utils/crypto.ts` and
    `server/src/scripts/encryptPlaidTokens.ts` — encrypting stored Plaid
    access tokens at rest.
  - Hardened `auth.ts` (61-line change), `passport.ts`, `User.ts`,
    `BankConnection.ts`, `plaid.ts`, `import.ts`, `notifications.ts`,
    `recurring.ts`, `reports.ts`, `accountTypes.ts`.
  - Frontend tweaks to `Login.tsx`, `Reports.tsx`, `ResetPassword.tsx`
    (likely input validation / error-message hardening).

**Issues & lessons**
- **Secrets management was reactive, not proactive.** `.env` was tracked in
  git until `947ff280` (commit #51 of 58) — a real risk if the repo had a
  remote origin earlier. **Lesson:** `.gitignore` for secrets/build output
  must be the *first* commit of any project, not a late clean-up.
- **Config drift between code and infrastructure.** `render.yaml` had used
  `EMAIL_USER`/`EMAIL_PASS` while the code read `SMTP_*` — a mismatch that
  would only fail at runtime in production, not at build time. **Lesson:**
  env-var names should be defined once (e.g., a shared schema/zod config
  validator) and referenced by both app code and IaC.
- **Repository bloat compounds.** By Phase 8 the repo had accumulated
  multiple full `node_modules` commits (Phases 0, 2, 4, 7). The `265fb2e7`
  clean-up removing ~288K lines shows how expensive it is to retrofit a
  `.gitignore` after the fact (history remains bloated even if `HEAD` is
  clean, unless history is rewritten).
- **Real-world PDF parsing is hard and bank-specific.** Two dedicated
  commits were needed just for **TD Canada Trust** PDF statements after a
  PDF-parsing library upgrade — a reminder that "PDF import" really means
  "many small per-bank parsers," and an Edit step in "Preview Transactions"
  is essential as a safety net for parser mistakes.
- **Security review as a final gate.** Rate limiting and encryption-at-rest
  for Plaid tokens were added only in the *last* commit. This worked here
  because the app hadn't gone live with real user data yet, but for any app
  handling real financial credentials, **encryption-at-rest and rate
  limiting should be part of the initial auth/integration design**, not a
  pre-launch checklist item.
- Ending the project on a security-hardening commit is a strong practice —
  it signals the codebase was treated as "launch candidate" by the final
  commit, not just "feature complete."

---

## Cross-Cutting Lessons Learned (Summary)

1. **`.gitignore` first, always.** Four separate phases (0, 2, 4, 7)
   accidentally committed `node_modules`/build output, requiring a dedicated
   history clean-up (Phase 8) — entirely avoidable with a `.gitignore` in the
   first commit.
2. **Production builds catch what dev builds miss.** A large fraction of all
   "fix" commits (Phases 4, 5, 8) exist purely because Render's strict `tsc`
   + production `vite build` surfaced type errors and library-version
   incompatibilities (Recharts v3, Express 5) that local `npm run dev` never
   hit. Run the exact production build command locally before deploying.
3. **Defensive formatting beats one-off fixes.** The `$NaN` bug (Phase 6)
   was fixed once at the root cause *and* once defensively across all shared
   formatters — a pattern worth repeating for any "renders garbage to the
   user" class of bug.
4. **Demo/test data should be minimal and centralized.** Going from 10
   hardcoded demo accounts to 1 account + loadable profile templates (Phase
   6) cut maintenance cost without losing functionality — a good default for
   future demo-data design.
5. **Security and secrets hygiene belongs at the start, not the end.**
   `.env` tracking, encryption-at-rest for third-party tokens (Plaid), and
   rate limiting were all retrofitted in the final commits. They worked out
   here, but represent the highest-risk "technical debt" category if a
   project ever skips the final hardening pass.
6. **Bank statement parsing (CSV and PDF) is an ongoing, bank-specific
   effort.** From the very first commit (CSV, "except CC files") to the very
   last days (TD Canada Trust PDF parsing + manual Edit step), import
   fidelity required continuous, incremental, bank-by-bank investment.
7. **Feature branches arrived late but helped.** The two merge commits in
   Phase 7 (`feature/refrag`, `feature/implement_test_code`) were the first
   use of branches — introducing them earlier could have made the large,
   risky refactor/testing changes easier to review in isolation.

---

## Final Architecture Snapshot

- **Web** (`web/`): React 19 + TypeScript + Vite, React Router, Recharts,
  date-fns. Pages cover Dashboard, Accounts, Transactions, Budgets, Debts,
  Investments (FHSA/RESP/TFSA/RRSP), Tax Strategy, Financial Planning, AI/ML
  Insights, Demo Profiles, Reports, and Auth (incl. Forgot/Reset Password).
- **Server** (`server/`): Node.js + Express 5 + TypeScript + MongoDB/Mongoose,
  Passport.js session auth, Multer + csv-parse + PDF parsing for imports,
  Plaid integration (tokens encrypted at rest), rate limiting via
  `express-rate-limit`, Jest/ts-jest test suite with mock DB.
- **ML service** (`python-ml/`): Python + FastAPI/uvicorn, deployed as a
  separate Render web service (`persfin-ml`), providing AI/ML financial
  insights and forecasts consumed by the web app.
- **Deployment** (`render.yaml`): Two Render services — `persfin-app`
  (builds web + server, serves the React build as static files from
  Express) and `persfin-ml` (Python service). Secrets (Mongo URI, SMTP
  creds, Plaid creds, session secret) managed via Render env vars, not
  source control.
