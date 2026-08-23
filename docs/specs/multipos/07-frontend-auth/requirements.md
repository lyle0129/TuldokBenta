# Requirements: Frontend Authentication

## Introduction

The frontend's entire notion of a session is a boolean in `localStorage` under the key
`authenticated`, set by comparing a typed password against `import.meta.env.VITE_ADMIN_PASSWORD`
in the browser. There are no accounts, no identity and no server involvement.

This ticket replaces that with a real login against the API built in ticket 03: tokens stored
and attached to every request, a silent refresh when the access token expires, role-aware
navigation, and a forced password change for accounts flagged for it.

The shop picker is **not** in this ticket — it is ticket 08.

> **Correction, made during implementation.** This section previously read: "Until then the
> frontend sends no `X-Shop-Id` header, and the backend's legacy fallback supplies Shop 1."
> That is not what the backend does. `resolveShop`'s fallback is guarded on `req.user.legacy`
> — the synthetic actor `requireAuth` builds only for a request arriving with **no**
> `Authorization` header — and ticket 04 narrowed it there deliberately, so that an
> authenticated request which forgot the header gets a 400 instead of silently acting on
> Shop 1. Correct behaviour, and it means that the moment this ticket starts sending a token,
> every scoped endpoint answers `400 No shop selected`.
>
> So this ticket **does** send `X-Shop-Id`, chosen as the lowest id in the session's shop
> list (see Requirement 3.5). Ticket 08 replaces the choice with a real picker; it no longer
> introduces the header from scratch.

Choosing the shop is still out of scope here, which keeps this ticket's diff about identity
alone.

## Glossary

- **Session** — the stored access token, refresh token, user profile and shop list.
- **Session_Store** — `src/utils/session.js`, the subscribable store replacing
  `src/utils/auth.js`.
- **Silent Refresh** — exchanging the refresh token for a new access token after a 401,
  transparently to the caller.
- **Role Guard** — the component that renders a route only for permitted roles.
- **Nav_Config** — `src/components/shared/navItems.js`.

---

## Requirements

### Requirement 1: The session store

**User Story:** As a developer, I want session state in one subscribable place, so that the
navbar, the guards and the API layer all see the same thing at the same time.

#### Acceptance Criteria

1. THE Session_Store SHALL persist the access token, refresh token, user profile and shop list
   to `localStorage`.
2. THE Session_Store SHALL expose a `useSyncExternalStore`-compatible subscribe/getSnapshot
   pair, preserving the pattern already used by `src/hooks/useAuth.js`.
3. WHEN storage is unavailable, THE Session_Store SHALL behave as signed out rather than
   throwing, matching the existing fail-closed behaviour in `src/utils/auth.js`.
4. THE Session_Store SHALL expose the current user's role and shop list to callers without
   requiring them to decode a token.
5. THE storage keys SHALL be declared in `src/utils/storage.js` alongside the existing keys,
   not written inline.
6. THE legacy `authenticated` key SHALL be removed from storage when a session is established
   or cleared, so no stale flag survives the upgrade.

---

### Requirement 2: Signing in

**User Story:** As a worker, I want to sign in with my own username and password, so that what
I do at the till is recorded as mine.

#### Acceptance Criteria

1. THE app SHALL provide a `/login` route rendering a username and password form.
2. WHEN credentials are submitted, THE app SHALL call `POST /api/auth/login` and store the
   returned Session on success.
3. IF the API responds 401, THEN THE app SHALL show the server's message and SHALL NOT store
   anything.
4. IF the API is unreachable, THEN THE app SHALL show a connection error distinct from a
   credentials error.
5. WHEN a signed-out user navigates to any route other than `/login`, THE app SHALL redirect
   them to `/login`.
6. WHEN a signed-in user navigates to `/login`, THE app SHALL redirect them to the till.
7. AFTER a successful sign-in, THE app SHALL return the user to the route they originally
   requested, or to the till when there was none.

---

### Requirement 3: Attaching credentials to requests

**User Story:** As a developer, I want every request to carry the session automatically, so
that no call site can forget.

#### Acceptance Criteria

1. THE `apiRequest` wrapper SHALL attach `Authorization: Bearer <access token>` to every
   request when a session exists.
2. THE `apiRequest` wrapper SHALL NOT attach an Authorization header to the login or refresh
   calls.
