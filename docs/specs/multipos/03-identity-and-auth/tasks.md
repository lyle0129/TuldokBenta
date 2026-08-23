# Implementation Plan: Identity Schema & Auth API

## Overview

Add users, assignments, tokens, the `/api/auth` router, and the three middlewares ticket 04
will mount. Nothing existing is modified except `initDB.js` (two new tables plus a seed) and
`server.js` (one new mount plus a startup warning).

**Prerequisite:** the current `VITE_ADMIN_PASSWORD` value is compromised — it ships inside
every production bundle — and must not be used for the seed super admin or any other account.

## Tasks

- [x] 1. Add dependencies
  - `npm install bcrypt jsonwebtoken express-rate-limit` in `backend/`
  - `npm install --save-dev fast-check` in `backend/` for the property tests
  - Note: `bcrypt` is a native module. If the deploy host's build step has trouble with it,
    switch to `bcryptjs` — the API used here is identical and the cost-factor argument is the
    same
  - Done with **`bcryptjs`**, taking that fallback up front rather than waiting for a deploy
    to fail on node-gyp. Installed `bcryptjs@3`, `jsonwebtoken@9`, `express-rate-limit@8`
    (v7+ spells the cap `limit`, not `max`) and `fast-check@4`
  - _Requirements: 3.1, 9.1_

- [x] 2. Create `backend/utils/passwords.js` and its tests
  - Export `hashPassword`, `verifyPassword`, `assertPasswordPolicy`, `normalizeUsername` and
    `DUMMY_HASH`
  - `assertPasswordPolicy` throws via the existing `badRequest` helper from
    `utils/saleItems.js`, so auth errors flow through the same `toErrorResponse` translation
    as the rest of the backend — do not introduce a second error convention
  - `DUMMY_HASH` is a real bcrypt hash of a fixed throwaway string, generated once and
    committed as a literal, used to equalise response time for unknown usernames
  - Write `passwords.test.js` covering properties P4 and P5 plus the 7-vs-8 character boundary
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 1.2_

- [x] 3. Create `backend/utils/tokens.js` and its tests
  - Export `signAccessToken`, `signRefreshToken`, `verifyAccessToken`, `verifyRefreshToken`
  - Access payload `{ sub, username, role, shops }`; refresh payload `{ sub, tv }` only
  - Sign with `env.accessSecret` / `env.refreshSecret` and the configured TTLs
  - Verification returns `null` on failure rather than throwing
  - Write `tokens.test.js` covering P1, P2 and P3, plus an expired-token case signed with a
    negative TTL
  - P2 (the two keys are not interchangeable) is the one that must not be skipped
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 4. Add `users` and `user_shops` to `initDB.js`
  - `CREATE TABLE IF NOT EXISTS users` per the design's Data Models, including the role CHECK
    constraint restricted to the three role strings
  - `CREATE TABLE IF NOT EXISTS user_shops` with the composite primary key and both cascading
    foreign keys
  - Place both after the tenancy block from ticket 02 — `user_shops` references `shops(id)`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1_

- [x] 5. Seed the first super admin in `initDB.js`
  - Only when `SELECT COUNT(*) FROM users` is 0 **and** both seed variables are configured
  - Hash the seed password with `hashPassword`; insert with `role = 'super_admin'` and
    `must_change_password = TRUE`
  - When the table is empty and the variables are not set, log a warning naming both variable
    names and continue booting
  - Never log the password itself
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 6. Create `backend/middleware/auth.js`
  - Export `requireRealAuth` (verify token, set `req.user`, 401 otherwise) and `requireAuth`
    (the legacy bypass block, then delegate to `requireRealAuth`)
  - Export `requireRole(...roles)` returning 403 on mismatch
  - The bypass condition must be **`!header && env.legacyUnauth`** — guarded on the header
    being absent, never on verification having failed. Written the other way round, every
    malformed token becomes a manager session. This is the single most security-sensitive
    line in the ticket
  - Comment the bypass block with `// Removed in ticket 12`
  - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.3, 7.5_

