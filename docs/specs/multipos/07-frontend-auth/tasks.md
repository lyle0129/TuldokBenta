# Implementation Plan: Frontend Authentication

## Overview

Replace the bundled-password gate with a real session. Keep `LEGACY_UNAUTH=true` on the
backend throughout, so a mistake in header plumbing does not take the till down mid-ticket —
but verify headers in the network tab rather than trusting that the app still works.

The shop picker is ticket 08. This ticket sends no `X-Shop-Id`; the backend's legacy fallback
supplies Shop 1.

## Tasks

- [ ] 1. Add session keys to `src/utils/storage.js`
  - Add `SESSION_KEY = "tb_session"` beside the existing keys
  - Keep `AUTH_KEY` exported for now — task 3 needs it to delete the stale value — with a
    comment saying it is removed in task 12
  - _Requirements: 1.5_

- [ ] 2. Create `src/utils/session.js`
  - Mirror the module shape of the `src/utils/auth.js` it replaces: module-level value, a
    `Set` of listeners, a `notify()`
  - Export `getSession`, `setSession`, `clearSession`, `subscribeSession`, `getAccessToken`,
    `getRole`
  - **Cache the parsed session in a module-level variable.** `getSnapshot` for
    `useSyncExternalStore` must return a stable reference when nothing changed; re-parsing the
    JSON on every call returns a fresh object each time and puts React into an infinite render
    loop
  - Wrap every storage access in `try/catch` and treat failure as signed out, matching the
    existing fail-closed behaviour
  - `clearSession` also removes the legacy `authenticated` key
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6_

- [ ] 3. Point `src/hooks/useAuth.js` at the new store
  - Same `useSyncExternalStore(subscribe, getSnapshot, getSnapshot)` shape; only the imported
    functions change
  - Return the session object rather than a boolean
  - _Requirements: 1.2, 1.4_

- [ ] 4. Add auth to `src/api.js`
  - Attach `Authorization: Bearer` when a session exists; never on `/auth/login` or
    `/auth/refresh`
  - Add `performRefresh` as a **bare `fetch`**, not a recursive `apiRequest` — a refresh must
    not be subject to the 401 logic it implements
  - Collapse concurrent 401s onto a single module-level `refreshInFlight` promise; the till
    fires several queries on mount and without this each would refresh independently
  - Guard with an internal `_retry` flag and `path.startsWith("/auth/")`
  - `performRefresh` returns **three** outcomes, not a boolean: refreshed, refused, offline.
    On refused → `clearSession()`, `clearQueryCache()`, hard redirect to `/login`. On offline →
    keep the session and throw the usual connection `ApiError`. Conflating the two would sign a
    cashier out mid-shift whenever the network dropped — and signing back in also needs the
    network, so they would be stuck on the very screen built to work without one
  - **Do not disturb the existing `AbortError` passthrough.** It rethrows untranslated because
    TanStack Query aborts superseded fetches, and turning those into `ApiError`s would surface
    cancellations as failures
  - _Requirements: 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ] 5. Convert `src/hooks/useOfflineCatalog.js` to `apiRequest`
  - It is the only module in the app calling raw `fetch`. Left alone it would 401 quietly and
    leave the offline page showing a stale catalog with no visible error
  - Preserve the existing behaviour that a failed refresh keeps the current catalog rather
    than emptying it
  - _Requirements: 3.3, 3.4_

- [ ] 6. Rewrite `src/components/shared/navItems.js`
  - Replace `adminOnly: true` with an explicit `roles` array per group
  - Export `ROLES`, `visibleGroups(role)` and a new `rolesForPath(path)`
  - Add the comment on the Reporting group noting it is hidden as a convenience and is **not**
    a control, because the closed-sales data it derives from is worker-accessible by design
  - Remove `SIGN_IN_ROUTE` — it existed only because hiding the admin links also hid the only
    path to the password prompt, and there is now a real `/login`
  - _Requirements: 5.1, 5.6, 5.7_

- [ ] 7. Create `src/components/shared/RequireRole.jsx` and delete `ProtectedRoute.jsx`
  - Check order: no session → `/login`; `must_change_password` → `/change-password`; role not
    permitted → `/open-sales`; otherwise render children
  - The password-change check must outrank the role check, or an account with the right role
    reaches pages while still on an admin-set password
  - _Requirements: 5.3, 5.4, 7.1, 8.4_

