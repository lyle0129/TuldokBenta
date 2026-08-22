# Design: Super-Admin Console

## Overview

Frontend only. Three screens plus a dialog, all consuming endpoints ticket 06 already built.

`pages/PaymentMethods.jsx` is the template throughout. It is the newest management page, it
was itself created to un-hardcode something, and its vertical slice — page, list component,
add modal, edit modal, hook, query key — is small and consistent. Following it keeps the
Console from becoming a second design language inside the app.

---

## Architecture

```
src/
├── pages/
│   ├── AdminShops.jsx
│   ├── AdminUsers.jsx
│   └── AdminAudit.jsx
├── components/admin/
│   ├── ShopsList.jsx, AddShopModal.jsx, EditShopModal.jsx
│   ├── UsersList.jsx, AddUserModal.jsx, EditUserModal.jsx
│   ├── AssignShopsModal.jsx, ResetPasswordModal.jsx
│   ├── AuditFilters.jsx, AuditList.jsx, AuditChangeSummary.jsx
│   └── CorrectDatesModal.jsx
├── hooks/
│   ├── useAdminShops.js, useAdminUsers.js, useAuditLog.js
│   └── useCorrectSaleDates.js
└── components/shared/navItems.js   ← + an "Admin" group, super_admin only
```

`components/admin/` is a new sibling of the existing feature folders (`inventory/`,
`services/`, `payment-methods/`, …), matching the grouping the `component-folder-restructure`
spec established.

---

## Components and Interfaces

### Query keys for admin data

Console data is **not** shop-scoped — these screens act across shops, and ticket 08's
`X-Shop-Id` is deliberately not sent for `/admin/*`. So the keys carry no shop dimension:

```js
adminShops: ["adminShops"],
adminUsers: ["adminUsers"],
auditLog: (filters) => ["auditLog", filters],
```

None of these appear in `PERSISTED_RESOURCES`. That is required for the audit log by
Requirement 4.8 — caching a page of an unbounded log to `localStorage` for 24 hours is exactly
the cost the endpoint's design exists to avoid — and is simply correct for the other two, which
are read rarely and must never be stale when someone is granting access.

### The audit viewer

This is the screen where the API's deliberate awkwardness has to be respected rather than
smoothed over.

```js
useQuery({
  queryKey: queryKeys.auditLog(filters),
  queryFn: () => apiRequest(`/admin/audit?${params}`),
  enabled: Boolean(filters.from && filters.to),   // no range, no request
  staleTime: 0,
  gcTime: 5 * 60 * 1000,                          // short: do not hold pages in memory
  refetchOnWindowFocus: false,                    // Requirement 4.7
});
```

Four deliberate departures from how every other query in this app is configured:

- **`enabled` on the range.** Requirement 4.1 is enforced structurally. There is no code path
  that issues an audit request without both bounds.
- **`refetchOnWindowFocus: false`**, against the app-wide default of `true`. That default is
  right for the till, where another cashier's changes matter. It is wrong for a log that only
  grows and that costs a scan to read.
- **No prefetching of the next page.** Tempting, and it would double the cost of a screen
  nobody is waiting on.
- **A short `gcTime`** against the app-wide `24h`, so paging through a long range does not
  accumulate every page in memory.

Paging uses the cursor the API returns — a "Load more" button that appends, not numbered
pages. Numbered pages would need a count, and counting rows in an unbounded table is the query
this whole design is avoiding.

The action filter is populated from the distinct-actions list the API returns for the selected
range (Requirement 4.4), not from a constant. A hardcoded list drifts the moment a new action
is added on the backend, and it would show actions that never occurred in the range.

### Rendering `changes`

`AuditChangeSummary.jsx` turns the `{ before, after }` JSONB into readable lines:

```
Stock      12 → 20
Price      170.00 → 185.00
```

and for the compact create summaries, a single line: `3 lines · ₱410.00`.

Raw JSON is the easy path and makes the log unusable for the person it exists for. Fall back to
a formatted JSON block only for a shape the summariser does not recognise, so an unfamiliar
action still shows something rather than nothing.

### Date correction