- [x] 7. Create `backend/middleware/shopScope.js`
  - Export `resolveShop` per the design: legacy fallback only when the actor is the synthetic
    legacy one and no header is present; otherwise parse and validate `X-Shop-Id`
  - Super admins are validated against `shops` in the database, not against the token, so a
    newly created shop is reachable without waiting for a token refresh
  - Set `req.shopId` and nothing else — this is the only value controllers will be allowed to
    scope by in ticket 04
  - Comment the legacy block with `// Removed in ticket 12`
  - _Requirements: 6.4, 6.5, 6.6, 7.2, 7.5_

- [x] 8. Write middleware tests
  - `middleware/auth.test.js` — property P6 (with the flag on, a present `Authorization`
    header never yields the legacy actor), plus: valid token populates `req.user`; missing
    token 401s with the flag off; missing token yields the legacy actor with the flag on;
    `requireRole` allows a listed role and 403s an unlisted one; `requireRealAuth` 401s on a
    missing header even with the flag on
  - `middleware/shopScope.test.js` — assigned shop resolves; unassigned 403s; missing header
    400s; non-numeric header 400s; super admin resolves an active shop and is refused an
    inactive one
  - Split into **four** files, not two: `env` freezes `legacyUnauth` at import, so one process
    can only observe one value of it, and `node --test` gives each *file* its own process.
    Hence `auth.test.js` / `auth.legacy.test.js` and `shopScope.test.js` /
    `shopScope.legacy.test.js`. The shared `req`/`res` stand-ins live in
    `middleware/httpDoubles.js`, named so the runner does not treat them as a suite
  - P6 was checked against a deliberately inverted guard (`env.legacyUnauth && !payload`) and
    both of its cases fail, so it is known to be load-bearing rather than merely green
  - _Requirements: 6.2, 6.5, 6.6, 7.3, 7.4_

- [x] 9. Create `backend/controllers/authController.js`
  - Handlers `login`, `refresh`, `me`, `logout`, `changePassword` per the design's table
  - Add a `toPublicUser(row)` helper and route every user-shaped response through it, so
    `password_hash` and `token_version` cannot leak via a `SELECT *`
  - `login`: normalise the username; when the account is missing, still run a bcrypt compare
    against `DUMMY_HASH`; return one identical 401 for unknown user, wrong password and
    inactive account; update `last_login_at` on success
  - `refresh`: re-read the user and reject on inactive or `tv` mismatch; read role and shops
    fresh from the database rather than trusting anything in the refresh token
  - `changePassword`: verify current, apply the policy, hash, clear `must_change_password`,
    bump `token_version`
  - `logout`: a deliberate no-op that exists so ticket 05 has a place to record the event —
    add a comment explaining why there is no token blacklist
  - _Requirements: 5.1–5.9, 1.5, 1.6, 3.4_

- [x] 10. Create `backend/routes/auth.js`
  - `POST /login`, `POST /refresh`, `GET /me`, `POST /logout`, `POST /change-password`
  - `/me`, `/logout` and `/change-password` mount `requireRealAuth`
  - Apply the `express-rate-limit` limiter to `/login` and `/refresh` only, 15-minute window,
    20 attempts per IP, not counting successful logins
  - Thin router with no business logic, matching the four existing route files
  - One limiter instance **each**, not one shared. The shop is behind a single public IP, so
    a shared bucket would let a tab looping on an invalidated refresh token spend the budget
    that signing in needs and lock the counter out for fifteen minutes. Verified: each route
    allows exactly 20 failures independently of the other
  - _Requirements: 5.1, 5.5, 5.7, 5.8, 5.9, 9.1, 9.2, 9.3, 9.4_