- [ ] 8. Create `src/pages/Login.jsx`
  - Username and password form styled to match the existing modals in
    `components/sales-modals/`
  - Distinguish a 401 (show the server's message) from an `ApiError` with `status: 0` (the
    existing "Could not reach the server" text)
  - Read `location.state.from` and return the user there after signing in
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7_

- [ ] 9. Create `src/pages/ChangePassword.jsx`
  - Calls `POST /api/auth/change-password`; states the 8-character minimum before submit
  - On success, re-establish the session from the response and allow normal navigation
  - _Requirements: 7.2, 7.3, 7.4_

- [ ] 10. Wire the routes in `src/App.jsx`
  - Add `/login` and `/change-password`, rendered **outside** the nav shell — a signed-out
    user has no navigation to show
  - Wrap every other route in `RequireRole`, deriving the permitted roles from
    `rolesForPath` rather than from a literal list. This is what closes the drift the existing
    comment in `navItems.js` already warns about
  - Redirect a signed-in user away from `/login`
  - _Requirements: 2.5, 2.6, 5.2_

- [ ] 11. Update `Navbar.jsx` and `NavDrawer.jsx`
  - Filter groups with `visibleGroups(role)`
  - Show the signed-in user's full name
  - `handleLogout` calls `POST /api/auth/logout`, then clears session and cache and navigates —
    reusing the existing `clearQueryCache()`, and completing even if the API call fails
  - Remove the old sign-in affordance that pointed at `/inventory`
  - _Requirements: 5.5, 6.1, 6.2, 6.3_

- [ ] 12. Delete the old gate
  - Delete `src/utils/auth.js`
  - Remove `AUTH_KEY` from `src/utils/storage.js`
  - Remove `VITE_ADMIN_PASSWORD` from `webapp/tuldokbenta_web/.env.example`
  - Run SP1: `rg -n "VITE_ADMIN_PASSWORD|utils/auth|AUTH_KEY|ProtectedRoute" src` returns nothing
  - Run SP2: `rg -n "fetch\(" src | rg -v "src/api.js"` returns nothing
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] 13. Replace and extend the tests
  - `__tests__/ProtectedRoute.test.jsx` → `RequireRole.test.jsx` carrying P1, P2 and P3. The
    old properties describe a mechanism that no longer exists; the new ones assert the same
    *intent* — only the permitted may pass, and the default is denial
  - Update `__tests__/Navbar.test.jsx` to drive off role: a worker sees Sales only, a manager
    sees all three groups, a signed-out user sees none
  - Extend `__tests__/api.test.js` with P4, **P4b**, P5, header attach/omit, refused-refresh
    sign-out, no-refresh-on-login-401, and the surviving `AbortError` passthrough
  - P4b — a refresh that throws at the network level leaves the session intact — is the one
    that keeps the offline till usable; do not skip it
  - _Requirements: 5.2, 5.3, 7.1, 4.2, 4.4, 4.5, 8.5_

- [ ] 14. Verification checkpoint
  - `npm run build`, `npm test` and `npm run lint` all pass in `webapp/tuldokbenta_web/`
  - Walk the manual table from the design as each of the three roles, **watching the network
    tab** to confirm the Authorization header is actually present — with `LEGACY_UNAUTH` still
    on, a broken header would otherwise be invisible
  - Exercise token expiry by temporarily setting `ACCESS_TOKEN_TTL=60s` on the backend rather
    than waiting an hour
  - Bump `token_version` in the database and confirm the next action signs the user out
  - Confirm a 403 does **not** sign the user out — the session is valid, the action is not
  - Ask the user if any questions arise before closing out

## Notes

- No path aliases exist in this project, so every new file's imports are hand-written relative
  paths and their depth must be computed by hand.
- `session.js` deliberately contains no network code, and `api.js` imports only from it. That
  one-way dependency is what keeps the two out of an import cycle.
- Ticket 08 adds `X-Shop-Id` on top of this and gives every query key a shop dimension. Do not
  start on that here; the two diffs are much easier to review apart.
