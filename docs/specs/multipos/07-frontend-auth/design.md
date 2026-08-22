# Design: Frontend Authentication

## Overview

Replaces a bundled password and a localStorage boolean with a real session. The change is
concentrated in four places — the session store, the API wrapper, the guards, and the nav
config — and deliberately leaves the shop dimension to ticket 08.

The app is a React 19 + Vite SPA with no TypeScript and no path aliases; every import is a
hand-written relative path. Data flows through TanStack Query, whose cache is persisted to
`localStorage`. Those three facts shape most of what follows.

---

## Architecture

```
src/
├── api.js                       ← + auth header, + 401 refresh-and-retry
├── utils/
│   ├── auth.js                  ← DELETED
│   ├── session.js               ← NEW: the subscribable session store
│   └── storage.js               ← + session keys, − AUTH_KEY
├── hooks/
│   ├── useAuth.js               ← now reads session.js; same useSyncExternalStore shape
│   └── useOfflineCatalog.js     ← raw fetch → apiRequest
├── pages/
│   ├── Login.jsx                ← NEW
│   └── ChangePassword.jsx       ← NEW
├── components/shared/
│   ├── ProtectedRoute.jsx       ← DELETED
│   ├── RequireRole.jsx          ← NEW
│   ├── navItems.js              ← adminOnly → roles
│   ├── Navbar.jsx               ← user name, sign out, role-filtered groups
│   └── NavDrawer.jsx            ← same
└── App.jsx                      ← /login, /change-password, guards from navItems
```

### The circular-import problem, and how it is avoided

`api.js` needs the access token, and on a failed refresh it needs to clear the session. The
session store needs `api.js` to perform the refresh call. Written naively that is a cycle.

The resolution: **`session.js` holds no network code, and `api.js` imports only from it.**
The refresh call inside `api.js` is a bare `fetch` against `/auth/refresh`, not a recursive
`apiRequest` — which it has to be anyway, since a refresh must not itself be subject to the
401-retry logic it implements (Requirement 4.5).

```
session.js  ──(read token, clear session)──>  nothing
api.js      ──imports──>  session.js
pages/*     ──imports──>  both
```

---

## Components and Interfaces

### `src/utils/session.js`

Keeps the exact shape of the module it replaces — a module-level value, a `Set` of listeners,
a `notify()` — so `useAuth.js` changes only in what it reads.

```js
export const getSession = () => /* { accessToken, refreshToken, user, shops } | null */;
export const setSession = (session) => { /* write, notify */ };
export const clearSession = () => { /* remove, drop legacy AUTH_KEY, notify */ };
export const subscribeSession = (listener) => /* unsubscribe */;

export const getAccessToken = () => getSession()?.accessToken ?? null;
export const getRole        = () => getSession()?.user?.role ?? null;
```

`getSnapshot` for `useSyncExternalStore` must return a **stable reference** when nothing has
changed. Parsing the JSON on every call returns a fresh object each time and puts React into
an infinite render loop — the classic mistake with this hook. Cache the parsed session in a
module-level variable and replace it only in `setSession` / `clearSession`.

`clearSession` also removes the old `authenticated` key (Requirement 1.6), so a browser that
used the previous build does not carry a stale flag forward.

### `src/api.js`

```js
let refreshInFlight = null;   // module-level: one refresh, however many 401s

// Three outcomes, not two. "Refused" and "unreachable" must not be conflated:
// a cashier working offline would otherwise be signed out mid-shift and be unable
// to sign back in, because signing in also needs the network.
const REFRESHED = "refreshed", REFUSED = "refused", OFFLINE = "offline";

const performRefresh = async () => {
  // Bare fetch on purpose. A refresh must not run through apiRequest, or a 401 from
  // the refresh endpoint would trigger another refresh.
  const session = getSession();
  if (!session?.refreshToken) return REFUSED;
  let res;
  try {
    res = await fetch(`${API_BASE_URL}/auth/refresh`, { /* … */ });
  } catch {
    return OFFLINE;              // network-level failure: keep the session
  }
  if (!res.ok) return REFUSED;   // the server said no: the session is genuinely dead
  const { accessToken } = await res.json();
  setSession({ ...session, accessToken });
  return REFRESHED;
};

export const apiRequest = async (path, { method = "GET", body, signal, _retry } = {}) => {
  // …existing fetch, plus Authorization when a token exists…

  if (res.status === 401 && !_retry && !path.startsWith("/auth/")) {
    // Collapse concurrent 401s onto one refresh. The till fires several queries at
    // once on mount; without this, each would refresh and the last would win with a
    // token the others had already replaced.
    refreshInFlight ??= performRefresh().finally(() => { refreshInFlight = null; });
    const outcome = await refreshInFlight;

    if (outcome === REFRESHED) return apiRequest(path, { method, body, signal, _retry: true });

    // Unreachable server: the session may well still be valid. Fail this one request
    // the way any other network failure fails, and leave the user signed in.
    if (outcome === OFFLINE) throw new ApiError("Could not reach the server. Check your connection.", 0);

    clearSession();
    clearQueryCache();
    window.location.assign("/login");
    return;
  }

  // …existing !res.ok → ApiError, 204 → null, else res.json()…
};
```

