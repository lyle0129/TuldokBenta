# Implementation Plan: Super-Admin API

## Overview

Three new controllers under the `/api/admin` router created in ticket 05. No existing
controller changes and no schema changes.

## Tasks

- [x] 1. Create `controllers/adminShopsController.js`
  - `listShops` (including inactive), `createShop`, `updateShop`, `setShopActive`
  - **`createShop` must seed `cash` and `gcash` for the new shop.** The seed in
    `initDB.js:136-159` is guarded on the whole table being empty, so it fires once ever and
    those rows belong to Shop 1 — a shop created later gets nothing and its pay dialog is
    empty with no obvious cause
  - Do not copy inventory or services from any other shop
  - `slug` is immutable after creation; a duplicate returns 409
  - When `invoice_prefix` changes on a shop that already has sales, include a warning field in
    the response so ticket 10 can surface it
  - No delete route — sales, inventory and audit rows reference `shops`
  - _Requirements: 1.1–1.8, 2.1, 2.2, 2.3, 2.4_
  - **Done.** The new shop's id is reserved with `nextval(pg_get_serial_sequence(...))` before
    anything is written, so the shop row, its two payment methods and the audit row go out as
    one `sql.transaction` — the design allowed either that or a follow-up transaction, and
    this is the version where a failure cannot leave a shop that exists but cannot take a
    payment. A burned sequence value is the whole cost. `ACTIONS.shop.reactivate` was missing
    from ticket 05's vocabulary and has been added beside `deactivate`

- [x] 2. Create `utils/dateCorrection.js` as a pure validator
  - Export a function taking the current `(created_at, paid_at)`, the submitted patch and the
    sale type, returning either the resulting pair or a validation error
  - Rules in order: resulting dates not more than 24 hours in the future; a closed sale's
    resulting `paid_at` is not NULL; resulting `paid_at` is not earlier than resulting
    `created_at`
  - Keep it free of `sql` and of `req`/`res`, matching the existing discipline in
    `utils/saleItems.js` and `utils/reorder.js` — this is what makes P1–P2 testable
  - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6_
  - **Done.** Also exports `resolveSaleType` (the closed allowlist, so P3 is testable without
    the controller) and `toTimestampText`, which normalises both sides into the
    `YYYY-MM-DD HH:MM:SS.mmm` form the zone-less `TIMESTAMP` columns hold. A `toISOString()`
    here would append a `Z` that Postgres drops rather than converts, shifting every corrected
    date by the host's offset — the same trap `auditController.js:153-171` documents for its
    cursor. An omitted field is never written at all: `set` carries only what was submitted

- [x] 3. Create `controllers/adminSalesController.js`
  - `PATCH /api/admin/sales/:table/:id/dates`
  - Validate `:table` against an allowlist of exactly `open` and `closed`, and use it to
    choose between **two hand-written query branches**. Never interpolate the table name into
    a template — neon tagged templates cannot parameterise an identifier, and this is the one
    place a naive implementation would be an injection
  - Delegate validation to `utils/dateCorrection.js`
  - Emit the `UPDATE` and `auditQuery(...)` as one `sql.transaction([...])`, with complete
    before/after values in `changes`
  - Touch nothing else: not `items`, not stock, not `invoice_number`, not `invoice_seq`
  - _Requirements: 5.1, 5.7, 5.8, 5.9, 6.1, 6.2, 6.3_
  - **Done.** The audit row passes `shop_id: sale.shop_id` explicitly — there is no
    `resolveShop` on this router, so `rowFor` would otherwise default it to an undefined
    `req.shopId` and file every correction as a global event belonging to no shop