`CorrectDatesModal.jsx` is reachable from the closed-sales and open-sales row menus, not only
from the Console (Requirement 5.7) — the question "was this sale on the wrong day?" arises
while looking at sales, and making the super admin navigate away to act on it invites them to
do it in the database instead.

The confirmation text states the consequence plainly:

> Changing this date changes what past reports show for the affected days.

That is Requirement 5.4 and it maps to R4 in the overview's risk register. The feature is
intended; the surprise is not.

For an open sale the dialog offers `created_at` only, because `open_sales.paid_at` is NULL in
normal operation — `paySale` moves the row rather than stamping it.

On success, invalidate the shop-scoped `["closedSales", shopId]` and `["openSales", shopId]`
prefixes. Note the correction may target a shop other than the active one, so the modal must
invalidate for the sale's shop, not for the active shop.

### One-time password display

Requirement 3.10: an initial or reset password is shown once, in the modal, with an explicit
note that it will not be shown again. The API never returns a password after creation, so the
value displayed is the one the admin just typed or the one the client generated.

If the client offers to generate a password, generate it with `crypto.getRandomValues`, not
`Math.random`.

---

## Data Models

No new client-side persisted state. The Console reads and writes through the API only.

---

## Error Handling

| Condition | Behaviour |
|---|---|
| Any API refusal (409 or 400) | Show the server's message inline; leave the dialog open |
| Deactivating the last super admin | The server's 409 message, shown as-is |
| Self-deactivation | The server's 409 message |
| Delete unavailable due to activity | Delete disabled, with the reason shown next to it |
| Audit range with no results | "No activity in this range." |
| Audit request without a range | Not possible — the query is disabled |
| Non-super-admin reaches a Console route | Redirected to the till by `RequireRole` |
| Date correction rejected | Server's message; dialog stays open; nothing invalidated |

---

## Correctness Properties

### P1 — The audit query never fires without a range

For any filter object missing `from` or `to`, the query is disabled.

*Validates: 4.1, 4.2*

### P2 — The requested limit is never above 100

For any filter state, the constructed query string carries a limit of at most 100.

*Validates: 4.3*

### P3 — Admin queries are never persisted

For each of `adminShops`, `adminUsers` and `auditLog`, the resource name is absent from
`PERSISTED_RESOURCES`.

*Validates: 4.8*

### P4 — The change summariser never throws

For any `changes` payload, including `null`, an empty object and a deeply nested one,
`AuditChangeSummary` renders without throwing.

*Validates: 4.6*

P4 matters because the payload is JSONB written by several controllers over the program's
life; a shape the summariser has not seen must degrade to a JSON block, not to a blank screen.

---

## Testing Strategy

### Component and property tests

- P1, P2 and P4 as unit tests over the filter-to-query-string builder and the summariser, both
  extracted as pure functions so they are testable without rendering.
- P3 as a structural assertion against `queryClient.js`.
- `UsersList` disables Delete and shows the reason for a user with activity.

### Manual walk

| Step | Confirms |
|---|---|
| Manager opens `/admin/users` | Redirected to the till |
| Super admin creates a shop | It appears; the new password of nothing is shown; the shop has default payment methods |
| Switch into the new shop via the picker | Works without signing out — ticket 08's super-admin shop fetch |
| Create a worker assigned to that shop | Password shown once, with the note |
| That worker signs in | Forced to change the password, then lands on the shop's till |
| Reassign the worker, then they act | They see the new shop after their next refresh |
| Deactivate the worker | Their next request signs them out |
| Try to deactivate the only super admin | Server's 409 message shown |
| Audit viewer on load | Shows today; no request fires before a range exists |
| Filter by action | Options come from the range's own actions, not a constant |
| Page through more than 100 events | "Load more" appends; no duplicates; no gaps |
| Reload the audit page | Nothing restored from `localStorage`; `tb_query_cache` has no audit data |
| Correct a closed sale's date across a month boundary | The list updates; both months' reports move |
| Correct `paid_at` before `created_at` | Server's message; dialog stays open; nothing changed |

The "reload the audit page" row is the check that P3 actually holds in the built app rather
than only in the constant.
