# Requirements: Identity Schema & Auth API

## Introduction

The backend has no notion of a person. This ticket adds one: a `users` table with bcrypt
password hashes, a `user_shops` assignment table, JWT issuing and verification, and the
`/api/auth/*` endpoints the frontend will call in ticket 07.

It also builds the three middlewares that ticket 04 will mount — `requireAuth`,
`requireRole` and `resolveShop` — **without mounting them on any existing route**. The auth
system becomes available in this ticket and becomes mandatory in the next one. That split
means this ticket can be deployed to production while the live frontend keeps working
untouched.

Prerequisite from ticket 01: the value of `VITE_ADMIN_PASSWORD` is compromised — it has been
inlined into every production bundle ever served — and must not be used as any account's
password, including the seed super admin's.

## Glossary

- **Actor** — the authenticated user for a request, exposed as `req.user`.
- **Access Token** — a short-lived JWT (default 60m) signed with `JWT_ACCESS_SECRET`,
  carrying the actor's id, role and shop assignments.
- **Refresh Token** — a long-lived JWT (default 30d) signed with `JWT_REFRESH_SECRET`, used
  only against `/api/auth/refresh`.
- **Token Version** — an integer on the user row. Bumping it invalidates every outstanding
  refresh token for that user.
- **Assignment** — a `user_shops` row granting a user access to a shop.
- **Auth_Module** — `backend/middleware/auth.js`.
- **Scope_Module** — `backend/middleware/shopScope.js`.
- **Token_Module** — `backend/utils/tokens.js`, the pure sign/verify layer.

---

## Requirements

### Requirement 1: The `users` table

**User Story:** As a super admin, I want real accounts with hashed passwords, so that each
person using the system has their own credentials and their own identity.

#### Acceptance Criteria

1. THE DB_Init SHALL create a `users` table if it does not exist, with `id`, `username`,
   `password_hash`, `full_name`, `role`, `is_active`, `must_change_password`,
   `token_version`, `last_login_at`, `created_at` and `created_by`.
2. THE `users.username` column SHALL be UNIQUE and NOT NULL.
3. THE `users.role` column SHALL carry a CHECK constraint restricting it to exactly
   `'super_admin'`, `'manager'` or `'worker'`.
4. THE `users.is_active` column SHALL default to TRUE, `must_change_password` to FALSE, and
   `token_version` to 0.
5. THE `users.password_hash` column SHALL store a bcrypt hash and SHALL NEVER store a
   plaintext or reversibly-encoded password.
6. THE API SHALL NEVER include `password_hash` or `token_version` in any response body.

---

### Requirement 2: Shop assignments

**User Story:** As a super admin, I want to assign a user to one or more shops, so that a
manager who runs two branches can switch between them while a worker sees only their own.

#### Acceptance Criteria

1. THE DB_Init SHALL create a `user_shops` table with `user_id` and `shop_id`, a composite
   PRIMARY KEY on both, and foreign keys to `users(id)` and `shops(id)` that cascade on
   delete.
2. THE system SHALL treat a user as having access to exactly the shops named by their
   `user_shops` rows.
3. THE system SHALL treat a `super_admin` as having access to every active shop, regardless
   of their `user_shops` rows.
4. WHEN a user has no assignments and is not a `super_admin`, THE login response SHALL return
   an empty shop list and the frontend SHALL be able to detect that state.

---

### Requirement 3: Password hashing

**User Story:** As a shop owner, I want passwords stored so that a database leak does not
hand over everyone's credentials.

#### Acceptance Criteria

1. THE system SHALL hash passwords with bcrypt at a cost factor of at least 10.
2. WHEN verifying a password, THE system SHALL use a constant-time comparison provided by the
   bcrypt library and SHALL NOT compare hashes with `===`.
3. THE system SHALL reject a password shorter than 8 characters at creation time.
4. WHEN a login attempt names a username that does not exist, THE system SHALL still perform
   a bcrypt comparison against a dummy hash before responding, so that response timing does
   not reveal whether an account exists.

---

### Requirement 4: Token issuing and verification

**User Story:** As a developer, I want token handling isolated in one module, so that the
signing rules cannot drift between the places that issue and the places that check.

#### Acceptance Criteria

1. THE Token_Module SHALL export functions to sign an Access Token, sign a Refresh Token,
   verify an Access Token and verify a Refresh Token.
2. THE Access Token payload SHALL contain the user's id, username, role and the list of shop
   ids they may access.
3. THE Refresh Token payload SHALL contain the user's id and their Token Version, and SHALL
   NOT contain the role or shop list.
4. THE Access Token SHALL be signed with `JWT_ACCESS_SECRET` and the Refresh Token with
   `JWT_REFRESH_SECRET`, and neither SHALL be verifiable with the other's key.
5. THE Access Token SHALL expire after `ACCESS_TOKEN_TTL` and the Refresh Token after
   `REFRESH_TOKEN_TTL`.
6. IF a token is expired, malformed, or signed with the wrong key, THEN THE Token_Module
   SHALL report failure without throwing an unhandled error.

---

### Requirement 5: Authentication endpoints

**User Story:** As a user, I want to sign in, stay signed in through a shift, and sign out,
so that using the POS does not mean retyping a password all day.

#### Acceptance Criteria

