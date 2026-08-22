# Implementation Plan: Environment & Secrets Groundwork

## Overview

Add a validated configuration module and a documented environment contract to the backend.
Purely additive — no existing endpoint changes behaviour, and the frontend is untouched.

## Tasks

- [ ] 1. Confirm repository hygiene before anything else
  - Run `git rev-list --all --objects -- "*.env"` and confirm it returns nothing
  - Run `git ls-files webapp/tuldokbenta_web/dist` and confirm it returns nothing
  - If either returns results, STOP: rotate the exposed credential before continuing with
    any ticket in this program
  - Record the result in the PR description so it is not re-investigated later
  - _Requirements: 5.1, 5.2, 5.3_

- [ ] 2. Generate the two signing secrets
  - Run `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
    twice, producing two independent values
  - Set `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` on the backend host's environment
  - Add the same two values to the local `backend/.env` (gitignored) for development
  - Do not commit either value anywhere
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 3. Create `backend/config/env.js`
  - Export a single frozen `env` object as a named export
  - Read and validate per the design: `DATABASE_URL` required; both signing secrets required
    and at least 32 characters; the two secrets must differ
  - On any failure, `console.error` a message naming the offending variable and call
    `process.exit(1)` — matching the failure convention already used in `config/initDB.js`
  - Compare `LEGACY_UNAUTH` against the exact string `"true"`; every other value, including
    unset, is false
  - Apply defaults: `ACCESS_TOKEN_TTL="60m"`, `REFRESH_TOKEN_TTL="30d"`, `LEGACY_SHOP_ID=1`,
    `port` from `PORT` falling back to `5001`
  - Expose the seed credentials as `null` when unset
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [ ] 4. Wire `env.js` into `backend/server.js`
  - Import it immediately after `dotenv.config()` and before `express` and the routers
  - Leave the `import "./config/timezone.js"` line first, with its existing comment intact —
    that ordering is load-bearing and must not be disturbed
  - Replace `const PORT = process.env.PORT || 5001` with `env.port`
  - Replace `process.env.NODE_ENV === "production"` in the cron guard with
    `env.nodeEnv === "production"`, preserving the existing inline comment
  - _Requirements: 2.9_

- [ ] 5. Create `backend/.env.example`
  - Write the full contract from the design, grouped under `Server`, `Auth`, `Cutover` and
    `One-time super admin seed` headings
  - Every variable carries a comment saying what it does and whether it is required
  - Placeholder values only — no real credential, no real connection string
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 6. Mark `VITE_ADMIN_PASSWORD` as deprecated
  - In `webapp/tuldokbenta_web/.env.example`, add a comment above `VITE_ADMIN_PASSWORD`
    noting that it is inlined into the production bundle, is therefore compromised, and is
    removed in ticket 07
  - Do **not** delete the variable or change any code that reads it — the password gate is
    still the only access control the app has until ticket 07 lands
  - _Requirements: 1.4, 4.1, 4.4_

- [ ] 7. Record the compromised-password decision
  - Add a short note to this ticket's PR description, and to the ticket 03 spec's
    prerequisites, stating that the current shared password must not be reused as the seed
    super admin's password or any other account's
  - _Requirements: 4.2, 4.3_

- [ ] 8. Add tests for `config/env.js`
  - Create `backend/config/env.test.js` using Node's built-in test runner, matching the style
    of the existing `backend/utils/*.test.js` files
  - Because the module validates at import time and calls `process.exit`, spawn a child
    process per case with a controlled environment and assert on exit code and stderr
  - Cover every row of the Testing Strategy table in the design, including the
    `LEGACY_UNAUTH=false` and `LEGACY_UNAUTH=TRUE` cases — an inverted read of that flag is
    the most dangerous defect this ticket can ship
  - _Requirements: 2.3, 2.5, 2.6, 2.7_

- [ ] 9. Verification checkpoint
  - `npm test` in `backend/` passes
  - `npm run dev` in `backend/` starts, and `GET /api/health` returns `{ status: "ok" }`
  - With `JWT_ACCESS_SECRET` unset, the process exits non-zero with a message naming the
    variable, and does so *before* `initDB()` logs anything
  - The frontend still builds and behaves exactly as before: `npm run build` and `npm test`
    in `webapp/tuldokbenta_web/` both pass, and the password gate still works
  - `git status` shows only: two new backend files, one modified `server.js`, one modified
    `webapp/tuldokbenta_web/.env.example`
  - Ask the user if any questions arise before closing out

## Notes

- ES Modules throughout, matching `"type": "module"` in `backend/package.json`.
- No new dependencies. `jsonwebtoken` and `bcrypt` arrive in ticket 03, not here.
- Nothing in this ticket is reachable by the frontend, so it can be deployed at any time
  independently of the rest of the program — as long as the two secrets are set on the host
  first, or the server will refuse to boot.