Three details that are easy to get wrong:

- **`_retry` is internal.** It exists to make Requirement 4.4 structural rather than a matter
  of care — a retried request cannot itself retry.
- **`path.startsWith("/auth/")` guards the refresh endpoint.** Without it, an expired refresh
  token produces an infinite loop of refresh attempts.
- **The existing `AbortError` passthrough must survive.** `api.js` currently rethrows an
  aborted request untranslated because TanStack Query aborts superseded fetches, and turning
  that into an `ApiError` would surface cancellations as failures. The new code must not sit
  in front of that.

A hard redirect via `window.location.assign` rather than a router navigate is deliberate:
`apiRequest` is called from hooks and mutations that have no router context, and a full reload
is the cleanest way to discard in-memory state alongside the cleared cache. It matches what
`Navbar.handleLogout` already does today.

### `src/components/shared/navItems.js`

```js
export const ROLES = { WORKER: "worker", MANAGER: "manager", SUPER_ADMIN: "super_admin" };
const ALL = [ROLES.WORKER, ROLES.MANAGER, ROLES.SUPER_ADMIN];
const MANAGERS = [ROLES.MANAGER, ROLES.SUPER_ADMIN];

export const NAV_GROUPS = [
  { label: "Sales", roles: ALL, items: [ /* Open, Offline, Closed */ ] },
  { label: "Manage", roles: MANAGERS, items: [ /* Inventory, Services, Payment Methods */ ] },
  // Hidden from workers as a convenience only. The closed-sales data this page derives
  // from is worker-accessible by design, so this is not a security control — see the
  // permission matrix in docs/specs/multipos/00-overview.md.
  { label: "Reporting", roles: MANAGERS, items: [ /* Reporting */ ] },
];

export const visibleGroups = (role) => NAV_GROUPS.filter((g) => g.roles.includes(role));
export const rolesForPath  = (path) => /* lookup across groups */;
```

The existing file already carries a comment noting that `adminOnly` **mirrors by hand** the
routes wrapped in `ProtectedRoute` in `App.jsx`, and that the two lists can drift. This ticket
closes that: `App.jsx` derives its guards from `rolesForPath`, so there is one list.

The comment on the Reporting group is required by Requirement 5.7. It is worth writing because
the natural reading of a hidden nav item is that the route is protected, and here it is not.

### `src/components/shared/RequireRole.jsx`

```jsx
export default function RequireRole({ roles, children }) {
  const session = useAuth();
  if (!session)                       return <Navigate to="/login" replace state={{ from: location }} />;
  if (session.user.must_change_password) return <Navigate to="/change-password" replace />;
  if (!roles.includes(session.user.role)) return <Navigate to="/open-sales" replace />;
  return children;
}
```

Order matters: the forced password change outranks the role check, so an account that must
change its password cannot reach anything by being the right role (Requirement 7.1).

Redirecting an unpermitted role to the till rather than rendering an error is Requirement 5.4 —
a worker following a stale bookmark should land somewhere useful.

### `src/pages/Login.jsx` and `ChangePassword.jsx`

Plain forms, styled to match the existing modals in `components/sales-modals/`. `Login`
distinguishes a 401 (show the server's message) from an `ApiError` with `status: 0` (show the
connection message `api.js` already produces). It reads `location.state.from` to return the
user where they were headed.

These are the two routes rendered **outside** the nav shell, since a signed-out user has no
navigation to show.

---

## Data Models

The Session, as stored:

```js
{
  accessToken:  "eyJ…",
  refreshToken: "eyJ…",
  user:  { id, username, full_name, role, must_change_password, last_login_at },
  shops: [ { id, name, slug }, … ],
}
```

`shops` is stored now and used in ticket 08. Storing it here avoids a second storage migration
one ticket later.

Storage keys, added to `src/utils/storage.js` beside the existing ones:

| Key | Contents |
|---|---|
| `tb_session` | The Session object above |
| ~~`authenticated`~~ | **Removed.** `clearSession` deletes it on sight |

---

## Error Handling