1. THE API SHALL expose `POST /api/auth/login` accepting `{ username, password }`.
2. WHEN credentials are valid and the account is active, THE login endpoint SHALL return an
   Access Token, a Refresh Token, the user's public profile, and the list of shops they may
   access.
3. IF credentials are invalid OR the account is inactive, THEN THE login endpoint SHALL
   respond 401 with a message that does not distinguish between the two cases.
4. WHEN a login succeeds, THE system SHALL update the user's `last_login_at`.
5. THE API SHALL expose `POST /api/auth/refresh` accepting a Refresh Token and returning a
   new Access Token.
6. WHEN refreshing, THE system SHALL re-read the user from the database and SHALL reject the
   refresh if the account is inactive or if the token's Token Version does not match the
   stored one.
7. THE API SHALL expose `GET /api/auth/me`, returning the current actor's profile and shop
   list, requiring a valid Access Token.
8. THE API SHALL expose `POST /api/auth/logout`, requiring a valid Access Token.
9. THE API SHALL expose `POST /api/auth/change-password` accepting the current and new
   password, requiring a valid Access Token, and SHALL clear `must_change_password` and bump
   `token_version` on success.

---

### Requirement 6: Request-scoped identity middleware

**User Story:** As a developer, I want identity and shop scope resolved once, before any
controller runs, so that no controller has to decide for itself who is asking.

#### Acceptance Criteria

1. THE Auth_Module SHALL export `requireAuth`, which verifies the `Authorization: Bearer`
   Access Token and sets `req.user` to `{ id, username, role, shops }`.
2. IF no token is present or the token is invalid, THEN `requireAuth` SHALL respond 401 and
   SHALL NOT call the next handler.
3. THE Auth_Module SHALL export `requireRole(...roles)`, which responds 403 unless
   `req.user.role` is one of the named roles.
4. THE Scope_Module SHALL export `resolveShop`, which reads the `X-Shop-Id` request header,
   validates it against `req.user.shops`, and sets `req.shopId`.
5. IF the `X-Shop-Id` header is absent, not a positive integer, or names a shop the actor is
   not assigned to, THEN `resolveShop` SHALL respond 400 or 403 as appropriate and SHALL NOT
   call the next handler.
6. WHEN the actor is a `super_admin`, `resolveShop` SHALL permit any shop that exists and is
   active.
7. THE middlewares SHALL NOT be mounted on any pre-existing route in this ticket.

---

### Requirement 7: The legacy compatibility bypass

**User Story:** As an operator, I want to deploy the authenticated backend before the
authenticated frontend, so that the shop never sees downtime during the upgrade.

#### Acceptance Criteria

1. WHEN `LEGACY_UNAUTH` is enabled AND a request carries no `Authorization` header, THEN
   `requireAuth` SHALL set `req.user` to a synthetic manager actor and call the next handler.
2. WHEN `LEGACY_UNAUTH` is enabled AND a request carries no `X-Shop-Id` header, THEN
   `resolveShop` SHALL set `req.shopId` to `LEGACY_SHOP_ID`.
3. WHEN `LEGACY_UNAUTH` is enabled AND a request DOES carry an `Authorization` header, THEN
   `requireAuth` SHALL verify it normally and SHALL NOT fall back to the synthetic actor —
   an invalid token must fail rather than silently escalate to manager.
4. WHEN `LEGACY_UNAUTH` is disabled, THE bypass SHALL have no effect whatsoever.
5. THE bypass SHALL be confined to the two middleware modules, SHALL be marked with a comment
   naming ticket 12 as the place it is deleted, and SHALL NOT appear in any controller.
6. WHEN the server starts with `LEGACY_UNAUTH` enabled, THE server SHALL log a clearly
   visible warning that authentication is bypassed.

---

### Requirement 8: The first super admin

**User Story:** As an operator, I want a way to create the very first account, so that the
system is reachable before any account exists to create accounts with.

#### Acceptance Criteria

1. WHEN the `users` table is empty AND both seed credentials are configured, THE DB_Init
   SHALL create one `super_admin` account from them.
2. THE seeded account SHALL be created with `must_change_password = TRUE`.
3. WHEN the `users` table is not empty, THE DB_Init SHALL create no account, regardless of
   the seed credentials.
4. IF the seed credentials are not configured AND the `users` table is empty, THEN THE
   DB_Init SHALL log a warning naming the two variables and SHALL continue starting.
5. THE seed password SHALL NOT be logged.

---

### Requirement 9: Login abuse resistance

**User Story:** As a shop owner, I want repeated password guessing to be slowed down, so that
a public endpoint with a password on it is not a free brute-force target.

#### Acceptance Criteria

1. THE `POST /api/auth/login` endpoint SHALL be rate limited by client IP.
2. WHEN the rate limit is exceeded, THE endpoint SHALL respond 429.
3. THE rate limit SHALL apply only to the auth routes and SHALL NOT affect the till.
4. THE limit SHALL be permissive enough that a shop's normal shift-change logins are never
   affected.

---

### Requirement 10: No behavioural change to existing endpoints

**User Story:** As the shop owner, I want the till to work exactly as it does today when this
ticket is deployed, so that the upgrade stays invisible.

#### Acceptance Criteria

1. THE existing controllers, routes and utilities SHALL NOT be modified by this ticket.
2. THE existing endpoints SHALL remain reachable without a token.
3. WHEN this ticket is deployed, THE existing frontend SHALL continue to function without
   modification.