- [x] 4. Create `controllers/adminUsersController.js` — reads and creation
  - `listUsers` using the single grouped `ARRAY_AGG` query from the design, not N+1
  - `createUser`: normalise the username, apply the password policy, hash, set
    `must_change_password = TRUE`, insert assignments, all in one transaction with the audit row
  - Route every user-shaped response through `toPublicUser` from ticket 03
  - Username is immutable after creation
  - _Requirements: 3.1, 3.2, 3.7, 3.8, 3.9, 6.1, 6.3, 6.4_
  - **Done.** `toPublicUser` moved from `authController.js` into a new `utils/users.js`, which
    also holds `ROLES` / `isRole`. It had to leave the controller to be reachable from two
    callers and from P4 — importing a controller pulls in `config/db.js` and `config/env.js`,
    and the latter calls `process.exit(1)` when `DATABASE_URL` is unset, so a test could not
    have loaded it

- [x] 5. Add the user mutation handlers
  - `updateUser` (full name and role only), `resetPassword`, `setUserShops`
  - `resetPassword` sets `must_change_password = TRUE` and bumps `token_version`
  - `setUserShops` replaces the whole set in one transaction — delete then insert — rather
    than diffing; the set is small and a partial diff failure would leave a user assigned to a
    shop nobody chose
  - _Requirements: 3.3, 3.5, 3.6, 6.1_
  - **Done.** `updateUser` also refuses to demote the last active super admin. Requirement 4.4
    names deactivation and deletion only, but a demotion strands the system in exactly the
    same way, and leaving it open on the controller that refuses the other two would be strange

- [x] 6. Add deactivation and the guarded hard delete
  - `setUserActive`: deactivation sets `is_active = false` **and bumps `token_version`**, or
    the user simply refreshes their way back in
  - Refuse to deactivate or delete the last active `super_admin`. Count active super admins
    **inside the same transaction** as the change, or two concurrent requests each see a count
    of two and both proceed
  - Refuse to let a super admin deactivate or delete their own account
  - `deleteUser` removes the row only when the user has zero `audit_log` rows; otherwise 409
    with a message pointing at deactivation
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - **Done.** The last-super-admin count is a predicate *inside* the UPDATE / DELETE, not a
    read followed by a write — `sql.transaction` takes a fixed array of statements with no
    branching, so this is the only form in which the count and the change cannot be
    interleaved. Zero rows returned means the guard fired. The audit-row count for a hard
    delete goes through a new `countActorEvents` export in `utils/audit.js` (ticket 05 asked
    for exactly this), and a `23503` from the `audit_log.actor_user_id` foreign key maps to
    the same 409 — which closes the window where the account acts between the count and the
    delete. `ACTIONS.user.delete` was added for the event itself

- [x] 7. Extend `routes/admin.js`
  - Add the shop, user and sale-date routes to the router ticket 05 created
  - Do **not** create a second admin router and do **not** mount `resolveShop` — these routes
    take the shop as an explicit parameter, which is safe only because the router-level
    `requireRole("super_admin")` means the caller already reaches every shop
  - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - **Done.** Thirteen routes added to the existing router; no second mount, no `resolveShop`

- [x] 8. Narrow ticket 04's structural check
  - Ticket 04's SP1 grep for `req.body.shop_id` will now legitimately hit the admin
    controllers. Narrow it to exclude `controllers/admin`, do not delete it — the rule still
    holds everywhere else
  - Add a comment at the top of each admin controller explaining why the exception is safe
    here and stating that no manager-reachable route may ever be added under `/api/admin`
  - _Requirements: 7.3_
  - **Done**, in `04-scope-enforcement/design.md`, with a sentence saying why it is narrowed
    rather than deleted and a pointer to this ticket's design. Worth recording: the unnarrowed
    grep still returns nothing today, because `setUserShops` reads `req.body?.shop_ids` through
    optional chaining and the pattern wants a literal `.`. The check was narrowed anyway — it
    should express the rule, not depend on a punctuation accident. The header comment is on all
    three admin controllers
  - Ticket 05's SP1 (`audit_log` named nowhere outside the audit module) still holds for
    queries: the two hits outside those files are both prose in comments, one of which
    predates this ticket in `openSalesController.js:314`