- [x] 11. Mount the auth router and warn about legacy mode
  - Add exactly one line to `server.js`: `app.use("/api/auth", authRouter)`
  - Add a startup warning when `env.legacyUnauth` is true, visible enough to not be missed in
    the deploy log
  - Change nothing else in `server.js`; every existing mount stays exactly as it is
  - **Departure:** one further line, `app.set("trust proxy", 1)`. Without it the limiter
    buckets every request under the hosting proxy's address, so Requirement 9.1's "by client
    IP" is not what it does. `1` rather than `true`, or a spoofed `X-Forwarded-For` would hop
    to a fresh bucket per guess
  - _Requirements: 7.6, 10.1_

- [x] 12. Verification checkpoint
  - `npm test` in `backend/` passes, including the new property tests
  - Run the integration table from the design's Testing Strategy against a scratch database
    with a seeded super admin — particularly: the refresh token is rejected by `/me`, and
    bumping `token_version` invalidates refresh
  - With `LEGACY_UNAUTH=true` and the **unmodified** frontend, walk all seven routes and
    confirm nothing has changed
  - Confirm `GET /api/auth/me` without a token returns 401 even with the flag on
  - Confirm no response body anywhere contains `password_hash` or `token_version`
  - `git diff` touches no existing controller, no existing route file, and no frontend file
  - Ask the user if any questions arise before closing out
  - **Done, against the same Neon branch of production ticket 02 was rehearsed on** — 14
    inventory, 7 services, 2 payment methods, 28 open sales, 6,336 closed sales, unchanged at
    the end of the run. `npm test` is 125 tests green across 31 suites, the five pre-existing
    files untouched
  - Integration: 44 checks. Every login refusal returns one identical message, and an unknown
    username costs comparable time to a known one (median 121ms vs 109ms, ratio 1.11 — the
    `DUMMY_HASH` compare is doing its job). The refresh token is refused by `/me`, an access
    token is refused by `/refresh`, a `token_version` bump refuses refresh immediately while
    the access token keeps working until it expires (R5, as documented). Changing a password
    strands the refresh token issued before it. No `password_hash` or `token_version` appeared
    in any of 37 captured response bodies
  - Rate limiting was re-run against a freshly restarted server, because 17 earlier failures
    in the same run had legitimately consumed the window: exactly 20 failures allowed on each
    of `/login` and `/refresh`, independently, with the till unaffected throughout
  - Schema: 37 further checks against `information_schema` and `pg_constraint` — the eleven
    designed columns, all three defaults, the UNIQUE on username, the three-value role CHECK
    (proved by an insert that fails with SQLSTATE 23514), the composite primary key and both
    cascading foreign keys on `user_shops`
  - The till walk ran create → pay → revert → delete with **no token**: stock, open-sale and
    closed-sale counts all returned to their starting values, and the new sale landed in shop
    1 through ticket 02's temporary default. All seven read endpoints served untokened
  - Checked with the flag **off** as well: the existing endpoints are still open, because this
    ticket mounts no middleware on them (Requirement 10.2), while `/api/auth/me` is 401 in
    both states
  - A second boot re-ran `initDB()` as a clean no-op and did **not** re-seed. The rehearsal
    accounts were deleted and `backend/.env` restored afterwards, so the branch is back to
    where ticket 02 left it plus two empty tables
  - The browser was not clicked through; every endpoint the frontend calls was exercised
    directly, as in ticket 02

## Notes

- ES Modules throughout. All new pure utilities (`tokens.js`, `passwords.js`) take their
  inputs as parameters and import neither `sql` nor Express, matching the existing discipline
  in `utils/saleItems.js` and `utils/paymentMethods.js`.
- After deploying, log in as the seeded super admin and change the password immediately —
  the account is created with `must_change_password = TRUE` for exactly this reason. Then
  unset both seed variables on the host.
- Ticket 04 mounts these middlewares. Until it does, every existing endpoint remains open
  exactly as it is today.
