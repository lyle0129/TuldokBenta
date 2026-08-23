# Requirements: Environment & Secrets Groundwork

## Introduction

Every later ticket in this program needs configuration that does not exist yet: signing
secrets for JWTs, a one-time super-admin seed, and the `LEGACY_UNAUTH` cutover flag. This
ticket establishes all of it up front, documents it, and makes the backend fail loudly at
boot rather than silently insecurely when a required secret is missing.

It also settles the standing question about the existing shared admin password.

### Findings that shaped this ticket

A repository audit was run before writing it, and two commonly-assumed problems turned out
**not** to exist:

- **No `.env` file has ever been committed.** `git rev-list --all --objects -- "*.env"`
  returns nothing. Only `webapp/tuldokbenta_web/.env.example` is tracked. The root
  `.gitignore` already carries `.env`, and `backend/.gitignore` does too.
- **`dist/` is not tracked.** `webapp/tuldokbenta_web/.gitignore` ignores it and
  `git ls-files` confirms zero tracked files under it.

So there is no history rewrite to perform and no credential rotation forced by git. What
*is* real: `VITE_ADMIN_PASSWORD` is a `VITE_`-prefixed variable, which means Vite inlines it
verbatim into the production JavaScript bundle. Anyone who has ever loaded the app has been
served that password in plain text. It is compromised by construction, and this ticket
records that fact so nobody reuses it as a real account password in ticket 03.

The one genuine gap is that `backend/` has no `.env.example`, so the variables the server
needs are undocumented.

## Glossary

- **Access Secret** — `JWT_ACCESS_SECRET`, the HMAC key signing short-lived access tokens.
- **Refresh Secret** — `JWT_REFRESH_SECRET`, a *separate* HMAC key signing refresh tokens.
- **Seed Credentials** — `SEED_SUPERADMIN_USERNAME` / `SEED_SUPERADMIN_PASSWORD`, consumed
  once by ticket 03 to create the first super admin.
- **Legacy Window** — the period during which `LEGACY_UNAUTH=true` is set. See
  [the overview](../00-overview.md).
- **Config_Module** — a new `backend/config/env.js` that reads, validates and exports
  configuration.

---

## Requirements

### Requirement 1: A documented backend environment contract

**User Story:** As a developer deploying this backend, I want one file that lists every
environment variable the server reads, so that I do not discover a missing one from a
runtime crash in production.

#### Acceptance Criteria

1. THE repository SHALL contain `backend/.env.example` listing every variable the backend
   reads, each with a comment describing its purpose and whether it is required.
2. THE `backend/.env.example` file SHALL contain only placeholder values and SHALL NOT
   contain any real credential.
3. THE `backend/.env.example` file SHALL document: `PORT`, `DATABASE_URL`, `NODE_ENV`,
   `API_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_TTL`,
   `REFRESH_TOKEN_TTL`, `LEGACY_UNAUTH`, `LEGACY_SHOP_ID`, `SEED_SUPERADMIN_USERNAME` and
   `SEED_SUPERADMIN_PASSWORD`.
4. THE `webapp/tuldokbenta_web/.env.example` file SHALL be updated to remove
   `VITE_ADMIN_PASSWORD` no earlier than ticket 07, and SHALL carry a comment marking it as
   deprecated until then.

---

### Requirement 2: Centralised, validated configuration

**User Story:** As a developer, I want configuration read and checked in one place, so that
a missing signing secret stops the server at boot instead of producing tokens anyone can
forge.

#### Acceptance Criteria

1. THE Config_Module SHALL read every environment variable the backend uses and export them
   as named, typed values.
2. WHEN the server starts, THE Config_Module SHALL validate that `DATABASE_URL` is present.
3. WHEN the server starts AND `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` is missing or
   shorter than 32 characters, THE Config_Module SHALL log a descriptive error and exit with
   a non-zero status.
4. THE Config_Module SHALL NOT apply a default value to either signing secret under any
   circumstances.
5. IF `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` hold the same value, THEN THE
   Config_Module SHALL log an error and exit with a non-zero status.
6. THE Config_Module SHALL treat `LEGACY_UNAUTH` as true only for the exact string `"true"`,
   and as false for every other value including unset.
7. THE Config_Module SHALL default `ACCESS_TOKEN_TTL` to `"60m"` and `REFRESH_TOKEN_TTL` to
   `"30d"` when they are not set.
8. THE Config_Module SHALL default `LEGACY_SHOP_ID` to `1`.
9. THE Config_Module SHALL be imported after `.env` has been loaded and before any module
   that reads configuration, preserving the existing import ordering discipline in
   `backend/server.js`. Because ES module imports are all evaluated before the importing
   module's own statements, `backend/server.js` SHALL load dotenv by side-effect import
   (`import "dotenv/config"`) rather than by calling `dotenv.config()`.
10. THE Config_Module SHALL NOT import dotenv itself, so that it validates exactly the
    environment it is given.

---

### Requirement 3: Secrets are generated, not invented

**User Story:** As an operator, I want the signing secrets to be genuinely random, so that a
guessable secret cannot be used to mint an admin token.

#### Acceptance Criteria

1. THE ticket documentation SHALL provide a copy-pasteable command that generates a
   cryptographically random secret of at least 32 bytes.
2. THE Access Secret and the Refresh Secret SHALL be generated independently of one another.
3. THE generated secrets SHALL be set on the backend host's environment and SHALL NOT be
   written to any file tracked by git.

---

### Requirement 4: The existing shared password is treated as compromised

**User Story:** As the shop owner, I want it stated plainly that the old shared password can
no longer be trusted, so that it is not quietly carried forward into a real account.

#### Acceptance Criteria

1. THE ticket documentation SHALL record that the value of `VITE_ADMIN_PASSWORD` is exposed
   in every production bundle ever served and is therefore compromised.
2. THE value of `VITE_ADMIN_PASSWORD` SHALL NOT be used as the password of any account
   created in ticket 03 or later.
3. THE Seed Credentials SHALL be a newly chosen password, and the account they create SHALL
   be flagged `must_change_password = TRUE` by ticket 03.
4. THE `VITE_ADMIN_PASSWORD` variable and the code reading it SHALL remain untouched by this
   ticket, and SHALL be removed in ticket 07 when the real login replaces the gate.

---

### Requirement 5: Repository hygiene is confirmed, not assumed

**User Story:** As a reviewer, I want the "are secrets in git?" question answered with
evidence, so that it is not re-litigated in every later ticket.

#### Acceptance Criteria

1. THE ticket SHALL verify, by command, that no `.env` file exists anywhere in the git
   history.
2. THE ticket SHALL verify, by command, that no file under `webapp/tuldokbenta_web/dist/` is
   tracked.
3. IF either verification finds tracked secrets, THEN THE ticket SHALL halt and the
   credential SHALL be rotated before any further ticket proceeds.
4. THE root `.gitignore` SHALL be left unchanged, since it already ignores `.env` and
   `.kiro`.