| Condition | Behaviour |
|---|---|
| Login 401 | Server's message shown inline; nothing stored |
| Login network failure | The existing "Could not reach the server" `ApiError` message, visually distinct from a credentials error |
| Request 401, refresh succeeds | Original request retried once; caller sees a normal result |
| Request 401, refresh **refused by the server** | Session cleared, query cache cleared, hard redirect to `/login` |
| Request 401, refresh fails because the server is **unreachable** | Session kept; the request fails with the usual connection `ApiError` |
| Request 401 from `/auth/*` | No refresh attempted; error propagates |
| Request 403 | Surfaced as an `ApiError` and shown; no sign-out, since the session is valid |
| `localStorage` unavailable | Treated as signed out; the app renders the login form |
| Logout API call fails | Session and cache cleared anyway; navigation proceeds |

The 403 row is worth stating: a 403 means "you are who you say you are, and you may not do
this". Signing the user out on a 403 would be both wrong and confusing.

---

## Correctness Properties

`fast-check` is already a dependency and the existing suite uses it for `ProtectedRoute`.
Those property tests are **replaced**, not deleted (Requirement 8.5).

### P1 — The Role Guard admits exactly the listed roles

For any role string and any list of permitted roles, `RequireRole` renders its children if and
only if the role is in the list and no password change is pending.

*Validates: 5.3, 5.6*

### P2 — Nav and guards cannot disagree

For every path in `NAV_GROUPS`, `rolesForPath(path)` equals the roles on the group containing
it, and every guarded route in `App.jsx` uses `rolesForPath` rather than a literal list.

*Validates: 5.2*

### P3 — A pending password change outranks everything

For any role and any permitted-roles list, a user with `must_change_password` is redirected to
`/change-password`.

*Validates: 7.1*

### P4 — One refresh per burst

For any number of concurrent 401s, `performRefresh` is invoked exactly once.

*Validates: 4.2*

### P4b — An unreachable server never signs anyone out

For any request whose refresh attempt throws at the network level, the session is still present
afterwards.

*Validates: 4.4*

This is the property that keeps the offline till usable. Signing in also requires the network,
so signing a user out because the network is down leaves them with no way back in — on the one
screen specifically built to work without a connection.

### P5 — A retry never retries

For any request that receives 401 twice, `apiRequest` performs at most one refresh and one
retry, and then fails.

*Validates: 4.4*

### Structural property SP1 — the old gate is gone

```powershell
rg -n "VITE_ADMIN_PASSWORD|utils/auth|AUTH_KEY|ProtectedRoute" webapp/tuldokbenta_web/src
```
returns nothing.

*Validates: 8.1, 8.2, 8.3, 8.4*

### Structural property SP2 — nothing bypasses `apiRequest`

```powershell
rg -n "fetch\(" webapp/tuldokbenta_web/src | rg -v "src/api.js"
```
returns nothing.

*Validates: 3.3, 3.4*

SP2 is what catches `useOfflineCatalog.js`, the one module in the app that calls `fetch`
directly today. Left as it is, it would 401 quietly and leave the offline page showing a stale
catalog with no visible error.

---

## Testing Strategy

Vitest + jsdom + Testing Library, configured inline in `vite.config.js`. Tests live in
`src/__tests__/`, not co-located.

### Replaced tests

`src/__tests__/ProtectedRoute.test.jsx` becomes `RequireRole.test.jsx`, carrying P1, P2 and P3.
The three existing properties — correct password grants, anything else denies, missing env var
fails closed — describe a mechanism that no longer exists; the replacements assert the same
*intent* (only the permitted may pass, and the default is denial) against the new one.

`src/__tests__/Navbar.test.jsx` currently pins the exact dropdown item list and asserts admin
links are hidden while signed out. Update it to drive off role instead: a worker sees only
Sales, a manager sees all three groups, a signed-out user sees no groups.

### New tests

`src/__tests__/api.test.js` gains: the Authorization header is attached when a session exists
and omitted when it does not; a 401 triggers one refresh and one retry; concurrent 401s
trigger one refresh (P4); a failed refresh clears the session; a 401 from `/auth/login` does
not trigger a refresh; an `AbortError` still propagates untranslated.

### Manual walk

With `LEGACY_UNAUTH` still **on** — the backend accepts tokenless requests, so a bug in the
header plumbing would otherwise hide. Confirm by watching the network tab that the header is
actually present, not just that the app works.

| Step | Confirms |
|---|---|
| Visit `/inventory` signed out | Redirect to `/login` |
| Sign in as the seeded super admin | Forced to `/change-password` |
| Change the password | Lands on the till |
| Sign in as a worker | Nav shows Sales only; `/inventory` redirects to the till |
| Sign in as a manager | All three groups; every page loads |
| Let the access token expire, then act | One refresh in the network tab, the action succeeds |
| Bump `token_version` in the database, then act | Signed out and returned to `/login` |
| Sign out | Session and `tb_query_cache` both gone from `localStorage` |
| Offline page's "Refresh catalog" | Sends the Authorization header |

The token-expiry row is best exercised by temporarily setting `ACCESS_TOKEN_TTL=60s` on the
backend rather than waiting an hour.
