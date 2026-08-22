# Implementation Plan: Super-Admin Console

## Overview

Frontend only, against endpoints ticket 06 already built. Follow `pages/PaymentMethods.jsx`
and its list/modal components throughout — it is the newest management page and the closest
template, and following it keeps the Console from becoming a second design language.

## Tasks

- [ ] 1. Add the Admin nav group and routes
  - New group in `navItems.js` with `roles: ["super_admin"]`, containing Shops, Users and Audit
  - `App.jsx` picks up the guards automatically via `rolesForPath` from ticket 07
  - Create `src/components/admin/` as a sibling of the existing feature folders
    (`inventory/`, `services/`, `payment-methods/`, …), matching the grouping the
    `component-folder-restructure` spec established
  - Take `pages/PaymentMethods.jsx` and its list/modal components as the structural template
    for every screen in this ticket, and carry its dark-mode and responsive classes through, so
    the Console does not become a second design language inside the app
  - _Requirements: 1.1, 1.2, 1.3, 6.1, 6.2, 6.3_

- [ ] 2. Add the admin query keys
  - `adminShops`, `adminUsers` and `auditLog(filters)` in `queryClient.js`
  - **No shop dimension** — these screens act across shops and ticket 08 deliberately omits
    `X-Shop-Id` for `/admin/*`
  - **None of them in `PERSISTED_RESOURCES`.** Required for the audit log by Requirement 4.8,
    and simply correct for the other two, which must never be stale when someone is granting
    access
  - _Requirements: 1.4, 4.8_

- [ ] 3. Build the shops screen
  - `pages/AdminShops.jsx` with `ShopsList`, `AddShopModal`, `EditShopModal`
  - `slug` read-only when editing; no delete action anywhere
  - On create, state that the shop starts with default payment methods and an empty catalog
  - Surface the API's `invoice_prefix` warning before saving
  - _Requirements: 2.1–2.7_

- [ ] 4. Build the users screen
  - `pages/AdminUsers.jsx` with `UsersList`, `AddUserModal`, `EditUserModal`,
    `AssignShopsModal`, `ResetPasswordModal`
  - `username` read-only when editing
  - Primary removal action is labelled **Deactivate**. Offer permanent delete only for an
    account with no activity, and show the reason when it is unavailable rather than hiding it
  - Show any server refusal message as-is — last super admin, self-deactivation, delete with
    activity
  - Never render a password hash
  - _Requirements: 3.1–3.9_

- [ ] 5. Add the one-time password display
  - Show an initial or reset password once in the modal, with an explicit note that it will not
    be shown again
  - If offering to generate one, use `crypto.getRandomValues`, never `Math.random`
  - _Requirements: 3.10_

- [ ] 6. Build the audit filter and query layer
  - Extract the filter-to-query-string builder as a **pure function** so P1 and P2 are testable
    without rendering
  - `useAuditLog` with `enabled: Boolean(filters.from && filters.to)` — Requirement 4.1 becomes
    structural, with no code path able to request without a range
  - Set `refetchOnWindowFocus: false` against the app-wide default of `true`, and a short
    `gcTime` against the app-wide 24h. The defaults are right for the till and wrong for a log
    that only grows
  - Clamp the limit to 100; default the range to today; provide no "all time" option
  - Do not prefetch the next page
  - _Requirements: 4.1, 4.2, 4.3, 4.7_

- [ ] 7. Build the audit viewer UI
  - `AuditFilters` populates its action dropdown from the API's distinct-actions response for
    the selected range, not from a constant — a hardcoded list drifts and would offer actions
    that never occurred in the range
  - `AuditList` shows time, actor, role, shop, action and entity label
  - Paging is a "Load more" button using the API's cursor, appending rather than replacing.
    Numbered pages would need a count, and counting an unbounded table is the query this whole
    design avoids
  - Say "No activity in this range." plainly when empty
  - _Requirements: 4.4, 4.5, 4.9_

- [ ] 8. Build `AuditChangeSummary.jsx`
  - Render `{ before, after }` as readable lines (`Stock  12 → 20`), and compact create
    summaries as a single line
  - Fall back to a formatted JSON block for an unrecognised shape, so an unfamiliar action
    still shows something. The payload is JSONB written by several controllers over the
    program's life — it must degrade, not blank
  - Extract the summarising logic as a pure function for P4
  - _Requirements: 4.6_

- [ ] 9. Build `CorrectDatesModal.jsx`
  - Reachable from the closed-sales and open-sales row menus, **not only** from the Console —
    the question arises while looking at sales, and making the admin navigate away invites them
    to do it in the database instead
  - Visible only to `super_admin`; pre-filled with current dates
  - Open sales offer `created_at` only, because `open_sales.paid_at` is NULL in normal
    operation — `paySale` moves the row rather than stamping it
  - State the consequence before confirming: changing the date changes what past reports show
  - On rejection, show the server's message and leave the dialog open
  - On success, invalidate `["closedSales", shopId]` and `["openSales", shopId]` **for the
    sale's shop**, which may not be the active one
  - _Requirements: 5.1–5.7_

- [ ] 10. Write the tests
  - P1 and P2 against the pure filter builder; P4 against the pure summariser, including
    `null`, `{}` and a deeply nested payload
  - P3 as a structural assertion that none of the three admin resources appears in
    `PERSISTED_RESOURCES`
  - `UsersList` disables Delete and shows the reason for a user with activity
  - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.8_

- [ ] 11. Verification checkpoint
  - `npm run build`, `npm test` and `npm run lint` pass
  - Walk the manual table from the design end to end, including creating a shop, switching into
    it without signing out, creating a worker for it, and watching that worker sign in
  - **Reload the audit page and confirm `tb_query_cache` in `localStorage` holds no audit
    data** — this is the check that P3 holds in the built app and not merely in the constant
  - Confirm dark mode and phone layout on all three screens
  - Ask the user if any questions arise before closing out

## Notes

- The audit viewer is the one screen where making the UI more convenient would undo a
  deliberate backend constraint. No auto-refresh, no prefetch, no "all time", no row count.
- Ticket 12 is the cutover. After this ticket the frontend is feature-complete; ticket 11
  finishes the offline path and 12 turns the legacy bypass off.