3. EVERY network call in the app SHALL go through `apiRequest`.
4. THE raw `fetch` calls in `src/hooks/useOfflineCatalog.js` SHALL be converted to
   `apiRequest`, since they are the only calls in the app that currently bypass it.
5. THE `apiRequest` wrapper SHALL attach `X-Shop-Id` when the session holds at least one
   shop, choosing the **lowest shop id** — the list arrives ordered by name, so the first
   element is alphabetical and arbitrary, while the lowest id is the shop that existed
   first. Ticket 08 replaces the choice; the header itself is required here because
   `resolveShop` refuses an authenticated request that omits it.
6. THE `X-Shop-Id` header SHALL be omitted for an account assigned to no shops, which is a
   real state rather than an error — an account can exist before anyone assigns it.

---

### Requirement 4: Silent refresh

**User Story:** As a worker, I want to keep working through a whole shift without being
signed out, so that the login is a start-of-day event rather than an hourly interruption.

#### Acceptance Criteria

1. WHEN a request fails with 401 AND a refresh token exists, THE app SHALL attempt a Silent
   Refresh and retry the original request once.
2. WHEN several requests fail with 401 at the same time, THE app SHALL perform at most one
   refresh and SHALL have all of them await its result.
3. IF the Silent Refresh is **rejected by the server**, THEN THE app SHALL clear the Session,
   clear the query cache and redirect to `/login`.
4. IF the Silent Refresh fails because the server is **unreachable**, THEN THE app SHALL leave
   the Session intact and SHALL surface a connection error to the caller.
5. THE app SHALL NOT retry a request more than once per 401.
6. THE app SHALL NOT attempt a Silent Refresh for a 401 returned by the login endpoint itself.
7. WHEN a Silent Refresh succeeds, THE original request SHALL be retried with the new token
   and its result returned to the caller as though nothing happened.

---

### Requirement 5: Role-aware navigation and guards

**User Story:** As a worker, I want to see only what I can use, so that the app is not full of
links that reject me.

#### Acceptance Criteria

1. THE Nav_Config SHALL replace its `adminOnly` boolean with an explicit list of roles per
   group or item.
2. THE route guards in `src/App.jsx` SHALL derive their permitted roles from the Nav_Config,
   so the navigation and the guards cannot disagree.
3. THE Role Guard SHALL render its children only when the current user's role is permitted.
4. WHEN a signed-in user reaches a route their role does not permit, THE app SHALL redirect
   them to the till rather than showing an empty page.
5. THE navigation SHALL display the signed-in user's name.
6. THE permitted roles SHALL match the permission matrix in
   [the overview](../00-overview.md).
7. THE "Reporting" entry SHALL be hidden from workers, and the code SHALL carry a comment
   noting this is a convenience rather than a control, because the underlying closed-sales
   data is worker-accessible by design.

---

### Requirement 6: Signing out

**User Story:** As a worker, I want signing out to actually clear everything, so that the next
person at the terminal starts clean.

#### Acceptance Criteria

1. WHEN a user signs out, THE app SHALL call `POST /api/auth/logout`, clear the Session, clear
   the persisted query cache, and navigate to `/login`.
2. THE sign-out SHALL complete even if the logout API call fails.
3. THE existing `clearQueryCache()` helper SHALL be reused rather than reimplemented.

---

### Requirement 7: Forced password change

**User Story:** As a super admin, I want an account I just created to be forced to set its own
password, so that the password I chose does not stay in use.

#### Acceptance Criteria

1. WHEN a signed-in user's profile carries `must_change_password`, THE app SHALL route them to
   a change-password screen and SHALL NOT allow navigation elsewhere.
2. THE change-password screen SHALL call `POST /api/auth/change-password`.
3. WHEN the change succeeds, THE app SHALL re-establish the Session and allow normal
   navigation.
4. THE screen SHALL state the minimum password length before the user submits.

---

### Requirement 8: Removing the old gate

**User Story:** As a developer, I want the client-side password gate gone entirely, so that no
part of the app still believes a bundled string is a credential.

#### Acceptance Criteria

1. THE `VITE_ADMIN_PASSWORD` variable SHALL be removed from `.env.example` and from all code.
2. THE `src/utils/auth.js` module SHALL be deleted.
3. NO code SHALL read the `authenticated` localStorage key after this ticket.
4. THE existing `ProtectedRoute` component SHALL be replaced by the Role Guard.
5. THE tests that assert the old password gate's behaviour SHALL be replaced by tests of the
   Role Guard, not merely deleted.