- [x] 9. Write the tests
  - Property tests for `utils/dateCorrection.js`: P1 (the verdict depends only on the
    resulting pair, not on which field was submitted), P2, P3
  - P4 against `toPublicUser`
  - _Requirements: 3.8, 5.1, 5.2, 5.3, 6.4_
  - **Done.** `utils/dateCorrection.test.js` and `utils/users.test.js`; the suite is 163 tests
    across 41 suites, 0 failures, up from 143. P4 asserts the whole key set rather than the
    two dangerous names, so a helper that spread the row and deleted them would still fail it.
    `dateCorrection.test.js` imports `config/timezone.js` first, exactly as `server.js` does —
    without the pin its assertions pass only on a machine already running in UTC, which is the
    bug the module exists to avoid

- [ ] 10. Run the integration checks — **NOT DONE**
  - Deferred pending the Neon branch of production tickets 02 and 03 were rehearsed on. Two of
    these checks rename `audit_log`, which breaks audit writes for the live shop for the length
    of the run, so they must not go near the only configured database. The runner is
    `backend/scripts/verify-ticket-06.mjs` and covers every row below plus ticket 05's two
    carried-over checks; it records shop 1's row counts first and asserts they are unchanged at
    the end, and removes its own scratch shops and users afterwards. Point `DATABASE_URL` at
    the branch, boot the backend against it, and run the script (its header lists the four
    environment variables it wants)
  - Every row of the design's integration table
  - Confirm a newly created shop can take a sale immediately and that its first invoice is
    the shop's prefix + `0001`
  - Confirm deactivation kills refresh straight away
  - Confirm all three refusals: last super admin, self, and hard delete with activity
  - **Break the audit insert, then correct a date: the request must fail with 500 and the date
    must be unchanged.** This is the opposite outcome to ticket 05's equivalent check, and
    confirming both is what proves the two write modes actually differ
  - _Requirements: 2.1, 2.4, 4.1, 4.3, 4.4, 4.5, 6.2_

- [ ] 11. Verify the reporting impact of a correction — **NOT DONE**, same reason as task 10
  - Correct a sale's date across a month boundary, then reload `/reporting` for both months
    and watch the sale move
  - This is intended behaviour — see R4 in [the overview](../00-overview.md). The point is to
    see it working, not to prevent it
  - _Requirements: 5.7_

- [~] 12. Verification checkpoint — **static half done, live half pending**
  - `npm test` in `backend/` passes ✅ — 163 tests across 41 suites, 0 failures
  - Every module in the ticket loads and all 15 routes register on the one `/api/admin`
    router ✅ — checked by importing it with throwaway environment values, no database involved
  - No response anywhere contains `password_hash` or `token_version` ✅ *by construction* —
    every user-shaped response goes through `toPublicUser`, and property P4 states the key set
    is fixed. The end-to-end confirmation is in task 10
  - No audit `changes` payload contains a password ✅ — no handler passes one, and
    `utils/audit.js` strips the key names unconditionally (ticket 05's P2)
  - A manager gets 403 on every route in this ticket; an unauthenticated caller gets 401 even
    with `LEGACY_UNAUTH=true` — ⏳ in task 10's runner; the guards are router-level and
    unchanged from ticket 05, which verified them live
  - The ticket-04 two-shop matrix still passes unchanged — ⏳ pending the branch
  - Ask the user if any questions arise before closing out ✅ — the two spec deviations
    (`updateUser`'s last-super-admin guard, and reserving ids to keep creation atomic) and the
    three vocabulary additions were raised as they were made

## Notes

- This ticket completes the backend. After it, tickets 07–11 are frontend work against a
  finished API, and `LEGACY_UNAUTH` is still on the whole time.
- The scoping exception here is deliberate and documented in the design. If a future route
  under `/api/admin` needs to be manager-reachable, the reasoning collapses — put it on a
  shop-scoped route with `resolveShop` instead. Ticket 09 does exactly that for the
  manager-editable shop profile.
